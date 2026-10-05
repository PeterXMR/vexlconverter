import { FIAT_CURRENCIES } from '../fiatCurrencies';

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

const OFFERED_FIAT = new Set(FIAT_CURRENCIES.map(({ code }) => code));

const PAIRS = [
  ['allSourceType', 'allSourceValue'],
  ['allTargetType', 'allTargetValue'],
];

const cleaner = (values) => {
  const cleaned = { ...values };
  const changed = new Set();
  const reset = (key) => {
    cleaned[key] = DEFAULTS[key];
    changed.add(key);
  };
  const resetPairsOfType = (type, isOffered) => {
    for (const [typeKey, valueKey] of PAIRS) {
      if (values[typeKey] === type && !isOffered(values[valueKey])) {
        reset(typeKey);
        reset(valueKey);
      }
    }
  };
  return { cleaned, changed, reset, resetPairsOfType };
};

const cleanFiat = (values) => {
  const { cleaned, changed, reset, resetPairsOfType } = cleaner(values);
  const offeredList = values.currencyList.filter((code) => OFFERED_FIAT.has(code));
  if (offeredList.length !== values.currencyList.length) {
    cleaned.currencyList = offeredList;
    changed.add('currencyList');
  }
  for (const key of ['fiatSource', 'fiatTarget']) {
    if (!OFFERED_FIAT.has(values[key])) reset(key);
  }
  resetPairsOfType('fiat', (code) => OFFERED_FIAT.has(code));
  return { cleaned, changed };
};

const writeBack = (store, values, keys) => {
  for (const key of keys) store.writeSetting(key, encodePreference(key, values[key]));
};

export async function loadPreferences(store) {
  if (store.isNewIdentity) {
    writeBack(store, DEFAULTS, KEYS);
    return { ...DEFAULTS };
  }
  const rows = await store.readSettings();
  const decoded = Object.fromEntries(KEYS.map((key) => [key, PREFERENCES[key].decode(rows[key]) ?? DEFAULTS[key]]));
  const { cleaned, changed } = cleanFiat(decoded);
  writeBack(store, cleaned, changed);
  return cleaned;
}

export function cleanCoinPreferences(store, values, coinIds) {
  if (coinIds.length === 0) return values;
  const offered = new Set(coinIds);
  const { cleaned, changed, reset, resetPairsOfType } = cleaner(values);
  for (const key of ['cryptoSource', 'cryptoTarget', 'alertCoin']) {
    if (!offered.has(values[key])) reset(key);
  }
  resetPairsOfType('crypto', (coin) => offered.has(coin));
  writeBack(store, cleaned, changed);
  return cleaned;
}
