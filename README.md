# Vexl Converter

Vexl Converter — a Bitcoin & cryptocurrency conversion platform with live prices, historical charts, and user-configurable alerts.

🌐 **[Live Demo](https://vexlconverter.vercel.app)** · 🔌 **[API health](https://vexlconverter-api.onrender.com/api/health)**

![Python](https://img.shields.io/badge/python-3.14-blue)
![React](https://img.shields.io/badge/react-19-61dafb)
![Postgres](https://img.shields.io/badge/postgres-15-336791)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![CI](https://github.com/PeterXMR/vexlconverter/actions/workflows/docker-image.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.2.0-blue)

![Screenshot](screenshot.png)

## Features

- **Four conversion modes** — BTC↔fiat, crypto↔crypto, fiat↔fiat, and a universal "any to any" mode
- **Reverse conversion** — fiat amount back to crypto
- **162 fiat currencies** sourced from ExchangeRate-API, with a searchable picker
- **Price alerts** with persistent storage, per-alert ownership tokens, triggered-alert queue, and browser-notification acknowledgement
- **Historical price charts** with 24h / 7d / 30d / 1Y ranges and USD/EUR toggle
- **Live prices** sourced from CoinGecko, refreshed by APScheduler
- **Fluid UI** that reflows from desktop down to ~360 px (container queries + auto-fit grids)
- **Security**: per-alert HMAC-verified edit tokens, Flask-Limiter rate limiting, strict CSP, HSTS, no IP logging
- **Swagger UI** for interactive API exploration
- **Dockerised stack** (Flask API, React SPA served by Nginx, PostgreSQL 15) plus production manifests for Vercel + Render + Neon

## Architecture

```mermaid
flowchart LR
  User([Browser]) -->|HTTPS| SPA[React SPA<br/>Vercel / Nginx]
  SPA -->|REST JSON| API[Flask API<br/>Render / Docker]
  API -->|SQLAlchemy| PG[(PostgreSQL<br/>Neon / Docker)]
  API -.->|scheduled| CG[CoinGecko]
  API -.->|on demand| ER[ExchangeRate-API]
  APS[APScheduler] -.-> API
```

The same containers run locally (`docker compose`) and on managed services in production (Vercel for the SPA, Render for the API, Neon for Postgres).

## Tech stack

| Layer     | Tech                                  | Purpose                                              |
|-----------|---------------------------------------|------------------------------------------------------|
| Frontend  | React 19, Axios, Chart.js             | SPA UI, API calls, price-history visualisation       |
| Web tier  | Nginx (Docker) / Vercel (prod)        | Serves the production React bundle                   |
| Backend   | Python 3.14, Flask 3, SQLAlchemy 2    | REST API and ORM                                     |
| Jobs      | APScheduler                           | Periodic price refresh and history jobs              |
| Database  | PostgreSQL 15 (Docker) / Neon (prod)  | Price snapshots, alerts, history                     |
| Rate limit| Flask-Limiter (in-memory)             | Per-IP buckets on write/expensive endpoints          |
| Data feeds| CoinGecko + ExchangeRate-API          | Live crypto prices + 162 fiat cross-rates            |
| Docs      | Swagger UI + `backend/swagger.json`   | Interactive API reference                            |
| CI        | GitHub Actions                        | Lint, tests, build, Docker smoke test, Trivy scan    |

## Quick start

### Docker (recommended)

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Swagger UI: http://localhost:5001/api/docs (set `ENABLE_API_DOCS=true` to enable in production)

Stop the stack with `docker compose down`.

### Local development

```bash
# 1. Start Postgres only
docker compose up -d postgres

# 2. Backend
cd backend
pip install -r requirements.txt
python app.py          # listens on :5001

# 3. Frontend (new terminal)
cd frontend
npm install
npm start              # listens on :3000
```

## API reference

All endpoints are rooted at `http://localhost:5001`. See Swagger UI (`/api/docs`) or the raw
schema (`/static/swagger.json`) for request/response payloads.

| Method | Path                       | Rate limit         | Description                                        |
|--------|----------------------------|--------------------|----------------------------------------------------|
| GET    | `/api/health`              | —                  | Liveness probe                                     |
| GET    | `/api/cryptos`             | —                  | List supported cryptocurrencies                    |
| GET    | `/api/fiat-rates`          | 30/min             | USD-base fiat rates (cached, proxied)              |
| GET    | `/api/prices/latest`       | —                  | Latest price snapshot                              |
| GET    | `/api/prices/all`          | —                  | Full latest-price table, grouped by asset          |
| POST   | `/api/convert`             | —                  | Convert a crypto amount to fiat                    |
| POST   | `/api/convert/reverse`     | —                  | Convert a fiat amount back to crypto               |
| POST   | `/api/alerts`              | 10/min             | Create a price alert (returns one-time edit token) |
| GET    | `/api/alerts`              | —                  | List alerts you own (`X-Alert-Tokens` header)      |
| DELETE | `/api/alerts/<id>`         | —                  | Delete an alert you own (`X-Alert-Token` header)   |
| GET    | `/api/alerts/triggered`    | —                  | Triggered, unacked alerts you own                  |
| POST   | `/api/alerts/ack`          | 10/min             | Acknowledge one or more triggered alerts           |
| GET    | `/api/prices/history`      | 20/min             | Historical prices (24h / 7d / 30d / 1y)            |
| GET    | `/static/swagger.json`     | —                  | Raw OpenAPI document                               |

Alert ownership is enforced via per-alert tokens: `POST /api/alerts` returns a one-time edit
token, which the client stores in `localStorage` and replays via `X-Alert-Token` (single) or
`X-Alert-Tokens` (comma-separated for list) headers. The server stores only a SHA-256 hash and
constant-time compares with `hmac.compare_digest`.

## Project structure

```
.
├── backend/                  # Flask API, models, scheduler, Swagger
│   ├── app.py
│   ├── models.py
│   ├── scheduler.py
│   ├── swagger.json
│   ├── requirements.txt
│   ├── entrypoint.sh
│   ├── gunicorn.conf.py
│   ├── test_setup.py
│   └── Dockerfile
├── frontend/                 # React SPA + Nginx image
│   ├── src/
│   ├── public/
│   ├── nginx.conf
│   ├── package.json
│   └── Dockerfile
├── database/
│   └── init.sql              # Postgres schema bootstrap (Docker)
├── scripts/
│   ├── diagnose.sh           # Environment diagnostic helper
│   ├── fresh-setup.sh        # Wipe-and-rebuild helper
│   ├── start-docker.sh       # Convenience launcher (Docker)
│   ├── start-local.sh        # Convenience launcher (local dev)
│   └── test-workflow.sh      # Reproduces the CI steps locally
├── .github/workflows/
│   └── docker-image.yml      # CI: lint + test + build + smoke test + Trivy
├── docker-compose.yml        # Multi-container orchestration (local)
├── render.yaml               # Render Blueprint (backend deploy)
├── vercel.json               # Vercel headers (CSP, HSTS, Permissions-Policy)
├── screenshot.png
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Configuration

The backend reads the following environment variables. Supply them via `docker-compose.yml`,
your shell, a local `.env` file, or platform secrets (Render env vars for production).

| Variable                   | Default                                                          | Purpose                                            |
|----------------------------|------------------------------------------------------------------|----------------------------------------------------|
| `DATABASE_URL`             | _required in production; `postgresql://user:user@localhost:5432/btc_converter` for local_ | SQLAlchemy connection string         |
| `FLASK_ENV`                | `production`                                                     | `production` enforces DATABASE_URL + disables docs |
| `FLASK_PORT`               | `5001`                                                           | API listen port                                    |
| `FLASK_DEBUG`              | `false`                                                          | Enables Flask debug mode                           |
| `LOG_LEVEL`                | `INFO`                                                           | Python logging level                               |
| `CORS_ORIGINS`             | `http://localhost:3000`                                          | Comma-separated allowed origins                    |
| `COINGECKO_API_URL`        | `https://api.coingecko.com/api/v3/simple/price`                  | Upstream crypto price feed                         |
| `FIAT_RATES_PROVIDER_URL`  | `https://open.er-api.com/v6/latest/USD`                          | Upstream fiat-rates feed (proxied)                 |
| `PRICE_UPDATE_INTERVAL`    | `300` (seconds)                                                  | APScheduler refresh interval                       |
| `RUN_SCHEDULER`            | `true`                                                           | Set to `false` to disable in-process scheduler     |
| `ENABLE_API_DOCS`          | `false` in production                                            | Forces Swagger UI on in production                 |
| `POSTGRES_PASSWORD`        | `changeme`                                                       | Postgres password for the Docker stack             |

The frontend reads `VITE_API_URL` at build time (Vite inlines `import.meta.env.VITE_*` into
the bundle, so it must be set before `npm run build` or passed as a Docker build `ARG`).

## Testing

```bash
# Backend (lint + tests if present)
cd backend
ruff check .
# pytest runs only if backend/tests/ exists

# Frontend (smoke test + production build)
cd frontend
npm test -- --watchAll=false
npm run build
```

`scripts/test-workflow.sh` reproduces the CI pipeline locally: it builds the images, boots the
stack, and hits `/api/health`.

## Deployment

**Production deployment** uses three managed services configured to mirror the local Docker
stack:

- **Frontend → Vercel** — `vercel.json` ships strict security headers (CSP, HSTS, Referrer-Policy,
  Permissions-Policy). Set `VITE_API_URL` to the backend URL as a build-time env var.
- **Backend → Render** — `render.yaml` is a Render Blueprint that builds the Docker image.
  Set `DATABASE_URL` and `CORS_ORIGINS` as Render secrets.
- **Database → Neon** — managed Postgres; copy the connection string into Render as
  `DATABASE_URL`. Schema is auto-bootstrapped on first startup via `init_schema()` in
  `backend/models.py`.

For any other host with Docker Engine, `docker compose up -d` runs the whole stack. Put a
reverse proxy (Caddy / Traefik) in front for TLS if you're self-hosting.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, branch naming, and commit conventions.

## Security

Security policy and vulnerability disclosure instructions are in [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
