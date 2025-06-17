#!/usr/bin/env python3
"""
Spark Streaming Job for Stock Data Processing

This script processes real-time stock data from Kafka topics, performs analysis,
and writes results to Google BigQuery.
"""

import os
import json
from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    from_json, col, window, avg, max, min, sum, expr, 
    current_timestamp, lit, when, abs
)
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, 
    LongType, IntegerType, TimestampType
)

# Load configuration from environment variables
SPARK_MASTER = os.environ.get("SPARK_MASTER", "local[*]")
KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC_TRADES = os.environ.get("KAFKA_TOPIC_TRADES", "stock-trades")
KAFKA_TOPIC_QUOTES = os.environ.get("KAFKA_TOPIC_QUOTES", "stock-quotes")
CHECKPOINT_LOCATION = os.environ.get("CHECKPOINT_LOCATION", "/checkpoint")
BIGQUERY_PROJECT = os.environ.get("BIGQUERY_PROJECT", "your-project")
BIGQUERY_DATASET = os.environ.get("BIGQUERY_DATASET", "stock_data")

def create_spark_session():
    """Create and configure Spark session"""
    return (SparkSession.builder
            .appName("StockDataProcessor")
            .master(SPARK_MASTER)
            .config("spark.jars.packages", 
                   "org.apache.spark:spark-sql-kafka-0-10_2.12:3.3.2,"
                   "com.google.cloud:google-cloud-bigquery:2.24.4")
            .config("spark.streaming.stopGracefullyOnShutdown", "true")
            .config("spark.sql.streaming.schemaInference", "true")
            .getOrCreate())

def define_trade_schema():
    """Define schema for trade messages"""
    return StructType([
        StructField("s", StringType(), True),        # Symbol
        StructField("p", DoubleType(), True),        # Price
        StructField("v", DoubleType(), True),        # Volume
        StructField("t", LongType(), True),          # Timestamp
        StructField("c", StringType(), True),        # Trade conditions
        StructField("receiveTime", LongType(), True) # Time received by our system
    ])

def define_quote_schema():
    """Define schema for quote messages"""
    return StructType([
        StructField("c", DoubleType(), True),        # Current price
        StructField("d", DoubleType(), True),        # Change
        StructField("dp", DoubleType(), True),       # Percent change
        StructField("h", DoubleType(), True),        # High price of the day
        StructField("l", DoubleType(), True),        # Low price of the day
        StructField("o", DoubleType(), True),        # Open price of the day
        StructField("pc", DoubleType(), True),       # Previous close price
        StructField("t", LongType(), True),          # Timestamp
        StructField("symbol", StringType(), True),   # Symbol
        StructField("timestamp", LongType(), True),  # Time of data
        StructField("fetchTime", LongType(), True)   # Time fetched by our system
    ])

def read_trades_from_kafka(spark):
    """Read trade data from Kafka"""
    return (spark
            .readStream
            .format("kafka")
            .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
            .option("subscribe", KAFKA_TOPIC_TRADES)
            .option("startingOffsets", "latest")
            .load()
            .selectExpr("CAST(key AS STRING)", "CAST(value AS STRING)")
            .select(
                col("key").alias("symbol"),
                from_json(col("value"), define_trade_schema()).alias("data")
            )
            .select(
                col("symbol"),
                col("data.p").alias("price"),
                col("data.v").alias("volume"),
                (col("data.t") / 1000).cast("timestamp").alias("trade_time"),
                col("data.c").alias("conditions"),
                (col("data.receiveTime") / 1000).cast("timestamp").alias("receive_time")
            ))

def read_quotes_from_kafka(spark):
    """Read quote data from Kafka"""
    return (spark
            .readStream
            .format("kafka")
            .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
            .option("subscribe", KAFKA_TOPIC_QUOTES)
            .option("startingOffsets", "latest")
            .load()
            .selectExpr("CAST(key AS STRING)", "CAST(value AS STRING)")
            .select(
                col("key").alias("symbol"),
                from_json(col("value"), define_quote_schema()).alias("data")
            )
            .select(
                col("symbol"),
                col("data.c").alias("current_price"),
                col("data.d").alias("change"),
                col("data.dp").alias("percent_change"),
                col("data.h").alias("high_of_day"),
                col("data.l").alias("low_of_day"),
                col("data.o").alias("open_price"),
                col("data.pc").alias("previous_close"),
                (col("data.timestamp") / 1000).cast("timestamp").alias("quote_time"),
                (col("data.fetchTime") / 1000).cast("timestamp").alias("fetch_time")
            ))

def process_trades(trades_df):
    """Process trade data with analytics"""
    # Register the DataFrame as a temporary view
    trades_df.createOrReplaceTempView("trades")
    
    # Calculate various metrics
    processed_trades = trades_df.sparkSession.sql("""
        SELECT
            symbol,
            trade_time,
            price,
            volume,
            
            -- Calculate 5-minute moving average price
            AVG(price) OVER (
                PARTITION BY symbol
                ORDER BY trade_time
                RANGE BETWEEN INTERVAL 5 MINUTES PRECEDING AND CURRENT ROW
            ) AS price_ma_5min,
            
            -- Calculate 15-minute moving average price
            AVG(price) OVER (
                PARTITION BY symbol
                ORDER BY trade_time
                RANGE BETWEEN INTERVAL 15 MINUTES PRECEDING AND CURRENT ROW
            ) AS price_ma_15min,
            
            -- Calculate volume weighted average price (VWAP)
            SUM(price * volume) OVER (
                PARTITION BY symbol
                ORDER BY trade_time
                RANGE BETWEEN INTERVAL 30 MINUTES PRECEDING AND CURRENT ROW
            ) / 
            NULLIF(SUM(volume) OVER (
                PARTITION BY symbol
                ORDER BY trade_time
                RANGE BETWEEN INTERVAL 30 MINUTES PRECEDING AND CURRENT ROW
            ), 0) AS vwap_30min,
            
            -- Add processing timestamp
            CURRENT_TIMESTAMP() AS processing_time
        FROM trades
    """)
    
    return processed_trades

