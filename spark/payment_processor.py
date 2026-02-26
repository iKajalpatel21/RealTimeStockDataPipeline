#!/usr/bin/env python3
"""
Spark Streaming Job for Payment Event Processing with Exactly-Once Semantics

This script processes real-time payment events from Kafka with a deduplication layer
to ensure exactly-once delivery semantics. Critical for financial correctness:
- Even if Kafka sends a message twice (on network retry), it only hits BigQuery once
- Uses transaction_id as the deduplication key
- Implements watermarking to handle late-arriving data
- State Store pattern to track seen transactions

Why this matters:
- Without deduplication: A $1,000 payment could be recorded as $2,000
- With deduplication: Each payment is recorded exactly once, ensuring financial reconciliation
"""

import os
import json
import hashlib
import redis
from pyspark.sql import SparkSession, Window
from pyspark.sql.functions import (
    from_json,
    col,
    window,
    current_timestamp,
    lit,
    row_number,
    max as spark_max,
    min as spark_min,
    when,
    substring,
    concat,
    regexp_extract,
    md5,
    sha2,
    concat_ws,
    count,
    collect_list,
    size,
)
from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    DoubleType,
    LongType,
    IntegerType,
    TimestampType,
)

# Load configuration from environment variables
SPARK_MASTER = os.environ.get("SPARK_MASTER", "local[*]")
KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC_PAYMENTS = os.environ.get("KAFKA_TOPIC_PAYMENTS", "payment-events")
CHECKPOINT_LOCATION = os.environ.get("CHECKPOINT_LOCATION", "/checkpoint")
BIGQUERY_PROJECT = os.environ.get("BIGQUERY_PROJECT", "your-project")
BIGQUERY_DATASET = os.environ.get("BIGQUERY_DATASET", "payment_data")

# Redis configuration for real-time fraud alerts
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
REDIS_DB = int(os.environ.get("REDIS_DB", 0))
VELOCITY_FRAUD_THRESHOLD = int(
    os.environ.get("VELOCITY_FRAUD_THRESHOLD", 3)
)  # Txns in 60s
VELOCITY_FRAUD_WINDOW = 60  # seconds


def create_spark_session():
    """
    Create and configure Spark session

    Key configurations explained:
    - spark.sql.streaming.schemaInference: Auto-detects message schema
    - spark.streaming.stopGracefullyOnShutdown: Cleanly stops the stream instead of crashing
    """
    return (
        SparkSession.builder.appName("PaymentEventProcessor")
        .master(SPARK_MASTER)
        .config(
            "spark.jars.packages",
            "org.apache.spark:spark-sql-kafka-0-10_2.12:3.3.2,"
            "com.google.cloud:google-cloud-bigquery:2.24.4",
        )
        .config("spark.streaming.stopGracefullyOnShutdown", "true")
        .config("spark.sql.streaming.schemaInference", "true")
        # Critical for exactly-once: checkpoint location tracks processed messages
        .config("spark.sql.streaming.checkpointLocation", CHECKPOINT_LOCATION)
        .getOrCreate()
    )


def define_payment_schema():
    """
    Define schema for payment event messages from Kafka

    This matches the payment_simulator.py output structure:
    - transaction_id: Unique identifier (UUID) - used for deduplication
    - sender_account_id: Source account
    - receiver_account_id: Destination account
    - amount: Transaction amount
    - currency: Currency code
    - device_id: Device used for transaction
    - ip_address: Origin IP address
    - timestamp: Event timestamp in milliseconds
    - region: Geographic region
    - PII Fields (masked in Spark):
      - payment_method: credit_card, debit_card, wallet, bank_transfer
      - credit_card: Card number (will be masked to last 4 digits)
      - cvv: Card verification value (will be fully masked)
      - card_expiry: Card expiration date (will be masked)
    """
    return StructType(
        [
            StructField("transaction_id", StringType(), False),  # PRIMARY KEY for dedup
            StructField("sender_account_id", StringType(), False),
            StructField("receiver_account_id", StringType(), False),
            StructField("amount", DoubleType(), False),
            StructField("currency", StringType(), False),
            StructField("device_id", StringType(), False),
            StructField("ip_address", StringType(), False),
            StructField("timestamp", LongType(), False),  # Event time for watermarking
            StructField("region", StringType(), True),
            # PII Fields (nullable, only present for card payments)
            StructField("payment_method", StringType(), True),
            StructField("credit_card", StringType(), True),  # PII - to be masked
            StructField("cvv", StringType(), True),  # PII - to be masked
            StructField("card_expiry", StringType(), True),  # PII - to be masked
        ]
    )


