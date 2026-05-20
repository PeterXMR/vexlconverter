# Local security testing TODO — vexlconverter

A focused, runnable plan for self-pentesting the **locally-running Docker
stack** of this app. Eight tools, all with stable releases on or after
2026-01-01, chosen to add value beyond what's already in CI (Trivy filesystem
scan, npm audit, pip-audit, gitleaks, CodeQL).

Three previously-considered tools were **dropped** because their latest stable
release is older than 2026:

| Dropped | Last release | Replaced by |
|---|---|---|
| hadolint | 2024-09-22 (v2.14.0) | Checkov `--framework dockerfile` |
| dockle | 2025-01-06 (v0.4.15) | Trivy `image --scanners misconfig,secret` |
| Nuclei | 2025-04-18 (v3.8.0) | Wapiti (active OpenAPI-aware DAST) |

## Final toolkit (all releases ≥ 2026-01-01)

| Layer | Tool | Version | Released | What it catches |
|---|---|---|---|---|
| Local SAST | Semgrep | 1.163.0 | 2026-05-13 | Polyglot taint patterns, framework anti-patterns |
| Python SAST | Bandit | 1.9.4 | 2026-02-25 | Python stdlib pitfalls (`pickle`, `yaml.load`, weak crypto) |
| Dockerfile lint | Checkov (`dockerfile`) | 3.2.529 | 2026-05-14 | Image-build best-practice + security misconfigs |
| Image inspector | Trivy (`misconfig,secret`) | 0.70.0 | 2026-04-16 | USER/HEALTHCHECK/ENV-secrets in built images |
| Compose lint | Checkov (`docker_compose`) | 3.2.529 | 2026-05-14 | Privileged, host-net, exposed sockets, missing `cap_drop` |
| API fuzz | Schemathesis | 4.19.0 | 2026-05-19 | OpenAPI-driven property fuzzing; 5xx on edge inputs |
| Web DAST | Wapiti | 3.3.0 | 2026-05-13 | Active SQLi/XSS/SSRF/CRLF via OpenAPI ingestion |
| Manual proxy | mitmproxy | 12.2.3 | 2026-05-12 | HMAC-token testing — IDOR, replay, timing |
| Optional | sqlmap | 1.10.5 | 2026-05-02 | SQLi depth (expected clean; verify) |
| Optional | testssl.sh | 3.2.3 | 2026-02-12 | Production TLS scan |

---

## Pre-flight: build and start the local Docker stack

Most active-scanning tools target the running app. Build and start it first.

```bash
# 1. Build images
docker compose build

# 2. Start with Swagger enabled and rate limiting disabled
#    (Schemathesis and Wapiti will burn through 10/min limits in 2 seconds)
ENABLE_API_DOCS=true \
RATELIMIT_ENABLED=False \
FLASK_ENV=development \
  docker compose up -d

# 3. Verify the stack
curl -s http://localhost:5001/api/health
curl -sI http://localhost:3000/

# 4. Save the OpenAPI spec for tools that need a local file
curl -s http://localhost:5001/static/swagger.json > /tmp/vexl-openapi.json
test -s /tmp/vexl-openapi.json && echo "OpenAPI saved: $(wc -c < /tmp/vexl-openapi.json) bytes"
```

After all testing:

```bash
docker compose down
# Re-enable rate limiting for any subsequent test runs that need it
```

> **Networking note for Mac/Windows Docker Desktop users:** the `--network
> host` flag in tool commands below works on Linux. On Mac/Windows, replace
> `localhost`/`127.0.0.1` with `host.docker.internal` inside tool containers,
> or run the tools via brew/pip on the host instead of Docker.

---

## 1. Semgrep — local SAST

- [ ] **Goal:** find Flask/Python/React/JS anti-patterns Semgrep's rule packs already cover
- [ ] **Target:** source code (`./backend`, `./frontend/src`)

