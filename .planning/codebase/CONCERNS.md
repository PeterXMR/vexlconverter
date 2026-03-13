# Codebase Concerns

**Analysis Date:** 2026-03-13

## Tech Debt

**Hardcoded API URL in Frontend:**
- Issue: API URL is hardcoded to `http://localhost:5001/api` in production-ready code
- Files: `frontend/src/components/Converter.js` (line 5)
- Impact: Frontend cannot connect to API in production/Docker environments without code changes; breaks in containerized deployments
- Fix approach: Move API_URL to environment variable (REACT_APP_API_URL) which is already declared in docker-compose.yml but not used in code

**Unused Component in Repository:**
- Issue: `CurrencySelector.js` is defined but never used in the application
- Files: `frontend/src/components/CurrencySelector.js`
- Impact: Dead code increases maintenance burden; component is partially functional and inconsistent with actual currency picker implementation in Converter.js
- Fix approach: Remove unused component or integrate its functionality properly into Converter.js

**Test Suite is Not Functional:**
- Issue: Frontend test file references non-existent "learn react link" from create-react-app boilerplate
- Files: `frontend/src/App.test.js` (lines 4-8)
- Impact: Tests fail when run (`npm test`), no actual application logic is tested, test framework is not integrated into CI/CD
- Fix approach: Replace boilerplate test with actual test coverage for Converter and CurrencySelector components

**Unused Database Table:**
- Issue: `conversion_history` table is created in database schema but never written to or used by API
- Files: `database/init.sql` (lines 17-28), not referenced in `backend/app.py` or `backend/models.py`
- Impact: Unused database overhead; comment indicates it's "optional for v0.0.1" but code suggests premature design; blocks future feature implementation without cleanup
- Fix approach: Remove table from schema unless actively implementing user conversion history tracking

**Backend Credentials in Docker Compose:**
- Issue: Database credentials hardcoded in docker-compose.yml with weak default password
- Files: `docker-compose.yml` (lines 9-10, 26)
- Impact: Hard-coded credentials ("user:user") used in both compose file and CONNECTION_URL; development-only but establishes poor security practice
- Fix approach: Require DATABASE_URL and POSTGRES_PASSWORD as environment variables from .env file

## Known Bugs

**Frontend Input Type Mismatch:**
- Symptoms: Input field declared as `type="text"` with `inputMode="decimal"` for numeric entry; inconsistent with BTC precision handling
- Files: `frontend/src/components/Converter.js` (lines 278-288)
- Trigger: User enters value and switches between BTC/SATS units
- Workaround: Input validation logic compensates, but proper field type would prevent invalid input at browser level
- Fix approach: Consider using `type="number"` with custom validation, or add explicit numeric keyboard on mobile

**Cursor Selection Lost on Conversion:**
- Symptoms: User's text cursor position and selection jumps around during typed input; race condition in setTimeout
- Files: `frontend/src/components/Converter.js` (lines 107-115, 122-124)
- Trigger: Type BTC amount → conversion API call → focus restoration with 0ms setTimeout
- Workaround: setTimeout(fn, 0) works but is brittle; timing depends on rendering speed
- Fix approach: Use useCallback and useEffect dependency arrays to prevent re-render during async operations; consider debouncing input at input level not API level

## Security Considerations

**Frontend API URL Hardcoded for Non-Development:**
- Risk: Localhost URL hardcoded in production build; cannot be changed without rebuilding container
- Files: `frontend/src/components/Converter.js` (line 5)
- Current mitigation: Docker Compose sets REACT_APP_API_URL environment variable but code doesn't use it
- Recommendations: Use environment variable `const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api'` to allow runtime configuration

**Missing Input Validation on Backend:**
- Risk: Backend `POST /api/convert` endpoint accepts any btc_amount value without type validation or range limits
- Files: `backend/app.py` (lines 77-130)
- Current mitigation: Decimal type casting and > 0 check; no upper bound on values
- Recommendations: Add maximum value validation (e.g., 21 million BTC limit), validate that input is numeric before Decimal conversion to prevent cryptic errors

**Unvalidated External API Response:**
- Risk: CoinGecko API response consumed without validating structure; malformed response could crash conversion
- Files: `frontend/src/components/Converter.js` (lines 134-149), `backend/scheduler.py` (lines 18-27)
- Current mitigation: Try-catch blocks exist but don't validate response structure
- Recommendations: Add schema validation for CoinGecko responses; validate that `response.data.bitcoin[currency]` exists before using

