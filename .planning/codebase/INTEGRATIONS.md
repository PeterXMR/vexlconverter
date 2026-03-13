# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

**Cryptocurrency Pricing:**
- CoinGecko API (free tier) - Provides real-time BTC price data
  - SDK/Client: `requests` library
  - Endpoint: `https://api.coingecko.com/api/v3/simple/price`
  - Usage: Backend scheduler fetches BTC/USD and BTC/EUR rates; frontend fetches additional currency rates
  - Rate limit: Free tier (no authentication required)
  - Parameters: `ids=bitcoin&vs_currencies=usd,eur` (backend), extended currency list (frontend)

## Data Storage

**Databases:**
- PostgreSQL 15-alpine
  - Connection: `postgresql://user:user@postgres:5432/btc_converter` (configurable via `DATABASE_URL` env var)
  - Client: SQLAlchemy 2.0+ ORM with psycopg3 driver
  - Tables:
    - `btc_prices` - Stores Bitcoin price history (id, btc_usd, btc_eur, timestamp, created_at)
    - `conversion_history` - Stores conversion records (optional, for audit trail)
  - Indexes:
    - `idx_btc_prices_timestamp` - For efficient latest price queries
    - `idx_conversion_history_timestamp` - For historical lookups

**File Storage:**
- Local filesystem only
  - Swagger API spec served from `backend/swagger.json`

**Caching:**
- None - Prices queried fresh from database on each request

## Authentication & Identity

**Auth Provider:**
- Custom/Internal - No external authentication
- Implementation: No authentication layer currently implemented
  - Frontend communicates directly with backend API
  - Backend has no authentication middleware
  - All endpoints are publicly accessible
  - No API keys required for internal communication

## Monitoring & Observability

**Error Tracking:**
- None detected - No external error tracking service configured

**Logs:**
- Standard approach:
  - Backend: Console logging via `print()` statements in Flask app
  - Frontend: `console.error()` for debugging
  - Docker: Accessible via `docker compose logs [service]`

**Health Checks:**
- Backend health endpoint: `GET /api/health`
- Database health: PostgreSQL healthcheck via `pg_isready` in docker-compose
- Frontend availability: HTTP 200 response on service startup

## CI/CD & Deployment

**Hosting:**
- Docker containers (self-hosted or cloud deployment)
- Deployment via docker-compose orchestration

**CI Pipeline:**
- GitHub Actions (`.github/workflows/docker-image.yml`)
  - Triggers: Push to main/master, pull requests
  - Steps:
    1. Checkout code
    2. Build all Docker images with compose
    3. Start all services
    4. Health checks for backend (GET /api/health)
    5. Availability checks for frontend (HTTP 200)
    6. Cleanup on completion

## Environment Configuration

**Required env vars:**
- `POSTGRES_PASSWORD` - Database password (default: changeme)
- `DATABASE_URL` - PostgreSQL connection string
- `FLASK_ENV` - Flask environment mode (development/production)
- `FLASK_PORT` - Port for Flask app (default: 5001)
- `COINGECKO_API_URL` - CoinGecko API endpoint (default: https://api.coingecko.com/api/v3/simple/price)
- `PRICE_UPDATE_INTERVAL` - Scheduler update frequency in seconds (default: 300)
- `REACT_APP_API_URL` - Backend API URL for frontend (default: http://localhost:5001)

**Secrets location:**
- `.env` file (not committed to git)
- Environment variables passed to Docker via docker-compose (development)
- No secrets management system currently integrated

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None - All integrations are pull-based (application fetches data)

---

*Integration audit: 2026-03-13*
