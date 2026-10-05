import { cleanCoinPreferences, loadPreferences } from './preferences';

const fakeStore = ({ isNewIdentity, rows = {} }) => {
  const written = {};
  return {
    written,
    store: {
      isNewIdentity,
      readSettings: async () => ({ ...rows }),
      writeSetting: (key, value) => {
        written[key] = value;
      },
    },
  };
};

const DEFAULT_PICKS = {
  mode: 'btc',
  unit: 'BTC',
  currencyList: ['USD', 'EUR'],
  fiatSource: 'USD',
  fiatTarget: 'EUR',
  cryptoSource: 'bitcoin',
  cryptoTarget: 'ethereum',
  allSourceType: 'crypto',
  allSourceValue: 'bitcoin',
  allTargetType: 'fiat',
  allTargetValue: 'USD',
  chartPeriod: '7d',
  chartUsd: true,
  chartEur: true,
  alertCoin: 'bitcoin',
  alertCurrency: 'usd',
  alertDirection: 'above',
};

test('a new identity is given every default', async () => {
  const { store, written } = fakeStore({ isNewIdentity: true });

  const preferences = await loadPreferences(store);

  expect(written).toEqual({
    mode: 'btc',
    unit: 'BTC',
    currencyList: '["USD","EUR"]',
    fiatSource: 'USD',
    fiatTarget: 'EUR',
    cryptoSource: 'bitcoin',
    cryptoTarget: 'ethereum',
    allSourceType: 'crypto',
    allSourceValue: 'bitcoin',
    allTargetType: 'fiat',
    allTargetValue: 'USD',
    chartPeriod: '7d',
    chartUsd: 'true',
    chartEur: 'true',
    alertCoin: 'bitcoin',
    alertCurrency: 'usd',
    alertDirection: 'above',
  });
  expect(preferences).toEqual(DEFAULT_PICKS);
});

test('an existing identity keeps its own picks and nothing is written', async () => {
  const { store, written } = fakeStore({ isNewIdentity: false, rows: { mode: 'fiat', unit: 'SATS' } });

  const preferences = await loadPreferences(store);

  expect(written).toEqual({});
  expect(preferences).toEqual({ ...DEFAULT_PICKS, mode: 'fiat', unit: 'SATS' });
});

test('a stored value that does not decode reads as its default', async () => {
  const { store } = fakeStore({ isNewIdentity: false, rows: { mode: 'crypto', unit: 'grams' } });

  const preferences = await loadPreferences(store);

  expect(preferences).toEqual({ ...DEFAULT_PICKS, mode: 'crypto', unit: 'BTC' });
});

test('a currency the app no longer offers is dropped from the stored list and written back', async () => {
  const { store, written } = fakeStore({
    isNewIdentity: false,
    rows: { currencyList: '["CZK","XYZ","USD"]' },
  });

  const preferences = await loadPreferences(store);

  expect(preferences.currencyList).toEqual(['CZK', 'USD']);
  expect(written).toEqual({ currencyList: '["CZK","USD"]' });
});

test('a fiat pick pointing at a currency the app no longer offers resets to its default', async () => {
  const { store, written } = fakeStore({
    isNewIdentity: false,
    rows: { fiatSource: 'XYZ', fiatTarget: 'GBP', allTargetType: 'fiat', allTargetValue: 'XYZ' },
  });

  const preferences = await loadPreferences(store);

  expect(preferences).toMatchObject({ fiatSource: 'USD', fiatTarget: 'GBP', allTargetType: 'fiat', allTargetValue: 'USD' });
  expect(written).toEqual({ fiatSource: 'USD', allTargetType: 'fiat', allTargetValue: 'USD' });
});

const STALE_COIN_PICKS = {
  ...DEFAULT_PICKS,
  cryptoSource: 'dogecoin',
  cryptoTarget: 'bitcoin',
  allSourceType: 'crypto',
  allSourceValue: 'dogecoin',
  alertCoin: 'dogecoin',
};

test('coin picks the app no longer offers reset to their defaults once the coin list loads', () => {
  const { store, written } = fakeStore({ isNewIdentity: false });

  const preferences = cleanCoinPreferences(store, STALE_COIN_PICKS, ['bitcoin', 'ethereum']);

  expect(preferences).toEqual({ ...DEFAULT_PICKS, cryptoTarget: 'bitcoin' });
  expect(written).toEqual({
    cryptoSource: 'bitcoin',
    allSourceType: 'crypto',
    allSourceValue: 'bitcoin',
    alertCoin: 'bitcoin',
  });
});

test('coin picks are left alone when the coin list is empty', () => {
  const { store, written } = fakeStore({ isNewIdentity: false });

  const preferences = cleanCoinPreferences(store, STALE_COIN_PICKS, []);

  expect(preferences).toEqual(STALE_COIN_PICKS);
  expect(written).toEqual({});
});
