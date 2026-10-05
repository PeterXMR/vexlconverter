import { loadPreferences } from './preferences';

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