def process_quotes(quotes_df):
    """Process quote data with analytics"""
    # Register the DataFrame as a temporary view
    quotes_df.createOrReplaceTempView("quotes")
    
    # Calculate various metrics
    processed_quotes = quotes_df.sparkSession.sql("""
        SELECT
            symbol,
            quote_time,
            current_price AS price,
            change,
            percent_change,
            high_of_day,
            low_of_day,
            open_price,
            previous_close,
            
            -- Calculate relative strength index (RSI)
            -- This is a simplified version; real RSI calculation is more complex
            100 - (100 / (1 + (
                AVG(CASE WHEN change > 0 THEN change ELSE 0 END) OVER (
                    PARTITION BY symbol
                    ORDER BY quote_time
                    ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
                ) / 
                NULLIF(AVG(CASE WHEN change &lt; 0 THEN ABS(change) ELSE 0 END) OVER (
                    PARTITION BY symbol
                    ORDER BY quote_time
                    ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
                ), 0)
            ))) AS rsi_14,
            
            -- Add processing timestamp
            CURRENT_TIMESTAMP() AS processing_time
        FROM quotes
    """)
    
    return processed_quotes

def generate_trading_signals(quotes_df):
    """Generate trading signals based on technical indicators"""
    # Register the DataFrame as a temporary view
    quotes_df.createOrReplaceTempView("quotes_signals")
    
    # Generate signals based on RSI and price movement
    signals = quotes_df.sparkSession.sql("""
        WITH quote_with_ma AS (
            SELECT
                symbol,
                quote_time,
                price,
                change,
                rsi_14,
                AVG(price) OVER (
                    PARTITION BY symbol
                    ORDER BY quote_time
                    ROWS BETWEEN 9 PRECEDING AND CURRENT ROW
                ) AS ma_10,
                AVG(price) OVER (
                    PARTITION BY symbol
                    ORDER BY quote_time
                    ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
                ) AS ma_20,
                LAG(price) OVER (
                    PARTITION BY symbol
                    ORDER BY quote_time
                ) AS prev_price
            FROM quotes_signals
        )
        SELECT
            symbol,
            quote_time AS signal_time,
            price AS price_at_signal,
            CASE
                WHEN rsi_14 &lt; 30 AND ma_10 > ma_20 THEN 'BUY'
                WHEN rsi_14 > 70 AND ma_10 &lt; ma_20 THEN 'SELL'
                ELSE 'HOLD'
            END AS signal_type,
            CASE
                WHEN rsi_14 &lt; 30 AND ma_10 > ma_20 THEN (30 - rsi_14) / 30
                WHEN rsi_14 > 70 AND ma_10 &lt; ma_20 THEN (rsi_14 - 70) / 30
                ELSE 0.0
            END AS signal_strength,
            ma_10,
            ma_20,
            rsi_14,
            CASE
                WHEN rsi_14 &lt; 30 AND ma_10 > ma_20 THEN 'RSI oversold and MA crossover'
                WHEN rsi_14 > 70 AND ma_10 &lt; ma_20 THEN 'RSI overbought and MA crossover'
                ELSE NULL
            END AS signal_reason,
            CURRENT_TIMESTAMP() AS generation_time
        FROM quote_with_ma
        WHERE (rsi_14 &lt; 30 AND ma_10 > ma_20) OR (rsi_14 > 70 AND ma_10 &lt; ma_20)
    """)
    
    return signals

def write_to_bigquery(df, table, mode="append"):
    """Write DataFrame to BigQuery"""
    output_table = f"{BIGQUERY_PROJECT}.{BIGQUERY_DATASET}.{table}"
    
    return (df.writeStream
            .format("bigquery")
            .option("table", output_table)
            .option("temporaryGcsBucket", "your-gcs-bucket")  # Replace with your GCS bucket
            .option("checkpointLocation", f"{CHECKPOINT_LOCATION}/{table}")
            .outputMode(mode)
            .start())

def main():
    """Main function to start Spark Streaming job"""
    # Create Spark session
    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")
    
    # Read data from Kafka
    trades_df = read_trades_from_kafka(spark)
    quotes_df = read_quotes_from_kafka(spark)
    
    # Process data
    processed_trades = process_trades(trades_df)
    processed_quotes = process_quotes(quotes_df)
    trading_signals = generate_trading_signals(processed_quotes)
    
    # Write data to BigQuery
    query1 = write_to_bigquery(processed_trades, "processed_trades")
    query2 = write_to_bigquery(processed_quotes, "processed_quotes")
    query3 = write_to_bigquery(trading_signals, "trading_signals")
    
    # Wait for streaming queries to terminate
    spark.streams.awaitAnyTermination()

if __name__ == "__main__":
    main()