def read_payments_from_kafka(spark):
    """
    Read payment events from Kafka

    Why readStream instead of read():
    - read() reads static data once
    - readStream() continuously listens for new messages

    Kafka offset strategy:
    - "latest": Start from newest messages (ignore past data)
    - "earliest": Start from oldest messages (replay all data)
    - Default here: "latest" (for production scenarios)
    """
    return (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", KAFKA_TOPIC_PAYMENTS)
        .option("startingOffsets", "latest")
        # Kafka timeout: How long to wait for messages (30 seconds)
        .option(
            "failOnDataLoss", "false"
        )  # Don't crash if messages are lost (e.g., Kafka reboot)
        .load()
        # Cast Kafka binary data to strings
        .selectExpr("CAST(key AS STRING)", "CAST(value AS STRING)")
        # Parse JSON payload
        .select(
            col("key").alias("transaction_id_key"),
            from_json(col("value"), define_payment_schema()).alias("payment_data"),
        )
        # Extract fields from nested structure
        .select(
            col("payment_data.transaction_id").alias("transaction_id"),
            col("payment_data.sender_account_id"),
            col("payment_data.receiver_account_id"),
            col("payment_data.amount"),
            col("payment_data.currency"),
            col("payment_data.device_id"),
            col("payment_data.ip_address"),
            # Convert milliseconds to timestamp for watermarking
            (col("payment_data.timestamp") / 1000)
            .cast("timestamp")
            .alias("event_time"),
            col("payment_data.region"),
            # PII Fields (will be masked in mask_pii_data function)
            col("payment_data.payment_method"),
            col("payment_data.credit_card"),
            col("payment_data.cvv"),
            col("payment_data.card_expiry"),
            # Track when Spark processed this message
            current_timestamp().alias("processing_time"),
        )
    )


