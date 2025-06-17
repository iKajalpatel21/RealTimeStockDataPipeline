"use client"

import { useState, useEffect } from "react"
import { getPortfolioData } from "@/lib/data"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

export default function PortfolioSummary() {
  const [portfolio, setPortfolio] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPortfolio() {
      setLoading(true)
      try {
        const data = await getPortfolioData()
        setPortfolio(data)
      } catch (error) {
        console.error("Error fetching portfolio data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchPortfolio()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Colors for pie chart
  const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">${portfolio.totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total Portfolio Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">+${portfolio.totalGain.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total Gain/Loss</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">+{portfolio.percentGain.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">Percent Gain/Loss</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-4 text-lg font-medium">Asset Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={portfolio.allocation}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {portfolio.allocation.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, "Value"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-lg font-medium">Signal-Based Recommendations</h3>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <div>Buy</div>
                <div className="font-medium">{portfolio.signalBreakdown.buy}%</div>
              </div>
              <Progress
                value={portfolio.signalBreakdown.buy}
                className="h-2 bg-gray-200"
                indicatorClassName="bg-green-500"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <div>Hold</div>
                <div className="font-medium">{portfolio.signalBreakdown.hold}%</div>
              </div>
              <Progress
                value={portfolio.signalBreakdown.hold}
                className="h-2 bg-gray-200"
                indicatorClassName="bg-blue-500"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <div>Sell</div>
                <div className="font-medium">{portfolio.signalBreakdown.sell}%</div>
              </div>
              <Progress
                value={portfolio.signalBreakdown.sell}
                className="h-2 bg-gray-200"
                indicatorClassName="bg-red-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-medium">Holdings</h3>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Shares</TableHead>
                <TableHead>Avg. Cost</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Gain/Loss</TableHead>
                <TableHead>Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.holdings.map((holding: any) => (
                <TableRow key={holding.symbol}>
                  <TableCell className="font-medium">{holding.symbol}</TableCell>
                  <TableCell>{holding.shares}</TableCell>
                  <TableCell>${holding.avgCost.toFixed(2)}</TableCell>
                  <TableCell>${holding.currentPrice.toFixed(2)}</TableCell>
                  <TableCell>${(holding.shares * holding.currentPrice).toLocaleString()}</TableCell>
                  <TableCell className={holding.gain >= 0 ? "text-green-500" : "text-red-500"}>
                    {holding.gain >= 0 ? "+" : ""}
                    {holding.gain.toFixed(2)}%
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium
                      ${
                        holding.signal === "BUY"
                          ? "bg-green-100 text-green-800"
                          : holding.signal === "SELL"
                            ? "bg-red-100 text-red-800"
                            : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {holding.signal}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
