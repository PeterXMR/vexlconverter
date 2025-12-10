-- Vexl Converter MVP v0.0.1 Database Schema
-- PostgreSQL initialization script

-- Table to store Bitcoin prices
CREATE TABLE btc_prices (
    id SERIAL PRIMARY KEY,
    btc_usd DECIMAL(12, 2) NOT NULL,
    btc_eur DECIMAL(12, 2) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast retrieval of latest price
CREATE INDEX idx_btc_prices_timestamp ON btc_prices(timestamp DESC);

-- Table to store conversion history (optional for v0.0.1, useful for future)
CREATE TABLE conversion_history (
    id SERIAL PRIMARY KEY,
    btc_amount DECIMAL(18, 8) NOT NULL,
    usd_amount DECIMAL(12, 2) NOT NULL,
    eur_amount DECIMAL(12, 2) NOT NULL,
    btc_usd_rate DECIMAL(12, 2) NOT NULL,
    btc_eur_rate DECIMAL(12, 2) NOT NULL,
    converted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on conversion history timestamp
CREATE INDEX idx_conversion_history_timestamp ON conversion_history(converted_at DESC);

