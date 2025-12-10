import React, { useState } from 'react';
import './CurrencySelector.css';

const CurrencySelector = ({ availableCurrencies, onAddCurrency }) => {
  const [selectedCurrency, setSelectedCurrency] = useState('');

  const handleAdd = () => {
    if (selectedCurrency) {
      onAddCurrency(selectedCurrency);
      setSelectedCurrency('');
    }
  };

  if (availableCurrencies.length === 0) {
    return null;
  }

  return (
    <div className="currency-selector">
      <h2>Add More Currencies</h2>
      <div className="selector-controls">
        <select
          className="currency-dropdown"
          value={selectedCurrency}
          onChange={(e) => setSelectedCurrency(e.target.value)}
        >
          <option value="">Select a currency...</option>
          {availableCurrencies.map(currency => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <button
          className="add-button"
          onClick={handleAdd}
          disabled={!selectedCurrency}
        >
          ➕ Add
        </button>
      </div>
    </div>
  );
};

export default CurrencySelector;

