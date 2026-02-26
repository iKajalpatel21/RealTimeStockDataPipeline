-- BigQuery Schema for Payment Events Processing
-- This schema is designed for exactly-once processing with full audit trail

-- Main transactions table: Raw, deduplicated payment events
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.payment_transactions` (
  transaction_id STRING NOT NULL,
  sender_account_id STRING NOT NULL,
  receiver_account_id STRING NOT NULL,
  amount FLOAT64 NOT NULL,
  currency STRING NOT NULL,
  device_id STRING NOT NULL,
  ip_address STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  region STRING,
  processing_time TIMESTAMP NOT NULL,
  
  -- Payment method and masked PII (PCI-DSS compliant)
  payment_method STRING,
  credit_card_masked STRING,       -- Format: XXXX-XXXX-XXXX-1234 (last 4 digits only)
  cvv_masked STRING,               -- Always XXX (never stored unmasked per PCI-DSS)
  card_expiry_masked STRING,       -- Format: MM/XX (year masked)
  pii_hash STRING,                 -- SHA-256(original_pii) for GDPR "right to be forgotten"
  
  -- Indexing for common queries
  INDEX_transaction_id (transaction_id),
  INDEX_sender_id (sender_account_id),
  INDEX_event_time (event_time)
)
PARTITION BY DATE(event_time)
CLUSTER BY sender_account_id, receiver_account_id, currency;

-- Transactions with fraud indicators
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.payment_transactions_fraud` (
  transaction_id STRING NOT NULL,
  sender_account_id STRING NOT NULL,
  receiver_account_id STRING NOT NULL,
  amount FLOAT64 NOT NULL,
  currency STRING NOT NULL,
  device_id STRING NOT NULL,
  ip_address STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  region STRING,
  processing_time TIMESTAMP NOT NULL,
  
  -- Fraud signals
  risk_amount STRING,
  txn_count_5min INT64,
  geographic_risk STRING,
  unique_devices_sender INT64,
  fraud_score INT64,
  enrichment_time TIMESTAMP NOT NULL,
  
  -- Flag for real-time alerts
  is_high_risk BOOL AS (fraud_score > 60),
  
  INDEX_fraud_score (fraud_score),
  INDEX_transaction_id (transaction_id)
)
PARTITION BY DATE(event_time)
CLUSTER BY sender_account_id, fraud_score;

-- Real-Time Fraud Alerts Table (Velocity Fraud Detection)
-- Sliding window aggregates for transaction velocity fraud
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.fraud_velocity_alerts` (
  transaction_id STRING NOT NULL,
  sender_account_id STRING NOT NULL,
  receiver_account_id STRING NOT NULL,
  amount FLOAT64 NOT NULL,
  currency STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  device_id STRING,
  ip_address STRING,
  region STRING,
  
  -- Velocity Fraud Features
  txn_velocity_window INT64 NOT NULL,              -- Count of txns in 60-sec window
  velocity_fraud_peers ARRAY<STRING>,              -- Transaction IDs of peer txns in window
  is_velocity_fraud BOOL NOT NULL,                 -- Flagged as fraud (>3 txns in 60s)
  
  -- Masked PII (for context without exposure)
  credit_card_masked STRING,
  card_expiry_masked STRING,
  pii_hash STRING,
  
  -- Alert metadata
  alert_timestamp TIMESTAMP NOT NULL,
  alert_severity STRING AS (
    CASE 
      WHEN txn_velocity_window > 10 THEN 'CRITICAL'
      WHEN txn_velocity_window > 5 THEN 'HIGH'
      ELSE 'MEDIUM'
    END
  ),
  
  INDEX_sender_fraud (sender_account_id, is_velocity_fraud),
  INDEX_alert_time (alert_timestamp),
  INDEX_transaction_id (transaction_id),
  INDEX_pii_hash (pii_hash)
)
PARTITION BY DATE(event_time)
CLUSTER BY sender_account_id, is_velocity_fraud;

-- Aggregated metrics for monitoring
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.payment_metrics` (
  metric_time TIMESTAMP NOT NULL,
  region STRING NOT NULL,
  currency STRING NOT NULL,
  transaction_count INT64 NOT NULL,
  total_amount FLOAT64 NOT NULL,
  min_amount FLOAT64,
  max_amount FLOAT64,
  avg_amount FLOAT64,
  calculation_time TIMESTAMP NOT NULL,
  
  INDEX_metric_time (metric_time),
  INDEX_region (region),
  INDEX_currency (currency)
)
PARTITION BY DATE(metric_time)
CLUSTER BY region, currency;

