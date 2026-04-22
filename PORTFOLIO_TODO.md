# Portfolio Readiness TODO — Vexl Converter

> Status legend: `[x]` shipped · `[ ]` open · `[~]` partially done

Verified by a 4-agent parallel review, fixed by a 4-agent parallel implementation pass, then hardened through end-to-end verification — all on 2026-04-22.

---

## ✅ Shipped in this pass

### P0 — Fixed

- [x] README rewritten: drops "MVP v0.0.1", labels v0.2.0, documents all 13 endpoints, Mermaid architecture diagram, shields.io badges, real project tree
- [x] `LICENSE` file added (MIT, 2026, PeterXMR)
- [x] `backend/Dockerfile`: `python:3.14-slim` → `python:3.12-slim`
- [x] `backend/Dockerfile`: `ENV POSTGRES_PASSWORD=changeme` removed
- [x] `backend/Dockerfile`: non-root `appuser` + `curl` for healthcheck + `HEALTHCHECK` directive
- [x] `frontend/Dockerfile`: rewritten multi-stage (node:20-alpine builder → nginx:alpine); `ARG REACT_APP_API_URL`
- [x] `backend/models.py`: `user:user` fallback now logs a warning; `declarative_base` from `sqlalchemy.orm`; all `datetime.utcnow()` → `datetime.now(timezone.utc)`
- [x] `backend/entrypoint.sh`: Flask dev server → `gunicorn --preload --workers 2`
- [x] `backend/app.py`: `CORS(app)` wildcard → `CORS_ORIGINS` env-var allow-list
- [x] `backend/app.py`: every `str(e)` (10 sites) → `logger.exception()` + generic `{'error': 'internal server error'}`
- [x] `backend/app.py`: all 12 `SessionLocal()` / `db.close()` sites → `with get_db() as db:`
- [x] `Converter.js`, `PriceChart.js`, `AlertManager.js`: `API_URL` now reads `process.env.REACT_APP_API_URL`
- [x] `frontend/src/App.test.js`: broken "learn react" assertion → real smoke test
- [x] `frontend/src/components/PriceCard.js` + CSS: corrupted file deleted (nothing imported it)
- [x] `docker-compose.yml`: Postgres port bound to `127.0.0.1:5432:5432`
- [x] Converter swap arrows: `<div onClick>` → `<button type="button" aria-label>`

### P1 — Fixed

**Backend**
- [x] `/api/health` probes DB with `SELECT 1`, returns 503 on failure
- [x] APScheduler gated by `RUN_SCHEDULER` env; `gunicorn --preload` ensures single instance
- [x] `date_trunc(:trunc, ...)` → whitelisted literal interpolation
- [x] `VALID_FIAT_CURRENCIES` now enforced
- [x] `MAX_AMOUNT = 1e12` upper bound on convert/reverse/alert endpoints
- [x] CoinGecko history seeding uses `INSERT ... ON CONFLICT DO NOTHING`
- [x] `datetime.utcnow()` swept from `app.py`, `models.py`, `scheduler.py`
- [x] `swagger.json`: added `POST /api/alerts/ack` spec
- [x] All `print()` in `app.py` → `logger.info/warning/error`

**Frontend**
- [x] Conversion failures now set error state (was silent `console.error`)
- [x] `Notification.requestPermission()` moved from mount to user-gesture button
- [x] `ModeSwitch` has `role="tablist"`/`role="tab"`/`aria-selected`
- [x] `index.html` `<title>` + meta description updated; `manifest.json` identity updated
- [x] Frontend Dockerfile: `npm install --production` → `npm ci`
- [x] Dead `inputRef` removed
- [x] `ErrorBoundary` wraps the three main components
- [x] `React.lazy` + `Suspense` split `PriceChart` and `AlertManager` into a ~69 KB async chunk
- [x] Chart y-axis: `$` → `€` when only EUR is active

**Infra / CI**
- [x] CI rewritten: `backend-test` + `frontend-test` + `docker-build` + `security-scan` (Trivy, non-blocking)
- [x] `.env.example` at repo root
- [x] `backend/.dockerignore` + `frontend/.dockerignore`
- [x] `.github/dependabot.yml`: weekly pip, npm, github-actions, docker
- [x] postgres: `restart: unless-stopped`
- [x] `healthcheck:` on backend + frontend services
- [x] `REACT_APP_API_URL` wired via `build.args:`
- [x] `logging:` json-file rotation (10m × 3) on all services
- [x] `CORS_ORIGINS` threaded through compose → backend env

**Portfolio presentation**
- [x] Mermaid architecture diagram
- [x] shields.io badges (Python, React, Postgres, MIT, CI, version)
- [x] `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`
- [x] `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md` + `PULL_REQUEST_TEMPLATE.md`
- [x] 5 shell scripts moved to `scripts/`
- [x] Stale `TODO.txt` / `PythonProject/` references removed
- [x] "Future Enhancements" section stripped of already-implemented features

