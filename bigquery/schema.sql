-- Stock Data Schema for BigQuery

-- Create dataset if it doesn't exist
CREATE SCHEMA IF NOT EXISTS stock_data;

-- Table for processed trades
CREATE TABLE IF NOT EXISTS stock_data.processed_trades (
  symbol STRING NOT NULL,
  trade_time TIMESTAMP NOT NULL,
  price FLOAT64 NOT NULL,
  volume FLOAT64,
  price_ma_5min FLOAT64,
  price_ma_15min FLOAT64,
  vwap_30min FLOAT64,
  processing_time TIMESTAMP NOT NULL
)
PARTITION BY DATE(trade_time)
CLUSTER BY symbol;

-- Table for processed quotes
CREATE TABLE IF NOT EXISTS stock_data.processed_quotes (
  symbol STRING NOT NULL,
  quote_time TIMESTAMP NOT NULL,
  price FLOAT64 NOT NULL,
  change FLOAT64,
  percent_change FLOAT64,
  high_of_day FLOAT64,
  low_of_day FLOAT64,
  open_price FLOAT64,
  previous_close FLOAT64,
  rsi_14 FLOAT64,
  processing_time TIMESTAMP NOT NULL
)
PARTITION BY DATE(quote_time)
CLUSTER BY symbol;

-- Table for trading signals
CREATE TABLE IF NOT EXISTS stock_data.trading_signals (
  symbol STRING NOT NULL,
  signal_time TIMESTAMP NOT NULL,
  price_at_signal FLOAT64 NOT NULL,
  signal_type STRING NOT NULL,  -- 'BUY', 'SELL', 'HOLD'
  signal_strength FLOAT64,      -- 0 to 1 indicating confidence
  ma_10 FLOAT64,
  ma_20 FLOAT64,
  rsi_14 FLOAT64,
  signal_reason STRING,
  generation_time TIMESTAMP NOT NULL
)
PARTITION BY DATE(signal_time)
CLUSTER BY symbol, signal_type;

-- View for latest stock prices
CREATE OR REPLACE VIEW stock_data.latest_stock_prices AS
SELECT
  symbol,
  price,
  change,
  percent_change,
  high_of_day,
  low_of_day,
  rsi_14,
  quote_time
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY quote_time DESC) as row_num
  FROM
    stock_data.processed_quotes
  WHERE
    DATE(quote_time) = CURRENT_DATE()
)
WHERE row_num = 1;

-- View for daily stock summary
CREATE OR REPLACE VIEW stock_data.daily_stock_summary AS
SELECT
  symbol,
  DATE(trade_time) as trading_date,
  MIN(price) as daily_low,
  MAX(price) as daily_high,
  ARRAY_AGG(price ORDER BY trade_time ASC LIMIT 1)[OFFSET(0)] as daily_open,
  ARRAY_AGG(price ORDER BY trade_time DESC LIMIT 1)[OFFSET(0)] as daily_close,
  SUM(volume) as daily_volume,
  AVG(price) as daily_avg_price,
  AVG(vwap_30min) as daily_avg_vwap
FROM
  stock_data.processed_trades
GROUP BY
  symbol, DATE(trade_time)
ORDER BY
  trading_date DESC, symbol;
