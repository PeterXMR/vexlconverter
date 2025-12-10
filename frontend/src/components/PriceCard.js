import React from 'react';
export default PriceCard;

};
  );
    </div>
      <div className="btc-label">1 BTC</div>
      </div>
        )}
          </>
            <span className="currency-symbol">{currency}</span>
            <span className="price-value">{formatPrice(price)}</span>
          <>
        ) : (
          <div className="loading-spinner">⏳</div>
        {loading ? (
      <div className="price-display">
      </div>
        )}
          </button>
            ✕
          <button className="remove-button" onClick={onRemove} title="Remove currency">
        {!isDefault && onRemove && (
        <h3 className="currency-code">{currency}</h3>
      <div className="card-header">
    <div className={`price-card ${isDefault ? 'default' : 'additional'}`}>
  return (

  };
    }).format(price);
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    return new Intl.NumberFormat('en-US', {
    if (price === undefined || price === null) return 'N/A';
  const formatPrice = (price) => {
const PriceCard = ({ currency, price, loading, isDefault, onRemove }) => {

import './PriceCard.css';

