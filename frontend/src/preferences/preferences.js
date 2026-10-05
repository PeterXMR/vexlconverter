const oneOf = (allowed, fallback) => ({
  fallback,
  decode: (raw) => (allowed.includes(raw) ? raw : undefined),
  encode: (value) => value,
});

const text = (fallback) => ({
  fallback,
  decode: (raw) => (typeof raw === 'string' && raw.trim() !== '' ? raw : undefined),
  encode: (value) => value,
});

const flag = (fallback) => ({
  fallback,
  decode: (raw) => ({ true: true, false: false })[raw],
  encode: (value) => String(value),
});

const codeList = (fallback) => ({
  fallback,
  decode: (raw) => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.every((code) => typeof code === 'string') ? parsed : undefined;
    } catch {
      return undefined;
    }
  },
  encode: (value) => JSON.stringify(value),
});

export const PREFERENCES = {
  mode: oneOf(['btc', 'crypto', 'fiat', 'both'], 'btc'),
  unit: oneOf(['BTC', 'SATS'], 'BTC'),
  currencyList: codeList(['USD', 'EUR']),
  fiatSource: text('USD'),
  fiatTarget: text('EUR'),
  cryptoSource: text('bitcoin'),
  cryptoTarget: text('ethereum'),
  allSourceType: oneOf(['crypto', 'fiat'], 'crypto'),
  allSourceValue: text('bitcoin'),
  allTargetType: oneOf(['crypto', 'fiat'], 'fiat'),
  allTargetValue: text('USD'),
  chartPeriod: oneOf(['24h', '7d', '30d'], '7d'),
  chartUsd: flag(true),
  chartEur: flag(true),
  alertCoin: text('bitcoin'),
  alertCurrency: oneOf(['usd', 'eur'], 'usd'),
  alertDirection: oneOf(['above', 'below'], 'above'),
};

const KEYS = Object.keys(PREFERENCES);

export const DEFAULTS = Object.fromEntries(KEYS.map((key) => [key, PREFERENCES[key].fallback]));

export const encodePreference = (key, value) => PREFERENCES[key].encode(value);

export async function loadPreferences(store) {
  if (store.isNewIdentity) {
    for (const key of KEYS) store.writeSetting(key, encodePreference(key, DEFAULTS[key]));
    return { ...DEFAULTS };
  }
  const rows = await store.readSettings();
  return Object.fromEntries(KEYS.map((key) => [key, PREFERENCES[key].decode(rows[key]) ?? DEFAULTS[key]]));
}
