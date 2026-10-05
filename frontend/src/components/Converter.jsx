import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { usePreference } from '../preferences/PreferencesProvider';
import { FIAT_CURRENCIES } from '../fiatCurrencies';
import './Converter.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const SATS_PER_BTC = 100000000;

const DEFAULT_CURRENCY_LIST = ['USD', 'EUR'];

// Fiat rates are proxied through our backend (/api/fiat-rates) so we don't
// leak visitor IPs to a third party and the call stays inside our CSP
// connect-src. The backend handles upstream caching; we keep a small
// browser-side cache to avoid pinging on every mode switch.
const FIAT_RATES_TTL_MS = 10 * 60 * 1000;
let _fiatRatesCache = null;
let _fiatRatesFetchedAt = 0;

async function getUsdToFiatRates() {
  const now = Date.now();
  if (_fiatRatesCache && (now - _fiatRatesFetchedAt) < FIAT_RATES_TTL_MS) {
    return _fiatRatesCache;
  }
  const response = await axios.get(`${API_URL}/fiat-rates`);
  if (response?.data?.success && response.data.rates) {
    _fiatRatesCache = response.data.rates;
    _fiatRatesFetchedAt = now;
    return _fiatRatesCache;
  }
  throw new Error('Fiat rates provider returned an unexpected payload');
}

