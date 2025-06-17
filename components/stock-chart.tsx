"use client"

import { useEffect, useRef } from "react"

type StockData = {
  timestamp: number
  price: number
  volume: number
}

interface StockChartProps {
  data: StockData[]
}

export default function StockChart({ data }: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // Calculate min and max values
    const prices = data.map((d) => d.price)
    const minPrice = Math.min(...prices) * 0.99 // Add some padding
    const maxPrice = Math.max(...prices) * 1.01
    const priceRange = maxPrice - minPrice

    // Calculate dimensions
    const padding = { top: 20, right: 20, bottom: 30, left: 50 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw axes
    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top)
    ctx.lineTo(padding.left, canvas.height - padding.bottom)
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom)
    ctx.strokeStyle = "#e2e8f0"
    ctx.stroke()

    // Draw price labels
    ctx.font = "10px Arial"
    ctx.fillStyle = "#64748b"
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"

    const numPriceTicks = 5
    for (let i = 0; i <= numPriceTicks; i++) {
      const y = padding.top + chartHeight - (i / numPriceTicks) * chartHeight
      const price = minPrice + (i / numPriceTicks) * priceRange

      ctx.fillText(price.toFixed(2), padding.left - 5, y)

      // Draw horizontal grid line
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.width - padding.right, y)
      ctx.strokeStyle = "#e2e8f0"
      ctx.stroke()
    }

    // Draw time labels
    ctx.textAlign = "center"
    ctx.textBaseline = "top"

    const numTimeTicks = Math.min(5, data.length)
    for (let i = 0; i < numTimeTicks; i++) {
      const index = Math.floor((i / (numTimeTicks - 1)) * (data.length - 1))
      const x = padding.left + (index / (data.length - 1)) * chartWidth
      const time = new Date(data[index].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

      ctx.fillText(time, x, canvas.height - padding.bottom + 5)
    }

    // Draw price line
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth
      const y = padding.top + chartHeight - ((d.price - minPrice) / priceRange) * chartHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.strokeStyle = "#3b82f6"
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw area under the line
    ctx.lineTo(padding.left + chartWidth, canvas.height - padding.bottom)
    ctx.lineTo(padding.left, canvas.height - padding.bottom)
    ctx.closePath()
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)"
    ctx.fill()

    // Draw data points
    data.forEach((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth
      const y = padding.top + chartHeight - ((d.price - minPrice) / priceRange) * chartHeight

      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = "#3b82f6"
      ctx.fill()
    })

    // Draw chart title
    ctx.font = "bold 12px Arial"
    ctx.fillStyle = "#334155"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("Stock Price Chart", canvas.width / 2, 5)
  }, [data])

  return <canvas ref={canvasRef} className="w-full h-full" />
}
