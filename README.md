# Real-Time Stock Market Data Pipeline

This project implements a complete data pipeline for processing real-time stock market data using:
- Finnhub API for real-time stock data
- Apache Kafka for data streaming
- Apache Spark for data processing
- Google BigQuery for data storage
- Tableau for data visualization
- Docker and Kubernetes for containerization and orchestration

## Project Structure

- `/data-collector`: Python service that connects to Finnhub API and sends data to Kafka
- `/kafka`: Kafka configuration and setup files
- `/spark`: Spark streaming jobs for data processing
- `/bigquery`: BigQuery schemas and utilities
- `/visualization`: Tableau workbooks and Next.js dashboard
- `/k8s`: Kubernetes manifests for deployment
- `/.github`: GitHub Actions workflows for CI/CD

## Project Architecture
![image](https://github.com/user-attachments/assets/fc2bd8ed-2cdd-4cf0-80e7-dd7e758dffc8)

## Setup Instructions

1. Set up environment variables in `.env` file
2. Run `docker-compose up` to start the local development environment
3. Deploy to production with `./deploy.sh`

See detailed instructions in each component's README file.
\`\`\`

\`\`\`python file="data-collector/finnhub_collector.py"
#!/usr/bin/env python3
"""
Finnhub Stock Data Collector

This script connects to Finnhub API via WebSocket and REST API to collect real-time 
stock data and historical data. It then publishes this data to Kafka topics.
"""

import os
import json
import time
import logging
import websocket
import requests
from datetime import datetime
from confluent_kafka import Producer
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
FINNHUB_API_KEY = os.getenv('FINNHUB_API_KEY')
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
KAFKA_TOPIC_TRADES = os.getenv('KAFKA_TOPIC_TRADES', 'stock-trades')
KAFKA_TOPIC_QUOTES = os.getenv('KAFKA_TOPIC_QUOTES', 'stock-quotes')
STOCK_SYMBOLS = os.getenv('STOCK_SYMBOLS', 'AAPL,MSFT,GOOGL,AMZN,META').split(',')

# Configure Kafka producer
producer_conf = {
    'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
    'client.id': 'finnhub-data-collector'
}
producer = Producer(producer_conf)

def delivery_report(err, msg):
    """Callback for Kafka producer to report delivery result"""
    if err is not None:
        logger.error(f"Message delivery failed: {err}")
    else:
        logger.debug(f"Message delivered to {msg.topic()} [{msg.partition()}] at offset {msg.offset()}")

def publish_to_kafka(topic, key, value):
    """Publish message to Kafka topic"""
    try:
        producer.produce(
            topic=topic,
            key=key.encode('utf-8'),
            value=json.dumps(value).encode('utf-8'),
            callback=delivery_report
        )
        producer.poll(0)  # Trigger delivery reports
    except Exception as e:
        logger.error(f"Error publishing to Kafka: {e}")

def fetch_stock_quote(symbol):
    """Fetch current stock quote from Finnhub REST API"""
    try:
        url = f'https://finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_API_KEY}'
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        # Add metadata
        data['symbol'] = symbol
        data['timestamp'] = int(time.time() * 1000)
        data['fetchTime'] = int(time.time() * 1000)
        
        # Publish to Kafka
        publish_to_kafka(KAFKA_TOPIC_QUOTES, symbol, data)
        logger.info(f"Published quote for {symbol}: {data['c']}")
        return data
    except Exception as e:
        logger.error(f"Error fetching quote for {symbol}: {e}")
        return None

def on_message(ws, message):
    """Handle incoming WebSocket messages"""
    try:
        data = json.loads(message)
        if data['type'] == 'trade':
            for trade in data['data']:
                # Add metadata
                trade['receiveTime'] = int(time.time() * 1000)
                
                # Publish to Kafka
                symbol = trade['s']
                publish_to_kafka(KAFKA_TOPIC_TRADES, symbol, trade)
            logger.info(f"Published {len(data['data'])} trades")
    except Exception as e:
        logger.error(f"Error processing WebSocket message: {e}")

def on_error(ws, error):
    """Handle WebSocket errors"""
    logger.error(f"WebSocket error: {error}")

def on_close(ws, close_status_code, close_msg):
    """Handle WebSocket connection close"""
    logger.info(f"WebSocket connection closed: {close_status_code} - {close_msg}")

def on_open(ws):
    """Handle WebSocket connection open"""
    logger.info("WebSocket connection established")
    
    # Subscribe to trade updates for configured symbols
    for symbol in STOCK_SYMBOLS:
        ws.send(json.dumps({'type': 'subscribe', 'symbol': symbol}))
        logger.info(f"Subscribed to trades for {symbol}")

def start_websocket_client():
    """Start WebSocket client for real-time trade data"""
    websocket.enableTrace(False)
    ws = websocket.WebSocketApp(
        f"wss://ws.finnhub.io?token={FINNHUB_API_KEY}",
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    ws.on_open = on_open
    return ws

def poll_stock_quotes():
    """Poll stock quotes periodically"""
    while True:
        for symbol in STOCK_SYMBOLS:
            fetch_stock_quote(symbol)
        
        # Flush Kafka producer to ensure delivery
        producer.flush()
        
        # Wait before next poll
        time.sleep(60)  # Poll every minute

def main():
    """Main function to start data collection"""
    logger.info("Starting Finnhub data collector")
    
    # Start WebSocket client in a separate thread
    ws = start_websocket_client()
    websocket_thread = threading.Thread(target=ws.run_forever)
    websocket_thread.daemon = True
    websocket_thread.start()
    
    # Start polling stock quotes
    try:
        poll_stock_quotes()
    except KeyboardInterrupt:
        logger.info("Shutting down data collector")
        ws.close()
        producer.flush()

if __name__ == "__main__":
    import threading
    main()
