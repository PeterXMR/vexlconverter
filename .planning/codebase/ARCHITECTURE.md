# Architecture

**Analysis Date:** 2026-03-13

## Pattern Overview

**Overall:** Layered architecture with clear separation between frontend, backend, and data persistence layers. The application follows a client-server model with an asynchronous background job scheduler for periodic price updates.

**Key Characteristics:**
- Frontend and backend are independently deployable containerized services
- Stateless HTTP API with database-backed price data
- Background scheduler for periodic external API integration
- Real-time conversion calculations on the frontend with debouncing

## Layers

**Frontend (React):**
- Purpose: User interface for currency conversion, display of exchange rates
- Location: `frontend/src/`
- Contains: React components, styling, utilities
- Depends on: Backend API (`http://localhost:5001/api`), CoinGecko API for additional currencies
- Used by: Web browsers via port 3000

**Backend (Flask):**
- Purpose: Serve HTTP API endpoints, manage database operations, expose Swagger documentation
- Location: `backend/`
- Contains: Flask application, database models, scheduler logic, API endpoints
- Depends on: PostgreSQL database, CoinGecko API for price fetching
- Used by: Frontend application, scheduler job

**Data Persistence (PostgreSQL):**
- Purpose: Store Bitcoin price history and conversion records
- Location: Database service accessed via `postgresql://user:user@postgres:5432/btc_converter`
- Contains: `btc_prices` table (live rates), `conversion_history` table (optional usage tracking)
- Depends on: Init script at `database/init.sql`
- Used by: Backend API for reads/writes

**Scheduler (APScheduler):**
- Purpose: Periodically fetch and store Bitcoin prices from external API
- Location: `backend/scheduler.py`
- Contains: Background job that fetches from CoinGecko every 300 seconds (configurable)
- Depends on: CoinGecko API, PostgreSQL database
- Used by: Backend application startup

## Data Flow

**Price Fetch & Storage Flow:**

1. Backend starts on port 5001 and initializes scheduler
2. Scheduler attempts immediate price fetch from CoinGecko API
3. Fetched prices (BTC/USD, BTC/EUR) stored in `btc_prices` table with timestamp
4. Scheduler repeats fetch every 300 seconds (default, configurable via `PRICE_UPDATE_INTERVAL`)
5. If fetch fails, retry up to 3 times with 2-second delays between retries

**Conversion Request Flow:**

1. User enters BTC amount in `Converter` component frontend
2. Input validated for format (8 decimals for BTC, whole numbers for satoshis)
3. After 800ms debounce, POST request sent to `/api/convert` endpoint
4. Backend queries latest `btc_prices` record from database
5. Conversion calculated: `usd_amount = btc_amount × btc_usd_rate`
6. Result returned with current rates and timestamp
7. Frontend displays USD/EUR amounts and updates additional currency rates via CoinGecko API

**Additional Currency Flow:**

1. User clicks "Add Currency" button
2. Currency picker opens showing available currencies (24 options)
3. User selects currency, component fetches rate from CoinGecko API
4. Rate and converted amount displayed below USD/EUR outputs
5. Rate updates on every BTC amount change

**State Management:**

**Frontend (React local state):**
- `btcAmount`: Current input value (string for precision)
- `usdAmount`, `eurAmount`: Calculated output values
- `rates`: Current BTC/USD and BTC/EUR rates
- `additionalCurrencies`: Array of selected currencies with rates and amounts
- `loading`: Conversion in progress
- `error`: API error messages
- `unit`: BTC or SATS toggle

**Backend (Database):**
- `btc_prices`: Immutable records of historical rates
- `conversion_history`: Optional tracking (not currently used in frontend)

**External State:**
- CoinGecko API: Live rates for 50+ currencies

## Key Abstractions

**Converter Component:**
- Purpose: Main application UI, handles user input and state orchestration
- Location: `frontend/src/components/Converter.js`
- Pattern: React functional component with hooks (`useState`, `useEffect`, `useRef`)
- Responsibilities: Input validation, debouncing, API calls, currency management, formatting

**BTCPrice Model:**
- Purpose: ORM representation of price records in database
- Location: `backend/models.py`
- Pattern: SQLAlchemy declarative model with `to_dict()` serialization
- Responsibilities: Type conversion (Decimal to float), timestamping

**API Response Format:**
- All endpoints return JSON with `success` (boolean) and either `data` or `error` key
- Example: `{ "success": true, "data": { "btc_usd": 65000, ... } }`

**Error Handling Pattern:**
- Backend: Try-catch with HTTP status codes (404 for missing data, 500 for server errors)
- Frontend: Error state display at top of converter box, API failures logged to console
- Database: Transaction rollback on constraint violations, session cleanup in finally block

## Entry Points

**Frontend Entry:**
- Location: `frontend/src/index.js`
- Triggers: User navigates to `http://localhost:3000`
- Responsibilities: Mounts React app to DOM, renders `App` component

**Frontend App Root:**
- Location: `frontend/src/App.js`
- Triggers: Mounted by index.js
- Responsibilities: Renders `Converter` component

**Converter Component:**
- Location: `frontend/src/components/Converter.js`
- Triggers: Mounted by App
- Responsibilities: Main application logic and UI

**Backend Entry:**
- Location: `backend/app.py`
- Triggers: Docker container startup or `python app.py`
- Responsibilities: Flask app initialization, blueprint registration, scheduler startup

**Scheduler Startup:**
- Location: `backend/app.py` lines 38-44
- Triggers: Backend initialization in `__main__` block
- Responsibilities: Start APScheduler, attempt initial price fetch, handle startup errors gracefully

## Error Handling

**Strategy:** Graceful degradation with specific error messaging

**Patterns:**

**Frontend:**
- API failures: Display error message in red banner, preserve previous data if available
- Input validation: Real-time format checking prevents invalid submissions
- Focus restoration: Cursor position preserved after async operations
- No data case: Display "N/A" with non-breaking space (`\u00A0`) to maintain layout

**Backend:**
- Missing price data: Return 404 with `{ "success": false, "error": "No price data available" }`
- Invalid input: Return 400 with validation message
- API errors: Retry logic (3 attempts × 2 seconds) before giving up
- Scheduler errors: Non-fatal, API still works but prices won't auto-update
- Database errors: Rollback transactions, close sessions in finally blocks

**External API:**
- CoinGecko timeout: 10 seconds
- Retry mechanism: 3 attempts before marking failure
- Fallback: If scheduled fetch fails, frontend can still fetch for additional currencies

## Cross-Cutting Concerns

**Logging:**
- Backend: Print statements with emoji indicators (✓, ✗, ⚠️)
- Frontend: Console.error() for API failures
- Scheduler: Print price update confirmations and retry attempts

**Validation:**
- Frontend: Regex patterns for input (BTC: `^\d*\.?\d{0,8}$`, SATS: `^\d*$`)
- Backend: Decimal validation, positive amount checks
- Database: Column constraints (NOT NULL, DECIMAL precision)

**Authentication:**
- Not implemented (MVP assumes trusted environment)
- CORS enabled on backend (`flask_cors`)

**Rate Limiting:**
- Not implemented
- Frontend has 30-second refresh interval for latest prices
- Frontend debounces conversion requests by 800ms

---

*Architecture analysis: 2026-03-13*
