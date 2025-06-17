"use client"

import { useEffect, useState } from "react"
import { getTradingSignals } from "@/lib/data"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

interface TradingSignalsProps {
  extended?: boolean
}

export default function TradingSignals({ extended = false }: TradingSignalsProps) {
  const [signals, setSignals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSignals() {
      setLoading(true)
      try {
        const data = await getTradingSignals()
        setSignals(data)
      } catch (error) {
        console.error("Error fetching signals:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchSignals()
    // Refresh data every minute
    const interval = setInterval(fetchSignals, 60000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array(extended ? 6 : 3)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
      </div>
    )
  }

  // Show only the most recent signals if not extended view
  const displaySignals = extended ? signals : signals.slice(0, 5)

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Signal</TableHead>
            <TableHead>Price</TableHead>
            {extended && (
              <>
                <TableHead className="hidden md:table-cell">RSI</TableHead>
                <TableHead className="hidden md:table-cell">Reason</TableHead>
                <TableHead className="hidden md:table-cell">Time</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displaySignals.length > 0 ? (
            displaySignals.map((signal, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{signal.symbol}</TableCell>
                <TableCell>
                  <Badge
                    variant={signal.signalType === "BUY" ? "default" : "destructive"}
                    className={signal.signalType === "BUY" ? "bg-green-500" : ""}
                  >
                    {signal.signalType}
                  </Badge>
                </TableCell>
                <TableCell>${signal.price.toFixed(2)}</TableCell>
                {extended && (
                  <>
                    <TableCell className="hidden md:table-cell">{signal.rsi.toFixed(1)}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-xs truncate">{signal.reason}</TableCell>
                    <TableCell className="hidden md:table-cell">{new Date(signal.time).toLocaleString()}</TableCell>
                  </>
                )}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={extended ? 6 : 3} className="h-24 text-center">
                No signals generated yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
