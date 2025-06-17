"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart, Play, Pause, RefreshCw } from "lucide-react"
import { fetchStockData } from "@/lib/stock-api"
import StockChart from "@/components/stock-chart"
import { Alert, AlertDescription } from "@/components/ui/alert"

type StockData = {
  timestamp: number
  price: number
  volume: number
}

export default function StockDataDemo() {
  const [symbol, setSymbol] = useState("AAPL")
  const [isStreaming, setIsStreaming] = useState(false)
  const [stockData, setStockData] = useState<StockData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch initial data
  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchStockData(symbol)
      setStockData(data)
    } catch (err) {
      setError("Failed to fetch stock data. Please try again.")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // Simulate streaming data
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (isStreaming && stockData.length > 0) {
      interval = setInterval(() => {
        const lastPrice = stockData[stockData.length - 1].price
        const change = (Math.random() - 0.5) * 2 // Random price movement
        const newPrice = Math.max(lastPrice + change, 0.01)
        const newVolume = Math.floor(Math.random() * 10000) + 1000

        setStockData((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            price: Number.parseFloat(newPrice.toFixed(2)),
            volume: newVolume,
          },
        ])
      }, 2000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isStreaming, stockData])

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchData()
  }

  // Toggle streaming
  const toggleStreaming = () => {
    if (!isStreaming && stockData.length === 0) {
      fetchData()
    }
    setIsStreaming(!isStreaming)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
        <form onSubmit={handleSubmit} className="flex-1 space-y-2">
          <Label htmlFor="symbol">Stock Symbol</Label>
          <div className="flex gap-2">
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Enter stock symbol (e.g., AAPL)"
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Fetch Data"}
            </Button>
          </div>
        </form>
        <Button onClick={toggleStreaming} variant={isStreaming ? "destructive" : "default"} className="min-w-[140px]">
          {isStreaming ? (
            <>
              <Pause className="mr-2 h-4 w-4" /> Stop Stream
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" /> Start Stream
            </>
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="chart" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chart">Chart View</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline View</TabsTrigger>
          <TabsTrigger value="raw">Raw Data</TabsTrigger>
        </TabsList>
        <TabsContent value="chart" className="pt-4">
          <div className="h-[300px] w-full">
            {stockData.length > 0 ? (
              <StockChart data={stockData} />
            ) : (
              <div className="flex items-center justify-center h-full border rounded-md bg-gray-50">
                <div className="text-center">
                  <LineChart className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-gray-500">No data available. Fetch stock data to view the chart.</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="pipeline" className="pt-4">
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md">
                <div className="font-medium">Data Collection</div>
                <div className="text-sm text-gray-500">
                  {isStreaming ? (
                    <span className="flex items-center text-green-600">
                      <span className="h-2 w-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-500">
                      <span className="h-2 w-2 bg-gray-400 rounded-full mr-2"></span>
                      Idle
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="font-medium">Kafka Ingestion</div>
                <div className="text-sm text-gray-500">
                  {isStreaming ? (
                    <span className="flex items-center text-green-600">
                      <span className="h-2 w-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
                      Processing
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-500">
                      <span className="h-2 w-2 bg-gray-400 rounded-full mr-2"></span>
                      Idle
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-md">
                <div className="font-medium">Spark Analysis</div>
                <div className="text-sm text-gray-500">
                  {isStreaming ? (
                    <span className="flex items-center text-green-600">
                      <span className="h-2 w-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
                      Computing
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-500">
                      <span className="h-2 w-2 bg-gray-400 rounded-full mr-2"></span>
                      Idle
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md">
                <div className="font-medium">BigQuery Storage</div>
                <div className="text-sm text-gray-500">
                  {isStreaming ? (
                    <span className="flex items-center text-green-600">
                      <span className="h-2 w-2 bg-green-600 rounded-full mr-2 animate-pulse"></span>
                      Writing
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-500">
                      <span className="h-2 w-2 bg-gray-400 rounded-full mr-2"></span>
                      Ready
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-md">
                <div className="font-medium">Tableau Visualization</div>
                <div className="text-sm text-gray-500">
                  {stockData.length > 0 ? (
                    <span className="flex items-center text-green-600">
                      <span className="h-2 w-2 bg-green-600 rounded-full mr-2"></span>
                      Available
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-500">
                      <span className="h-2 w-2 bg-gray-400 rounded-full mr-2"></span>
                      No Data
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="raw" className="pt-4">
          <div className="border rounded-md overflow-auto max-h-[300px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Volume
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockData.length > 0 ? (
                  stockData.map((data, index) => (
                    <tr key={index}>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">
                        {new Date(data.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900">${data.price.toFixed(2)}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">
                        {data.volume.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <div className="text-sm text-gray-500 italic">
        Note: This is a simplified demonstration. In a production environment, the pipeline would connect to actual
        Kafka clusters, Spark jobs, and BigQuery instances.
      </div>
    </div>
  )
}