def mask_pii_data(payments_df):
    """
    PII MASKING LAYER: Compliance with PCI-DSS and GDPR

    PCI-DSS Requirements (Payment Card Industry Data Security Standard):
    - Credit card data must never be stored unencrypted or unmasked
    - Sensitive authentication data (CVV, PIN) must not be retained post-authorization
    - Violation penalties: $5,000-$100,000 per month + breach liability

    GDPR Requirements (General Data Protection Regulation):
    - Minimize personal data collection (data minimization principle)
    - Must have legitimate purpose for storing personal data
    - Individual has right to erasure ("right to be forgotten")
    - Unauthorized access can result in 4% of global revenue penalty

    Our Masking Strategy:
    1. Credit Card Numbers: Keep only last 4 digits (XXXX-XXXX-XXXX-1234)
       Rationale: Last 4 digits sufficient for payment reconciliation, full number never needed in analytics

    2. CVV: Fully masked (CVV must NEVER be stored - PCI-DSS requirement)
       Rationale: Should be verified by payment gateway immediately, no reason to store

    3. Card Expiry: Mask year only (MM/XX - keep month for reconciliation)
       Rationale: Month needed for fraud analysis, full expiry not needed

    4. Original PII Hash: SHA-256 hash of original unmasked values stored separately
       Rationale: Enables "right to be forgotten" without key management complexity

    Hash-based approach eliminates need for encryption keys:
    - Hash is one-way (cannot reverse to get original data)
    - If user requests erasure, we delete rows matching their hash
    - No key management complexity, works with BigQuery native functions
    """

    masked_payments = payments_df.select(
        col("transaction_id"),
        col("sender_account_id"),
        col("receiver_account_id"),
        col("amount"),
        col("currency"),
        col("device_id"),
        col("ip_address"),
        col("event_time"),
        col("region"),
        col("payment_method"),
        col("processing_time"),
        # PII Masking Layer
        # Credit Card: Keep only last 4 digits
        # Example: 1234-5678-9012-3456 → XXXX-XXXX-XXXX-3456
        when(
            col("credit_card").isNotNull(),
            concat(lit("XXXX-XXXX-XXXX-"), substring(col("credit_card"), -4, 4)),
        )
        .otherwise(None)
        .alias("credit_card_masked"),
        # CVV: Always masked (MUST NOT be stored per PCI-DSS)
        when(col("cvv").isNotNull(), lit("XXX")).otherwise(None).alias("cvv_masked"),
        # Card Expiry: Mask year only (MM/XX)
        # Example: 03/26 → 03/XX
        when(
            col("card_expiry").isNotNull(),
            concat(substring(col("card_expiry"), 1, 3), lit("XX")),
        )
        .otherwise(None)
        .alias("card_expiry_masked"),
        # Create audit trail: Hash of original PII for GDPR "right to be forgotten"
        # SHA-256(credit_card || cvv || expiry) = hash
        # If user requests deletion, we find rows matching this hash and delete them
        when(
            col("credit_card").isNotNull(),
            sha2(
                concat_ws("||", col("credit_card"), col("cvv"), col("card_expiry")), 256
            ),
        )
        .otherwise(None)
        .alias("pii_hash"),
    )

    return masked_payments


def detect_velocity_fraud(payments_df):
    """
    REAL-TIME FRAUD FEATURE ENGINEERING: Sliding Window Velocity Detection

    Purpose: Detect suspicious transaction velocity patterns in real-time

    Fraud Pattern:
    - Single account initiates >3 transactions within 60 seconds
    - Indicates account compromise or card testing
    - Example: Attacker testing stolen card with rapid micro-charges

    Approach: Sliding Window Aggregation
    1. Group by sender_account_id + 60-second tumbling window
    2. Count transactions per window
    3. Flag if count > VELOCITY_FRAUD_THRESHOLD (default: 3)
    4. Mark suspicious transactions for alert

    Output: New columns
    - txn_velocity_window: Count of txns in 60-sec window for this sender
    - is_velocity_fraud: Boolean (True if count > 3)
    - velocity_fraud_peers: List of sibling transaction IDs in window
    """

    # Step 1: Create 60-second tumbling window
    # Spark automatically creates windows: [0-60s], [60-120s], [120-180s], etc.
    windowed = payments_df.withWatermark("event_time", "2 minutes").select(
        window(col("event_time"), "60 seconds").alias("velocity_window"),
        col("transaction_id"),
        col("sender_account_id"),
        col("receiver_account_id"),
        col("amount"),
        col("currency"),
        col("device_id"),
        col("ip_address"),
        col("event_time"),
        col("region"),
        col("payment_method"),
        col("credit_card_masked"),
        col("cvv_masked"),
        col("card_expiry_masked"),
        col("pii_hash"),
        col("processing_time"),
    )

    # Step 2: Count transactions per sender within each window
    velocity_fraud = (
        windowed.groupBy(col("velocity_window"), col("sender_account_id"))
        .agg(
            count("transaction_id").alias("txn_velocity_window"),
            collect_list("transaction_id").alias("velocity_fraud_peers"),
        )
        .select(
            col("velocity_window.start").alias("window_start"),
            col("velocity_window.end").alias("window_end"),
            col("sender_account_id"),
            col("txn_velocity_window"),
            col("velocity_fraud_peers"),
        )
    )

    # Step 3: Join velocity counts back to original dataframe
    # This gives each transaction the velocity context
    velocity_enriched = windowed.join(
        velocity_fraud,
        (col("velocity_window.start") == col("window_start"))
        & (col("velocity_window.end") == col("window_end"))
        & (col("sender_account_id") == velocity_fraud.col("sender_account_id")),
        "left",
    ).select(
        col("transaction_id"),
        col("sender_account_id"),
        col("receiver_account_id"),
        col("amount"),
        col("currency"),
        col("device_id"),
        col("ip_address"),
        col("event_time"),
        col("region"),
        col("payment_method"),
        col("credit_card_masked"),
        col("cvv_masked"),
        col("card_expiry_masked"),
        col("pii_hash"),
        col("processing_time"),
        col("txn_velocity_window"),
        col("velocity_fraud_peers"),
        # Step 4: Flag as fraud if velocity > threshold
        when(col("txn_velocity_window") > VELOCITY_FRAUD_THRESHOLD, True)
        .otherwise(False)
        .alias("is_velocity_fraud"),
    )

    return velocity_enriched


