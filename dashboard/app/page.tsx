import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowDown, ArrowUp, Activity } from "lucide-react"
import StockPriceTable from "@/components/stock-price-table"
import TradingSignals from "@/components/trading-signals"
import StockChart from "@/components/stock-chart"
import PortfolioSummary from "@/components/portfolio-summary"

export default function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background px-6 shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Activity className="h-6 w-6 text-blue-600" />
          <span className="font-bold">Stock Market Data Pipeline</span>
        </div>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link href="/" className="text-sm font-medium text-primary">
            Dashboard
          </Link>
          <Link href="/stocks" className="text-sm font-medium text-muted-foreground">
            Stocks
          </Link>
          <Link href="/analytics" className="text-sm font-medium text-muted-foreground">
            Analytics
          </Link>
          <Link href="/signals" className="text-sm font-medium text-muted-foreground">
            Signals
          </Link>
        </nav>
      </header>
      <main className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Market Dashboard</h1>
          <div className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleString()}</div>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">S&P 500</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-2xl font-bold">4,283.96</div>
                <div className="ml-2 flex items-center text-green-500">
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-sm">2.13%</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Dow Jones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-2xl font-bold">33,761.84</div>
                <div className="ml-2 flex items-center text-green-500">
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-sm">1.27%</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">NASDAQ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-2xl font-bold">13,047.19</div>
                <div className="ml-2 flex items-center text-green-500">
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-sm">2.05%</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Russell 2000</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="text-2xl font-bold">1,926.43</div>
                <div className="ml-2 flex items-center text-red-500">
                  <ArrowDown className="h-4 w-4" />
                  <span className="text-sm">0.34%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stocks">Stocks</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card className="col-span-2">
                <CardHeader>
                  <CardTitle>Stock Performance</CardTitle>
                  <CardDescription>Real-time price movements of top stocks</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <StockChart />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Latest Signals</CardTitle>
                  <CardDescription>Trading signals from the pipeline</CardDescription>
                </CardHeader>
                <CardContent>
                  <TradingSignals />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="stocks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stock Prices</CardTitle>
                <CardDescription>Latest prices and technical indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <StockPriceTable />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="signals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Trading Signals</CardTitle>
                <CardDescription>Signals generated by the analytics pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                <TradingSignals extended={true} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="portfolio" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Portfolio Summary</CardTitle>
                <CardDescription>Overview of your portfolio based on signals</CardDescription>
              </CardHeader>
              <CardContent>
                <PortfolioSummary />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Status</CardTitle>
              <CardDescription>Current status of the data pipeline components</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Finnhub Data Collector</div>
                  <div className="flex items-center text-green-500">
                    <span className="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                    Running
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">Kafka Cluster</div>
                  <div className="flex items-center text-green-500">
                    <span className="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                    Running
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">Spark Processing</div>
                  <div className="flex items-center text-green-500">
                    <span className="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                    Running
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">BigQuery Storage</div>
                  <div className="flex items-center text-green-500">
                    <span className="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                    Running
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Metrics</CardTitle>
              <CardDescription>Performance metrics of the data pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Data Ingestion Rate</div>
                  <div className="text-sm">10,450 events/second</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">Processing Latency</div>
                  <div className="text-sm">423 ms</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">Storage Efficiency</div>
                  <div className="text-sm">72% compression ratio</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-medium">Query Performance</div>
                  <div className="text-sm">1.8s for complex queries</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
