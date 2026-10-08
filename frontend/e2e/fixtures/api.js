export const BTC_PRICE_USD = 65000;
export const BTC_PRICE_EUR = 60000;

const TIMESTAMP = '2026-10-01T12:00:00';

const CRYPTOS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
];

const PRICES = {
  bitcoin: { usd: BTC_PRICE_USD, eur: BTC_PRICE_EUR },
  ethereum: { usd: 2500, eur: 2300 },
};

const USD_TO_FIAT = { USD: 1, EUR: BTC_PRICE_EUR / BTC_PRICE_USD, CZK: 23, GBP: 0.79 };

const json = (body, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const allPrices = () =>
  Object.fromEntries(
    CRYPTOS.map(({ id, symbol, name }) => [
      id,
      {
        crypto_id: id,
        symbol,
        name,
        price_usd: PRICES[id].usd,
        price_eur: PRICES[id].eur,
        timestamp: TIMESTAMP,
      },
    ]),
  );

const convert = (request) => {
  const { crypto, amount } = request.postDataJSON();
  const price = PRICES[crypto];
  if (!price) return json({ success: false, error: 'Unknown crypto' }, 400);
  return json({
    success: true,
    data: {
      crypto,
      amount,
      usd_amount: Math.round(price.usd * amount * 100) / 100,
      eur_amount: Math.round(price.eur * amount * 100) / 100,
      rates: { usd: price.usd, eur: price.eur },
      timestamp: TIMESTAMP,
    },
  });
};

const history = () =>
  json({
    success: true,
    data: [0, 1, 2].map((hour) => ({
      timestamp: `2026-10-01T1${hour}:00:00`,
      price_usd: BTC_PRICE_USD,
      price_eur: BTC_PRICE_EUR,
    })),
  });

const handlers = {
  'GET /api/cryptos': () => json({ success: true, data: CRYPTOS }),
  'GET /api/prices/all': () => json({ success: true, data: allPrices() }),
  'GET /api/prices/history': history,
  'GET /api/fiat-rates': () => json({ success: true, rates: USD_TO_FIAT }),
  'POST /api/convert': convert,
  'GET /api/alerts': () => json({ success: true, data: [] }),
  'GET /api/alerts/triggered': () => json({ success: true, data: [] }),
};

export async function stubApi(page) {
  await page.route(/\/api\//, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const handler = handlers[`${request.method()} ${pathname}`];
    if (!handler) {
      await route.fulfill(json({ success: false, error: `No stub for ${request.method()} ${pathname}` }, 501));
      return;
    }
    await route.fulfill(handler(request));
  });
}
