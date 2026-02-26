#!/usr/bin/env python3
"""
Payment Event Simulator

This script generates realistic payment events and publishes them to Kafka.
It simulates a payment processing system with transaction data including:
- transaction_id: Unique identifier for the transaction
- sender_account_id: Account ID of the payment sender
- receiver_account_id: Account ID of the payment receiver
- amount: Transaction amount
- currency: Currency code (USD, EUR, etc.)
- device_id: Device identifier used for the transaction
- ip_address: IP address from which the transaction originated
"""

import os
import json
import time
import logging
import random
import uuid
from datetime import datetime
from confluent_kafka import Producer
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_PAYMENTS = os.getenv("KAFKA_TOPIC_PAYMENTS", "payment-events")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Set up logging
logging.basicConfig(
    level=LOG_LEVEL, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Currency codes
CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "SGD", "CHF"]

# Device types
DEVICE_IDS = [f"device_{random.randint(1000, 9999)}" for _ in range(100)]

# IP address pools (simulating different geographic regions)
IP_POOLS = [
    ("192.168.", "US"),
    ("194.0.", "EU"),
    ("221.", "JP"),
    ("203.", "AU"),
]

# Payment methods
PAYMENT_METHODS = ["credit_card", "debit_card", "wallet", "bank_transfer"]


def generate_credit_card():
    """Generate a realistic but fake credit card number (PII - for testing only)"""
    # Generate random 16-digit card number
    # Format: XXXX-XXXX-XXXX-XXXX
    card_number = "-".join(
        [
            str(random.randint(1000, 9999)),
            str(random.randint(1000, 9999)),
            str(random.randint(1000, 9999)),
            str(random.randint(1000, 9999)),
        ]
    )
    return card_number


def generate_cvv():
    """Generate a fake CVV (PII - for testing only)"""
    return str(random.randint(100, 999))


def generate_card_expiry():
    """Generate a fake card expiry date (MM/YY)"""
    month = random.randint(1, 12)
    year = random.randint(25, 30)
    return f"{month:02d}/{year:02d}"


def generate_payment_event():
    """Generate a realistic payment event with PII data (simulated)"""
    transaction_id = str(uuid.uuid4())

    sender_account_id = f"ACC_{random.randint(100000, 999999)}"
    receiver_account_id = f"ACC_{random.randint(100000, 999999)}"

    # Amount between $1 and $10,000
    amount = round(random.uniform(1, 10000), 2)

    currency = random.choice(CURRENCIES)
    device_id = random.choice(DEVICE_IDS)
    payment_method = random.choice(PAYMENT_METHODS)

    # Generate realistic IP address
    ip_prefix, region = random.choice(IP_POOLS)
    ip_address = f"{ip_prefix}{random.randint(0, 255)}.{random.randint(0, 255)}"

    # Generate PII data (credit card, CVV, expiry)
    # WARNING: This is simulated test data only!
    # In production, this would come from a secure payment gateway
    credit_card = (
        generate_credit_card()
        if payment_method in ["credit_card", "debit_card"]
        else None
    )
    cvv = generate_cvv() if credit_card else None
    card_expiry = generate_card_expiry() if credit_card else None

    event = {
        "transaction_id": transaction_id,
        "sender_account_id": sender_account_id,
        "receiver_account_id": receiver_account_id,
        "amount": amount,
        "currency": currency,
        "device_id": device_id,
        "ip_address": ip_address,
        "timestamp": int(time.time() * 1000),  # milliseconds
        "region": region,
        # PII Fields (will be masked in Spark)
        "payment_method": payment_method,
        "credit_card": credit_card,  # PII - masked in Spark
        "cvv": cvv,  # PII - masked in Spark
        "card_expiry": card_expiry,  # PII - masked in Spark
    }

    return event


def delivery_report(err, msg):
    """Callback for Kafka producer to report delivery result"""
    if err is not None:
        logger.error(f"Message delivery failed: {err}")
    else:
        logger.debug(
            f"Message delivered to {msg.topic()} "
            f"[{msg.partition()}] at offset {msg.offset()}"
        )


def publish_to_kafka(event):
    """Publish payment event to Kafka topic"""
    try:
        producer.produce(
            topic=KAFKA_TOPIC_PAYMENTS,
            key=event["transaction_id"].encode("utf-8"),
            value=json.dumps(event).encode("utf-8"),
            callback=delivery_report,
        )
        producer.poll(0)  # Trigger delivery reports
        logger.info(
            f"Published payment event: {event['transaction_id']} "
            f"- ${event['amount']} {event['currency']} "
            f"from {event['sender_account_id']}"
        )
    except Exception as e:
        logger.error(f"Error publishing to Kafka: {e}")


def configure_producer():
    """
    Configure and return idempotent Kafka producer

    Idempotent producer ensures that messages are delivered exactly once
    to the Kafka broker, preventing duplicates even if the producer retries.
    """
    producer_conf = {
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "client.id": "payment-event-simulator",
        # Enable idempotent producer (exactly-once semantics)
        # Prevents duplicates even if the producer retries on failure
        "enable.idempotence": True,
        # Ensure in-order delivery (required for idempotence)
        "max.in.flight.requests.per.connection": 5,
        # Increase retries for reliability
        "retries": 2147483647,
        # Keep retry backoff reasonable
        "retry.backoff.ms": 100,
    }

    producer = Producer(producer_conf)
    logger.info(f"Kafka producer configured (idempotent): {KAFKA_BOOTSTRAP_SERVERS}")
    logger.info("Idempotent producer enabled: enable.idempotence=true")

    return producer


def main():
    """Main function to start payment event simulation"""
    global producer

    logger.info("Starting Payment Event Simulator")
    logger.info(f"Publishing to Kafka topic: {KAFKA_TOPIC_PAYMENTS}")

    # Configure Kafka producer
    producer = configure_producer()

    # Event generation interval (seconds)
    event_interval = 2

    try:
        event_count = 0
        while True:
            # Generate and publish a payment event
            event = generate_payment_event()
            publish_to_kafka(event)

            event_count += 1

            # Log statistics every 50 events
            if event_count % 50 == 0:
                logger.info(f"Total events generated: {event_count}")

            # Wait before generating next event
            time.sleep(event_interval)

    except KeyboardInterrupt:
        logger.info("Shutting down Payment Event Simulator")
        producer.flush()
        logger.info(f"Total events generated: {event_count}")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        producer.flush()
        raise


if __name__ == "__main__":
    main()
