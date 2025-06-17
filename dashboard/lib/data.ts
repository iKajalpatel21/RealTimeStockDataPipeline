// This file contains functions to fetch data from BigQuery
import { BigQuery } from "@google-cloud/bigquery"

// Initialize BigQuery client
let bigqueryClient: BigQuery | null = null

function getBigQueryClient() {
  if (!bigqueryClient) {
    bigqueryClient = new BigQuery({
      projectId: process.env.BIGQUERY_PROJECT,
    })
  }
  return bigqueryClient
}

// Mock data for development without BigQuery
const MOCK_DATA = {
  stockData: [
    { time: new Date(Date.now() - 3600000).getTime(), price: 175.84, ma5: 175.92, ma15: 176.01 },
    { time: new Date(Date.now() - 3000000).getTime(), price: 176.12, ma5: 176.01, ma15: 176.05 },
    { time: new Date(Date.now() - 2400000).getTime(), price: 176.43, ma5: 176.15, ma15: 176.08 },
    { time: new Date(Date.now() - 1800000).getTime(), price: 176.21, ma5: 176.23, ma15: 176.12 },
    { time: new Date(Date.now() - 1200000).getTime(), price: 176.35, ma5: 176.28, ma15: 176.15 },
    { time: new Date(Date.now() - 600000).getTime(), price: 176.57, ma5: 176.34, ma15: 176.19 },
    { time: new Date().getTime(), price: 176.92, ma5: 176.42, ma15: 176.25 },
  ],
  latestPrices: [
    { symbol: "AAPL", price: 176.92, change: 1.08, percentChange: 0.61, rsi: 58.7, time: new Date().getTime() },
    { symbol: "MSFT", price: 326.76, change: 2.35, percentChange: 0.72, rsi: 62.1, time: new Date().getTime() },
    { symbol: "GOOGL", price: 138.45, change: -0.67, percentChange: -0.48, rsi: 45.3, time: new Date().getTime() },
    { symbol: "AMZN", price: 134.68, change: 1.24, percentChange: 0.93, rsi: 56.8, time: new Date().getTime() },
    { symbol: "META", price: 301.32, change: 3.76, percentChange: 1.26, rsi: 64.2, time: new Date().getTime() },
  ],
  tradingSignals: [
    {
      symbol: "AAPL",
      signalType: "BUY",
      price: 176.92,
      rsi: 58.7,
      reason: "RSI oversold and MA crossover",
      time: new Date().getTime(),
    },
    {
      symbol: "GOOGL",
      signalType: "SELL",
      price: 138.45,
      rsi: 45.3,
      reason: "RSI overbought and MA crossover",
      time: new Date(Date.now() - 1200000).getTime(),
    },
    {
      symbol: "MSFT",
      signalType: "BUY",
      price: 326.76,
      rsi: 62.1,
      reason: "RSI oversold and MA crossover",
      time: new Date(Date.now() - 3600000).getTime(),
    },
    {
      symbol: "AMZN",
      signalType: "BUY",
      price: 134.68,
      rsi: 56.8,
      reason: "RSI oversold and MA crossover",
      time: new Date(Date.now() - 7200000).getTime(),
    },
    {
      symbol: "META",
      signalType: "SELL",
      price: 301.32,
      rsi: 64.2,
      reason: "RSI overbought and MA crossover",
      time: new Date(Date.now() - 10800000).getTime(),
    },
  ],
  portfolioData: {
    totalValue: 156750,
    totalGain: 12350,
    percentGain: 8.55,
    allocation: [
      { name: "AAPL", value: 35384 },
      { name: "MSFT", value: 49014 },
      { name: "GOOGL", value: 27690 },
      { name: "AMZN", value: 26936 },
      { name: "META", value: 18066 },
    ],
    signalBreakdown: {
      buy: 60,
      hold: 20,
      sell: 20,
    },
    holdings: [
      { symbol: "AAPL", shares: 200, avgCost: 168.45, currentPrice: 176.92, gain: 5.03, signal: "BUY" },
      { symbol: "MSFT", shares: 150, avgCost: 312.5, currentPrice: 326.76, gain: 4.56, signal: "BUY" },
      { symbol: "GOOGL", shares: 200, avgCost: 142.25, currentPrice: 138.45, gain: -2.67, signal: "SELL" },
      { symbol: "AMZN", shares: 200, avgCost: 130.75, currentPrice: 134.68, gain: 3.01, signal: "BUY" },
      { symbol: "META", shares: 60, avgCost: 295.5, currentPrice: 301.32, gain: 1.97, signal: "HOLD" },
    ],
  },
}

// Function to get stock data for a specific symbol and time range
export async function getStockData(symbol: string, timeRange: string) {
  // In a real implementation, this would query BigQuery
  // For now, return mock data
  return MOCK_DATA.stockData
}

// Function to get latest stock prices
export async function getLatestPrices() {
  // In a real implementation, this would query BigQuery
  // For now, return mock data
  return MOCK_DATA.latestPrices
}

// Function to get trading signals
export async function getTradingSignals() {
  // In a real implementation, this would query BigQuery
  // For now, return mock data
  return MOCK_DATA.tradingSignals
}

// Function to get portfolio data
export async function getPortfolioData() {
  // In a real implementation, this would query BigQuery and calculate portfolio metrics
  // For now, return mock data
  return MOCK_DATA.portfolioData
}

// Example of how a real BigQuery query would look like
async function queryBigQuery(query: string) {
  const bigquery = getBigQueryClient()

  try {
    const [rows] = await bigquery.query({ query })
    return rows
  } catch (error) {
    console.error("BigQuery error:", error)
    throw error
  }
}

// This function would be used in a real implementation
async function getRealStockData(symbol: string, timeRange: string) {
  const interval = timeRangeToInterval(timeRange)
  const query = `
    SELECT 
      trade_time as time,
      price,
      price_ma_5min as ma5,
      price_ma_15min as ma15
    FROM 
      \`${process.env.BIGQUERY_PROJECT}.${process.env.BIGQUERY_DATASET}.processed_trades\`
    WHERE 
      symbol = '${symbol}'
      AND trade_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${interval})
    ORDER BY 
      trade_time ASC
  `

  return await queryBigQuery(query)
}

// Helper function to convert time range to BigQuery interval
function timeRangeToInterval(timeRange: string) {
  switch (timeRange) {
    case "1h":
      return "1 HOUR"
    case "1d":
      return "1 DAY"
    case "1w":
      return "7 DAY"
    case "1m":
      return "30 DAY"
    default:
      return "1 DAY"
  }
}