### P2 — Partially addressed

- [x] `requirements.txt` pinned (`psycopg==3.2.3`, `SQLAlchemy==2.0.36`, `gunicorn==22.0.0`)
- [x] Magic number `100000000` → `SATOSHIS_PER_BTC` constant
- [x] `print()` → `logging.getLogger(__name__)`
- [~] Loading skeletons still use "Loading…" text. Acceptable for v0.2.0.

### Bugs found during live verification (all fixed)

- [x] **EUR = 0 bug** — `/api/prices/history` joined two CoinGecko `/market_chart` series by exact-millisecond timestamp; the tail points drift by request latency, so the newest row was always written with `price_eur=0` and became the "latest" consumed by the converter. Fixed with nearest-neighbour match + 60s tolerance via `bisect`. (`backend/app.py`)
- [x] **Gunicorn fork races** — `--preload --workers 2` caused `ResourceClosedError` (shared engine) on Linux and SIGSEGV on macOS (Obj-C fork safety). Added `backend/gunicorn.conf.py` with `post_fork` hook disposing the SQLAlchemy engine so each worker builds a fresh pool; local dev uses `--workers 1` (no fork).
- [x] **MATIC → POL migration** — CoinGecko renamed `matic-network` to `polygon-ecosystem-token`. Stale ID returned empty `{}`, so MATIC showed `$0`. Updated `SUPPORTED_CRYPTOS` + symbol `MATIC` → `POL`.
- [x] **Swagger `/api/alerts/ack` spec mismatch** — spec said `{alert_id: int}` but code expects `{ids: [int]}`. Aligned spec to code.
- [x] **PYG + exotic-fiat coverage** — CoinGecko's `vs_currencies` list only has ~30 fiats and excludes Paraguayan Guarani. Migrated frontend fiat-rate source to `open.er-api.com` (166 fiats, no key, cached 10 min). Covers PYG, HUF, PHP, ILS, IDR, UAH, and every other fiat consistently.
- [x] **Universal-mode silent-USD fallback** — fiat→crypto path sent USD for any non-EUR source, silently returning wrong crypto amounts. Fixed by converting source fiat → USD via ER-API, then calling backend with the correct USD input.
- [x] **Universal-mode error handling** — unconditional `setError(null)` at end of function wiped errors set by per-branch `setError` calls; three silent-failure paths where `response.data.success === false` yielded no UI feedback. Refactored to collect `resolved` + `errMsg` locals, apply state deterministically once at end.
- [x] **`/api/prices/history` crypto validation** — endpoint accepted any `crypto` query param and returned 200 with empty data. Now rejects unknown crypto IDs with 400.
- [x] **Fiat↔fiat via ER-API** — previously used CoinGecko (broke on PYG). Now uses `(usdToTgt / usdToSrc)` cross-rate from ER-API.
- [x] **Stale UI copy** — "CoinGecko has no rate for this currency" replaced with provider-agnostic copy after ER-API migration.
- [x] **Add-currency stale-closure** — `performBtcConversion` captured old `additionalCurrencies.length`; first add wouldn't populate the rate until the user touched the input. Fixed by calling `fetchAdditionalRates` directly from `addCurrency` using the already-computed USD amount.

---

## 🟡 Still open (deferred — out of scope for this pass)

### P2 polish

- [ ] Python type hints on Flask route functions
- [ ] TypeScript migration for frontend
- [ ] Prettier + extended ESLint config
- [ ] CRA → Vite migration (CRA deprecated)
- [ ] Base images pinned by SHA digest
- [ ] Loading skeletons replacing "Loading…" text

### Structural (bigger scope)

- [ ] `Converter.js` decomposition into per-mode sub-components + `usePrices` hook (785 lines, 25 state vars — works, but would benefit from split)
- [ ] Pytest test suite under `backend/tests/` (CI is ready for it)
- [ ] Alembic migrations
- [ ] `conversion_history` table — wire up or drop from schema

### Signature moves (pick 1–2 for biggest recruiter impact)

- [ ] Live demo on Fly.io / Render
- [ ] WebSocket price streaming replacing 30-second poll
- [ ] Flask-Limiter rate limiting with `X-RateLimit-*` headers
- [ ] OpenTelemetry tracing with Jaeger screenshot in README
- [ ] CSV export of price history
- [ ] `docs/screenshot.png` (README already references the path)

### Follow-ups flagged during integration

- [ ] `SECURITY.md` contains `security@example.com` placeholder — replace before publishing
- [ ] `frontend/Dockerfile`: nginx master runs as root (workers drop to `nginx` user — idiomatic but not fully rootless). Swap to `nginxinc/nginx-unprivileged` for strict rootless.
- [ ] Git history has 3 identical `docker-publish.yml fix` commits — squash if history rewrite is acceptable
