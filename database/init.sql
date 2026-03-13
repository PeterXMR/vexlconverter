-- Vexl Converter Database Schema
-- PostgreSQL initialization script

-- Legacy table: Bitcoin prices (kept for backwards compatibility)
CREATE TABLE btc_prices (
    id SERIAL PRIMARY KEY,
    btc_usd DECIMAL(12, 2) NOT NULL,
    btc_eur DECIMAL(12, 2) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_btc_prices_timestamp ON btc_prices(timestamp DESC);

-- Multi-cryptocurrency prices
CREATE TABLE crypto_prices (
    id SERIAL PRIMARY KEY,
    crypto_id VARCHAR(32) NOT NULL,
    price_usd DECIMAL(18, 8) NOT NULL,
    price_eur DECIMAL(18, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crypto_prices_lookup ON crypto_prices(crypto_id, timestamp DESC);

-- Price alerts
CREATE TABLE price_alerts (
    id SERIAL PRIMARY KEY,
    crypto VARCHAR(50) NOT NULL DEFAULT 'bitcoin',
    target_price DECIMAL(18, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    direction VARCHAR(10) NOT NULL DEFAULT 'above',
    is_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    seen_by_client BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triggered_at TIMESTAMP
);

CREATE INDEX idx_price_alerts_active ON price_alerts(is_triggered, crypto);
CREATE INDEX idx_price_alerts_triggered ON price_alerts(is_triggered, triggered_at DESC);

-- Conversion history (for future analytics)
CREATE TABLE conversion_history (
    id SERIAL PRIMARY KEY,
    crypto_id VARCHAR(32) NOT NULL DEFAULT 'bitcoin',
    crypto_amount DECIMAL(18, 8) NOT NULL,
    usd_amount DECIMAL(12, 2) NOT NULL,
    eur_amount DECIMAL(12, 2) NOT NULL,
    crypto_usd_rate DECIMAL(18, 8) NOT NULL,
    crypto_eur_rate DECIMAL(18, 8) NOT NULL,
    converted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversion_history_timestamp ON conversion_history(converted_at DESC);