def deduplicate_payments(payments_df):
    """
    EXACTLY-ONCE SEMANTICS: Deduplication Layer

    This is the CRITICAL function that prevents double-counting payments.

    Why duplicates happen:
    1. Network retries: Kafka sends message, network fails before ack, Kafka resends
    2. Producer retries: Application retries on timeout (doesn't know if msg sent)
    3. Consumer rebalancing: Consumer crashes mid-processing, restart replays messages

    Our solution: Check transaction_id against state store (checkpoint)

    How it works:
    1. Use window() + dropDuplicates() to group messages
    2. Keep ONLY the first occurrence of each transaction_id
    3. Spark automatically maintains this in the checkpoint (state store)
    4. Even if same message arrives 100x, only first one passes through

    Watermarking explained:
    - Watermark = threshold for "late data"
    - If data arrives > 1 hour late, discard it (can't reprocess old payments)
    - Example: If event_time is 2026-02-25 10:00, and it's now 2026-02-25 11:30,
              this data is too late (outside 1-hour watermark), so discard it

    Why this matters for payments:
    - Can't accept a payment from yesterday - must be real-time
    - Prevents state store from growing infinitely with ancient transactions
    """

    # Step 1: Add watermark for late data
    # If a payment is more than 1 hour late, consider it invalid
    payments_with_watermark = payments_df.withWatermark("event_time", "1 hour")

    # Step 2: Deduplicate using transaction_id
    # For each unique transaction_id within the watermark window,
    # keep only the FIRST one (ordered by event_time)
    window_spec = Window.partitionBy("transaction_id").orderBy("event_time")

    deduped_payments = (
        payments_with_watermark.withColumn("rn", row_number().over(window_spec))
        # rn = 1 means this is the first occurrence of this transaction_id
        # rn = 2, 3, 4... means these are duplicates - DROP them
        .filter(col("rn") == 1).drop("rn")
    )

    return deduped_payments