```bash
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:latest \
  semgrep \
  --config=p/python --config=p/flask --config=p/javascript --config=p/react \
  --config=p/owasp-top-ten --config=p/security-audit \
  --error \
  backend frontend/src
```

**Review the output for:**

- [ ] Any flagging of `text()` calls in `backend/app.py:813,837` — should be FALSE
      POSITIVE (allowlist-gated `_TRUNC_WHITELIST`). Add `# nosemgrep: ...
      reason: trunc is allowlist-validated` if it flags.
- [ ] Any `requests.get(...)` without `timeout=` — should already have
      `timeout=10` / `timeout=15`. Verify.
- [ ] Any `eval()`, `exec()`, `Function()`, `dangerouslySetInnerHTML` — none
      expected; any hit is a real finding.
- [ ] Hardcoded URLs / tokens / passwords — none expected.

**Action:** classify each hit as TP or FP. For FPs, write inline
`# nosemgrep: <rule-id>  reason: ...` so the codebase stays scan-clean.

**Time:** ~30 s.

---

## 2. Bandit — Python-specific SAST

- [ ] **Goal:** catch Python stdlib pitfalls Semgrep's polyglot ruleset misses
- [ ] **Target:** `./backend`

```bash
docker run --rm -v "$PWD:/src" -w /src python:3.14-slim sh -c \
  "pip install bandit && bandit -r backend -ll -ii -f txt"
# -ll = medium+ severity, -ii = medium+ confidence
```

**Review the output for:**

- [ ] `B201` Flask `debug=True` — `app.py:994` reads from env, default false.
      Should not flag.
- [ ] `B324` weak hash — we use SHA-256. Should not flag.
- [ ] `B105/B106/B107` hardcoded password — none expected.
- [ ] `B608` SQL injection via string formatting — `app.py:813,837` may flag
      the `date_trunc('{trunc}', ...)` pattern. Document with `# nosec B608
      reason: trunc is allowlist-validated (_TRUNC_WHITELIST)`.

**Action:** each flag → TP or FP. Annotate FPs inline with `# nosec`.

**Time:** ~5 s.

---

## 3. Checkov (Dockerfile mode) — Dockerfile lint

- [ ] **Goal:** catch Dockerfile anti-patterns (replaces hadolint)
- [ ] **Target:** `./backend/Dockerfile`, `./frontend/Dockerfile`

```bash
docker run --rm -v "$PWD:/src" -w /src bridgecrew/checkov:latest \
  -f backend/Dockerfile --framework dockerfile --compact --quiet

docker run --rm -v "$PWD:/src" -w /src bridgecrew/checkov:latest \
  -f frontend/Dockerfile --framework dockerfile --compact --quiet
```

**Review the output for:**

- [ ] `CKV_DOCKER_2` missing `HEALTHCHECK` — both Dockerfiles already have one;
      should pass.
- [ ] `CKV_DOCKER_3` no `USER` directive — backend likely flags (Python image
      runs as root by default; gunicorn binding non-privileged port).
      Mitigation: add `USER nobody` or document.
- [ ] `CKV_DOCKER_7` `:latest` tag — both should be pinned (`python:3.14-slim`,
      `nginx:alpine`). Verify versions are pinned.
- [ ] `CKV_DOCKER_11` `ADD` for remote URL — none expected; use `COPY`.
- [ ] `CKV_DOCKER_5` skip `apt-get upgrade` in container — verify backend RUN
      blocks don't do this.

**Action:** fix what's easy, document intentional skips in a `.checkov.yml`
or via inline comments.

**Time:** ~10 s.

---

## 4. Trivy (local image scan) — built-image inspector

- [ ] **Goal:** root user / missing HEALTHCHECK / ENV-secrets in built images
      (replaces dockle). Trivy is already in CI for *filesystem* scan; this is
      a different mode targeting the built images.
- [ ] **Target:** locally-built images (`docker compose build` must have run)

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image \
  --scanners misconfig,secret \
  --severity HIGH,CRITICAL \
  vexlconverter-backend:latest

docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image \
  --scanners misconfig,secret \
  --severity HIGH,CRITICAL \
  vexlconverter-frontend:latest
```

(Confirm the image names with `docker images | grep vexlconverter` if they
differ from the defaults above.)

**Review the output for:**

- [ ] **Misconfig:** image runs as root, no USER set, no HEALTHCHECK, `:latest`
      base tags, `ADD` of remote URLs.
- [ ] **Secret:** anything in image layers that looks like a token, API key, or
      password. None expected.
- [ ] If frontend nginx flags "runs as root" — known platform constraint;
      workers drop to nginx user. Document.

**Action:** any secret finding is a P0. Misconfig findings get fixed unless
documented as intentional.

**Time:** ~10 s per image.

---

## 5. Checkov (docker-compose mode) — compose misconfig

- [ ] **Goal:** misconfigured services (privileged, host network, exposed
      Docker socket, missing `cap_drop`, missing `read_only`).
- [ ] **Target:** `./docker-compose.yml`

```bash
docker run --rm -v "$PWD:/src" -w /src bridgecrew/checkov:latest \
  -f docker-compose.yml --framework docker_compose --compact --quiet
```

**Review the output for:**

- [ ] No `privileged: true` anywhere — should pass.
- [ ] No `network_mode: host` — should pass.
- [ ] No `/var/run/docker.sock` bind mount — should pass.
- [ ] `./backend:/app` volume mount for hot-reload — fine in dev, would flag
      in production (we use the built image in prod; this compose is dev).
- [ ] Missing `cap_drop: [ALL]` — will flag. Decide: add it (defense in
      depth) or document the choice.
- [ ] Missing `read_only: true` on containers that don't need writeable FS —
      similar.
- [ ] No resource limits (`mem_limit`, `cpus`) — may flag.

**Action:** for each finding, decide harden vs. document. Defense-in-depth
choices.

**Time:** ~10 s.

---

## 6. Schemathesis — OpenAPI-driven property fuzzer (highest signal)

- [ ] **Goal:** find 5xx crashes on edge inputs, schema violations, type
      confusion, missing 400s. **This is the tool most likely to find new
      bugs** — would have caught the NaN→500 bug (fixed in PR #45) automatically.
- [ ] **Target:** running backend at `http://localhost:5001`

```bash
docker run --rm --network host -v /tmp:/tmp schemathesis/schemathesis:stable \
  run \
  --base-url=http://localhost:5001 \
  --checks=all \
  --phases=examples,coverage,fuzzing,stateful \
  --max-examples=200 \
  --request-timeout=10000 \
  --report=junit:/tmp/schemathesis.xml \
  http://localhost:5001/static/swagger.json
```

**For endpoints that need a token, generate one and re-run with the header:**

```bash
TOKEN=$(curl -s -XPOST http://localhost:5001/api/alerts \
  -H 'Content-Type: application/json' \
  -d '{"target_price":100,"currency":"usd","direction":"above","crypto":"bitcoin"}' \
  | python -c 'import sys, json; print(json.load(sys.stdin)["data"]["edit_token"])')

docker run --rm --network host schemathesis/schemathesis:stable \
  run \
  --base-url=http://localhost:5001 \
  --header "X-Alert-Token: $TOKEN" \
  --checks=all --phases=fuzzing,stateful \
  http://localhost:5001/static/swagger.json
```

**Review the output for:**

