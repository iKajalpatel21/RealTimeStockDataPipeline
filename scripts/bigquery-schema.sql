-- This SQL script defines the BigQuery schema for storing processed stock data

-- Create dataset if it doesn't exist
CREATE SCHEMA IF NOT EXISTS stock_data;

-- Create table for raw stock data
CREATE TABLE IF NOT EXISTS stock_data.raw_stock_data (
  symbol STRING NOT NULL,
  price FLOAT64 NOT NULL,
  change FLOAT64,
  percent_change FLOAT64,
  high_of_day FLOAT64,
  low_of_day FLOAT64,
  open_price FLOAT64,
  previous_close FLOAT64,
  timestamp TIMESTAMP NOT NULL,
  volume INT64,
  fetch_time TIMESTAMP NOT NULL,
  ingestion_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY symbol;

-- Create table for processed stock data
CREATE TABLE IF NOT EXISTS stock_data.processed_stock_data (
  symbol STRING NOT NULL,
  price FLOAT64 NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  volume INT64,
  change FLOAT64,
  percent_change FLOAT64,
  price_ma_5min FLOAT64,
  price_ma_15min FLOAT64,
  vwap_30min FLOAT64,
  rsi_14 FLOAT64,
  processing_time TIMESTAMP NOT NULL,
  ingestion_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY symbol;

-- Create view for latest stock prices
CREATE OR REPLACE VIEW stock_data.latest_stock_prices AS
SELECT
  symbol,
  price,
  change,
  percent_change,
  volume,
  timestamp,
  price_ma_5min,
  price_ma_15min,
  vwap_30min,
  rsi_14
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY timestamp DESC) as row_num
  FROM
    stock_data.processed_stock_data
  WHERE
    DATE(timestamp) = CURRENT_DATE()
)
WHERE row_num = 1;

-- Create view for daily stock summary
CREATE OR REPLACE VIEW stock_data.daily_stock_summary AS
SELECT
  symbol,
  DATE(timestamp) as trading_date,
  MIN(price) as daily_low,
  MAX(price) as daily_high,
  ARRAY_AGG(price ORDER BY timestamp ASC LIMIT 1)[OFFSET(0)] as daily_open,
  ARRAY_AGG(price ORDER BY timestamp DESC LIMIT 1)[OFFSET(0)] as daily_close,
  SUM(volume) as daily_volume,
  AVG(price) as daily_avg_price,
  AVG(vwap_30min) as daily_avg_vwap,
  AVG(rsi_14) as daily_avg_rsi
FROM
  stock_data.processed_stock_data
GROUP BY
  symbol, DATE(timestamp)
ORDER BY
  trading_date DESC, symbol;

-- Create table for trading signals
CREATE TABLE IF NOT EXISTS stock_data.trading_signals (
  symbol STRING NOT NULL,
  signal_type STRING NOT NULL,  -- 'BUY', 'SELL', 'HOLD'
  signal_strength FLOAT64,      -- 0 to 1 indicating confidence
  price_at_signal FLOAT64 NOT NULL,
  ma_5min FLOAT64,
  ma_15min FLOAT64,
  rsi_14 FLOAT64,
  vwap_30min FLOAT64,
  signal_reason STRING,
  timestamp TIMESTAMP NOT NULL,
  creation_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY symbol, signal_type;