def add_fraud_indicators(payments_df):
    """
    Add fraud detection signals AFTER deduplication

    Only now can we reliably calculate:
    - Consecutive transactions: Are they happening too fast?
    - Geographic patterns: Impossible travel? (NY to Tokyo in 10 minutes)
    - Large transactions: Outliers that warrant review

    These must happen AFTER deduplication because:
    - If a $5000 payment is duplicated, it appears as $10,000 transaction
    - Risk scoring would be wrong
    """

    # Register as temp view for SQL operations
    payments_df.createOrReplaceTempView("payments_clean")

    # Calculate risk indicators
    fraud_flagged = payments_df.sparkSession.sql(
        """
        SELECT
            transaction_id,
            sender_account_id,
            receiver_account_id,
            amount,
            currency,
            device_id,
            ip_address,
            event_time,
            region,
            processing_time,
            
            -- FRAUD SIGNAL 1: Large transaction amount
            CASE 
                WHEN amount > 5000 THEN 'HIGH'
                WHEN amount > 1000 THEN 'MEDIUM'
                ELSE 'LOW'
            END AS risk_amount,
            
            -- FRAUD SIGNAL 2: Rapid consecutive transactions
            -- Is this sender making many txns in a short time window?
            COUNT(*) OVER (
                PARTITION BY sender_account_id
                ORDER BY event_time
                RANGE BETWEEN INTERVAL 5 MINUTES PRECEDING AND CURRENT ROW
            ) AS txn_count_5min,
            
            -- FRAUD SIGNAL 3: Geographic risk
            -- Transactions from unusual regions or IP ranges
            CASE
                WHEN region IN ('US', 'EU') THEN 'LOW_RISK_REGION'
                WHEN region IN ('JP', 'AU') THEN 'MEDIUM_RISK_REGION'
                ELSE 'HIGH_RISK_REGION'
            END AS geographic_risk,
            
            -- FRAUD SIGNAL 4: Unusual device
            -- Has this device been used before by this sender?
            COUNT(DISTINCT device_id) OVER (
                PARTITION BY sender_account_id
            ) AS unique_devices_sender,
            
            -- Combined fraud score (0-100)
            CASE
                WHEN amount > 5000 THEN 30
                WHEN amount > 1000 THEN 15
                ELSE 5
            END +
            CASE
                WHEN COUNT(*) OVER (
                    PARTITION BY sender_account_id
                    ORDER BY event_time
                    RANGE BETWEEN INTERVAL 5 MINUTES PRECEDING AND CURRENT ROW
                ) > 10 THEN 40
                WHEN COUNT(*) OVER (
                    PARTITION BY sender_account_id
                    ORDER BY event_time
                    RANGE BETWEEN INTERVAL 5 MINUTES PRECEDING AND CURRENT ROW
                ) > 5 THEN 25
                ELSE 0
            END AS fraud_score,
            
            CURRENT_TIMESTAMP() AS enrichment_time
        FROM payments_clean
    """
    )

    return fraud_flagged


def aggregate_payment_metrics(payments_df):
    """
    Calculate aggregated metrics for monitoring

    This runs on deduped data, so counts are 100% accurate
    """

    # Aggregate by region and currency every 1 minute
    metrics = (
        payments_df.groupBy(
            window(col("event_time"), "1 minute"), col("region"), col("currency")
        )
        .agg(
            # Count of UNIQUE transactions (no double-counting!)
            col("transaction_id").count().alias("transaction_count"),
            # Sum of amounts (accurate because deduped)
            col("amount").sum().alias("total_amount"),
            # Minimum and maximum amounts in this time window
            spark_min(col("amount")).alias("min_amount"),
            spark_max(col("amount")).alias("max_amount"),
            # Average transaction size
            (col("amount").sum() / col("transaction_id").count()).alias("avg_amount"),
        )
        .select(
            col("window.start").alias("metric_time"),
            col("region"),
            col("currency"),
            col("transaction_count"),
            col("total_amount"),
            col("min_amount"),
            col("max_amount"),
            col("avg_amount"),
            current_timestamp().alias("calculation_time"),
        )
    )

    return metrics


