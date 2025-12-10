import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Converter.css';

const API_URL = 'http://localhost:5001/api';

function Converter() {
  const [btcAmount, setBtcAmount] = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [eurAmount, setEurAmount] = useState('');
  const [rates, setRates] = useState({ btc_usd: 0, btc_eur: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unit, setUnit] = useState('BTC'); // 'BTC' or 'SATS'
  const [additionalCurrencies, setAdditionalCurrencies] = useState([]);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const SATS_PER_BTC = 100000000; // 1 BTC = 100,000,000 satoshis
  const debounceTimer = useRef(null);
  const inputRef = useRef(null);

  // Available currencies with their symbols and names (sorted alphabetically by name)
  const availableCurrencies = [
    { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
    { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
    { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
    { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
    { code: 'PYG', symbol: '₲', name: 'Paraguayan Guarani' },
    { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
    { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
    { code: 'THB', symbol: '฿', name: 'Thai Baht' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  ];

  // Fetch latest prices on component mount
  useEffect(() => {
    fetchLatestPrices();
    // Refresh every 30 seconds
    const interval = setInterval(fetchLatestPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLatestPrices = async () => {
    try {
      const response = await axios.get(`${API_URL}/prices/latest`);
      if (response.data.success) {
        setRates({
          btc_usd: response.data.data.btc_usd,
          btc_eur: response.data.data.btc_eur
        });
        setLastUpdate(new Date(response.data.data.timestamp));
        setError(null);
      }
    } catch (err) {
      setError('Failed to fetch latest prices');
      console.error(err);
    }
  };

  const performConversion = async (btcValue) => {
    if (!btcValue || btcValue <= 0) {
      setUsdAmount('');
      setEurAmount('');
      // Clear additional currency amounts
      setAdditionalCurrencies(prev => prev.map(curr => ({ ...curr, amount: '' })));
      return;
    }

    // Store cursor position before API call
    const input = inputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/convert`, {
        btc_amount: btcValue
      });

      if (response.data.success) {
        setUsdAmount(response.data.data.usd_amount.toFixed(2));
        setEurAmount(response.data.data.eur_amount.toFixed(2));

        // Fetch additional currency rates if any
        if (additionalCurrencies.length > 0) {
          await fetchAdditionalRates(btcValue);
        }

        setError(null);

        // Restore focus and selection after state update
        setTimeout(() => {
          if (input && document.activeElement !== input) {
            input.focus();
            if (start !== null && end !== null) {
              input.setSelectionRange(start, end);
            }
          }
        }, 0);
      }
    } catch (err) {
      setError('Conversion failed');
      console.error(err);

      // Restore focus even on error
      setTimeout(() => {
        if (input) input.focus();
      }, 0);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdditionalRates = async (btcValue) => {
    try {
      // Fetch rates from CoinGecko API for additional currencies
      const currencyCodes = additionalCurrencies.map(c => c.code.toLowerCase()).join(',');
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currencyCodes}`
      );

      if (response.data && response.data.bitcoin) {
        setAdditionalCurrencies(prev =>
          prev.map(curr => ({
            ...curr,
            rate: response.data.bitcoin[curr.code.toLowerCase()] || 0,
            amount: ((response.data.bitcoin[curr.code.toLowerCase()] || 0) * btcValue).toFixed(2)
          }))
        );
      }
    } catch (err) {
      console.error('Failed to fetch additional rates:', err);
    }
  };

  const addCurrency = (currency) => {
    if (!additionalCurrencies.find(c => c.code === currency.code)) {
      setAdditionalCurrencies(prev => [...prev, { ...currency, rate: 0, amount: '' }]);
      setShowCurrencyPicker(false);

      // If we have a BTC amount, fetch the rate immediately
      if (btcAmount && !isNaN(btcAmount) && parseFloat(btcAmount) > 0) {
        const btcValue = unit === 'SATS' ? parseFloat(btcAmount) / SATS_PER_BTC : parseFloat(btcAmount);
        performConversion(btcValue);
      }
    }
  };

  const removeCurrency = (currencyCode) => {
    setAdditionalCurrencies(prev => prev.filter(c => c.code !== currencyCode));
  };

  const handleBtcChange = (e) => {
    let value = e.target.value;

    // Allow empty input
    if (value === '') {
      setBtcAmount('');
      setUsdAmount('');
      setEurAmount('');
      return;
    }

    // Validation based on unit
    if (unit === 'BTC') {
      // For BTC: allow numbers and decimal point, up to 8 decimal places
      // Allow partial input like "0.", "0.0", etc. while typing
      if (!/^\d*\.?\d{0,8}$/.test(value)) {
        return; // Don't update if invalid format
      }
    } else {
      // For SATS: only allow whole numbers
      if (!/^\d*$/.test(value)) {
        return; // Don't update if not a whole number
      }
    }

    // Update the displayed value immediately
    setBtcAmount(value);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Parse the value for conversion
    const numValue = parseFloat(value);

    // If we have a valid number, debounce the API call
    if (!isNaN(numValue) && numValue > 0) {
      // Convert to BTC if in SATS mode
      const btcValue = unit === 'SATS' ? numValue / SATS_PER_BTC : numValue;

      // Debounce API call by 800ms - fast enough to feel responsive
      debounceTimer.current = setTimeout(() => {
        performConversion(btcValue);
      }, 800);
    } else {
      // Clear results if invalid number
      setUsdAmount('');
      setEurAmount('');
    }
  };

  const toggleUnit = () => {
    const newUnit = unit === 'BTC' ? 'SATS' : 'BTC';
    setUnit(newUnit);

    // Convert current value to new unit
    if (btcAmount && btcAmount !== '' && !isNaN(btcAmount)) {
      const currentValue = parseFloat(btcAmount);
      if (newUnit === 'SATS') {
        // Converting from BTC to SATS - multiply by 100,000,000
        const satsValue = Math.round(currentValue * SATS_PER_BTC);
        setBtcAmount(satsValue.toString());
      } else {
        // Converting from SATS to BTC - divide by 100,000,000
        const btcValue = currentValue / SATS_PER_BTC;
        // Format with up to 8 decimal places, removing trailing zeros
        setBtcAmount(btcValue.toFixed(8).replace(/\.?0+$/, ''));
      }
    }

    // Keep focus on input after switching
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select(); // Select all text after toggle
      }
    }, 0);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="converter">
      <div className="header">
        <h1>Vexl Converter</h1>
      </div>

      {error && <div className="error">{error}</div>}


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
            ref={inputRef}
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
            {unit === 'BTC'
              ? '1 BTC = 100,000,000 satoshis'
              : '1 BTC = 100,000,000 satoshis'}
          </div>
        </div>

        <div className="arrow">↓</div>

        <div className="output-section">
          <div className="output-field">
            <label>
              <span className="icon">$</span>
              USD Value
            </label>
            <input
              type="text"
              className="output-input"
              value={usdAmount || '\u00A0'} // Non-breaking space when empty to maintain height
              readOnly
              placeholder="0.00"
            />
            <div className="btc-rate">{rates.btc_usd > 0 ? `1 BTC = $${formatNumber(rates.btc_usd)}` : '\u00A0'}</div>
          </div>

          <div className="output-field">
            <label>
              <span className="icon">€</span>
              EUR Value
            </label>
            <input
              type="text"
              className="output-input"
              value={eurAmount || '\u00A0'} // Non-breaking space when empty to maintain height
              readOnly
              placeholder="0.00"
            />
            <div className="btc-rate">{rates.btc_eur > 0 ? `1 BTC = €${formatNumber(rates.btc_eur)}` : '\u00A0'}</div>
          </div>
        </div>

        {/* Additional currencies */}
        {additionalCurrencies.map((currency) => (
          <div key={currency.code} className="output-section additional-currency">
            <div className="output-field output-field-additional">
              <label>
                <span className="icon">{currency.symbol}</span>
                {currency.name} ({currency.code})
                <button
                  className="remove-currency-btn"
                  onClick={() => removeCurrency(currency.code)}
                  type="button"
                  title="Remove currency"
                >
                  ✕
                </button>
              </label>
              <input
                type="text"
                className="output-input"
                value={currency.amount || '\u00A0'}
                readOnly
                placeholder="0.00"
              />
              <div className="btc-rate">
                {currency.rate > 0 ? `1 BTC = ${currency.symbol}${formatNumber(currency.rate)}` : '\u00A0'}
              </div>
            </div>
          </div>
        ))}

        {/* Add Currency Button */}
        <div className="add-currency-section">
          <button
            className="add-currency-btn"
            onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
            type="button"
          >
            + Add Currency
          </button>
        </div>

        {/* Currency Picker */}
        {showCurrencyPicker && (
          <div className="currency-picker">
            <h3>Select Currency</h3>
            <div className="currency-list">
              {availableCurrencies
                .filter(curr => !additionalCurrencies.find(c => c.code === curr.code))
                .map((currency) => (
                  <button
                    key={currency.code}
                    className="currency-option"
                    onClick={() => addCurrency(currency)}
                    type="button"
                  >
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

      <div className="footer">
        <p className="footer-version">MVP v0.0.1</p>
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