- [ ] **Any 5xx** = bug. Each one is a minimal repro you can copy into a test.
- [ ] **Schema violations** (response shape doesn't match swagger.json): either
      fix the response or update the schema.
- [ ] **Missing 400s**: endpoint accepts malformed input without rejecting.
- [ ] **`Content-Type` mismatches**: backend declares JSON but ships something
      else.
- [ ] **`ignored_auth` check** failures: endpoint that should require a token
      accepts a request without one.

**Action:** for every 5xx, write a regression test in `backend/tests/` *first*,
then ship the fix. Each finding becomes a portfolio-quality PR.

**Time:** 3–15 min depending on `--max-examples`. Start with 200; bump to
1000 for a deeper run.

---

## 7. Wapiti — active web DAST (replaces Nuclei)

- [ ] **Goal:** active SQLi / XSS / SSRF / command-injection / CRLF / open-redirect
      payloads against every endpoint in the OpenAPI spec.
- [ ] **Target:** running backend at `http://localhost:5001`

```bash
docker run --rm --network host -v /tmp:/tmp cyberwatch/wapiti \
  -u http://localhost:5001 \
  -s http://localhost:5001/static/swagger.json \
  -f json -o /tmp/wapiti-report.json \
  --flush-session \
  -m sql,xss,ssrf,crlf,exec,redirect,permanentxss,httpheaders
```

**Review the output for:**

- [ ] **SQL injection** anywhere — would contradict the audit; would be a
      real finding.
- [ ] **XSS reflection** in any JSON response — would also contradict the audit.
- [ ] **SSRF** — possible only if any user input flows into outbound URLs.
      Our allowlists prevent this; Wapiti probing confirms.
- [ ] **CRLF in response headers** — none expected.
- [ ] **Missing security headers** — Wapiti checks for these. Should all be
      present (CSP, HSTS, COOP, CORP, X-Frame-Options) from prior hardening.
- [ ] **Open redirect** — no redirect endpoints expected.

**Action:** every real finding gets a fix + regression test. For "info"-level
header checks, ensure they confirm what's expected.

**Time:** 5–20 min.

---

## 8. mitmproxy — manual HMAC-token testing (NO automation can do this)

- [ ] **Goal:** test the per-alert HMAC token model for IDOR / replay /
      timing / header smuggling. This is the only auth surface; automated
      scanners can't reason about it.
- [ ] **Target:** running backend at `http://localhost:5001`, proxied through
      mitmproxy

**Start mitmproxy as a reverse proxy in front of the backend:**

```bash
docker run --rm -it --network host \
  -v ~/.mitmproxy:/home/mitmproxy/.mitmproxy \
  mitmproxy/mitmproxy \
  mitmweb --mode reverse:http://localhost:5001 --listen-port 8080
```

mitmweb's interactive UI opens at `http://127.0.0.1:8081`.

**For each interactive test, send the request through `http://localhost:8080`
(which forwards to the real backend) and observe / modify in mitmweb:**

- [ ] **Setup:** create an alert via `POST http://localhost:8080/api/alerts`,
      capture the returned `edit_token`. Save it.
- [ ] **IDOR via enumeration:** `DELETE http://localhost:8080/api/alerts/1`,
      `DELETE .../2`, ... `DELETE .../9999` with a *wrong* token in
      `X-Alert-Token`. **All must return identical 403.** This verifies the
      enumeration-resistance design at `backend/app.py:638-651`.
- [ ] **DELETE without token:** `DELETE http://localhost:8080/api/alerts/<your_id>`
      with no `X-Alert-Token` header. Must return 403.
- [ ] **DELETE with valid token, valid ID:** must return 200.
- [ ] **Timing oracle test:** in mitmweb, replay 30× `DELETE .../9999` with
      different random wrong tokens. Look at the response-time column. Group
      by similar timing. If you see two distinguishable groups, the constant-
      time path isn't being reached.
- [ ] **Header smuggling:** send `X-Alert-Token` twice with garbage in one
      and the real token in the other. Verify which one Flask uses (should
      reject both as ambiguous; Werkzeug behavior is "first wins" by default
      — verify the actual behavior).
- [ ] **CRLF injection in header:** send `X-Alert-Token: foo\r\nX-Injected:
      bar`. Werkzeug should reject with 400; verify.
- [ ] **Header confusion:** send `X-Alert-Tokens` (plural — the list-endpoint
      header) to `DELETE /api/alerts/<id>` (which expects singular
      `X-Alert-Token`). Must not work.
- [ ] **Empty / whitespace token:** `X-Alert-Token: ` (empty), `X-Alert-Token:
      \t\t\t`. Must return 403.
- [ ] **Token replay across processes:** make 2 requests with the same valid
      token from different "sessions" (different cookies, different User-Agent).
      Both should succeed — tokens are not session-bound. Verify this is the
      intended design.
- [ ] **Mass ack abuse:** POST to `/api/alerts/ack` with `{"acks": [{"id":1,
      "token":"junk"}, ...]}` containing 200 items. Should be rejected for
      exceeding `_MAX_ACKS_PER_REQUEST=100` (`app.py:697`).

**Action:** any 200/204 on a wrong-token request OR any timing-distinguishable
group on the oracle test is a real finding. Otherwise, the design holds.

**Time:** 30–60 min of focused work.

---

## Optional 9. sqlmap — SQL injection depth check

- [ ] **Goal:** confirm no SQLi (expected clean per code audit). Run for
      completeness and writeup evidence.
- [ ] **Target:** running backend at `http://localhost:5001`

```bash
# Query-string endpoint
docker run --rm --network host paoloo/sqlmap \
  -u "http://localhost:5001/api/prices/latest?crypto=bitcoin" \
  --batch --level=3 --risk=2 --output-dir=/tmp/sqlmap

# JSON-body endpoint
docker run --rm --network host paoloo/sqlmap \
  -u http://localhost:5001/api/convert \
  --method=POST \
  --data='{"amount":1,"crypto":"bitcoin"}' \
  --headers="Content-Type: application/json" \
  --batch --level=3 --risk=2 --output-dir=/tmp/sqlmap
```

**Expected output:** `all tested parameters do not appear to be injectable`.

**Action:** any other output is a real finding.

**Time:** 1–5 min per endpoint.

---

## Optional 10. testssl.sh — production TLS scan (NOT local Docker)

- [ ] **Goal:** verify TLS configuration on production hosts. Run *only*
      against production — Docker doesn't terminate TLS locally.
- [ ] **Target:** `https://vexlconverter.vercel.app/` and
      `https://vexlconverter-api.onrender.com/`

```bash
docker run --rm -ti drwetter/testssl.sh \
  --html /tmp/ssl-vercel.html \
  https://vexlconverter.vercel.app/

docker run --rm -ti drwetter/testssl.sh \
  --html /tmp/ssl-render.html \
  https://vexlconverter-api.onrender.com/
```

**Verify:**

- [ ] TLS 1.2 + 1.3 enabled; TLS 1.0/1.1/SSLv3 disabled
- [ ] HSTS `max-age >= 31536000` (already verified earlier ✅)
- [ ] No weak ciphers (RC4, 3DES, NULL)
- [ ] No certificate transparency issues
- [ ] OCSP stapling enabled (Vercel/Render usually yes)

**Expected:** A+ on both hosts. This is documentation, not bug-finding.

**Time:** 3–5 min per host.

---

## Suggested workflow (one focused afternoon)

| Time | Step | Why this order |
|---|---|---|
| 00:00 | `docker compose build` + start stack with `ENABLE_API_DOCS=true RATELIMIT_ENABLED=False` | Prereq for API-aware tools |
| 00:10 | Semgrep + Bandit (~1 min combined) | Fastest signal; fix easy issues before fuzzing |
| 00:15 | Checkov (Dockerfile + compose) + Trivy image scan | Independent of running app, no interference |
| 00:30 | **Schemathesis run** (let it run; ~10 min) | Highest probability of finding new bugs |
| 00:45 | Triage Schemathesis output | Fresh; minimal repros from Hypothesis shrinking |
| 02:00 | Wapiti active scan (~15 min) | Different bug classes from Schemathesis |
| 02:30 | mitmproxy manual session (~45 min) | Test the HMAC token model — only auth surface |
| 03:30 | Optional: sqlmap, testssl.sh | Mostly verification |
| 04:00 | Write up findings in a single document | The writeup IS the portfolio asset |
| 04:30 | `docker compose down`; re-enable rate limits | Cleanup |

Total active engagement: ~4 hours. Most of it is tools running while you do
other things.

---

## What to do with findings

For each finding:

1. **Reproduce manually.** Tools have false positives. Verify before fixing.
2. **Classify by exploitability**, not by tool severity:
   - *Exploitable now* → ship a fix in a PR today
   - *Exploitable under different config* (e.g., LOG_LEVEL=DEBUG, FLASK_DEBUG=true)
     → document the condition + decide whether to harden the default
   - *Not exploitable / false positive* → annotate inline (`# nosec`,
     `# nosemgrep`) with the reasoning. Suppressions-as-code, not as wiki
     entries that drift.
3. **Write a regression test BEFORE fixing.** Especially for Schemathesis
   findings — they're already minimal repros.
4. **Open one PR per finding.** Each becomes a portfolio-quality artifact
   showing the find → test → fix cycle.

---

## What this plan deliberately does NOT cover

- **Network-layer pentesting** (nmap, Wireshark) — your app runs on managed
  PaaS, no exposed network surface to test
- **Password/credential cracking** (Hashcat, John) — you have no passwords
- **Subdomain enumeration** (Amass, Subfinder) — you only own `*.vercel.app`
  / `*.onrender.com` subdomains via your accounts; nothing to discover
- **Exploitation frameworks** (Metasploit) — you're finding bugs, not
  exploiting; wrong layer
- **Commercial scanners** (Burp Pro, Snyk paid, Veracode) — the open-source
  toolkit above covers this app's surface; paid tools would mostly add weight

---

## Tools rejected with documented reasons (2026 cutoff)

| Tool | Last release | Why dropped | Replaced by |
|---|---|---|---|
| **hadolint** | 2024-09-22 v2.14.0 | 20 months since tagged release; PR backlog suggests thin maintainer bandwidth | Checkov `--framework dockerfile` |
| **dockle** | 2025-01-06 v0.4.15 | 16+ months since release; goodwithtech activity reduced | Trivy `image --scanners misconfig,secret` |
| **Nuclei** | 2025-04-18 v3.8.0 | 13+ months since stable engine cut; v3.9.x stuck in RC | Wapiti (active OpenAPI-aware DAST) |
| **Dredd** | archived 2024-11 | Repo archived | Schemathesis |
| **TnT-Fuzzer / APIFuzzer / Cherrybomb** | 2022–2023 | Abandoned | Schemathesis |
| **EvoMaster** | 2024 v6.0.0 | Research tool, weak blackbox; Java instrumentation for whitebox doesn't fit Python/Flask | Schemathesis |
| **KICS** | 2025-03 v2.1.20 | Docker Hub image compromised April 2026 (malicious tags) | Checkov |
| **container-structure-test** | 2024-12 v1.22.1 | Older than 2026; behavioral tester not a security tool | Trivy image scan |
| **Burp Suite Pro** | (paid) | $475/year | mitmproxy (free, scriptable) |
| **Caido** | (n/a) | Proprietary core — not actually open-source despite community wording | mitmproxy |
| **detect-secrets** | 2024 | Superseded by gitleaks (already in CI) and TruffleHog `--only-verified` for greenfield repos | (already covered by gitleaks in CI) |
| **grype** | (active) | Functionally redundant with Trivy (same CVE matcher problem) | Trivy already in CI |
| **Nikto** | 2026-02 v2.6.0 | Passes cutoff but largely surpassed by Schemathesis + Wapiti for app-layer; weak signal-to-noise | Schemathesis + Wapiti |

---

## Skills demonstrated by completing this plan

If you write the work up afterwards (highly recommended), the resulting
artifact shows:

- Threat modeling (knowing *what* to test, not just running tools)
- Tool selection with documented rationale and version cutoffs
- Hands-on use of mainstream AppSec tooling against a real running app
- Triage discipline (separating exploitability from severity)
- Communication (the writeup itself)

That's a portfolio piece worth more than the bugs you find.
