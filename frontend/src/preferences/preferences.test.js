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

test('a new identity is given the default mode and unit', async () => {
  const { store, written } = fakeStore({ isNewIdentity: true });

  const preferences = await loadPreferences(store);

  expect(written).toEqual({ mode: 'btc', unit: 'BTC' });
  expect(preferences).toEqual({ mode: 'btc', unit: 'BTC' });
});

test('an existing identity keeps its own picks and nothing is written', async () => {
  const { store, written } = fakeStore({ isNewIdentity: false, rows: { mode: 'fiat', unit: 'SATS' } });

  const preferences = await loadPreferences(store);

  expect(written).toEqual({});
  expect(preferences).toEqual({ mode: 'fiat', unit: 'SATS' });
});

test('a stored value that does not decode reads as its default', async () => {
  const { store } = fakeStore({ isNewIdentity: false, rows: { mode: 'crypto', unit: 'grams' } });

  const preferences = await loadPreferences(store);

  expect(preferences).toEqual({ mode: 'crypto', unit: 'BTC' });
});
