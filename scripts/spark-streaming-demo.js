// This script demonstrates how a Spark Streaming job would be implemented
// to process stock data from Kafka in a production environment

// Note: In a real environment, this would be written in Scala or Python
// and run on a Spark cluster. This is a simplified JavaScript representation.

import { SparkSession } from "spark-node"
import { StructType, col, from_json } from "spark-node"

// Configuration
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || "localhost:9092"
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || "stock-data"
const CHECKPOINT_LOCATION = process.env.CHECKPOINT_LOCATION || "/tmp/spark-checkpoint"
const BIGQUERY_DATASET = process.env.BIGQUERY_DATASET || "stock_data"
const BIGQUERY_TABLE = process.env.BIGQUERY_TABLE || "processed_stock_data"

// Initialize Spark Session
const spark = new SparkSession.builder()
  .appName("StockDataProcessing")
  .config("spark.streaming.stopGracefullyOnShutdown", "true")
  .getOrCreate()

// Set log level
spark.sparkContext.setLogLevel("WARN")

// Define schema for the incoming data
const stockSchema = new StructType()
  .add("symbol", "string")
  .add("price", "double")
  .add("change", "double")
  .add("percentChange", "double")
  .add("highOfDay", "double")
  .add("lowOfDay", "double")
  .add("openPrice", "double")
  .add("previousClose", "double")
  .add("timestamp", "long")
  .add("volume", "long")
  .add("fetchTime", "long")

// Read from Kafka
const kafkaStream = spark.readStream
  .format("kafka")
  .option("kafka.bootstrap.servers", KAFKA_BROKERS)
  .option("subscribe", KAFKA_TOPIC)
  .option("startingOffsets", "latest")
  .load()

// Parse JSON data
const parsedStream = kafkaStream
  .selectExpr("CAST(key AS STRING)", "CAST(value AS STRING)")
  .select(col("key").as("symbol"), from_json(col("value"), stockSchema).as("data"))
  .select("symbol", "data.*")

// Register the stream as a temporary view
parsedStream.createOrReplaceTempView("stock_data")

// Calculate metrics using SQL
const processedData = spark.sql(`
  SELECT
    symbol,
    price,
    timestamp,
    volume,
    change,
    percentChange,
    
    -- Calculate 5-minute moving average price
    AVG(price) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 5 * 60 * 1000 PRECEDING AND CURRENT ROW
    ) AS price_ma_5min,
    
    -- Calculate 15-minute moving average price
    AVG(price) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 15 * 60 * 1000 PRECEDING AND CURRENT ROW
    ) AS price_ma_15min,
    
    -- Calculate volume weighted average price (VWAP)
    SUM(price * volume) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 30 * 60 * 1000 PRECEDING AND CURRENT ROW
    ) / 
    SUM(volume) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      RANGE BETWEEN 30 * 60 * 1000 PRECEDING AND CURRENT ROW
    ) AS vwap_30min,
    
    -- Calculate relative strength index (RSI)
    -- This is a simplified version; real RSI calculation is more complex
    100 - (100 / (1 + (
      SUM(CASE WHEN change > 0 THEN change ELSE 0 END) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
      ) / 
      SUM(CASE WHEN change < 0 THEN ABS(change) ELSE 0 END) OVER (
        PARTITION BY symbol
        ORDER BY timestamp
        ROWS BETWEEN 13 PRECEDING AND CURRENT ROW
      )
    ))) AS rsi_14,
    
    -- Add processing timestamp
    CURRENT_TIMESTAMP() AS processing_time
  FROM stock_data
`)

// Write the processed data to BigQuery
const query = processedData.writeStream
  .outputMode("append")
  .format("bigquery")
  .option("table", `${BIGQUERY_DATASET}.${BIGQUERY_TABLE}`)
  .option("checkpointLocation", CHECKPOINT_LOCATION)
  .option("credentialsFile", "/path/to/service-account.json")
  .start()

// Wait for the query to terminate
query.awaitTermination()

// Note: In a production environment, this would be deployed as a Spark application
// on a cluster with proper monitoring, error handling, and resource allocation
