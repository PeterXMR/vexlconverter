# Vexl Converter

Vexl Converter — a Bitcoin & cryptocurrency conversion platform with live prices, historical charts, and user-configurable alerts.

![Python](https://img.shields.io/badge/python-3.12-blue)
![React](https://img.shields.io/badge/react-18-61dafb)
![Postgres](https://img.shields.io/badge/postgres-15-336791)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![CI](https://github.com/PeterXMR/vexlconverter/actions/workflows/docker-image.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.2.0-blue)

<!-- TODO: add a real screenshot at docs/screenshot.png -->
![Screenshot](docs/screenshot.png)

## Features

- Multi-crypto conversion (Bitcoin plus additional cryptocurrencies) against multiple fiat currencies
- Fiat-to-fiat conversion using cross-rates derived from crypto price feeds
- Universal conversion mode that lets the user pick any supported pair
- Reverse conversion (fiat amount back to crypto)
- Price alerts with persistent storage, triggered-alert queue, and acknowledgement flow
- Historical price charts with 24h / 7d / 30d ranges
- Live prices sourced from the CoinGecko public API, refreshed on a schedule
- APScheduler background jobs for price refresh and history backfill
- Swagger UI for interactive API exploration
- Dockerised stack (Flask API, React SPA served by Nginx, PostgreSQL 15)

## Architecture

```mermaid
flowchart LR
  User([Browser]) -->|HTTP| Nginx[Nginx / React SPA]
  Nginx -->|REST JSON| Flask[Flask API]
  Flask -->|SQLAlchemy| PG[(PostgreSQL)]
  Flask -.->|Scheduled fetch| CG[CoinGecko API]
  APS[APScheduler] -.-> Flask
```

## Tech stack

| Layer     | Tech                                  | Purpose                                              |
|-----------|---------------------------------------|------------------------------------------------------|
| Frontend  | React 18, Axios, Chart.js             | SPA UI, API calls, price-history visualisation        |
| Web tier  | Nginx                                 | Serves the production React bundle                    |
| Backend   | Python 3.12, Flask 3, SQLAlchemy 2    | REST API and ORM                                      |
| Jobs      | APScheduler                           | Periodic price refresh and history jobs               |
| Database  | PostgreSQL 15                         | Price snapshots, alerts, history                      |
| Data feed | CoinGecko public API                  | Source of live and historical prices                  |
| Docs      | Swagger UI + `swagger.json`           | Interactive API reference                             |
| CI        | GitHub Actions                        | Build and smoke-test the Docker images                |

## Quick start

### Docker (recommended)

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5001
- Swagger UI: http://localhost:5001/api/docs

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

| Method | Path                       | Description                                         |
|--------|----------------------------|-----------------------------------------------------|
| GET    | `/api/health`              | Liveness probe                                      |
| GET    | `/api/cryptos`             | List supported cryptocurrencies                     |
| GET    | `/api/prices/latest`       | Latest price snapshot (all supported assets)        |
| GET    | `/api/prices/all`          | Full latest-price table, grouped by asset           |
| POST   | `/api/convert`             | Convert a crypto amount to fiat                     |
| POST   | `/api/convert/reverse`     | Convert a fiat amount back to crypto                |
| POST   | `/api/alerts`              | Create a price alert                                |
| GET    | `/api/alerts`              | List all configured alerts                          |
| DELETE | `/api/alerts/<id>`         | Delete an alert by id                               |
| GET    | `/api/alerts/triggered`    | List alerts that have fired but not been acked      |
| POST   | `/api/alerts/ack`          | Acknowledge one or more triggered alerts            |
| GET    | `/api/prices/history`      | Historical prices (24h / 7d / 30d ranges)           |
| GET    | `/static/swagger.json`     | Raw OpenAPI document                                |

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
│   ├── test_setup.py
│   └── Dockerfile
├── frontend/                 # React SPA + Nginx image
│   ├── src/
│   ├── public/
│   ├── nginx.conf
│   ├── package.json
│   └── Dockerfile
├── database/
│   └── init.sql              # Postgres schema bootstrap
├── .github/workflows/
│   └── docker-image.yml      # CI: build + smoke-test images
├── docker-compose.yml        # Multi-container orchestration
├── diagnose.sh               # Environment diagnostic helper
├── fresh-setup.sh            # Wipe-and-rebuild helper
├── start-docker.sh           # Convenience launcher (Docker)
├── start-local.sh            # Convenience launcher (local dev)
├── test-workflow.sh          # Reproduces the CI steps locally
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Configuration

The backend reads the following environment variables. See `.env.example` (if present) for a
template; supply them via `docker-compose.yml`, your shell, or a local `.env` file.

| Variable                 | Default                                                          | Purpose                                   |
|--------------------------|------------------------------------------------------------------|-------------------------------------------|
| `DATABASE_URL`           | `postgresql://user:user@localhost:5432/btc_converter`            | SQLAlchemy connection string              |
| `FLASK_ENV`              | `development`                                                    | Flask environment                         |
| `FLASK_PORT`             | `5001`                                                           | API listen port                           |
| `COINGECKO_API_URL`      | `https://api.coingecko.com/api/v3/simple/price`                  | Upstream price feed                       |
| `PRICE_UPDATE_INTERVAL`  | `300` (seconds)                                                  | APScheduler refresh interval              |

The frontend reads `REACT_APP_API_URL` at build time (Create React App bakes env vars into the
bundle, so it must be set before `npm run build` or passed as a Docker build `ARG`).

## Testing

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

`test-workflow.sh` at the repo root reproduces the CI pipeline locally: it builds the images,
boots the stack, and hits `/api/health`.

## Deployment

The project ships as three containers orchestrated by `docker-compose.yml` and will run on any
host with Docker Engine. For managed platforms:

- **Fly.io** — `fly launch` from the repo root; create a Postgres attachment and set
  `DATABASE_URL` as a secret.
- **Render** — one web service per Dockerfile plus a managed Postgres instance.
- **Any VPS** — clone, set env vars, `docker compose up -d`, put a reverse proxy (Caddy / Traefik)
  in front for TLS.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, branch naming, and commit conventions.

## Security

Security policy and vulnerability disclosure instructions are in [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