function Converter({ mode }) {
  // ─── Shared state ──────────────────────────
  const [cryptos, setCryptos] = useState([]);
  const [allPrices, setAllPrices] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  // ─── BTC mode state ────────────────────────
  const [btcAmount, setBtcAmount] = useState('');
  const [unit, setUnit, unitLoading] = usePreference('unit');
  const [currencyList, setCurrencyList] = useState(DEFAULT_CURRENCY_LIST);
  const [usdToFiat, setUsdToFiat] = useState(null);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [pickerFilter, setPickerFilter] = useState('');

  // ─── Crypto mode state ─────────────────────
  const [sourceCrypto, setSourceCrypto] = usePreference('cryptoSource');
  const [targetCrypto, setTargetCrypto] = usePreference('cryptoTarget');
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

  const fetchFiatRates = async () => {
    try {
      setUsdToFiat(await getUsdToFiatRates());
    } catch (err) {
      console.error('Failed to fetch fiat rates:', err);
    }
  };

  // ─── Fetch cryptos and prices ──────────────
  useEffect(() => {
    // Data-fetch effect: both fetchers only set state after their awaits
    // resolve, but the compiler-based rule can't prove that. Intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCryptos();
    fetchAllPrices();
    fetchFiatRates();
    const interval = setInterval(() => {
      fetchAllPrices();
      fetchFiatRates();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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

  const btcValue = (() => {
    const parsed = parseFloat(btcAmount);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return unit === 'SATS' ? parsed / SATS_PER_BTC : parsed;
  })();

  const btcUsdPrice = allPrices.bitcoin?.price_usd;

  // Use the backend's /api/fiat-rates proxy (which fronts ExchangeRate-API).
  // Rationale: CoinGecko's /simple/price vs_currencies list is curated to ~30 fiats
  // and excludes some that our UI offers (e.g. PYG Paraguayan Guarani). Computing
  // BTC → USD → target_fiat via a dedicated fiat-rates provider gives full coverage
  // and consistent cross-rates. Proxying through the backend keeps the call
  // inside our CSP and avoids leaking visitor IPs to a third party.
  const priceCurrencyRow = (code) => {
    const currency = FIAT_CURRENCIES.find(c => c.code === code) ?? { code, symbol: code, name: code };
    if (!btcUsdPrice || !usdToFiat) return { ...currency, rate: 0, amount: '' };
    const usdRate = usdToFiat[code];
    if (typeof usdRate !== 'number' || usdRate <= 0) {
      return { ...currency, rate: null, amount: '' };
    }
    const rate = btcUsdPrice * usdRate;
    return { ...currency, rate, amount: btcValue > 0 ? (rate * btcValue).toFixed(2) : '' };
  };

  const currencyRows = currencyList.map(priceCurrencyRow);

  const handleBtcChange = (e) => {
    const value = e.target.value;
    if (value !== '') {
      const pattern = unit === 'BTC' ? /^\d*\.?\d{0,8}$/ : /^\d*$/;
      if (!pattern.test(value)) return;
    }
    setBtcAmount(value);
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
    setCurrencyList(prev => (prev.includes(currency.code) ? prev : [...prev, currency.code]));
    setShowCurrencyPicker(false);
    setPickerFilter('');
  };

  const removeCurrency = (code) => {
    setCurrencyList(prev => prev.filter(c => c !== code));
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
  const renderCurrencyRow = (row) => {
    const outputId = `btc-${row.code.toLowerCase()}-output`;
    const value = row.rate === null ? 'Rate unavailable' : row.amount || '\u00A0';
    const rateText = row.rate > 0
      ? `1 BTC = ${row.symbol}${formatNumber(row.rate)}`
      : row.rate === null
        ? 'No rate available'
        : '\u00A0';

    if (DEFAULT_CURRENCY_LIST.includes(row.code)) {
      return (
        <div key={row.code} className="output-field">
          <label htmlFor={outputId}><span className="icon">{row.symbol}</span>{row.code} Value</label>
          <input id={outputId} type="text" className="output-input" value={value} readOnly placeholder="0.00" />
          <div className="btc-rate">{rateText}</div>
        </div>
      );
    }

    return (
      <div key={row.code} className="additional-currency">
        <div className="output-field output-field-additional">
          <label>
            <span className="currency-label">
              <span className="icon">{row.symbol}</span>
              {row.code}
            </span>
            <button className="remove-currency-btn" onClick={() => removeCurrency(row.code)} type="button" title="Remove">✕</button>
          </label>
          <input
            id={outputId}
            type="text"
            className="output-input"
            aria-label={`${row.code} Value`}
            value={value}
            readOnly
            placeholder="0.00"
          />
          <div className="btc-rate">{rateText}</div>
        </div>
      </div>
    );
  };

  const defaultRows = currencyRows.filter(row => DEFAULT_CURRENCY_LIST.includes(row.code));
  const addedRows = currencyRows.filter(row => !DEFAULT_CURRENCY_LIST.includes(row.code));

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
          {unitLoading ? (
            <span className="unit-toggle unit-skeleton" aria-hidden="true">
              Switch to Sats
            </span>
          ) : (
            <button className="unit-toggle" onClick={toggleUnit} type="button">
              Switch to {unit === 'BTC' ? 'Sats' : 'BTC'}
            </button>
          )}
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
        {defaultRows.map(renderCurrencyRow)}
      </div>

      {addedRows.length > 0 && (
        <div className="additional-currencies-grid">
          {addedRows.map(renderCurrencyRow)}
        </div>
      )}

      <div className="add-currency-section">
        <button
          className="add-currency-btn"
          onClick={() => {
            setShowCurrencyPicker(!showCurrencyPicker);
            setPickerFilter('');
          }}
          type="button"
        >
          + Add Currency
        </button>
      </div>

      {showCurrencyPicker && (() => {
        // Filter by code (prefix), then by name (substring), both case-insensitive.
        const q = pickerFilter.trim().toLowerCase();
        const candidates = FIAT_CURRENCIES
          .filter(curr => !currencyList.includes(curr.code));
        const filtered = q
          ? candidates.filter(c =>
              c.code.toLowerCase().includes(q) ||
              c.name.toLowerCase().includes(q)
            )
          : candidates;
        return (
          <div className="currency-picker">
            <h3>Select Currency</h3>
            <input
              type="text"
              className="currency-picker-search"
              placeholder="Search by code or name (e.g. ars, peso, euro)"
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              autoFocus
              aria-label="Filter currency list"
            />
            <div className="currency-list">
              {filtered.length === 0 ? (
                <div className="currency-list-empty">No currencies match &ldquo;{pickerFilter}&rdquo;</div>
              ) : (
                filtered.map((currency) => (
                  <button key={currency.code} className="currency-option" onClick={() => addCurrency(currency)} type="button">
                    <span className="currency-symbol">{currency.symbol}</span>
                    <span className="currency-info">
                      <strong>{currency.code}</strong> - {currency.name}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );

  const renderCryptoMode = () => (
    <div className="converter-box">
      <h2>Crypto to Crypto</h2>

      <div className="convert-row">
        <div className="input-section">
          <div className="input-header">
            <label htmlFor="crypto-source">
              <span className="icon" aria-hidden="true">⟠</span>
              From
            </label>
            <select
              id="crypto-source"
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
            <label htmlFor="crypto-target">
              <span className="icon" aria-hidden="true">⟠</span>
              To
            </label>
            <select
              id="crypto-target"
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
    </div>
  );

  const renderFiatMode = () => (
    <div className="converter-box">
      <h2>Fiat to Fiat</h2>

      <div className="convert-row">
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

        <div className="convert-row">
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

      <div className="converter-footer">
        <p className="converter-footer-version">v0.2.0</p>
        {lastUpdate && (
          <p className="converter-footer-update">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

export default Converter;