-- Deduplication audit table: Track what was deduplicated
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.deduplication_audit` (
  transaction_id STRING NOT NULL,
  first_occurrence_time TIMESTAMP NOT NULL,
  duplicate_occurrences INT64 NOT NULL,
  duplicate_timestamps ARRAY<TIMESTAMP>,
  reason STRING,
  detected_time TIMESTAMP NOT NULL,
  
  PRIMARY KEY (transaction_id) NOT ENFORCED
);

-- State store checkpoint log: Track Spark checkpoint progress
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.checkpoint_log` (
  checkpoint_id STRING NOT NULL,
  batch_number INT64 NOT NULL,
  start_offset INT64,
  end_offset INT64,
  transactions_processed INT64,
  transactions_deduplicated INT64,
  checkpoint_time TIMESTAMP NOT NULL,
  duration_ms INT64,
  status STRING,
  
  PRIMARY KEY (checkpoint_id) NOT ENFORCED,
  INDEX_time (checkpoint_time)
);

-- Error and retry log: Track failures and retries
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.error_log` (
  error_id STRING NOT NULL,
  transaction_id STRING,
  error_type STRING NOT NULL,
  error_message STRING,
  retry_count INT64,
  last_retry_time TIMESTAMP,
  resolution_status STRING,
  detected_time TIMESTAMP NOT NULL,
  
  INDEX_transaction_id (transaction_id),
  INDEX_error_type (error_type)
);

-- Summary view for daily reconciliation
CREATE OR REPLACE VIEW `{project_id}.payment_data.daily_reconciliation` AS
SELECT
  DATE(event_time) AS transaction_date,
  region,
  currency,
  COUNT(DISTINCT transaction_id) AS unique_transactions,
  COUNT(*) AS total_records,  -- Should equal unique_transactions after dedup
  SUM(amount) AS total_amount,
  MIN(amount) AS min_amount,
  MAX(amount) AS max_amount,
  ROUND(AVG(amount), 2) AS avg_amount,
  COUNT(CASE WHEN fraud_score > 60 THEN 1 END) AS high_risk_count,
  CURRENT_TIMESTAMP() AS view_generated_time
FROM `{project_id}.payment_data.payment_transactions_fraud`
GROUP BY transaction_date, region, currency
ORDER BY transaction_date DESC, total_amount DESC;

-- PII Masking Audit Table (GDPR Compliance)
-- This table tracks masked PII data for compliance with GDPR "right to be forgotten"
-- When a user requests erasure, we match their pii_hash and delete relevant rows
CREATE TABLE IF NOT EXISTS `{project_id}.payment_data.pii_masking_audit` (
  transaction_id STRING NOT NULL,
  pii_hash STRING NOT NULL,        -- SHA-256 hash of original credit_card||cvv||expiry
  payment_method STRING,
  credit_card_masked STRING,       -- Last 4 digits only: XXXX-XXXX-XXXX-1234
  cvv_masked STRING,               -- Always XXX
  card_expiry_masked STRING,       -- MM/XX
  
  -- Masking metadata
  masking_timestamp TIMESTAMP NOT NULL,
  masking_reason STRING,           -- "PCI-DSS", "GDPR", "retention_policy"
  
  -- For GDPR erasure requests
  user_email STRING,               -- Optional: to link to user for erasure
  erasure_requested BOOL DEFAULT FALSE,
  erasure_timestamp TIMESTAMP,
  
  INDEX_pii_hash (pii_hash),
  INDEX_transaction_id (transaction_id),
  INDEX_user_email (user_email)
)
PARTITION BY DATE(masking_timestamp)
CLUSTER BY pii_hash;

-- Summary view for fraud analysis
CREATE OR REPLACE VIEW `{project_id}.payment_data.fraud_summary` AS
SELECT
  DATE(event_time) AS transaction_date,
  sender_account_id,
  COUNT(DISTINCT transaction_id) AS transaction_count,
  COUNT(DISTINCT ip_address) AS unique_ips,
  COUNT(DISTINCT device_id) AS unique_devices,
  COUNT(DISTINCT region) AS unique_regions,
  SUM(CASE WHEN fraud_score > 60 THEN 1 ELSE 0 END) AS high_risk_txns,
  SUM(CASE WHEN fraud_score > 60 THEN amount ELSE 0 END) AS high_risk_amount,
  MAX(fraud_score) AS max_fraud_score,
  ROUND(AVG(fraud_score), 2) AS avg_fraud_score
FROM `{project_id}.payment_data.payment_transactions_fraud`
WHERE DATE(event_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY transaction_date, sender_account_id
HAVING max_fraud_score > 30
ORDER BY transaction_date DESC, high_risk_amount DESC;

-- Real-Time Velocity Fraud Analysis View
-- Monitor high-velocity accounts in real-time
CREATE OR REPLACE VIEW `{project_id}.payment_data.velocity_fraud_analysis` AS
SELECT
  DATE(event_time) AS fraud_date,
  sender_account_id,
  COUNT(DISTINCT transaction_id) AS total_transactions,
  SUM(CASE WHEN is_velocity_fraud THEN 1 ELSE 0 END) AS velocity_fraud_count,
  ROUND(100.0 * SUM(CASE WHEN is_velocity_fraud THEN 1 ELSE 0 END) / COUNT(*), 2) AS velocity_fraud_rate,
  MAX(txn_velocity_window) AS max_velocity_in_window,
  SUM(amount) AS total_amount,
  COUNT(DISTINCT ip_address) AS unique_ips,
  COUNT(DISTINCT device_id) AS unique_devices,
  COUNT(DISTINCT region) AS unique_regions,
  MAX(alert_timestamp) AS latest_alert
FROM `{project_id}.payment_data.fraud_velocity_alerts`
WHERE is_velocity_fraud = TRUE
  AND event_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY fraud_date, sender_account_id
HAVING velocity_fraud_count > 0
ORDER BY fraud_date DESC, velocity_fraud_count DESC;

-- Top High-Risk Velocity Accounts (Last 1 Hour)
CREATE OR REPLACE VIEW `{project_id}.payment_data.active_high_risk_accounts` AS
SELECT
  sender_account_id,
  COUNT(DISTINCT transaction_id) AS alert_count_1h,
  MAX(txn_velocity_window) AS peak_velocity,
  MIN(event_time) AS first_alert_time,
  MAX(event_time) AS latest_alert_time,
  SUM(amount) AS total_amount_1h,
  STRING_AGG(DISTINCT ip_address LIMIT 5) AS recent_ips,
  'ACTIVE' AS account_status
FROM `{project_id}.payment_data.fraud_velocity_alerts`
WHERE is_velocity_fraud = TRUE
  AND event_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
GROUP BY sender_account_id
ORDER BY alert_count_1h DESC;

-- Deduplication effectiveness report
CREATE OR REPLACE VIEW `{project_id}.payment_data.deduplication_effectiveness` AS
SELECT
  DATE(first_occurrence_time) AS date,
  COUNT(*) AS total_duplicate_events,
  SUM(duplicate_occurrences) AS duplicates_detected,
  ROUND(100.0 * SUM(duplicate_occurrences) / NULLIF(COUNT(*), 0), 2) AS duplicate_rate_percent,
  STRING_AGG(DISTINCT reason, ', ') AS dedup_reasons
FROM `{project_id}.payment_data.deduplication_audit`
WHERE first_occurrence_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY date
ORDER BY date DESC;
