import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import './PriceChart.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const PERIODS = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '1y', label: '1Y' },
];

function PriceChart() {
  const [period, setPeriod] = useState('7d');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUSD, setShowUSD] = useState(true);
  const [showEUR, setShowEUR] = useState(true);

  const fetchHistory = useCallback(async (selectedPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${API_URL}/prices/history?period=${selectedPeriod}`
      );
      if (response.data.success) {
        setChartData(response.data.data);
      } else {
        setError(response.data.error || 'Failed to load history');
      }
    } catch (err) {
      setError('Failed to fetch price history');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data-fetch effect: fetchHistory sets loading state synchronously before
    // the request, which the compiler-based rule flags. Intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory(period);

    // Auto-refresh every 60s when viewing the 24h period
    if (period === '24h') {
      const refreshInterval = setInterval(() => {
        fetchHistory('24h');
      }, 60000);
      return () => clearInterval(refreshInterval);
    }
  }, [period, fetchHistory]);

  const formatLabel = (isoString) => {
    const date = new Date(isoString);
    if (period === '24h') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (period === '7d') {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const labels = chartData.map((d) => formatLabel(d.timestamp));

  // Show individual points when data is sparse so the chart is never blank
  const pointRadius = chartData.length <= 5 ? 4 : 0;
  const pointHoverRadius = chartData.length <= 5 ? 6 : 4;

  const datasets = [];
  if (showUSD) {
    datasets.push({
      label: 'BTC / USD',
      data: chartData.map((d) => d.price_usd),
      borderColor: '#FC0377',
      backgroundColor: 'rgba(252, 3, 119, 0.1)',
      borderWidth: 2,
      pointRadius,
      pointHoverRadius,
      tension: 0.3,
      fill: true,
    });
  }
  if (showEUR) {
    datasets.push({
      label: 'BTC / EUR',
      data: chartData.map((d) => d.price_eur),
      borderColor: '#9400FF',
      backgroundColor: 'rgba(148, 0, 255, 0.1)',
      borderWidth: 2,
      pointRadius,
      pointHoverRadius,
      tension: 0.3,
      fill: true,
    });
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        borderColor: 'rgba(252, 3, 119, 0.3)',
        borderWidth: 1,
        titleColor: '#FFFFFF',
        bodyColor: '#CCCCCC',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function (context) {
            const value = context.parsed.y;
            const formatted = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: context.dataset.label.includes('USD') ? 'USD' : 'EUR',
              minimumFractionDigits: 2,
            }).format(value);
            return `${context.dataset.label}: ${formatted}`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#666666', font: { size: 11 }, maxRotation: 0, maxTicksLimit: 8 },
      },
      y: {
        display: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#666666',
          font: { size: 11 },
          callback: function (value) {
            const symbol = showUSD ? '$' : showEUR ? '\u20AC' : '';
            return symbol + value.toLocaleString();
          },
        },
      },
    },
  };

  return (
    <div className="price-chart-container">
      <div className="chart-header">
        <h2>Price History</h2>
        <div className="chart-controls">
          <div className="currency-toggles">
            <button
              className={`currency-toggle ${showUSD ? 'active usd' : ''}`}
              onClick={() => setShowUSD(!showUSD)}
              type="button"
            >
              USD
            </button>
            <button
              className={`currency-toggle ${showEUR ? 'active eur' : ''}`}
              onClick={() => setShowEUR(!showEUR)}
              type="button"
            >
              EUR
            </button>
          </div>
          <div className="period-selector">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`period-btn ${period === p.key ? 'active' : ''}`}
                onClick={() => setPeriod(p.key)}
                type="button"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-area">
        {loading && <div className="chart-loading">Loading chart data...</div>}
        {error && <div className="chart-error">{error}</div>}
        {!loading && !error && chartData.length === 0 && (
          <div className="chart-empty">No price data available for this period</div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <Line data={data} options={options} />
        )}
      </div>
    </div>
  );
}

export default PriceChart;
