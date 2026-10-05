export const DEFAULTS = { mode: 'btc', unit: 'BTC' };

const ALLOWED = {
  mode: ['btc', 'crypto', 'fiat', 'both'],
  unit: ['BTC', 'SATS'],
};

const decode = (key, raw) => (ALLOWED[key].includes(raw) ? raw : DEFAULTS[key]);

export async function loadPreferences(store) {
  if (store.isNewIdentity) {
    for (const [key, value] of Object.entries(DEFAULTS)) store.writeSetting(key, value);
    return { ...DEFAULTS };
  }
  const rows = await store.readSettings();
  return Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, decode(key, rows[key])]));
}
