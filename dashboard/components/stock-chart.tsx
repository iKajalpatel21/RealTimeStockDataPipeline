"use client"

import { useEffect, useState } from "react"
import { getStockData } from "@/lib/data"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

export default function StockChart() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [symbol, setSymbol] = useState("AAPL")
  const [timeRange, setTimeRange] = useState("1d")

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const stockData = await getStockData(symbol, timeRange)
        setData(stockData)
      } catch (error) {
        console.error("Error fetching stock data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // Refresh data every 60 seconds
    const interval = setInterval(fetchData, 60000)

    return () => clearInterval(interval)
  }, [symbol, timeRange])

  if (loading) {
    return <Skeleton className="h-full w-full" />
  }

  return (
    <div className="h-full w-full">
      <div className="mb-4 flex items-center justify-between">
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Select stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AAPL">AAPL</SelectItem>
            <SelectItem value="MSFT">MSFT</SelectItem>
            <SelectItem value="GOOGL">GOOGL</SelectItem>
            <SelectItem value="AMZN">AMZN</SelectItem>
            <SelectItem value="META">META</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-24">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 Hour</SelectItem>
              <SelectItem value="1d">1 Day</SelectItem>
              <SelectItem value="1w">1 Week</SelectItem>
              <SelectItem value="1m">1 Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12 }}
            tickFormatter={(time) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
            labelFormatter={(time) => new Date(time).toLocaleString()}
          />
          <Legend />
          <Line type="monotone" dataKey="price" stroke="#3b82f6" activeDot={{ r: 8 }} strokeWidth={2} name="Price" />
          <Line type="monotone" dataKey="ma5" stroke="#10b981" dot={false} strokeWidth={1.5} name="5-min MA" />
          <Line type="monotone" dataKey="ma15" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="15-min MA" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