**CORS Enabled for All Origins:**
- Risk: `CORS(app)` in Flask with no restrictions; allows any origin to make requests
- Files: `backend/app.py` (line 14)
- Current mitigation: None; CORS allows all origins
- Recommendations: Restrict CORS to known frontend origin in production: `CORS(app, resources={r'/api/*': {'origins': ['http://localhost:3000', 'https://yourdomain.com']}})`

**Credentials Database Access Without Connection Pooling:**
- Risk: New database session created for each API request; no connection pooling, sessions not always properly closed
- Files: `backend/app.py` (lines 55, 97, 98), `backend/models.py` (lines 31-36)
- Current mitigation: Try-finally block ensures db.close() but only in scheduler.py; API endpoints open/close manually
- Recommendations: Implement proper connection pooling with max_overflow and pool_size; use dependency injection or middleware pattern for session management

## Performance Bottlenecks

**Frontend Makes Separate API Call for Each Additional Currency:**
- Problem: When user adds currency, `fetchAdditionalRates()` makes separate HTTP request to CoinGecko for EACH currency
- Files: `frontend/src/components/Converter.js` (lines 130-150)
- Cause: Fetches all additional currencies in single request `currencyCodes.join(',')` but API response processing is inefficient
- Improvement path: Batch currency requests or move currency conversion to backend API endpoint (let backend fetch from CoinGecko once for all needed currencies)

**Database Session Not Reused Across Requests:**
- Problem: Backend creates new database session for each API call; no connection pooling
- Files: `backend/app.py` (lines 55-59, 97-101), `backend/models.py` (lines 30-36)
- Cause: Using `SessionLocal()` directly without connection pooling configuration; sessions recreated on every request
- Improvement path: Implement SQLAlchemy connection pooling with `pool_size` and `max_overflow` parameters; use Flask-SQLAlchemy extension to manage sessions

**Frontend Refreshes Exchange Rates Every 30 Seconds Regardless of Activity:**
- Problem: `fetchLatestPrices()` runs every 30 seconds even if user is idle
- Files: `frontend/src/components/Converter.js` (lines 52-57)
- Cause: Interval set unconditionally; wasted API calls and bandwidth
- Improvement path: Implement activity-based refresh; pause interval when page is hidden (Page Visibility API); only refresh when user is actively using app

**No Request Deduplication for Additional Currencies:**
- Problem: If user clicks "Add Currency" twice for same currency before request completes, duplicate rate fetch requests may occur
- Files: `frontend/src/components/Converter.js` (lines 152-163)
- Cause: No pending request tracking or debouncing
- Improvement path: Track pending requests; cancel previous request if new one initiated for same currencies

## Fragile Areas

**Complex State Management in Single Component:**
- Files: `frontend/src/components/Converter.js`
- Why fragile: 8+ useState calls (btcAmount, usdAmount, eurAmount, rates, lastUpdate, loading, error, unit, additionalCurrencies, showCurrencyPicker) managing tightly coupled state; any refactor risks breaking conversions
- Safe modification: Use useReducer to consolidate related state; avoid modifying state objects deeply (currently done correctly with spread operator)
- Test coverage: No unit tests for state transitions; manual testing only

**Scheduler and Database Race Condition:**
- Files: `backend/scheduler.py` (lines 32-48), `backend/app.py` (lines 54-75)
- Why fragile: Multiple concurrent requests to database while scheduler is writing new price records; no locking mechanism
- Safe modification: Add database transaction isolation level; use database-level constraints; don't rely on application-level synchronization
- Test coverage: No tests for concurrent price updates and API requests

**Manual Error Handling Gaps:**
- Files: `backend/app.py` (lines 71-75, 127-130), `backend/scheduler.py` (lines 50-55)
- Why fragile: Generic exception handling with string error messages; no differentiation between types of errors (network, database, validation)
- Safe modification: Create custom exception classes; log full stack traces for debugging; return appropriate HTTP status codes
- Test coverage: No error scenario testing; only success path verified

## Scaling Limits

**Database Grows Unbounded:**
- Current capacity: init.sql creates indexes but no retention policy; btc_prices and conversion_history tables grow infinitely
- Limit: After 1 year of 5-minute updates (105k+ records), queries will degrade without archival strategy
- Scaling path: Implement data retention policy (keep 30 days of prices, archive older data); add VACUUM and ANALYZE cron jobs; implement table partitioning by date

**Single Database Instance No Replication:**
- Current capacity: PostgreSQL container in docker-compose is single instance with no backup
- Limit: Data loss on container failure; no high availability
- Scaling path: Implement PostgreSQL replication; add automated backups to S3; use managed database service (RDS, Supabase)

