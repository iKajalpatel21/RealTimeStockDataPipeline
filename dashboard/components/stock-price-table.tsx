"use client"

import { useState, useEffect } from "react"
import { getLatestPrices } from "@/lib/data"
import { Input } from "@/components/ui/input"
import { ArrowUp, ArrowDown, Search } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

export default function StockPriceTable() {
  const [prices, setPrices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    async function fetchPrices() {
      setLoading(true)
      try {
        const data = await getLatestPrices()
        setPrices(data)
      } catch (error) {
        console.error("Error fetching prices:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchPrices()
    // Refresh data every 30 seconds
    const interval = setInterval(fetchPrices, 30000)

    return () => clearInterval(interval)
  }, [])

  // Filter prices based on search term
  const filteredPrices = prices.filter((price) => price.symbol.toLowerCase().includes(searchTerm.toLowerCase()))

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex w-full max-w-sm items-center space-x-2">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full max-w-sm items-center space-x-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search symbols..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Change</TableHead>
              <TableHead className="hidden md:table-cell">% Change</TableHead>
              <TableHead className="hidden md:table-cell">RSI</TableHead>
              <TableHead className="hidden md:table-cell">Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPrices.length > 0 ? (
              filteredPrices.map((price) => (
                <TableRow key={price.symbol}>
                  <TableCell className="font-medium">{price.symbol}</TableCell>
                  <TableCell>${price.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className={`flex items-center ${price.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {price.change >= 0 ? (
                        <ArrowUp className="mr-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="mr-1 h-4 w-4" />
                      )}
                      ${Math.abs(price.change).toFixed(2)}
                    </div>
                  </TableCell>
                  <TableCell
                    className={`hidden md:table-cell ${price.percentChange >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {price.percentChange >= 0 ? "+" : ""}
                    {price.percentChange.toFixed(2)}%
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div
                      className={`${
                        price.rsi < 30 ? "text-green-500" : price.rsi > 70 ? "text-red-500" : "text-gray-500"
                      }`}
                    >
                      {price.rsi.toFixed(1)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{new Date(price.time).toLocaleTimeString()}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
