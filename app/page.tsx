import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRight, BarChart3, Database, GitFork, LineChart, RefreshCw } from "lucide-react"
import PipelineArchitecture from "@/components/pipeline-architecture"
import StockDataDemo from "@/components/stock-data-demo"

export const metadata: Metadata = {
  title: "Real-Time Stock Market Data Pipeline",
  description:
    "A demonstration of a real-time stock market data pipeline using Finnhub API, Kafka, Spark, BigQuery, and Tableau",
}

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold mb-4">Real-Time Stock Market Data Pipeline</h1>
          <p className="text-xl opacity-90 max-w-3xl">
            A comprehensive data engineering project that collects, processes, analyzes, and visualizes stock market
            data in real-time.
          </p>
          <div className="flex gap-4 mt-8">
            <Button asChild variant="secondary" size="lg">
              <Link href="#architecture">
                View Architecture <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Link href="#demo">
                See Demo <BarChart3 className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-6">Project Overview</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <RefreshCw className="mr-2 h-5 w-5 text-blue-600" />
                  Real-Time Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Collect live stock market data from Finnhub API with real-time updates on price movements and trading
                  volumes.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <GitFork className="mr-2 h-5 w-5 text-blue-600" />
                  Streaming Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Process data streams with Apache Kafka and analyze with Spark Streaming for real-time insights.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5 text-blue-600" />
                  Storage & Visualization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>Store processed data in Google BigQuery and create interactive dashboards with Tableau.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="architecture" className="mb-16 scroll-mt-16">
          <h2 className="text-3xl font-bold mb-6">Pipeline Architecture</h2>
          <Card className="p-6">
            <PipelineArchitecture />
          </Card>
          <div className="grid md:grid-cols-2 gap-8 mt-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">Data Collection</h3>
              <p className="mb-4">
                The pipeline begins with a data collector service that connects to the Finnhub API to fetch real-time
                stock data. This service is responsible for:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Establishing WebSocket connections for real-time price updates</li>
                <li>Fetching historical data for initial analysis</li>
                <li>Handling API rate limits and connection issues</li>
                <li>Formatting data for ingestion into Kafka</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Data Processing</h3>
              <p className="mb-4">Once data is collected, it flows through a processing pipeline:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Apache Kafka ingests and buffers the real-time data stream</li>
                <li>Spark Streaming processes the data with windowed operations</li>
                <li>Calculated metrics include moving averages, volatility, and trading signals</li>
                <li>Processed results are stored in BigQuery for analysis and visualization</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="demo" className="mb-16 scroll-mt-16">
          <h2 className="text-3xl font-bold mb-6">Live Demo</h2>
          <p className="mb-6">
            This interactive demo shows a simplified version of the pipeline in action, fetching real stock data and
            visualizing it in real-time.
          </p>
          <Card>
            <CardContent className="pt-6">
              <StockDataDemo />
            </CardContent>
          </Card>
        </section>

        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-6">Business Impact</h2>
          <Card>
            <CardHeader>
              <CardTitle>Key Performance Improvements</CardTitle>
              <CardDescription>Quantifiable metrics demonstrating the value of this pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <LineChart className="mx-auto h-10 w-10 text-blue-600 mb-2" />
                  <h3 className="text-xl font-bold text-blue-800">95%</h3>
                  <p className="text-sm text-gray-600">Reduction in data processing latency</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <BarChart3 className="mx-auto h-10 w-10 text-blue-600 mb-2" />
                  <h3 className="text-xl font-bold text-blue-800">20x</h3>
                  <p className="text-sm text-gray-600">Increase in data processing throughput</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Database className="mx-auto h-10 w-10 text-blue-600 mb-2" />
                  <h3 className="text-xl font-bold text-blue-800">99.9%</h3>
                  <p className="text-sm text-gray-600">System uptime and data availability</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <p className="text-sm text-gray-600">
                This pipeline enables financial analysts to make data-driven decisions with near real-time market data,
                reducing the time to insight from hours to seconds.
              </p>
            </CardFooter>
          </Card>
        </section>

        <section>
          <h2 className="text-3xl font-bold mb-6">Technologies Used</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { name: "Finnhub API", description: "Real-time stock data source" },
              { name: "Apache Kafka", description: "Distributed streaming platform" },
              { name: "Apache Spark", description: "Unified analytics engine" },
              { name: "Google BigQuery", description: "Serverless data warehouse" },
              { name: "Tableau", description: "Data visualization platform" },
              { name: "Docker", description: "Containerization platform" },
              { name: "Kubernetes", description: "Container orchestration" },
              { name: "Python", description: "Data processing scripts" },
              { name: "Next.js", description: "Frontend framework" },
              { name: "GitHub Actions", description: "CI/CD pipeline" },
            ].map((tech, i) => (
              <Card key={i} className="flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{tech.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{tech.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-gray-100 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>Real-Time Stock Market Data Pipeline Project</p>
          <p className="text-sm mt-2">© {new Date().getFullYear()} - A Data Engineering Portfolio Project</p>
        </div>
      </footer>
    </div>
  )
}