**Frontend API Calls Not Rate-Limited:**
- Current capacity: No rate limiting on client or server; user can spam conversion endpoint
- Limit: CoinGecko API has 10-50 calls/minute free tier limit; backend will fail silently if limit exceeded
- Scaling path: Add client-side debouncing for input (already has 800ms debounce but can be improved); add server-side rate limiting middleware (Flask-Limiter)

**Scheduler Blocks on External API:**
- Current capacity: APScheduler makes blocking HTTP request to CoinGecko; if CoinGecko is slow, scheduler blocks
- Limit: Single price update takes >10s → next scheduled update delayed → prices become stale
- Scaling path: Use async requests (aiohttp); add timeout and circuit breaker pattern; queue failed fetches for retry

## Dependencies at Risk

**APScheduler 3.10.4 Not Latest:**
- Risk: Version is 1+ year old; missing security patches and new features
- Impact: Memory leaks possible in background scheduler if not properly managed
- Migration plan: Update to APScheduler 3.13+; verify BackgroundScheduler.shutdown() is called on app exit

**Flask 3.0.0 with Security Deprecations:**
- Risk: Flask 3.0 has deprecated patterns; some dependencies may drop support
- Impact: Potential vulnerability in newer versions of Flask-CORS
- Migration plan: Monitor Flask-CORS updates; ensure psycopg is using psycopg3 (currently does via psycopg[binary])

**React 19.2.1 Unstable Minor:**
- Risk: React 19.x is relatively new; potential edge cases with hooks behavior
- Impact: Hooks in Converter.js may have subtle bugs with concurrent rendering
- Migration plan: Monitor React release notes; add strict mode testing; consider waiting for React 19.1+ LTS if available

**psycopg Binding Mode:**
- Risk: Using psycopg[binary] which bundles libpq binary; package size larger, fewer distribution channels
- Impact: Docker image bloat; potential binary compatibility issues on non-standard systems
- Migration plan: Switch to native psycopg[c] if postgresql dev libraries available in container; or psycopg[ctypes] for minimal overhead

## Missing Critical Features

**No API Rate Limiting:**
- Problem: Any client can make unlimited requests; no protection against abuse
- Blocks: Public deployment; production readiness
- Recommendation: Add Flask-Limiter or similar; implement per-IP rate limits (100 req/hour for free tier)

**No Database Backups:**
- Problem: No automated backup strategy defined in docker-compose or documentation
- Blocks: Data persistence; production deployment
- Recommendation: Add postgres-backup container or S3 backup cron job to docker-compose

**No Input Validation Schema:**
- Problem: No Pydantic or Marshmallow schema validation for API inputs
- Blocks: Cannot handle unknown fields gracefully; error messages are unclear
- Recommendation: Add Pydantic BaseModel for request/response validation

**No Logging Infrastructure:**
- Problem: Backend uses print() statements instead of structured logging
- Blocks: Debugging in production; monitoring and alerting impossible
- Recommendation: Replace print() with Python logging module; use JSON structured logs for parsing

## Test Coverage Gaps

**Frontend Component Tests Missing:**
- What's not tested: Converter.js component (411 lines) has zero test coverage; no tests for conversion logic, error handling, unit toggle, additional currency logic
- Files: `frontend/src/components/Converter.js`
- Risk: Refactoring converter breaks without detection; user-facing bugs shipped
- Priority: High - component is core application logic

**Backend API Endpoint Tests Missing:**
- What's not tested: POST /api/convert and GET /api/prices/latest endpoints have no test coverage; only test_setup.py (dependency check script)
- Files: `backend/app.py` (endpoints), no corresponding test file
- Risk: API contract breaks without detection; conversion math errors undetected
- Priority: High - API is backend contract

**Database Integration Tests Missing:**
- What's not tested: Database operations, transactions, concurrent access, error cases (no database, full disk)
- Files: `backend/models.py`, no integration test suite
- Risk: Database-level errors only caught in production
- Priority: Medium - secondary failure path

**Scheduler Reliability Tests Missing:**
- What's not tested: Scheduler error recovery, retry logic, external API timeout handling
- Files: `backend/scheduler.py`
- Risk: Price updates fail silently; users see stale data without knowing
- Priority: Medium - affects data freshness

**Edge Case Input Tests Missing:**
- What's not tested: Very large BTC amounts (>21M), very small amounts (< satoshi precision), negative numbers, non-numeric input, null/undefined values
- Files: `frontend/src/components/Converter.js`, `backend/app.py`
- Risk: Precision errors, crashes, or incorrect calculations at boundaries
- Priority: Medium - affects correctness

---

*Concerns audit: 2026-03-13*
