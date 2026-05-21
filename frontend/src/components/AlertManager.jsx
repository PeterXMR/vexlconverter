import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './AlertManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Per-alert edit tokens (returned once by POST /alerts) live in
// localStorage keyed by alert id. They prove ownership to the API for
// listing, deleting, and acknowledging.
const TOKENS_KEY = 'vexl_alert_tokens';

const loadTokens = () => {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveTokens = (tokens) => {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // localStorage quota / disabled — degrade gracefully
  }
};

const storeToken = (id, token) => {
  const t = loadTokens();
  t[String(id)] = token;
  saveTokens(t);
};

const dropToken = (id) => {
  const t = loadTokens();
  delete t[String(id)];
  saveTokens(t);
};

const allTokensHeader = () => Object.values(loadTokens()).join(',');
const tokenFor = (id) => loadTokens()[String(id)] || '';

function AlertManager() {
  const [alerts, setAlerts] = useState([]);
  const [cryptos, setCryptos] = useState([]);
  const [targetPrice, setTargetPrice] = useState('');
  const [currency, setCurrency] = useState('usd');
  const [direction, setDirection] = useState('above');
  const [crypto, setCrypto] = useState('bitcoin');
  const [notifications, setNotifications] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const seenTriggeredIds = useRef(new Set());

  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
    } catch (err) {
      console.error('Failed to request notification permission:', err);
    }
  };

  const fetchAlerts = useCallback(async () => {
    const tokens = allTokensHeader();
    if (!tokens) {
      setAlerts([]);
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/alerts`, {
        headers: { 'X-Alert-Tokens': tokens },
      });
      if (response.data.success) {
        setAlerts(response.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }, []);

  const checkTriggered = useCallback(async () => {
    const tokens = allTokensHeader();
    if (!tokens) return;
    try {
      const response = await axios.get(`${API_URL}/alerts/triggered`, {
        headers: { 'X-Alert-Tokens': tokens },
      });
      if (response.data.success && response.data.data.length > 0) {
        const newTriggers = response.data.data.filter(
          (a) => !seenTriggeredIds.current.has(a.id)
        );

        if (newTriggers.length === 0) return;

        const acks = [];

        newTriggers.forEach((alert) => {
          seenTriggeredIds.current.add(alert.id);
          const tok = tokenFor(alert.id);
          if (tok) acks.push({ id: alert.id, token: tok });

          const currSymbol = alert.currency === 'usd' ? '$' : '\u20AC';
          const cryptoName = alert.crypto.charAt(0).toUpperCase() + alert.crypto.slice(1);
          const message = `${cryptoName} price went ${alert.direction} ${currSymbol}${alert.target_price.toLocaleString()}!`;

          if (Notification.permission === 'granted') {
            new Notification('Vexl Price Alert', { body: message, icon: '/favicon.ico' });
          }

          setNotifications((prev) => [...prev, { id: alert.id, message }]);
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== alert.id));
          }, 8000);
        });

        // Acknowledge seen alerts so they don't appear again
        if (acks.length > 0) {
          try {
            await axios.post(`${API_URL}/alerts/ack`, { acks });
          } catch (err) {
            console.error('Failed to ack alerts:', err);
          }
        }

        fetchAlerts();
      }
    } catch (err) {
      console.error('Failed to check triggered alerts:', err);
    }
  }, [fetchAlerts]);

  useEffect(() => {
    // Fetch supported cryptos for the selector
    axios.get(`${API_URL}/cryptos`).then(res => {
      if (res.data.success) setCryptos(res.data.data);
    }).catch(() => {});

    fetchAlerts();

    // Check triggered immediately on mount (not after 30s)
    checkTriggered();

    const interval = setInterval(checkTriggered, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts, checkTriggered]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetPrice || parseFloat(targetPrice) <= 0) return;
    try {
      const response = await axios.post(`${API_URL}/alerts`, {
        target_price: parseFloat(targetPrice),
        currency,
        direction,
        crypto,
      });
      if (response.data.success) {
        const alertData = response.data.data;
        setTargetPrice('');

        // Persist the per-alert edit token returned exactly once on create.
        // Without it we can't list, delete, or ack this alert later.
        if (alertData.edit_token) {
          storeToken(alertData.id, alertData.edit_token);
        }

        // If the alert was immediately triggered, show notification right away
        if (alertData.is_triggered) {
          const currSymbol = currency === 'usd' ? '$' : '\u20AC';
          const cryptoName = crypto.charAt(0).toUpperCase() + crypto.slice(1);
          const message = `${cryptoName} price is already ${direction} ${currSymbol}${parseFloat(targetPrice).toLocaleString()}!`;

          seenTriggeredIds.current.add(alertData.id);

          if (Notification.permission === 'granted') {
            new Notification('Vexl Price Alert', { body: message, icon: '/favicon.ico' });
          }

          setNotifications((prev) => [...prev, { id: alertData.id, message }]);
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== alertData.id));
          }, 8000);

          // Acknowledge it immediately
          try {
            await axios.post(`${API_URL}/alerts/ack`, {
              acks: [{ id: alertData.id, token: alertData.edit_token }],
            });
          } catch (err) {
            console.error('Failed to ack alert:', err);
          }
        }

        fetchAlerts();
      }
    } catch (err) {
      console.error('Failed to create alert:', err);
    }
  };

  const handleDelete = async (alertId) => {
    const token = tokenFor(alertId);
    if (!token) {
      console.error('No token for alert', alertId, '— cannot delete');
      return;
    }
    try {
      const response = await axios.delete(`${API_URL}/alerts/${alertId}`, {
        headers: { 'X-Alert-Token': token },
      });
      if (response.data.success) {
        dropToken(alertId);
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  const dismissNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const formatCurrency = (price, curr) => {
    const symbol = curr === 'usd' ? '$' : '\u20AC';
    return `${symbol}${Number(price).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getCryptoLabel = (cryptoId) => {
    const found = cryptos.find(c => c.id === cryptoId);
    return found ? found.symbol : cryptoId.toUpperCase();
  };

  return (
    <div className="alert-manager">
      <div className="alert-notification-stack" role="status" aria-live="polite">
        {notifications.map((n) => (
          <div key={n.id} className="alert-notification">
            {n.message}
            <button
              className="alert-notification-close"
              onClick={() => dismissNotification(n.id)}
              type="button"
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="alert-manager-box">
        <h2>Price Alerts</h2>

        {notificationPermission === 'default' && (
          <button
            type="button"
            className="alert-enable-notifications-btn"
            onClick={handleEnableNotifications}
          >
            Enable notifications
          </button>
        )}

        <form className="alert-form" onSubmit={handleSubmit}>
          <div className="alert-form-group">
            <label htmlFor="alert-crypto">Crypto</label>
            <select
              id="alert-crypto"
              value={crypto}
              onChange={(e) => setCrypto(e.target.value)}
            >
              {cryptos.map(c => (
                <option key={c.id} value={c.id}>{c.symbol} - {c.name}</option>
              ))}
              {cryptos.length === 0 && <option value="bitcoin">BTC - Bitcoin</option>}
            </select>
          </div>
          <div className="alert-form-group">
            <label htmlFor="alert-price">Target Price</label>
            <input
              id="alert-price"
              type="number"
              step="0.01"
              min="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="e.g. 100000"
              required
            />
          </div>
          <div className="alert-form-group">
            <label htmlFor="alert-currency">Currency</label>
            <select id="alert-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="usd">USD ($)</option>
              <option value="eur">EUR (&euro;)</option>
            </select>
          </div>
          <div className="alert-form-group">
            <label htmlFor="alert-direction">Direction</label>
            <select id="alert-direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </div>
          <button type="submit" className="alert-submit-btn">Set Alert</button>
        </form>

        <div className="alert-list-header">Active Alerts</div>

        {alerts.length === 0 ? (
          <div className="alert-list-empty">
            No active alerts. Set one above to get notified when price hits your target.
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.id} className="alert-item">
              <div className="alert-item-info">
                <div className={`alert-direction ${alert.direction}`}>
                  {alert.direction === 'above' ? '\u2191' : '\u2193'}
                </div>
                <div className="alert-details">
                  <span className="alert-price">
                    {alert.direction === 'above' ? 'Above' : 'Below'}{' '}
                    {formatCurrency(alert.target_price, alert.currency)}
                  </span>
                  <span className="alert-meta">
                    {getCryptoLabel(alert.crypto)}/{alert.currency.toUpperCase()} &middot; Created{' '}
                    {new Date(alert.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button className="alert-delete-btn" onClick={() => handleDelete(alert.id)} type="button">
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AlertManager;
