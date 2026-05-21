# Security design

How vexlconverter is structured against the attacks a public-facing
read-mostly SaaS actually sees, and why each control was chosen.

This is the engineering document. See [SECURITY.md](../SECURITY.md) for the
reporting policy and [/.well-known/security.txt](../frontend/public/.well-known/security.txt)
for the machine-readable contact.

---

## 1. Threat model

### Assets

| Asset | Where it lives | What loss looks like |
|---|---|---|
| **Price-alert rows** | Postgres (`price_alerts` table) | Alert deleted or acknowledged by someone other than the creator |
| **Per-alert edit tokens** | localStorage on the creator's browser + SHA-256 hash in Postgres | Token leaks → attacker can delete/ack the corresponding alert |
| **Backend secrets** (`DATABASE_URL`, `CORS_ORIGINS`, etc.) | Render env vars | Database access, CORS bypass |
| **Source code + CI pipeline** | GitHub | Supply-chain compromise → malicious build → users get attacker code |
| **CoinGecko / ExchangeRate-API quotas** | External services | Rate-limit-induced denial of price data |

Notably **NOT assets**: no user accounts, no passwords, no PII, no payment
data, no session cookies, no file uploads, no SSR templates. The threat
model is much smaller than a typical SaaS as a result.

### Attackers

| Type | Goal | Capability |
|---|---|---|
| **Random scrapers and bots** | Find any vulnerable endpoint | OWASP-style payload sprays, no targeted research |
| **Cost-exhaustion attackers** | Burn compute / CoinGecko quota | Generate large or expensive requests at scale |
| **Privacy-curious observers** | Learn who uses the app and what they convert | Network position; observe request volume / patterns |
| **Targeted attacker against one user** | Hijack a known user's alerts | Knows or guesses the user's `X-Alert-Token` |
| **Supply-chain attacker** | Inject malicious code at build time | Compromise a dependency or a GitHub action |

### Out of scope

- Physical access to the user's device (localStorage tokens visible to malware,
  XSS, browser extensions — see § 5 on what we do mitigate)
- Compromise of Vercel, Render, or Neon's infrastructure
- Vulnerabilities in dependencies that have already been disclosed upstream
  (the dependency-update pipeline is what addresses those — see § 6)
- Trivial volumetric DDoS against a single self-hosted instance

---

## 2. Attack surface

