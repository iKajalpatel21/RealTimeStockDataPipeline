// Mock function to simulate fetching stock data from Finnhub API
export async function fetchStockData(symbol: string) {
  // In a real implementation, this would call the Finnhub API
  // For demo purposes, we'll generate mock data

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Generate mock historical data
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000
  const data = []

  // Base price depends on the symbol to make it look realistic
  let basePrice = 0
  switch (symbol.toUpperCase()) {
    case "AAPL":
      basePrice = 180
      break
    case "MSFT":
      basePrice = 350
      break
    case "GOOGL":
      basePrice = 140
      break
    case "AMZN":
      basePrice = 130
      break
    case "META":
      basePrice = 300
      break
    default:
      basePrice = 100 + (symbol.charCodeAt(0) % 10) * 10 // Generate based on first letter
  }

  // Generate 20 data points over the last hour
  for (let i = 0; i < 20; i++) {
    const timestamp = oneHourAgo + i * 3 * 60 * 1000 // 3-minute intervals
    const randomFactor = 0.98 + Math.random() * 0.04 // Random factor between 0.98 and 1.02
    const price = basePrice * randomFactor
    const volume = Math.floor(Math.random() * 10000) + 1000

    data.push({
      timestamp,
      price: Number.parseFloat(price.toFixed(2)),
      volume,
    })
  }

  return data
}

// In a real implementation, we would have functions like:
// export async function connectWebSocket(symbol: string, callback: (data: any) => void) {...}
// export async function getCompanyProfile(symbol: string) {...}
// export async function getFinancials(symbol: string) {...}
