"use client"

import { useEffect, useRef } from "react"

export default function PipelineArchitecture() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    canvas.width = canvas.offsetWidth
    canvas.height = 400

    // Define colors
    const colors = {
      background: "#f8fafc",
      connector: "#94a3b8",
      finnhub: "#0ea5e9",
      kafka: "#0f172a",
      spark: "#ea580c",
      bigquery: "#4285F4",
      tableau: "#E97627",
      text: "#334155",
      shadow: "rgba(0, 0, 0, 0.1)",
    }

    // Clear canvas
    ctx.fillStyle = colors.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw components
    const componentWidth = 120
    const componentHeight = 60
    const horizontalSpacing = (canvas.width - 5 * componentWidth) / 6
    const verticalCenter = canvas.height / 2

    // Helper function to draw a component
    const drawComponent = (x: number, y: number, label: string, color: string) => {
      // Draw shadow
      ctx.fillStyle = colors.shadow
      ctx.fillRect(x + 3, y + 3, componentWidth, componentHeight)

      // Draw component
      ctx.fillStyle = color
      ctx.fillRect(x, y, componentWidth, componentHeight)

      // Draw text
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 14px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(label, x + componentWidth / 2, y + componentHeight / 2)
    }

    // Helper function to draw an arrow
    const drawArrow = (fromX: number, fromY: number, toX: number, toY: number) => {
      const headLength = 10
      const angle = Math.atan2(toY - fromY, toX - fromX)

      ctx.beginPath()
      ctx.moveTo(fromX, fromY)
      ctx.lineTo(toX, toY)
      ctx.strokeStyle = colors.connector
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw arrowhead
      ctx.beginPath()
      ctx.moveTo(toX, toY)
      ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6))
      ctx.closePath()
      ctx.fillStyle = colors.connector
      ctx.fill()
    }

    // Calculate positions
    const positions = [
      horizontalSpacing,
      2 * horizontalSpacing + componentWidth,
      3 * horizontalSpacing + 2 * componentWidth,
      4 * horizontalSpacing + 3 * componentWidth,
      5 * horizontalSpacing + 4 * componentWidth,
    ]

    // Draw components
    drawComponent(positions[0], verticalCenter - componentHeight / 2, "Finnhub API", colors.finnhub)
    drawComponent(positions[1], verticalCenter - componentHeight / 2, "Kafka", colors.kafka)
    drawComponent(positions[2], verticalCenter - componentHeight / 2, "Spark", colors.spark)
    drawComponent(positions[3], verticalCenter - componentHeight / 2, "BigQuery", colors.bigquery)
    drawComponent(positions[4], verticalCenter - componentHeight / 2, "Tableau", colors.tableau)

    // Draw arrows
    for (let i = 0; i < 4; i++) {
      drawArrow(positions[i] + componentWidth, verticalCenter, positions[i + 1], verticalCenter)
    }

    // Add labels
    ctx.fillStyle = colors.text
    ctx.font = "12px Arial"
    ctx.textAlign = "center"

    ctx.fillText("Data Source", positions[0] + componentWidth / 2, verticalCenter + componentHeight / 2 + 25)
    ctx.fillText("Message Queue", positions[1] + componentWidth / 2, verticalCenter + componentHeight / 2 + 25)
    ctx.fillText("Processing", positions[2] + componentWidth / 2, verticalCenter + componentHeight / 2 + 25)
    ctx.fillText("Storage", positions[3] + componentWidth / 2, verticalCenter + componentHeight / 2 + 25)
    ctx.fillText("Visualization", positions[4] + componentWidth / 2, verticalCenter + componentHeight / 2 + 25)

    // Add data flow labels
    ctx.font = "10px Arial"
    ctx.fillText("Real-time stock data", (positions[0] + positions[1] + componentWidth) / 2, verticalCenter - 15)
    ctx.fillText("Data streams", (positions[1] + positions[2] + componentWidth) / 2, verticalCenter - 15)
    ctx.fillText("Processed data", (positions[2] + positions[3] + componentWidth) / 2, verticalCenter - 15)
    ctx.fillText("Query results", (positions[3] + positions[4] + componentWidth) / 2, verticalCenter - 15)
  }, [])

  return (
    <div className="w-full">
      <canvas ref={canvasRef} className="w-full h-[400px]" style={{ maxWidth: "100%" }} />
    </div>
  )
}