The full network-exposed surface is documented in
[README.md → API reference](../README.md#api-reference). Summary:

- **Frontend (Vercel):** static HTML/JS/CSS at `vexlconverter.vercel.app`,
  served via Vercel's CDN. No server-side rendering. No cookies.
- **Backend (Render):** 14 JSON endpoints at `vexlconverter-api.onrender.com/api/*`.
- **Database (Neon):** PostgreSQL behind Render, not reachable from the
  public internet. Connection over TLS with cert verification.
- **Outbound from backend:** two external calls — CoinGecko `simple/price`
  and `market_chart`, ExchangeRate-API `latest/USD`. Both targets are
  hard-coded prefixes; the only dynamic part of the URL is the
  cryptocurrency ID, which is validated against `SUPPORTED_CRYPTOS`
  (`backend/models.py`) before the request is made.

No SSH, no admin panel, no debug endpoint in production
(`ENABLE_API_DOCS=false` gates the only optional surface — `/api/docs`).

---

## 3. Authorization model

There are no user accounts. The only writable resource is a price alert,
and ownership is established via per-alert HMAC tokens.

### Token lifecycle

1. **Creation.** `POST /api/alerts` returns a one-time
   `edit_token` field in the JSON response. The token is generated with
   `secrets.token_urlsafe(32)` — 256 bits of cryptographic randomness
   (`backend/app.py`).
2. **Storage on the server.** Only `sha256(token).hexdigest()` is persisted,
   in the `price_alerts.edit_token_hash` column. The raw token is never
   logged, never written to disk, never reconstructable from anything the
   server retains.
3. **Storage on the client.** The frontend keeps the raw token in
   `localStorage` keyed by alert id, in a single object under
   `vexl_alert_tokens` (`frontend/src/components/AlertManager.jsx`).
4. **Use.** The client sends the raw token in `X-Alert-Token`
   (single, for `DELETE /api/alerts/{id}` and `POST /api/alerts/ack`) or
   `X-Alert-Tokens` (comma-separated, for `GET /api/alerts` and
   `GET /api/alerts/triggered`). The server hashes the incoming value and
   compares against the stored hash with `hmac.compare_digest` — constant
   time, so the comparison itself cannot be timed.

### Design rationale

| Choice | Alternative considered | Why this won |
|---|---|---|
| Per-alert token, not per-session | OAuth, signed JWTs, classic sessions | No user identity to anchor a session to. A per-alert capability is the smallest unit that maps to the actual authorization decision. |
| 256-bit `secrets.token_urlsafe` | Sequential or short ID | Brute-force search of a 256-bit space is infeasible. At 60 req/min, exhausting half is ~10⁵⁹ years. |
| Server stores only the hash | Server stores the token verbatim | If the database leaks, the attacker has hashes; the raw tokens needed to act on them are only on the original users' devices. |
| `hmac.compare_digest` | `==` | Closes the constant-time gap so wall-clock timing can't distinguish "right token" from "wrong token". |
| Identical 403 for missing-token, wrong-token, and non-existent alert | Distinct 401 / 403 / 404 | Distinct responses leak which alert ids exist; a single 403 lets `DELETE /api/alerts/1`, `/2`, `/9999` all look the same to a probe (`backend/app.py`). |
| Token sent in a header, not a query string | Query string | Headers are not logged by Vercel/Render access logs by default; query strings are. The token never lands in a log line. |

### What this design does NOT defend against

- **A user's local malware or a malicious browser extension** can read
  `localStorage` directly. Outside our threat model — a compromised
  client can do anything that client can do.
- **A targeted XSS exploit** that bypasses CSP could exfiltrate tokens
  from `localStorage`. We mitigate the XSS risk via § 5; we cannot make
  the localStorage value invisible to the page that legitimately needs it.
- **A user clearing localStorage** (or switching browsers) loses access
  to their alerts. There is no recovery path by design — recovery would
  imply a server-side identifier of the user, which we deliberately
  don't have.

---

## 4. Privacy stance

This is a small, opinionated set of choices that constrain what data flows
through the system.

### What we don't collect

- **No user accounts** — no name, no email, no password, no profile.
- **No IP logging.** Gunicorn's access log is disabled
  (`backend/gunicorn.conf.py`). The application logger uses
  `%(asctime)s %(levelname)s [%(name)s] %(message)s` — no client IP
  field.
- **No analytics, no tracking pixels, no third-party JavaScript.** The
  frontend's CSP `script-src 'self'` is enforced — anything we shipped
  that tried to call out would be blocked.
- **No CSP `report-uri` / `report-to` endpoint.** A CSP report contains
  the violating URL, the offending source, and an IP-like fingerprint.
  We've explicitly chosen not to collect that telemetry.

### What the backend does see

- **Request IPs** are available to the rate limiter via Werkzeug's
  `ProxyFix(x_for=1)` middleware (`backend/app.py`). They live in
  Flask-Limiter's in-memory bucket only — never written to disk,
  flushed when the worker restarts.
- **CoinGecko and ExchangeRate-API** see our *backend's* outbound IP,
  not user IPs. The frontend never calls them directly — it goes through
  `/api/prices/*` and `/api/fiat-rates`, which proxy and cache.

### Third parties involved

| Service | What they see | Privacy stance |
|---|---|---|
| Vercel | Edge requests to the SPA: URL, headers, IP. | Standard CDN. Their logs are their own; we don't read or correlate them. |
| Render | Requests to the API: URL, headers, IP. | Same as Vercel. |
| Neon | DB queries from the backend. | Sees query patterns; no user IPs or identifying info travels through. |
| CoinGecko | Periodic and on-demand fetches from our backend IP. | They never see end users. |
| ExchangeRate-API | Periodic fetches from our backend IP. | Same. |

---

## 5. Defense layers

Listed inside-out, from data layer to browser layer.

### Database

- TLS-only connection to Neon (`postgresql+psycopg://...`).
- All queries via SQLAlchemy ORM with bound parameters.
- One `text()` call with an f-string interpolation
  (`backend/app.py` — `date_trunc('{trunc}', ...)`); `trunc` is a hardcoded
  string in the surrounding code AND validated against
  `_TRUNC_WHITELIST = {'hour', 'day', 'week', 'month'}` belt-and-suspenders.

### Application

- **Strict input validation on every POST handler.** Non-object JSON
  bodies, oversized bodies, deeply-nested bodies, type-confused enum
  fields all return 400/413 from explicit guards before any DB call.
- **`isinstance(data, dict)`** inlined at every endpoint that parses a
  JSON body. Prevents the previously-common
  `'list'/'str'/'int' object has no attribute 'get'` 500 path.
- **`MAX_CONTENT_LENGTH = 64 KB`** caps the request body well below
  Werkzeug defaults.
- **App-level error handlers** for `RequestEntityTooLarge` (→ 413) and
  `RecursionError` (→ 400 on deeply-nested JSON) so neither leaks as a
  generic 500.
- **Mass assignment is structurally impossible:** every writable column
  is constructed via explicit keyword arguments — no `Alert(**request.json)`.
- **`crypto`, `currency`, `direction`, `fiat_currency`** are all
  validated against explicit allowlists / enums.
- **No user-controlled value is reflected in error messages.** A request
  for `crypto=<script>` gets back the static `'Unknown crypto'`, not the
  echo. Closes CodeQL's `py/reflective-xss` class even though our JSON
  responses + nosniff would block exploitation anyway.

### Rate limiting

- Flask-Limiter, in-memory backend, per client IP.
- Defaults: `60 per minute` global.
- Tighter: `10 per minute` on `POST /api/alerts` and
  `POST /api/alerts/ack`; `20 per minute` on `GET /api/prices/history`;
  `30 per minute` on `GET /api/fiat-rates`.
- `RATELIMIT_HEADERS_ENABLED=False` — the `X-RateLimit-*` headers
  aren't emitted, so attackers can't pace at the bucket boundary.
- `ProxyFix(x_for=1)` matches Render's exact proxy chain.

### Server-to-client headers

Applied to every response — frontend via `frontend/vercel.json`,
backend via `@app.after_request` in `backend/app.py`:

| Header | Value | What it buys |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Two-year HSTS, preload-eligible. Submitted (or pending) at [hstspreload.org](https://hstspreload.org/). |
| `Content-Security-Policy` (frontend only) | `default-src 'self'; connect-src 'self' https://vexlconverter-api.onrender.com; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; ...` | No third-party scripts, no inline JS, no framing, restricted connect. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Window.opener isolation against cross-origin popups. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Blocks opaque cross-origin embeds (`<img src=api>` exfil). |
| `X-Frame-Options` | `DENY` | Belt-and-braces with `frame-ancestors`. |
| `X-Content-Type-Options` | `nosniff` | Browsers must honor the declared `Content-Type`; no JS execution of JSON responses. |
| `Referrer-Policy` | `no-referrer` | Outbound clicks from the app don't leak the originating URL. |
| `Permissions-Policy` | Disables 15+ browser APIs we never use — geolocation, camera, mic, USB, Bluetooth, HID, payment, gamepad, etc. | Defense in depth — a future XSS bug can't activate hardware. |
| `X-Permitted-Cross-Domain-Policies` | `none` | Legacy Flash/PDF lockdown. |
| `Cache-Control` | `private, no-store` (default) | Auth-bound responses can't be cached by intermediate proxies. |
| `Server` | `web` (stripped from Werkzeug/gunicorn defaults) | Reduces fingerprinting. |

### CORS

- `flask-cors` with an explicit allowlist (`CORS_ORIGINS` env, parsed
  as a `set` of exact-match strings).
- `supports_credentials=False` — cookies are not sent cross-origin
  even if the origin matched.
- `allow_headers` is an explicit allowlist including only
  `Content-Type`, `X-Alert-Token`, `X-Alert-Tokens`.

### Build / CI / supply chain

- **All GitHub Actions are pinned to commit SHAs** with `# vN` trailing
  comments so Dependabot can still auto-update them. Closes the
  "@v6 retag" supply-chain class.
- **`permissions: contents: read`** at workflow level on every job
  (`docker-image.yml`, `codeql.yml`, `secret-scan.yml`). No job has
  write access by default.
- **Dependency gates:**
  - `npm audit --audit-level=high` on the frontend
  - `pip-audit` on the backend (one documented suppression for
    PYSEC-2024-271 — mitigated by `LOG_LEVEL=INFO`; will be removed
    when flask-cors ships a fix)
  - **CodeQL** weekly + on PR, on Python and JavaScript with the
    `security-and-quality` query set
  - **Gitleaks** weekly + on PR over full git history
  - **Trivy** filesystem scan in CI; image scan run locally
- **Container image scanning:** Trivy as above. `frontend/Dockerfile`
  is documented as nginx-master-as-root (workers drop to nginx user
  automatically) — Checkov annotation can be added if the noise
  becomes annoying.

---

## 6. Verified attack-class coverage

Each row is a class of attack that's been actively probed (manual or
tool-driven) on the running app:

| Class | Tool / approach | Result |
|---|---|---|
| IDOR enumeration | manual probes — `DELETE /api/alerts/<id>` for `id` ∈ {1, 2, 3, 99, 999, 9999, 99999, 999999} with wrong tokens | All identical 403 |
| Token timing oracle | statistical test, 10 000 wrong-token DELETEs across two paths | mean diff −0.036 ms, t = −1.98 → not exploitable |
| SQL injection | `sqlmap --level=2 --risk=1` on `/api/prices/history`, `/api/prices/latest`, `/api/prices/all`, `/api/convert` | All tested parameters not injectable |
| Reflected XSS | CodeQL `py/reflective-xss` | 0 alerts on main |
| SSRF | Static review: only allowlisted crypto ids and a server-controlled URL reach `requests.get`. No user-provided URL paths anywhere. | No surface |
| Mass assignment | Code review of every `db.add(...)`; all writes use explicit keyword arguments | No surface |
| Race conditions | 10 concurrent `POST /api/alerts` | 10 distinct rows + 10 distinct token hashes |
| Rate-limit IP spoofing | `X-Forwarded-For` header set by attacker | Stripped by Render edge before reaching `ProxyFix` |
| Body too large | curl with 70 KB / 100 KB JSON | 413 (was 500 before PR #50) |
| Deeply-nested JSON | curl with 2 000-level nested object | 400 (was 500 before PR #50) |
| Non-object JSON body | curl with `[null]`, `"str"`, `42`, `true` | 400 (was 500 before PR #50) |
| Type-confused enum fields | curl with `{"crypto": ["bitcoin"]}` etc. | 400 (was 500 before PR #50) |
| CRLF in URL params | `crypto=foo%0d%0aX-Inject:%20yes` | Werkzeug rejects with 400 |
| HTTP method tampering | PUT/PATCH/TRACE/CONNECT on every route | All 405 / 404 |
| Hidden-route enumeration | requests to `/.env`, `/.git/config`, `/api/admin`, `/api/_internal`, etc. | All 404 |
| Gzip-bomb body | 10 KB compressed body (~10 MB decompressed) | Werkzeug ignores `Content-Encoding: gzip` for opaque bodies — no decompression |
| Form-encoded smuggling | `Content-Type: application/x-www-form-urlencoded` to a JSON endpoint | 400 |
| Allowlist case-mismatch | `crypto=Bitcoin`, `BITCOIN`, ` bitcoin`, `bitcoin/` | All 400 — correctly strict |

---

## 7. Acknowledged operational gaps

Things this design **does not** include, with the honest reasoning:

| Gap | Why not (yet) |
|---|---|
| Anomaly detection / SIEM | No security telemetry collected (privacy stance). If an attack happens, we find out from CPU/error-rate alerts on Render, not a security signal. Real downside; acceptable for an app with a small attack surface and no high-value data. |
| Bug-bounty program | Costs money and time. The `security.txt` + private advisory route is the unfunded version. |
| Third-party pentest | No external review has been performed. The audit trail in this repo is the internal version of that. |
| Multi-region failover | Single Render instance; if Render's region goes down, the API is down. Out of scope for the security posture. |
| Redis-backed rate limiter | In-memory limiter is per-worker. Single-instance deploy is fine; multi-instance would multiply the limit. Re-evaluate at scale. |
| Hardware-key 2FA documentation for the maintainer | The supply chain depends on the maintainer's GitHub / registrar / Vercel / Render / Neon accounts. 2FA on all of them is implied but not documented here. |

---

## 8. References

- [SECURITY.md](../SECURITY.md) — disclosure policy
- [/.well-known/security.txt](../frontend/public/.well-known/security.txt) — RFC 9116 contact
- [GitHub Security Advisories](https://github.com/PeterXMR/vexlconverter/security/advisories) — published advisories on confirmed vulns
- `backend/app.py` — all server-side enforcement
- `frontend/vercel.json` — Vercel response headers
- `backend/tests/test_input_validation.py` — regression tests for the
  input-validation hardening
- `.github/workflows/codeql.yml`, `secret-scan.yml`, `docker-image.yml` —
  the supply-chain pipeline
