#!/bin/bash

# Load Testing Script for Real-Time Payment Processing Pipeline
# Purpose: Validate HPA auto-scaling and system performance under load
# Usage: ./scripts/load-test.sh [duration_minutes] [peak_rate]

set -e

# Configuration
DURATION_MINUTES=${1:-30}
PEAK_RATE=${2:-50000}
RAMP_UP_MINUTES=5
SUSTAINED_MINUTES=20
RAMP_DOWN_MINUTES=5

DATA_COLLECTOR_POD=$(kubectl get pods -n payment-pipeline -l app=data-collector -o jsonpath='{.items[0].metadata.name}')
NAMESPACE="payment-pipeline"

echo "🚀 Load Testing: Real-Time Payment Processing Pipeline"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Duration: ${DURATION_MINUTES} minutes"
echo "Peak Rate: ${PEAK_RATE} msgs/sec"
echo "Data Collector Pod: ${DATA_COLLECTOR_POD}"
echo ""

# Function to set message rate
set_rate() {
  local rate=$1
  echo "📊 Setting rate to $rate msgs/sec..."
  kubectl exec -it ${DATA_COLLECTOR_POD} -n ${NAMESPACE} -- \
    curl -X POST http://localhost:5000/config/rate \
    -H "Content-Type: application/json" \
    -d "{\"messages_per_second\": $rate}" \
    2>/dev/null || echo "Rate update may have failed"
}

# Function to get metrics
get_metrics() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Get current Spark pod count
  SPARK_REPLICAS=$(kubectl get deployment spark-processor -n ${NAMESPACE} -o jsonpath='{.status.replicas}')
  SPARK_DESIRED=$(kubectl get deployment spark-processor -n ${NAMESPACE} -o jsonpath='{.spec.replicas}')
  
  echo "📈 Current Metrics:"
  echo "   Spark Replicas: ${SPARK_REPLICAS}/${SPARK_DESIRED}"
  echo ""
}

# Main test sequence
echo "Phase 1️⃣: RAMP UP (0-${RAMP_UP_MINUTES} min)"
RAMP_UP_SECONDS=$((RAMP_UP_MINUTES * 60))
STEP_SECONDS=$((RAMP_UP_SECONDS / 5))

for i in {1..5}; do
  RATE=$((PEAK_RATE * i / 5))
  set_rate $RATE
  get_metrics
  
  if [ $i -lt 5 ]; then
    echo "⏳ Waiting ${STEP_SECONDS} seconds..."
    sleep ${STEP_SECONDS}
  fi
done

echo ""
echo "Phase 2️⃣: SUSTAINED LOAD (${RAMP_UP_MINUTES}-$((RAMP_UP_MINUTES + SUSTAINED_MINUTES)) min)"
set_rate ${PEAK_RATE}

SUSTAINED_SECONDS=$((SUSTAINED_MINUTES * 60))
INTERVAL=30  # Check metrics every 30 seconds

for ((i=0; i<${SUSTAINED_SECONDS}; i+=INTERVAL)); do
  get_metrics
  REMAINING=$((SUSTAINED_SECONDS - i - INTERVAL))
  if [ $REMAINING -gt 0 ]; then
    echo "⏳ Sustained load for another $((REMAINING / 60))m ${REMAINING}s..."
    sleep $INTERVAL
  fi
done

echo ""
echo "Phase 3️⃣: RAMP DOWN ($((RAMP_UP_MINUTES + SUSTAINED_MINUTES))-${DURATION_MINUTES} min)"

for i in {5..1}; do
  RATE=$((PEAK_RATE * i / 5))
  set_rate $RATE
  get_metrics
  
  if [ $i -gt 1 ]; then
    sleep ${STEP_SECONDS}
  fi
done

# Final state
set_rate 1000
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Load test completed!"
echo ""
echo "📊 Final Metrics:"
get_metrics

echo "📋 Next Steps:"
echo "1. Check Grafana dashboard: kubectl port-forward svc/grafana 3000:80 -n monitoring"
echo "2. Verify HPA scaling: kubectl describe hpa spark-processor-hpa -n ${NAMESPACE}"
echo "3. Review Prometheus metrics: kubectl port-forward svc/prometheus-kube-prom-prometheus 9090:9090 -n monitoring"
echo "4. Check alert events: kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | grep -i hpa"
echo ""
echo "📈 Success Criteria:"
echo "   ✓ Spark replicas scaled from 2 to 5-10 replicas"
echo "   ✓ Throughput maintained at 85K-95K msgs/sec"
echo "   ✓ Consumer lag stayed <60 seconds"
echo "   ✓ No pod crashes or errors"
echo "   ✓ Graceful scale-down after load reduction"
