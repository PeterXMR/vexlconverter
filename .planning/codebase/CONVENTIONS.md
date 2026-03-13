# Coding Conventions

**Analysis Date:** 2026-03-13

## Naming Patterns

**Files:**
- Components: PascalCase with `.js` extension (e.g., `Converter.js`, `CurrencySelector.js`)
- Regular functions/utilities: camelCase with `.js` extension (e.g., `reportWebVitals.js`)
- Python modules: snake_case with `.py` extension (e.g., `scheduler.py`, `models.py`)

**Functions:**
- React components: PascalCase (e.g., `Converter`, `CurrencySelector`, `PriceCard`)
- Helper/utility functions: camelCase (e.g., `fetchLatestPrices`, `performConversion`, `handleBtcChange`, `formatNumber`)
- Python functions: snake_case (e.g., `fetch_and_store_prices`, `start_scheduler`, `get_db`)

**Variables:**
- State variables: camelCase (e.g., `btcAmount`, `usdAmount`, `loading`, `error`)
- React hooks follow state naming: `[state, setState]` pattern (e.g., `const [btcAmount, setBtcAmount] = useState('')`)
- Constants: UPPER_SNAKE_CASE (e.g., `SATS_PER_BTC`, `API_URL`, `COINGECKO_API`)
- CSS class names: kebab-case (e.g., `price-card`, `currency-selector`, `remove-button`)

**Types:**
- Python class names: PascalCase (e.g., `BTCPrice`)
- No TypeScript usage; plain JavaScript with PropTypes-style comments where needed

## Code Style

**Formatting:**
- React (frontend): react-scripts default formatter (based on `package.json` with `"react-scripts": "5.0.1"`)
- Python (backend): Standard Python conventions (4-space indentation)
- Line endings: Implicit via create-react-app and standard Python

**Linting:**
- Frontend: Uses ESLint via react-scripts with `"extends": ["react-app", "react-app/jest"]`
- Backend: No explicit linting configuration detected; code follows PEP 8 style

**Indentation:**
- JavaScript: 2 spaces (React convention)
- Python: 4 spaces (Python convention)

## Import Organization

**Order (JavaScript):**
1. React core imports: `import React, { useState, useEffect } from 'react'`
2. External dependencies: `import axios from 'axios'`
3. CSS imports: `import './Converter.css'`
4. No local imports of utilities detected

**Order (Python):**
1. Standard library: `from datetime import datetime`, `import os`, `import requests`
2. Third-party frameworks: `from flask import Flask`, `from sqlalchemy import create_engine`
3. Local imports: `from models import BTCPrice`, `from scheduler import start_scheduler`

**Path Aliases:**
- None detected; relative imports only

## Error Handling

**Patterns:**
- JavaScript: Try-catch blocks with error state management via `setError()`
- Example from `Converter.js`:
```javascript
try {
  const response = await axios.get(`${API_URL}/prices/latest`);
  if (response.data.success) {
    setRates({...});
    setError(null);
  }
} catch (err) {
  setError('Failed to fetch latest prices');
  console.error(err);
}
```
- Errors are displayed to user via conditional rendering: `{error && <div className="error">{error}</div>}`
- Graceful degradation: API failures don't crash the app, user sees error message

**Python patterns:**
- Try-except with specific error messages to console
- Database errors include rollback: `db.rollback()`
- Return status codes with JSON error responses: `return jsonify({'success': False, 'error': str(e)}), 500`
- Retry logic: `fetch_and_store_prices()` implements 3 retries with 2-second delays

## Logging

**Framework:** Console-based (no logging library)

**Patterns:**
- JavaScript: `console.error(err)` for exceptions, no general logging
- Python: `print()` with emoji prefixes for status:
  - `✓` for success (e.g., `print("✓ Scheduler started successfully")`)
  - `✗` for errors (e.g., `print(f"✗ Error fetching prices: {e}")`)
  - `⚠️` for warnings (e.g., `print(f"⚠️ Warning: Scheduler failed to start: {e}")`)
- Contextual messages: Include attempt counts for retries, configuration details on startup

## Comments

**When to Comment:**
- Constants with domain meaning: `SATS_PER_BTC = 100000000  # 1 BTC = 100,000,000 satoshis`
- Non-obvious logic: Cursor position restoration in `Converter.js` lines 85-114
- Configuration: Unit switching logic, debounce timing explanation
- API behavior: Request/response format documentation in docstrings

**JSDoc/TSDoc:**
- Minimal usage; Python uses docstrings for endpoints:
```python
@app.route('/api/convert', methods=['POST'])
def convert_btc():
    """Convert BTC amount to USD and EUR.

    Request body:
    {
        "btc_amount": 0.01
    }
    """
```

## Function Design

**Size:**
- Small, focused functions preferred
- `Converter.js` main component: 411 lines (large, but necessary for state management)
- Helper functions: 20-50 lines typical (e.g., `performConversion`, `fetchAdditionalRates`, `handleBtcChange`)

**Parameters:**
- JavaScript: Destructuring for props (e.g., `const PriceCard = ({ currency, price, loading, isDefault, onRemove })`)
- Python: Named parameters with defaults (e.g., `os.getenv('FLASK_PORT', 5001)`)

**Return Values:**
- JavaScript async functions: Promise-based (no explicit return, side effects via setState)
- Python functions: Boolean for success/failure, JSON for API responses, generator for database connections

**Async/Await:**
- Consistently used for API calls: `const response = await axios.get(...)`
- Debouncing for UI responsiveness: 800ms debounce on input (line 210-212 in `Converter.js`)

## Module Design

**Exports:**
- JavaScript: Default export for components: `export default App`
- Python: Module-level functions and classes; `SessionLocal` as factory for DB sessions

**Barrel Files:**
- No barrel files or index.js re-exports detected beyond `frontend/src/index.js` (entry point)

**Separation of Concerns:**
- Frontend: Components handle UI rendering + API calls (mixed concerns in `Converter.js`)
- Backend: Route handlers in `app.py`, models in `models.py`, scheduler in `scheduler.py`
- No service/repository layer; direct route-to-database

## Data Validation

**Frontend:**
- Regex validation on input: BTC allows `^\d*\.?\d{0,8}$`, SATS allows `^\d*$` (lines 184-191)
- Required field checks: `if (!btcValue || btcValue <= 0)`
- Number parsing: `parseFloat()` with `isNaN()` guards

**Backend:**
- Decimal type for currency: `Decimal(str(data.get('btc_amount', 0)))`
- Greater-than check: `if btc_amount <= 0: return 400 error`
- Database typing: Numeric(12, 2) for prices with 2 decimal places

## Testing Approach

See TESTING.md for complete testing patterns and framework details.

---

*Convention analysis: 2026-03-13*