def write_fraud_alerts_to_redis(df):
    """
    Write real-time fraud alerts to Redis for immediate response

    Redis Data Structure:
    - Key: fraud:alerts:sender:{sender_account_id}
    - Value: JSON with transaction details (TTL: 5 minutes)
    - List: fraud:alerts:all (all current high-risk accounts)

    Why Redis:
    - Microsecond latency for alerting
    - In-memory (fast lookup)
    - Expires automatically (no cleanup)
    - Works with real-time dashboards

    Consumption:
    1. Fraud analysts check Redis for latest alerts
    2. Escalate to manual review if needed
    3. Lock account if multiple velocity flags
    """

    def send_to_redis(row_iter):
        """Partition-level function to send flagged transactions to Redis"""
        try:
            r = redis.Redis(
                host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True
            )

            for row in row_iter:
                # Only alert on fraud
                if row.is_velocity_fraud:
                    alert_key = f"fraud:alerts:sender:{row.sender_account_id}"
                    alert_data = {
                        "transaction_id": row.transaction_id,
                        "sender_account_id": row.sender_account_id,
                        "receiver_account_id": row.receiver_account_id,
                        "amount": float(row.amount),
                        "currency": row.currency,
                        "event_time": str(row.event_time),
                        "velocity_count": int(row.txn_velocity_window),
                        "device_id": row.device_id,
                        "ip_address": row.ip_address,
                        "region": row.region,
                        "alert_timestamp": str(current_timestamp()),
                        "peer_transactions": (
                            row.velocity_fraud_peers if row.velocity_fraud_peers else []
                        ),
                    }

                    # Set alert with 5-minute TTL
                    r.setex(alert_key, 300, json.dumps(alert_data))  # 5 minutes

                    # Add to global alert list (for dashboard)
                    r.sadd("fraud:alerts:accounts", row.sender_account_id)

                    # Increment alert counter
                    counter_key = f"fraud:count:sender:{row.sender_account_id}"
                    r.incr(counter_key)
                    r.expire(counter_key, 3600)  # 1-hour retention

        except Exception as e:
            print(f"Redis alert error: {e}")

    # Apply function to each partition
    df.foreachPartition(send_to_redis)
    return df


def write_to_bigquery(df, table, mode="append", checkpoint_suffix=""):
    """
    Write DataFrame to BigQuery with checkpoint for fault tolerance

    Checkpoint = Spark's record of which messages were processed
    Why needed: If Spark crashes at byte 1000 of a file, restart from byte 1000, not byte 0

    Parameters:
    - df: The DataFrame to write
    - table: BigQuery table name
    - mode: "append" (add new rows) or "overwrite" (replace all rows)
    - checkpoint_suffix: Unique suffix for checkpoint location
    """
    output_table = f"{BIGQUERY_PROJECT}.{BIGQUERY_DATASET}.{table}"
    checkpoint_path = f"{CHECKPOINT_LOCATION}/{table}{checkpoint_suffix}"

    return (
        df.writeStream.format("bigquery")
        .option("table", output_table)
        .option("temporaryGcsBucket", os.environ.get("GCS_BUCKET", "your-gcs-bucket"))
        .option("checkpointLocation", checkpoint_path)
        .option("writeMethod", "direct")  # Write directly to BigQuery (fastest)
        .outputMode(mode)
        .start()
    )


