// This script demonstrates how a Kafka producer would be implemented
// in a production environment to stream stock data

import { Kafka } from "kafkajs"
import fetch from "node-fetch"

// Configuration
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "demo_key"
const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"]
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || "stock-data"
const SYMBOLS = (process.env.STOCK_SYMBOLS || "AAPL,MSFT,GOOGL,AMZN,META").split(",")

// Initialize Kafka client
const kafka = new Kafka({
  clientId: "stock-data-producer",
  brokers: KAFKA_BROKERS,
})

const producer = kafka.producer()

// Function to fetch stock data from Finnhub API
async function fetchStockData(symbol) {
  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`)
    }

    const data = await response.json()
    return {
      symbol,
      price: data.c,
      change: data.d,
      percentChange: data.dp,
      highOfDay: data.h,
      lowOfDay: data.l,
      openPrice: data.o,
      previousClose: data.pc,
      timestamp: data.t * 1000, // Convert to milliseconds
      volume: data.v,
      fetchTime: Date.now(),
    }
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error)
    return null
  }
}

// Function to send data to Kafka
async function sendToKafka(data) {
  try {
    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [
        {
          key: data.symbol,
          value: JSON.stringify(data),
          headers: {
            source: "finnhub",
            "data-type": "stock-quote",
            timestamp: Date.now().toString(),
          },
        },
      ],
    })
    console.log(`Sent data for ${data.symbol} to Kafka`)
  } catch (error) {
    console.error("Error sending to Kafka:", error)
  }
}

// Main function to run the producer
async function runProducer() {
  try {
    // Connect to Kafka
    await producer.connect()
    console.log("Connected to Kafka")

    // Set up interval to fetch and send data
    setInterval(async () => {
      for (const symbol of SYMBOLS) {
        const data = await fetchStockData(symbol)
        if (data) {
          await sendToKafka(data)
        }
      }
    }, 5000) // Fetch every 5 seconds

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Shutting down...")
      await producer.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error("Fatal error:", error)
    await producer.disconnect()
    process.exit(1)
  }
}

// Run the producer
runProducer().catch(console.error)

// Note: In a production environment, this script would be run as a service
// with proper error handling, retries, and monitoring
