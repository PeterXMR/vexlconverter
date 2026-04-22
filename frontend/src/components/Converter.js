import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './Converter.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const SATS_PER_BTC = 100000000;

// open.er-api.com returns USD-base rates for ~160 fiat currencies and requires
// no API key. Cached for 10 min so switching modes doesn't refetch.
const FIAT_RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const FIAT_RATES_TTL_MS = 10 * 60 * 1000;
let _fiatRatesCache = null;
let _fiatRatesFetchedAt = 0;

async function getUsdToFiatRates() {
  const now = Date.now();
  if (_fiatRatesCache && (now - _fiatRatesFetchedAt) < FIAT_RATES_TTL_MS) {
    return _fiatRatesCache;
  }
  const response = await axios.get(FIAT_RATES_URL);
  if (response?.data?.result === 'success' && response.data.rates) {
    _fiatRatesCache = response.data.rates;
    _fiatRatesFetchedAt = now;
    return _fiatRatesCache;
  }
  throw new Error('Fiat rates provider returned an unexpected payload');
}

const FIAT_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
  { code: 'PYG', symbol: '₲', name: 'Paraguayan Guarani' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
];

function Converter({ mode }) {
  // ─── Shared state ──────────────────────────
  const [cryptos, setCryptos] = useState([]);
  const [allPrices, setAllPrices] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ─── BTC mode state ────────────────────────
  const [btcAmount, setBtcAmount] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [eurAmount, setEurAmount] = useState('');
  const [unit, setUnit] = useState('BTC');
  const [additionalCurrencies, setAdditionalCurrencies] = useState([]);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  // ─── Crypto mode state ─────────────────────
  const [sourceCrypto, setSourceCrypto] = useState('bitcoin');
  const [targetCrypto, setTargetCrypto] = useState('ethereum');
  const [cryptoSourceAmount, setCryptoSourceAmount] = useState('');
  const [cryptoTargetAmount, setCryptoTargetAmount] = useState('');

  // ─── Fiat mode state ───────────────────────
  const [sourceFiat, setSourceFiat] = useState('USD');
  const [targetFiat, setTargetFiat] = useState('EUR');
  const [fiatSourceAmount, setFiatSourceAmount] = useState('');
  const [fiatTargetAmount, setFiatTargetAmount] = useState('');

  // ─── Both (universal) mode state ───────────
  const [universalSourceType, setUniversalSourceType] = useState('crypto');
  const [universalTargetType, setUniversalTargetType] = useState('fiat');
  const [universalSource, setUniversalSource] = useState('bitcoin');
  const [universalTarget, setUniversalTarget] = useState('USD');
  const [universalSourceAmount, setUniversalSourceAmount] = useState('');
  const [universalTargetAmount, setUniversalTargetAmount] = useState('');

  const debounceTimer = useRef(null);

  // ─── Fetch cryptos and prices ──────────────
  useEffect(() => {
    fetchCryptos();
    fetchAllPrices();
    const interval = setInterval(fetchAllPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchCryptos = async () => {
    try {
      const response = await axios.get(`${API_URL}/cryptos`);
      if (response.data.success) {
        setCryptos(response.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch cryptos:', err);
    }
  };

  const fetchAllPrices = async () => {
    try {
      const response = await axios.get(`${API_URL}/prices/all`);
      if (response.data.success) {
        setAllPrices(response.data.data);
        setLastUpdate(new Date());
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch prices');
      console.error(err);
    }
  };

  const formatNumber = (num, decimals = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const debounce = (fn, value) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fn(value), 600);
  };

  // ─── BTC MODE ──────────────────────────────

  const performBtcConversion = useCallback(async (btcValue) => {
    if (!btcValue || btcValue <= 0) {
      setUsdAmount('');
      setEurAmount('');
      setAdditionalCurrencies(prev => prev.map(c => ({ ...c, amount: '' })));
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/convert`, {
        crypto: 'bitcoin',
        amount: btcValue
      });
      if (response.data.success) {
        setUsdAmount(response.data.data.usd_amount.toFixed(2));
        setEurAmount(response.data.data.eur_amount.toFixed(2));
        if (additionalCurrencies.length > 0) {
          const btcUsdRate = response.data.data.usd_amount / btcValue;
          await fetchAdditionalRates(btcValue, btcUsdRate);
        }
        setError(null);
      }
    } catch (err) {
      console.error('BTC conversion failed:', err);
      setError('Conversion failed, please try again.');
    } finally {
      setLoading(false);
    }
    // fetchAdditionalRates is defined below in the same component body and
    // captures additionalCurrencies.length via this callback's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalCurrencies.length]);

  // Use open.er-api.com (ExchangeRate-API free tier, no key, 166 fiat currencies).
  // Rationale: CoinGecko's /simple/price vs_currencies list is curated to ~30 fiats
  // and excludes some that our UI offers (e.g. PYG Paraguayan Guarani). Computing
  // BTC → USD → target_fiat via a dedicated fiat-rates provider gives full coverage
  // and consistent cross-rates.
  const fetchAdditionalRates = async (btcValue, btcUsdRate) => {
    try {
      const usdToFiat = await getUsdToFiatRates();
      setAdditionalCurrencies(prev =>
        prev.map(curr => {
          const usdRate = usdToFiat[curr.code];
          if (typeof usdRate !== 'number' || usdRate <= 0) {
            return { ...curr, rate: null, amount: null };
          }
          const btcToFiat = btcUsdRate * usdRate;
          return {
            ...curr,
            rate: btcToFiat,
            amount: (btcToFiat * btcValue).toFixed(2),
          };
        })
      );
    } catch (err) {
      console.error('Failed to fetch fiat rates:', err);
    }
  };

  const handleBtcChange = (e) => {
    let value = e.target.value;
    if (value === '') {
      setBtcAmount('');
      setUsdAmount('');
      setEurAmount('');
      return;
    }
    if (unit === 'BTC') {
      if (!/^\d*\.?\d{0,8}$/.test(value)) return;
    } else {
      if (!/^\d*$/.test(value)) return;
    }
    setBtcAmount(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      const btcValue = unit === 'SATS' ? numValue / SATS_PER_BTC : numValue;
      debounce(performBtcConversion, btcValue);
    } else {
      setUsdAmount('');
      setEurAmount('');
    }
  };

  const toggleUnit = () => {
    const newUnit = unit === 'BTC' ? 'SATS' : 'BTC';
    setUnit(newUnit);
    if (btcAmount && !isNaN(btcAmount)) {
      const currentValue = parseFloat(btcAmount);
      if (newUnit === 'SATS') {
        setBtcAmount(Math.round(currentValue * SATS_PER_BTC).toString());
      } else {
        setBtcAmount(
          (currentValue / SATS_PER_BTC).toFixed(8).replace(/\.?0+$/, '')
        );
      }
    }
  };

  const addCurrency = (currency) => {
    if (additionalCurrencies.find(c => c.code === currency.code)) return;
    setAdditionalCurrencies(prev => [...prev, { ...currency, rate: 0, amount: '' }]);
    setShowCurrencyPicker(false);

    // Populate the newly added currency's rate immediately using the already
    // computed USD amount. Going back through performBtcConversion would
    // capture stale additionalCurrencies state in its useCallback closure.
    const parsedBtc = parseFloat(btcAmount);
    const parsedUsd = parseFloat(usdAmount);
    if (
      !isNaN(parsedBtc) && parsedBtc > 0 &&
      !isNaN(parsedUsd) && parsedUsd > 0
    ) {
      const btcValue = unit === 'SATS' ? parsedBtc / SATS_PER_BTC : parsedBtc;
      const btcUsdRate = parsedUsd / btcValue;
      fetchAdditionalRates(btcValue, btcUsdRate);
    }
  };

  const removeCurrency = (code) => {
    setAdditionalCurrencies(prev => prev.filter(c => c.code !== code));
  };

  // ─── CRYPTO MODE ───────────────────────────

  const handleCryptoConvert = (value) => {
    setCryptoSourceAmount(value);
    if (!value || isNaN(value) || parseFloat(value) <= 0) {
      setCryptoTargetAmount('');
      return;
    }
    try {
      const sourcePrice = allPrices[sourceCrypto]?.price_usd;
      const targetPrice = allPrices[targetCrypto]?.price_usd;
      if (sourcePrice && targetPrice && targetPrice > 0) {
        const result = (parseFloat(value) * sourcePrice) / targetPrice;
        setCryptoTargetAmount(result.toFixed(8).replace(/\.?0+$/, ''));
        setError(null);
      } else {
        setError('Conversion failed, please try again.');
      }
    } catch (err) {
      console.error('Crypto conversion failed:', err);
      setError('Conversion failed, please try again.');
    }
  };

  // ─── FIAT MODE ─────────────────────────────

  const handleFiatConvert = (value) => {
    setFiatSourceAmount(value);
    if (!value || isNaN(value) || parseFloat(value) <= 0) {
      setFiatTargetAmount('');
      return;
    }
    // ER-API gives USD-base rates for every fiat we support, so a fiat↔fiat
    // cross-rate is just (usdToTgt / usdToSrc). This handles currencies
    // CoinGecko's vs_currencies list doesn't (e.g. PYG).
    debounce(async () => {
      try {
        const usdToFiat = await getUsdToFiatRates();
        const srcRate = usdToFiat[sourceFiat];
        const tgtRate = usdToFiat[targetFiat];
        if (srcRate && tgtRate && srcRate > 0) {
          const result = (parseFloat(value) * tgtRate) / srcRate;
          setFiatTargetAmount(result.toFixed(2));
          setError(null);
        } else {
          setError(`No rate available for ${sourceFiat} or ${targetFiat}.`);
          setFiatTargetAmount('');
        }
      } catch (err) {
        console.error('Fiat conversion failed:', err);
        setError('Conversion failed, please try again.');
      }
    }, value);
  };

  // ─── BOTH (UNIVERSAL) MODE ─────────────────

  const handleUniversalConvert = (value) => {
    setUniversalSourceAmount(value);
    if (!value || isNaN(value) || parseFloat(value) <= 0) {
      setUniversalTargetAmount('');
      return;
    }
    debounce(async () => {
      const amount = parseFloat(value);
      // Collect a resolved value OR an error message from whichever branch
      // runs, then apply both to state exactly once at the end. Avoids the
      // "unconditional setError(null) wipes just-set errors" class of bug.
      let resolved = null;
      let errMsg = null;

      try {
        if (universalSourceType === 'crypto' && universalTargetType === 'crypto') {
          const srcPrice = allPrices[universalSource]?.price_usd;
          const tgtPrice = allPrices[universalTarget]?.price_usd;
          if (srcPrice && tgtPrice && tgtPrice > 0) {
            resolved = ((amount * srcPrice) / tgtPrice).toFixed(8).replace(/\.?0+$/, '');
          } else {
            errMsg = `No price available for ${universalSource} or ${universalTarget}.`;
          }
        } else if (universalSourceType === 'crypto' && universalTargetType === 'fiat') {
          // Crypto → fiat: get USD price from backend, cross-rate via ER-API.
          const response = await axios.post(`${API_URL}/convert`, {
            crypto: universalSource,
            amount,
          });
          if (!response.data?.success) {
            errMsg = 'Conversion failed, please try again.';
          } else {
            const usdAmt = response.data.data.usd_amount;
            if (universalTarget === 'USD') {
              resolved = usdAmt.toFixed(2);
            } else {
              const usdToFiat = await getUsdToFiatRates();
              const rate = usdToFiat[universalTarget];
              if (rate && rate > 0) {
                resolved = (usdAmt * rate).toFixed(2);
              } else {
                errMsg = `No rate available for ${universalTarget}.`;
              }
            }
          }
        } else if (universalSourceType === 'fiat' && universalTargetType === 'crypto') {
          // Fiat → crypto: convert source fiat to USD first, then hit backend.
          // Previously this silently sent USD for any non-EUR source, quietly
          // returning wrong crypto amounts.
          let usdInput = amount;
          if (universalSource !== 'USD') {
            const usdToFiat = await getUsdToFiatRates();
            const rate = usdToFiat[universalSource];
            if (!rate || rate <= 0) {
              errMsg = `No rate available for ${universalSource}.`;
            } else {
              usdInput = amount / rate;
            }
          }
          if (!errMsg) {
            const response = await axios.post(`${API_URL}/convert/reverse`, {
              fiat_amount: usdInput,
              fiat_currency: 'usd',
              crypto: universalTarget,
            });
            if (response.data?.success) {
              resolved = response.data.data.crypto_amount.toFixed(8).replace(/\.?0+$/, '');
            } else {
              errMsg = 'Conversion failed, please try again.';
            }
          }
        } else {
          // Fiat → fiat via ER-API (cross-rate = usdToTgt / usdToSrc).
          const usdToFiat = await getUsdToFiatRates();
          const srcRate = usdToFiat[universalSource];
          const tgtRate = usdToFiat[universalTarget];
          if (srcRate && tgtRate && srcRate > 0) {
            resolved = ((amount * tgtRate) / srcRate).toFixed(2);
          } else {
            errMsg = `No rate available for ${universalSource} or ${universalTarget}.`;
          }
        }
      } catch (err) {
        console.error('Universal conversion failed:', err);
        errMsg = 'Conversion failed, please try again.';
      }

      setUniversalTargetAmount(resolved ?? '');
      setError(errMsg);
    }, value);
  };

  const swapUniversal = () => {
    const tmpType = universalSourceType;
    const tmpVal = universalSource;
    setUniversalSourceType(universalTargetType);
    setUniversalSource(universalTarget);
    setUniversalTargetType(tmpType);
    setUniversalTarget(tmpVal);
    setUniversalSourceAmount('');
    setUniversalTargetAmount('');
  };

  // ─── Helper: get symbol for crypto ─────────

  const getCryptoSymbol = (id) => {
    const found = cryptos.find(c => c.id === id);
    return found ? found.symbol : id.toUpperCase();
  };

  const getFiatSymbol = (code) => {
    const found = FIAT_CURRENCIES.find(c => c.code === code);
    return found ? found.symbol : code;
  };

  // ─── Available currencies for BTC mode picker (exclude USD/EUR which are default)
  const availableCurrenciesForPicker = FIAT_CURRENCIES.filter(
    c => c.code !== 'USD' && c.code !== 'EUR'
  );

  // ─── RENDER ────────────────────────────────

  const renderBtcMode = () => (
    <div className="converter-box">
      <h2>Convert BTC</h2>

      <div className="input-section">
        <div className="input-header">
          <label htmlFor="btc-input">
            <span className="icon">₿</span>
            Enter {unit} Amount
          </label>
          <button className="unit-toggle" onClick={toggleUnit} type="button">
            Switch to {unit === 'BTC' ? 'Sats' : 'BTC'}
          </button>
        </div>
        <input
          id="btc-input"
          type="text"
          inputMode="decimal"
          value={btcAmount}
          onChange={handleBtcChange}
          placeholder={unit === 'BTC' ? '0.00001' : '1000'}
          autoComplete="off"
          autoFocus
        />
        <div className="info-text">
          1 BTC = 100,000,000 satoshis
        </div>
      </div>

      <div className="arrow">↓</div>

      <div className="output-section">
        <div className="output-field">
          <label><span className="icon">$</span>USD Value</label>
          <input type="text" className="output-input" value={usdAmount || '\u00A0'} readOnly placeholder="0.00" />
          <div className="btc-rate">
            {allPrices.bitcoin ? `1 BTC = $${formatNumber(allPrices.bitcoin.price_usd)}` : '\u00A0'}
          </div>
        </div>
        <div className="output-field">
          <label><span className="icon">€</span>EUR Value</label>
          <input type="text" className="output-input" value={eurAmount || '\u00A0'} readOnly placeholder="0.00" />
          <div className="btc-rate">
            {allPrices.bitcoin ? `1 BTC = €${formatNumber(allPrices.bitcoin.price_eur)}` : '\u00A0'}
          </div>
        </div>
      </div>

      {additionalCurrencies.map((currency) => (
        <div key={currency.code} className="output-section additional-currency">
          <div className="output-field output-field-additional">
            <label>
              <span className="icon">{currency.symbol}</span>
              {currency.name} ({currency.code})
              <button className="remove-currency-btn" onClick={() => removeCurrency(currency.code)} type="button" title="Remove">✕</button>
            </label>
            <input
              type="text"
              className="output-input"
              value={currency.amount ?? (currency.rate === null ? 'Rate unavailable' : '\u00A0')}
              readOnly
              placeholder="0.00"
            />
            <div className="btc-rate">
              {currency.rate > 0
                ? `1 BTC = ${currency.symbol}${formatNumber(currency.rate)}`
                : currency.rate === null
                  ? 'Rate provider has no data for this currency'
                  : '\u00A0'}
            </div>
          </div>
        </div>
      ))}

      <div className="add-currency-section">
        <button className="add-currency-btn" onClick={() => setShowCurrencyPicker(!showCurrencyPicker)} type="button">
          + Add Currency
        </button>
      </div>

      {showCurrencyPicker && (
        <div className="currency-picker">
          <h3>Select Currency</h3>
          <div className="currency-list">
            {availableCurrenciesForPicker
              .filter(curr => !additionalCurrencies.find(c => c.code === curr.code))
              .map((currency) => (
                <button key={currency.code} className="currency-option" onClick={() => addCurrency(currency)} type="button">
                  <span className="currency-symbol">{currency.symbol}</span>
                  <span className="currency-info">
                    <strong>{currency.code}</strong> - {currency.name}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {loading && <div className="loading">Converting...</div>}
    </div>
  );

  const renderCryptoMode = () => (
    <div className="converter-box">
      <h2>Crypto to Crypto</h2>

      <div className="input-section">
        <div className="input-header">
          <label>
            <span className="icon">⟠</span>
            From
          </label>
          <select
            className="crypto-dropdown"
            value={sourceCrypto}
            onChange={(e) => {
              setSourceCrypto(e.target.value);
              setCryptoSourceAmount('');
              setCryptoTargetAmount('');
            }}
          >
            {cryptos.map(c => (
              <option key={c.id} value={c.id}>{c.symbol} - {c.name}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="converter-input"
          value={cryptoSourceAmount}
          onChange={(e) => {
            if (e.target.value === '' || /^\d*\.?\d{0,8}$/.test(e.target.value)) {
              handleCryptoConvert(e.target.value);
            }
          }}
          placeholder="0.00"
          autoComplete="off"
          autoFocus
        />
        {allPrices[sourceCrypto] && (
          <div className="info-text">
            1 {getCryptoSymbol(sourceCrypto)} = ${formatNumber(allPrices[sourceCrypto].price_usd)}
          </div>
        )}
      </div>

      <button
        type="button"
        className="arrow swap-arrow"
        onClick={() => {
          const tmp = sourceCrypto;
          setSourceCrypto(targetCrypto);
          setTargetCrypto(tmp);
          setCryptoSourceAmount('');
          setCryptoTargetAmount('');
        }}
        aria-label="Swap currencies"
      >⇅</button>

      <div className="input-section">
        <div className="input-header">
          <label>
            <span className="icon">⟠</span>
            To
          </label>
          <select
            className="crypto-dropdown"
            value={targetCrypto}
            onChange={(e) => {
              setTargetCrypto(e.target.value);
              if (cryptoSourceAmount) handleCryptoConvert(cryptoSourceAmount);
            }}
          >
            {cryptos.map(c => (
              <option key={c.id} value={c.id}>{c.symbol} - {c.name}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          className="output-input"
          value={cryptoTargetAmount || '\u00A0'}
          readOnly
          placeholder="0.00"
        />
        {allPrices[sourceCrypto] && allPrices[targetCrypto] && (
          <div className="btc-rate">
            1 {getCryptoSymbol(sourceCrypto)} = {(allPrices[sourceCrypto].price_usd / allPrices[targetCrypto].price_usd).toFixed(6).replace(/\.?0+$/, '')} {getCryptoSymbol(targetCrypto)}
          </div>
        )}
      </div>
    </div>
  );

  const renderFiatMode = () => (
    <div className="converter-box">
      <h2>Fiat to Fiat</h2>

      <div className="input-section">
        <div className="input-header">
          <label>
            <span className="icon">{getFiatSymbol(sourceFiat)}</span>
            From
          </label>
          <select
            className="crypto-dropdown"
            value={sourceFiat}
            onChange={(e) => {
              setSourceFiat(e.target.value);
              setFiatSourceAmount('');
              setFiatTargetAmount('');
            }}
          >
            {FIAT_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="converter-input"
          value={fiatSourceAmount}
          onChange={(e) => {
            if (e.target.value === '' || /^\d*\.?\d{0,2}$/.test(e.target.value)) {
              handleFiatConvert(e.target.value);
            }
          }}
          placeholder="0.00"
          autoComplete="off"
          autoFocus
        />
      </div>

      <button
        type="button"
        className="arrow swap-arrow"
        onClick={() => {
          const tmp = sourceFiat;
          setSourceFiat(targetFiat);
          setTargetFiat(tmp);
          setFiatSourceAmount('');
          setFiatTargetAmount('');
        }}
        aria-label="Swap currencies"
      >⇅</button>

      <div className="input-section">
        <div className="input-header">
          <label>
            <span className="icon">{getFiatSymbol(targetFiat)}</span>
            To
          </label>
          <select
            className="crypto-dropdown"
            value={targetFiat}
            onChange={(e) => {
              setTargetFiat(e.target.value);
              if (fiatSourceAmount) handleFiatConvert(fiatSourceAmount);
            }}
          >
            {FIAT_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          className="output-input"
          value={fiatTargetAmount || '\u00A0'}
          readOnly
          placeholder="0.00"
        />
      </div>
    </div>
  );

  const renderBothMode = () => {
    const sourceOptions = universalSourceType === 'crypto'
      ? cryptos.map(c => ({ value: c.id, label: `${c.symbol} - ${c.name}`, icon: '⟠' }))
      : FIAT_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} - ${c.name}`, icon: c.symbol }));

    const targetOptions = universalTargetType === 'crypto'
      ? cryptos.map(c => ({ value: c.id, label: `${c.symbol} - ${c.name}`, icon: '⟠' }))
      : FIAT_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} - ${c.name}`, icon: c.symbol }));

    return (
      <div className="converter-box">
        <h2>Universal Converter</h2>

        <div className="input-section">
          <div className="input-header">
            <label>
              <span className="icon">→</span>
              From
            </label>
            <div className="type-and-select">
              <select
                className="type-dropdown"
                value={universalSourceType}
                onChange={(e) => {
                  setUniversalSourceType(e.target.value);
                  setUniversalSource(e.target.value === 'crypto' ? 'bitcoin' : 'USD');
                  setUniversalSourceAmount('');
                  setUniversalTargetAmount('');
                }}
              >
                <option value="crypto">Crypto</option>
                <option value="fiat">Fiat</option>
              </select>
              <select
                className="crypto-dropdown"
                value={universalSource}
                onChange={(e) => {
                  setUniversalSource(e.target.value);
                  setUniversalSourceAmount('');
                  setUniversalTargetAmount('');
                }}
              >
                {sourceOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            className="converter-input"
            value={universalSourceAmount}
            onChange={(e) => {
              const v = e.target.value;
              const pattern = universalSourceType === 'fiat' ? /^\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,8}$/;
              if (v === '' || pattern.test(v)) {
                handleUniversalConvert(v);
              }
            }}
            placeholder="0.00"
            autoComplete="off"
            autoFocus
          />
        </div>

        <button
          type="button"
          className="arrow swap-arrow"
          onClick={swapUniversal}
          aria-label="Swap currencies"
        >⇅</button>

        <div className="input-section">
          <div className="input-header">
            <label>
              <span className="icon">←</span>
              To
            </label>
            <div className="type-and-select">
              <select
                className="type-dropdown"
                value={universalTargetType}
                onChange={(e) => {
                  setUniversalTargetType(e.target.value);
                  setUniversalTarget(e.target.value === 'crypto' ? 'bitcoin' : 'USD');
                  setUniversalSourceAmount('');
                  setUniversalTargetAmount('');
                }}
              >
                <option value="crypto">Crypto</option>
                <option value="fiat">Fiat</option>
              </select>
              <select
                className="crypto-dropdown"
                value={universalTarget}
                onChange={(e) => {
                  setUniversalTarget(e.target.value);
                  if (universalSourceAmount) handleUniversalConvert(universalSourceAmount);
                }}
              >
                {targetOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <input
            type="text"
            className="output-input"
            value={universalTargetAmount || '\u00A0'}
            readOnly
            placeholder="0.00"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="converter">
      {error && <div className="error">{error}</div>}

      {mode === 'btc' && renderBtcMode()}
      {mode === 'crypto' && renderCryptoMode()}
      {mode === 'fiat' && renderFiatMode()}
      {mode === 'both' && renderBothMode()}

      <div className="footer">
        <p className="footer-version">v0.2.0</p>
        {lastUpdate && (
          <p className="footer-update">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

export default Converter;