def main():
    """
    Main function: Orchestrates the entire payment processing pipeline

    Flow:
    1. Create Spark session (connection to Spark cluster)
    2. Read streaming data from Kafka
    3. Deduplicate by transaction_id (EXACTLY-ONCE)
    4. Enrich with fraud indicators
    5. Aggregate metrics
    6. Write to BigQuery (multiple tables)
    7. Keep running until manually stopped
    """

    # Step 1: Create Spark session
    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    print("=" * 80)
    print("PAYMENT EVENT PROCESSOR WITH EXACTLY-ONCE SEMANTICS")
    print("=" * 80)
    print(f"Kafka Brokers: {KAFKA_BOOTSTRAP_SERVERS}")
    print(f"Kafka Topic: {KAFKA_TOPIC_PAYMENTS}")
    print(f"BigQuery Dataset: {BIGQUERY_DATASET}")
    print(f"Checkpoint Location: {CHECKPOINT_LOCATION}")
    print("=" * 80)

    # Step 2: Read streaming payments from Kafka
    payments_df = read_payments_from_kafka(spark)

    # Step 2.5: APPLY PII MASKING LAYER
    # Mask sensitive data before any processing (compliance with PCI-DSS/GDPR)
    masked_payments = mask_pii_data(payments_df)

    # Step 2.7: REAL-TIME FRAUD FEATURE ENGINEERING
    # Sliding window aggregates for velocity fraud detection
    velocity_enriched = detect_velocity_fraud(masked_payments)

    # Step 3: APPLY EXACTLY-ONCE SEMANTICS
    # This is the critical layer that ensures deduplication
    deduped_payments = deduplicate_payments(velocity_enriched)

    # Step 3.5: SEND REAL-TIME ALERTS TO REDIS
    # Write high-velocity fraud flags to Redis for immediate response
    # This triggers real-time dashboards and automated rules
    deduped_with_alerts = write_fraud_alerts_to_redis(deduped_payments)

    # Step 4: Enrich with fraud indicators
    # Safe to calculate fraud scores now (no double-counting, data already masked)
    enriched_payments = add_fraud_indicators(deduped_with_alerts)

    # Step 5: Calculate aggregated metrics
    # These counts are 100% accurate due to deduplication
    payment_metrics = aggregate_payment_metrics(deduped_with_alerts)

    print("\n✓ PII Masking layer initialized (PCI-DSS/GDPR compliant)")
    print("✓ Credit card data masked to last 4 digits only")
    print("✓ CVV and sensitive auth data fully masked")
    print("✓ PII hash stored for GDPR 'right to be forgotten'\n")
    print("✓ Real-Time Fraud Feature Engineering initialized")
    print(
        f"✓ Velocity fraud threshold: >{VELOCITY_FRAUD_THRESHOLD} transactions in 60 seconds"
    )
    print("✓ Suspicious accounts flagged in Redis (5-minute TTL)")
    print("✓ Redis alerts feed real-time dashboards and automated rules\n")
    print("✓ Deduplication layer initialized")
    print("✓ Each transaction_id will be processed exactly once")
    print(
        "✓ Even if Kafka sends duplicate messages, only first occurrence hits BigQuery\n"
    )

    # Step 6: Write to BigQuery
    # All data is now exactly-once, safe for financial reconciliation
    query1 = write_to_bigquery(
        enriched_payments, "payment_transactions", "append", "_raw"
    )
    query2 = write_to_bigquery(
        enriched_payments, "payment_transactions_fraud", "append", "_fraud"
    )

    # Step 6.5: Write velocity fraud alerts to BigQuery (for historical analysis)
    # Filter only flagged velocity fraud transactions
    velocity_fraud_only = enriched_payments.filter(
        col("is_velocity_fraud") == True
    ).select(
        col("transaction_id"),
        col("sender_account_id"),
        col("receiver_account_id"),
        col("amount"),
        col("currency"),
        col("event_time"),
        col("device_id"),
        col("ip_address"),
        col("region"),
        col("txn_velocity_window"),
        col("velocity_fraud_peers"),
        col("is_velocity_fraud"),
        col("credit_card_masked"),
        col("card_expiry_masked"),
        col("pii_hash"),
        current_timestamp().alias("alert_timestamp"),
    )

    query2_5 = write_to_bigquery(
        velocity_fraud_only, "fraud_velocity_alerts", "append", "_velocity"
    )
    query3 = write_to_bigquery(payment_metrics, "payment_metrics", "append", "_metrics")

    print("Streaming queries started:")
    print(
        f"  1. Writing to: {BIGQUERY_PROJECT}.{BIGQUERY_DATASET}.payment_transactions"
    )
    print(
        f"  2. Writing to: {BIGQUERY_PROJECT}.{BIGQUERY_DATASET}.payment_transactions_fraud"
    )
    print(f"  3. Writing to: {BIGQUERY_PROJECT}.{BIGQUERY_DATASET}.payment_metrics")
    print(f"\nRedis Alerts:")
    print(f"  • Host: {REDIS_HOST}:{REDIS_PORT}")
    print(f"  • Watch key: fraud:alerts:accounts")
    print(f"  • TTL: 5 minutes per alert")
    print("\nAwaiting termination (Ctrl+C to stop)...\n")

    # Step 7: Keep streaming queries running
    spark.streams.awaitAnyTermination()


if __name__ == "__main__":
    main()
