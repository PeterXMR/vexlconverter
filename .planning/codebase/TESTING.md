# Testing Patterns

**Analysis Date:** 2026-03-13

## Test Framework

**Runner:**
- Jest (implicit via `react-scripts`)
- Version: Included with `react-scripts@5.0.1`
- Config: Built-in, no explicit `jest.config.js` file

**Assertion Library:**
- `@testing-library/react@16.3.0`
- `@testing-library/jest-dom@6.9.1` for DOM matchers
- `@testing-library/dom@10.4.1` for querying

**Run Commands:**
```bash
npm test                    # Run tests in watch mode (default)
npm run build               # Build for production
npm run eject               # Eject from create-react-app
```

Test command specified in `frontend/package.json` line 19: `"test": "react-scripts test"`

## Test File Organization

**Location:**
- Co-located with source files
- Pattern: `[Component].test.js` alongside `[Component].js`

**Current Test Files:**
- `frontend/src/App.test.js` (8 lines)
- Tests placed in same directory as component being tested

**Naming:**
- Files: `.test.js` extension
- Test suites: No explicit `describe()` blocks detected yet

## Test Structure

**Suite Organization:**
The current test file shows basic structure:
```javascript
// frontend/src/App.test.js
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
```

**Patterns:**
- Single `test()` call per file (not grouped with `describe()`)
- Render component with `render()` from testing-library
- Query elements with `screen.getByText()` for text content
- Assert with `expect().toBeInTheDocument()`

## Setup and Teardown

**Global Setup:**
- `frontend/src/setupTests.js` imports `@testing-library/jest-dom` to enable custom matchers
- Runs automatically before tests (configured by create-react-app)

**Per-Test Setup:**
- No explicit setup/teardown hooks detected
- `render()` handles component mounting/cleanup automatically

## Mocking

**Framework:** Not extensively used yet

**Current Patterns:**
- No mock implementations detected in existing test files
- Backend has no test suite

**What to Mock (Recommendations):**
- HTTP requests: Use `jest.mock('axios')` for API calls
- External APIs: Mock CoinGecko API responses
- Child components: If testing parent isolation
- timers: `jest.useFakeTimers()` for debounce testing

**What NOT to Mock:**
- React hooks (let them run normally in tests)
- Component rendering (test real UI behavior)
- User interactions (use `userEvent` instead of mocking)

## Fixtures and Factories

**Test Data:**
No factory pattern detected. Example of what could be created:
```javascript
// Factory for price data
const createMockPrice = (overrides = {}) => ({
  id: 1,
  btc_usd: 45000,
  btc_eur: 41000,
  timestamp: new Date().toISOString(),
  ...overrides
});

// Factory for currency
const createMockCurrency = (overrides = {}) => ({
  code: 'USD',
  symbol: '$',
  name: 'US Dollar',
  rate: 0,
  amount: '',
  ...overrides
});
```

**Location:**
- Could place in `frontend/src/__test__/fixtures/` (not currently used)
- Or alongside test files as `.fixtures.js` files

## Coverage

**Requirements:** None detected or enforced

**View Coverage:**
```bash
npm test -- --coverage
```

No coverage configuration in `package.json`. Default create-react-app behavior will report coverage for files in `src/`.

## Test Types

**Unit Tests:**
- Scope: Individual components and functions
- Approach: Render component and verify output
- Current coverage: App component only (minimal)
- Needed: Tests for `Converter`, `CurrencySelector`, `PriceCard` components

**Integration Tests:**
- Scope: Component interactions and API integration
- Approach: Would test Converter's full flow from input to API response
- Current coverage: None
- Example scenario: User enters BTC amount → API called → results displayed

**E2E Tests:**
- Framework: Not currently used
- Could add: Cypress or Playwright for full user workflows
- Would test: Complete conversion flow, currency selection, unit toggling

## Common Testing Patterns

### Async Testing

**Current Frontend Code:**
Functions like `fetchLatestPrices()` and `performConversion()` use async/await:
```javascript
const fetchLatestPrices = async () => {
  try {
    const response = await axios.get(`${API_URL}/prices/latest`);
    // ... handle response
  } catch (err) {
    setError('Failed to fetch latest prices');
    console.error(err);
  }
};
```

**Test Pattern:**
```javascript
test('fetches and displays latest prices', async () => {
  const mockData = { success: true, data: { btc_usd: 45000, btc_eur: 41000 } };
  jest.spyOn(axios, 'get').mockResolvedValue({ data: mockData });

  render(<Converter />);

  await waitFor(() => {
    expect(screen.getByText(/45000/)).toBeInTheDocument();
  });
});
```

### Error Testing

**Backend Error Patterns:**
```python
# Models return 404 if no data
if not latest_price:
    return jsonify({'success': False, 'error': 'No price data available'}), 404

# Validation errors return 400
if btc_amount <= 0:
    return jsonify({'success': False, 'error': 'BTC amount must be greater than 0'}), 400

# Server errors return 500 with exception message
except Exception as e:
    return jsonify({'success': False, 'error': str(e)}), 500
```

**Frontend Error Display:**
```javascript
const [error, setError] = useState(null);

// ... in catch block
catch (err) {
  setError('Failed to fetch latest prices');
  console.error(err);
}

// ... in render
{error && <div className="error">{error}</div>}
```

**Test Pattern:**
```javascript
test('displays error message on API failure', async () => {
  jest.spyOn(axios, 'get').mockRejectedValue(new Error('Network error'));

  render(<Converter />);

  await waitFor(() => {
    expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument();
  });
});
```

## User Interaction Testing

**User Events:**
- React Testing Library provides `@testing-library/user-event@13.5.0`
- Can test input changes, button clicks, selections

**Example Pattern:**
```javascript
import userEvent from '@testing-library/user-event';

test('converts BTC to USD on input', async () => {
  const user = userEvent.setup();
  render(<Converter />);

  const input = screen.getByLabelText(/Enter BTC Amount/i);
  await user.type(input, '1.5');

  // Would verify conversion happens after debounce
  await waitFor(() => {
    expect(screen.getByDisplayValue('67500')).toBeInTheDocument(); // if rate is 45000
  }, { timeout: 1000 });
});
```

## Backend Testing

**Current Status:** No automated tests

**Manual Testing File:**
- `backend/test_setup.py` - Verifies dependencies are installed
- Not a test suite; just checks import availability

**Potential Test Approach:**
Could use `pytest` with fixtures:
```python
# tests/test_app.py
import pytest
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json['status'] == 'healthy'

def test_convert_btc(client, mocker):
    # Mock database
    mock_price = type('BTCPrice', (), {
        'btc_usd': 45000,
        'btc_eur': 41000
    })()

    mocker.patch('app.SessionLocal').return_value.query.return_value.order_by.return_value.first.return_value = mock_price

    response = client.post('/api/convert', json={'btc_amount': 0.5})
    assert response.status_code == 200
    assert response.json['data']['usd_amount'] == 22500.0
```

## Gaps and Recommendations

**Critical Gaps:**
- Only 1 test file for entire frontend
- `App.test.js` tests outdated link (not in current app code)
- No testing of core `Converter` component (main business logic)
- No tests for debounce behavior, API error handling, currency switching
- No backend test suite at all

**Priority Order:**
1. Add tests for `Converter.js` (most complex, highest value)
   - Input validation (BTC vs SATS formats)
   - Debounce timing
   - API success/failure flows
   - Unit switching
2. Add tests for `CurrencySelector.js` and `PriceCard.js`
3. Add backend API tests using pytest
4. Add integration tests for full conversion flow

---

*Testing analysis: 2026-03-13*
