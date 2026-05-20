# Local security testing plan

A focused, runnable plan for self-pentesting this app on a workstation. Goal:
find real bugs with high-signal tools, not run a 30-tool checklist.

This complements the controls already enforced in CI:
- `npm audit --audit-level=high` (frontend deps)
- `pip-audit` (backend deps, see PR #48)
- `gitleaks` (secret scanning, PR #47)
- CodeQL (deep cross-file SAST, weekly + on PR)
- Trivy (container + filesystem CVE scanning)

The tools below catch things those don't.

## Toolkit at a glance

| Layer | Tool | Why this one |
|---|---|---|
| Local SAST | **Semgrep** | Polyglot, fast, custom rules in minutes; complements CodeQL |
| Python SAST | **Bandit** | Hand-tuned for Python stdlib quirks; runs in <5s |
| Dockerfile lint | **hadolint** | Zero overlap with Trivy; catches `DL3008`, `DL3025`, etc. |
| Image best-practices | **dockle** | Catches root user / missing HEALTHCHECK / ENV-leaked secrets (Trivy misses these) |
| Compose lint | **Checkov** (compose only) | `docker-compose.yml` security misconfigs (privileged, host net, etc.) |
| API fuzzing | **Schemathesis** | OpenAPI-driven property-based fuzzing; would have caught the NaN-→500 bug automatically |
| Web DAST | **Nuclei** (OpenAPI + DAST mode) | Template-driven CVE/misconfig + active SQLi/SSRF/XSS scanning |
| Manual proxy | **mitmproxy** | Script-driven HMAC-token testing for IDOR / replay / timing |

Optional (run if you have time, mostly to confirm clean):
- **sqlmap** — depth on SQLi (expected to find nothing; verify)
- **Wapiti** — overlaps Nuclei+Schemathesis; useful as a sanity check
- **testssl.sh** — TLS config audit (run against production, not local)

---

## Setup

One-time install. Pick the package manager you already use; commands below are
the most common.

```bash
# Python tools (use a venv if you want)
pip install semgrep bandit schemathesis checkov pip-audit

# Native binaries via Homebrew
brew install hadolint nuclei mitmproxy sqlmap

# Docker-based (no install, just docker run)
docker pull goodwithtech/dockle
docker pull cyberwatch/wapiti          # optional
docker pull ghcr.io/zaproxy/zaproxy:stable  # optional, alternative to Nuclei DAST
```

Run the backend with Swagger enabled so the API-aware tools can ingest the spec:

```bash
ENABLE_API_DOCS=true RATELIMIT_ENABLED=False docker compose up -d
# Verify:
curl -s http://localhost:5001/static/swagger.json | head -c 200
```

> **Why disable rate limits for local testing:** Schemathesis and Nuclei will
> burn through them in seconds and spend the rest of the run getting 429s.
> Re-enable for a final smoke run.

---

## Per-tool plan

### 1. Semgrep — local SAST

**Looking for:** intra-file taint patterns, dangerous APIs, Flask-specific
anti-patterns, React `dangerouslySetInnerHTML`, hardcoded secrets, weak crypto.

**Command**
```bash
semgrep \
  --config=p/python --config=p/flask --config=p/javascript --config=p/react \
  --config=p/owasp-top-ten --config=p/security-audit \
  --error \
  ./backend ./frontend/src
```

**Specific things to grep for in the output for this app**
- [ ] Anything flagging `text()` calls in `backend/app.py:813,837` — should be
      false positive (allowlist-gated), document if needed
- [ ] Any `dangerouslySetInnerHTML` in frontend components — there should be none
- [ ] Any `eval()` or `Function()` in frontend code
- [ ] Any `requests.get(...)` without a timeout (we have timeout=10 / timeout=15
      but verify)
- [ ] Hardcoded URLs / tokens / passwords (none expected)

**Action on findings:** classify each as true positive / false positive. For
each FP, write a one-line `# nosemgrep: <rule-id>  reason: ...` annotation in
the source so the codebase remains scan-clean.

**Time:** ~30 s on ~6.5 KLOC.

---

### 2. Bandit — Python-specific SAST

**Looking for:** Python idioms that Semgrep's polyglot ruleset misses —
`assert` in prod, `pickle`/`yaml.load`/`subprocess shell=True`, weak hashes,
insecure SSL contexts, Flask `debug=True`.

**Command**
```bash
bandit -r ./backend -ll -ii -f txt
# -ll = medium+ severity, -ii = medium+ confidence
```

**Specific checks worth eyeballing**
- [ ] B201: Flask `debug=True` — `backend/app.py:994` reads from env, default
      `false`. Should not flag.
- [ ] B324: weak hash function — we use SHA-256, not MD5/SHA1. Should not flag.
- [ ] B105/B106/B107: hardcoded password — none expected.
- [ ] B608: SQL injection via string formatting — the `date_trunc('{trunc}', ...)`
      pattern at `app.py:813,837` may flag. Document with a comment.

**Action on findings:** for legitimate FPs, add `# nosec B608  reason: trunc is
allowlist-validated (_TRUNC_WHITELIST)` inline.

**Time:** <5 s.

---

### 3. hadolint — Dockerfile linter

**Looking for:** Dockerfile anti-patterns that aren't CVEs — unpinned apt
packages, missing `HEALTHCHECK`, `USER root` left at end, `:latest` base
tags, multi-stage opportunities, etc.

**Command**
```bash
docker run --rm -i hadolint/hadolint < backend/Dockerfile
docker run --rm -i hadolint/hadolint < frontend/Dockerfile
```

**Specific checks for this repo's Dockerfiles**
- [ ] `DL3008` pin `apt-get install` versions — backend uses `python:3.14-slim`,
      may flag if any apt-get is unpinned
- [ ] `DL3025` use JSON form for CMD/ENTRYPOINT — verify
- [ ] `DL3007` no `:latest` tag — verify base images are pinned
- [ ] `DL3002` no `USER root` at end — should be fine (Nginx workers drop)
- [ ] `DL3009` clean apt lists after install — backend should `rm -rf
      /var/lib/apt/lists/*`

**Action:** fix each finding or document why it's intentional. The Dockerfiles
are small enough that the report should be short.

**Time:** <1 s per Dockerfile.

---

### 4. dockle — built-image inspector

**Looking for:** runtime image properties Trivy doesn't check — does the image
run as root, is there a `HEALTHCHECK`, are credentials in `ENV` vars, are
setuid/setgid files present.

**Command** (after `docker compose build`)
```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  goodwithtech/dockle vexlconverter-backend:latest

docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  goodwithtech/dockle vexlconverter-frontend:latest
```

**Specific checks for this repo**
- [ ] `CIS-DI-0001` image runs as root — frontend nginx default may flag;
      acceptable since nginx workers drop. Document.
- [ ] `CIS-DI-0006` no `HEALTHCHECK` — both Dockerfiles already have one. Should
      not flag.
- [ ] `DKL-DI-0006` env vars look like secrets — should not flag (`VITE_API_URL`
      is not a secret pattern).
- [ ] `CIS-DI-0008` setuid/setgid files — should be clean.

**Action:** for each unavoidable finding, document the mitigation. The nginx
master-as-root case is a known platform constraint.

**Time:** ~5 s per image.

---

### 5. Checkov (docker-compose only) — compose misconfig

**Looking for:** misconfigured compose services — `privileged: true`, host
networking, Docker socket bind-mounts, unbounded resource limits, missing
`read_only`, missing `cap_drop`.

**Command**
```bash
checkov -f docker-compose.yml --framework docker_compose --quiet --compact
```

**Specific checks for this repo's compose**
- [ ] No `privileged: true` anywhere — should pass
- [ ] No `network_mode: host` — should pass
- [ ] No `/var/run/docker.sock:/var/run/docker.sock` bind — should pass
- [ ] Volume mounts — `./backend:/app` for dev hot-reload is fine in dev but
      flag-worthy in prod (we use the built image in prod, this is dev-only)
- [ ] Missing `read_only`, missing `cap_drop` — both will flag. These are
      defense-in-depth; decide whether to add or document.

**Action:** add `cap_drop: [ALL]` + `cap_add: [...]` to compose services if you
want to harden further. Otherwise document the choice.

**Time:** ~10 s.

---

### 6. Schemathesis — OpenAPI-driven API fuzzer (highest signal)

**Looking for:** schema-vs-response violations, 5xx crashes on edge inputs,
type confusion, missing/extra fields, wrong status codes, stateful sequence
bugs. **This is the tool most likely to find new bugs.**

**Command**
```bash
# Start backend with rate limiting off
RATELIMIT_ENABLED=False ENABLE_API_DOCS=true docker compose up -d

st run \
  --base-url=http://localhost:5001 \
  --checks=all \
  --phases=examples,coverage,fuzzing,stateful \
  --max-examples=200 \
  --request-timeout=10000 \
  --report=junit:schemathesis.xml \
  http://localhost:5001/static/swagger.json
```

For endpoints that need a token, generate one first and pass via header:
```bash
TOKEN=$(curl -s -XPOST http://localhost:5001/api/alerts \
  -H 'Content-Type: application/json' \
  -d '{"target_price":100,"currency":"usd","direction":"above","crypto":"bitcoin"}' \
  | python -c 'import sys, json; print(json.load(sys.stdin)["data"]["edit_token"])')

st run --header "X-Alert-Token: $TOKEN" \
  --base-url=http://localhost:5001 \
  --checks=all --phases=fuzzing \
  http://localhost:5001/static/swagger.json
```

**Specific bug classes to look for**
- [ ] **5xx on edge inputs** (NaN, Infinity, huge ints, surrogate-pair unicode,
      empty strings, deeply nested JSON). PR #45 fixed one class; there may be
      more. Each 5xx = bug.
- [ ] **Schema violations**: response shape doesn't match swagger.json. If
      Schemathesis flags one, either fix the response or update the schema.
- [ ] **Missing 400s**: endpoint accepts malformed input without rejecting.
- [ ] **`Content-Type` mismatches**: backend says `application/json` but ships
      something else.
- [ ] **`ignored_auth` check** failures: an endpoint that should require a
      token accepts a request without one.

**Action on findings:** for each 5xx, write a regression test before fixing.
Schemathesis prints minimal repros via Hypothesis shrinking — paste them into
the issue/PR.

**Time:** 3–15 min depending on `--max-examples`. Start with `200`; bump to
`1000` for a deeper run.

---

### 7. Nuclei — DAST + OpenAPI + CVE templates

**Looking for:** known-vulnerable patterns (exposed `.env`, `.git`, debug
mode, server fingerprints), and active SQLi/SSRF/XSS/CMDi via DAST mode
driven from the OpenAPI spec.

**Command**
```bash
# Pull latest templates
docker run --rm projectdiscovery/nuclei:latest -update-templates

# Baseline scan (exposures + misconfig)
docker run --rm --network host -v $PWD:/sgr \
  projectdiscovery/nuclei:latest \
  -u http://localhost:5001 \
  -t http,exposures,misconfiguration \
  -severity low,medium,high,critical \
  -o /sgr/nuclei-baseline.txt

# OpenAPI-driven DAST (SQLi, SSRF, XSS, CMDi)
docker run --rm --network host -v $PWD:/sgr \
  projectdiscovery/nuclei:latest \
  -l /sgr/swagger-local.json \
  -im openapi \
  -dast \
  -severity low,medium,high,critical \
  -o /sgr/nuclei-dast.txt
# Where swagger-local.json was saved from /static/swagger.json
```

Also scan the frontend for static exposures:
```bash
docker run --rm --network host projectdiscovery/nuclei:latest \
  -u http://localhost:3000 -t http,exposures
```

**Specific things expected to NOT fire (verify)**
- [ ] No exposed `.env`, `.git`, `composer.lock`, `package.json`, etc. on
      either host
- [ ] No Flask `debug=True` console exposed
- [ ] No directory listing on nginx
- [ ] No swagger.json on the frontend (Vite shouldn't ship it; verify)
- [ ] DAST mode should NOT find SQLi (allowlists + bound params), SSRF
      (no user-controlled URL paths), XSS (CSP + React escaping)

**Action:** every fired template gets reviewed; most will be info-only. Real
findings get a fix or a documented "intentional" note.

**Time:** 2–8 min for baseline + DAST combined.

---

### 8. mitmproxy — manual HMAC-token testing (no automation can do this)

**Looking for:** IDOR, token replay, timing attacks, side-channel leaks. The
alert-token model is the only auth surface; automated tools can't reason about
its semantics.

**Command**
```bash
# Run mitmproxy as a reverse proxy in front of the backend
mitmweb --mode reverse:http://localhost:5001 --listen-port 8080

# In another terminal, point the frontend at the proxy
VITE_API_URL=http://localhost:8080 docker compose up -d frontend
```

Then in mitmweb (opens browser at http://127.0.0.1:8081):

**Test checklist for the token system**
- [ ] Create an alert, capture the `POST /api/alerts` request + the returned
      `edit_token`. Save it.
- [ ] **IDOR via enumeration**: `DELETE /api/alerts/1`, `DELETE /api/alerts/2`,
      ... with a wrong token. All should return identical 403 (verifies the
      enumeration-prevention design from `app.py:638-651`).
- [ ] **Token replay across sessions**: re-send the captured `POST /api/alerts`
      with the same body — should create a new alert with a new token (no
      idempotency token expected here, but the design should be sound).
- [ ] **Timing oracle**: send `DELETE /api/alerts/<random_high_id>` with
      various wrong tokens. Measure response times via mitmproxy's timing
      column. Look for distinguishable groups (suggests `hmac.compare_digest`
      isn't reaching it).
- [ ] **Header smuggling**: send `X-Alert-Token` twice, with garbage in one
      and the real token in the other. What does Flask see? (`request.headers.get`
      returns the first or last by client implementation; verify.)
- [ ] **CRLF in headers**: send `X-Alert-Token: foo\r\nX-Injected: bar`.
      Werkzeug should reject. Verify.
- [ ] **Auth confusion**: send `X-Alert-Tokens` (plural, list endpoint header) to
      `DELETE /api/alerts/<id>` (which expects singular). Should not work.
- [ ] **Empty/whitespace tokens**: `X-Alert-Token: ` (empty), `X-Alert-Token:
      \t\t\t`. Should 403.

**Action:** any timing-distinguishable group or any 200/204 on a wrong token
is a real finding.

**Time:** 30–60 min of focused manual work.

---

### Optional: sqlmap — SQLi depth check

Expected to find nothing (the audit showed ORM-only + one allowlist-gated
f-string), but worth running for completeness and for the writeup.

```bash
# Per-endpoint
sqlmap -u "http://localhost:5001/api/prices/latest?crypto=bitcoin" \
       --batch --level=3 --risk=2

sqlmap -u http://localhost:5001/api/convert \
       --method=POST \
       --data='{"amount":1,"crypto":"bitcoin"}' \
       --headers="Content-Type: application/json" \
       --batch --level=3 --risk=2
```

Expected output: "no injectable parameters". If anything different, that's a
finding.

---

### Optional: testssl.sh — TLS configuration (production only)

```bash
docker run --rm -ti drwetter/testssl.sh \
  --html /tmp/ssl-report.html \
  https://vexlconverter.vercel.app/

docker run --rm -ti drwetter/testssl.sh \
  --html /tmp/ssl-report-api.html \
  https://vexlconverter-api.onrender.com/
```

**What to verify**
- [ ] TLS 1.2 + 1.3 only; TLS 1.0/1.1/SSLv3 disabled
- [ ] HSTS header `max-age >= 31536000` (we already verified ✅)
- [ ] No weak ciphers (RC4, 3DES, NULL)
- [ ] No certificate transparency issues
- [ ] OCSP stapling enabled (Vercel/Render usually yes)

Vercel and Render both typically score A+. The exercise here is documentation,
not finding bugs.

---

## Suggested workflow (one focused afternoon)

| Time | Step | Tool | Why this order |
|---|---|---|---|
| 0:00 | Local stack up with `ENABLE_API_DOCS=true RATELIMIT_ENABLED=False` | docker compose | Prereq for API-aware tools |
| 0:05 | Static pass | Semgrep + Bandit | Fastest signal; fix easy issues before fuzzing |
| 0:15 | Config pass | hadolint + dockle + Checkov | Independent of running app, no interference |
| 0:25 | Schemathesis run | Schemathesis | Highest probability of finding new bugs; let it run |
| 0:45 | Triage Schemathesis output | (review) | Fresh, focused triage |
| 1:30 | Nuclei baseline + OpenAPI DAST | Nuclei | Complements Schemathesis; different bug classes |
| 2:00 | Manual proxy session | mitmproxy | Test the HMAC token model |
| 3:00 | Optional sqlmap + Wapiti | (if time) | Mostly verification |
| 3:30 | Write up findings | (text editor) | The writeup is the portfolio asset |
| 4:00 | Re-enable rate limiting, redeploy | docker compose | Cleanup |

Total active engagement: ~3 hours. Mostly the tools run while you do other
things.

---

## What to do with findings

For each finding:

1. **Reproduce manually.** Tools have false positives; verify before fixing.
2. **Classify by exploitability**, not by tool severity:
   - *Exploitable now* → ship a fix in a PR today
   - *Exploitable under different config* → document the condition + decide whether to harden
   - *Not exploitable / false positive* → document why, suppress with inline annotation
3. **Write a regression test before fixing.** Especially for Schemathesis
   findings — they're already minimal repros.
4. **Commit the suppressions as code**, not as documentation. A `# nosec` /
   `# nosemgrep` annotation next to the line is more reliable than a wiki
   entry that drifts.
5. **Open one PR per finding.** Each becomes a portfolio-quality artifact
   showing the find → fix → test cycle.

---

## What this plan deliberately does NOT cover

- **Network-layer pentesting** (nmap, Wireshark) — your app runs on managed
  PaaS, no exposed network surface to test
- **Password/credential cracking** (Hashcat, John) — you have no passwords
- **Subdomain enumeration** (Amass, Subfinder) — you only own `*.vercel.app` /
  `*.onrender.com` subdomains via your accounts; nothing to discover
- **Exploitation frameworks** (Metasploit) — you're finding bugs, not
  exploiting; wrong layer
- **Commercial scanners** (Burp Pro, Snyk paid tier, Veracode) — open-source
  equivalents cover this app's surface; paid tools would mostly add weight

## Skills demonstrated by completing this plan

If you write the work up afterwards (highly recommended), the resulting
artifact shows:
- Threat modeling (knowing what to test)
- Tool selection with documented rationale
- Hands-on use of mainstream AppSec tooling
- Triage discipline (separating exploitability from severity)
- Communication (the writeup itself)

That's a portfolio piece worth more than the bugs you find.
