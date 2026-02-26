#!/bin/bash

# Quick Reference: Common Operations for Payment Pipeline
# Usage: Source this file in your shell to access helper functions
# Or run individual commands directly

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

NAMESPACE="payment-pipeline"
MONITORING_NS="monitoring"

# ============================================================================
# DEPLOYMENT & STATUS COMMANDS
# ============================================================================

function pipeline-status() {
  echo -e "${BLUE}=== Pipeline Status ===${NC}"
  echo ""
  echo "Application Pods:"
  kubectl get pods -n ${NAMESPACE} -o wide
  echo ""
  echo "Monitoring Pods:"
  kubectl get pods -n ${MONITORING_NS} -o wide
  echo ""
  echo "Services:"
  kubectl get svc -n ${NAMESPACE}
  echo ""
  echo "HPA Status:"
  kubectl get hpa -n ${NAMESPACE}
}

function pipeline-logs() {
  local component=${1:-spark-processor}
  echo -e "${BLUE}=== Logs: ${component} ===${NC}"
  kubectl logs -f deployment/${component} -n ${NAMESPACE} --tail=100
}

function spark-describe() {
  echo -e "${BLUE}=== Spark Deployment Details ===${NC}"
  kubectl describe deployment spark-processor -n ${NAMESPACE}
}

function hpa-status() {
  echo -e "${BLUE}=== HPA Status ===${NC}"
  kubectl describe hpa spark-processor-hpa -n ${NAMESPACE}
}

# ============================================================================
# MONITORING & DASHBOARDS
# ============================================================================

function grafana-open() {
  echo -e "${GREEN}🔓 Opening Grafana...${NC}"
  echo "Port-forwarding to Grafana..."
  echo "URL: http://localhost:3000"
  echo "Username: admin"
  echo "Password: PaymentProcessing@2026"
  kubectl port-forward svc/grafana 3000:80 -n ${MONITORING_NS}
}

function prometheus-open() {
  echo -e "${GREEN}🔓 Opening Prometheus...${NC}"
  echo "Port-forwarding to Prometheus..."
  echo "URL: http://localhost:9090"
  kubectl port-forward svc/prometheus-kube-prom-prometheus 9090:9090 -n ${MONITORING_NS}
}

function alertmanager-open() {
  echo -e "${GREEN}🔓 Opening AlertManager...${NC}"
  echo "Port-forwarding to AlertManager..."
  echo "URL: http://localhost:9093"
  kubectl port-forward svc/alertmanager 9093:9093 -n ${MONITORING_NS}
}

function spark-ui() {
  echo -e "${GREEN}🔓 Opening Spark UI...${NC}"
  SPARK_POD=$(kubectl get pods -n ${NAMESPACE} -l app=spark-processor -o jsonpath='{.items[0].metadata.name}')
  echo "Spark Pod: ${SPARK_POD}"
  kubectl port-forward pod/${SPARK_POD} 4040:4040 -n ${NAMESPACE}
}

# ============================================================================
# SCALING & CONFIGURATION
# ============================================================================

function scale-spark() {
  local replicas=${1:-3}
  echo -e "${YELLOW}📊 Scaling Spark to ${replicas} replicas...${NC}"
  kubectl scale deployment spark-processor --replicas=${replicas} -n ${NAMESPACE}
  echo "✅ Done"
}

function set-message-rate() {
  local rate=${1:-10000}
  DATA_COLLECTOR_POD=$(kubectl get pods -n ${NAMESPACE} -l app=data-collector -o jsonpath='{.items[0].metadata.name}')
  
  echo -e "${YELLOW}📊 Setting message rate to ${rate} msgs/sec...${NC}"
  kubectl exec -it ${DATA_COLLECTOR_POD} -n ${NAMESPACE} -- \
    curl -X POST http://localhost:5000/config/rate \
    -H "Content-Type: application/json" \
    -d "{\"messages_per_second\": $rate}"
  echo ""
  echo "✅ Rate updated"
}

function update-hpa() {
  echo -e "${YELLOW}📊 Current HPA Configuration:${NC}"
  kubectl get hpa spark-processor-hpa -n ${NAMESPACE} -o yaml | grep -A 20 "spec:"
}

# ============================================================================
# METRICS & QUERIES
# ============================================================================

function get-throughput() {
  echo -e "${BLUE}=== Current Throughput ===${NC}"
  echo "Querying Prometheus for throughput (msgs/sec)..."
  echo ""
  echo "Note: Set up port-forward to Prometheus first:"
  echo "  kubectl port-forward svc/prometheus-kube-prom-prometheus 9090:9090 -n monitoring"
  echo ""
  echo "Then query: http://localhost:9090/api/v1/query?query=rate(spark_streaming_processed_records_total[5m])"
}

function get-consumer-lag() {
  echo -e "${BLUE}=== Consumer Lag ===${NC}"
  echo "Querying Prometheus for consumer lag..."
  echo ""
  echo "Query: http://localhost:9090/api/v1/query?query=kafka_consumer_lag_seconds"
}

function get-fraud-alerts() {
  echo -e "${BLUE}=== Fraud Alerts ===${NC}"
  echo "Connecting to Redis to check fraud alerts..."
  REDIS_POD=$(kubectl get pods -n ${NAMESPACE} -l app=redis -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  
  if [ -z "$REDIS_POD" ]; then
    echo -e "${YELLOW}Redis pod not found in ${NAMESPACE}${NC}"
    echo "Trying monitoring namespace..."
    REDIS_POD=$(kubectl get pods -n ${MONITORING_NS} -l app=redis -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  fi
  
  if [ -n "$REDIS_POD" ]; then
    echo "Redis Pod: ${REDIS_POD}"
    kubectl exec -it ${REDIS_POD} -n ${NAMESPACE} -- redis-cli SCARD fraud:accounts
  else
    echo -e "${YELLOW}Redis pod not found. Query Redis directly:${NC}"
    echo "  redis-cli SCARD fraud:accounts"
  fi
}

# ============================================================================
# TROUBLESHOOTING
# ============================================================================

function check-resources() {
  echo -e "${BLUE}=== Resource Usage ===${NC}"
  echo ""
  echo "Pod Resource Usage:"
  kubectl top pods -n ${NAMESPACE}
  echo ""
  echo "Node Resource Usage:"
  kubectl top nodes
}

function restart-component() {
  local component=${1:-spark-processor}
  echo -e "${YELLOW}🔄 Restarting ${component}...${NC}"
  kubectl rollout restart deployment/${component} -n ${NAMESPACE}
  kubectl rollout status deployment/${component} -n ${NAMESPACE}
  echo "✅ ${component} restarted"
}

function show-events() {
  local component=${1:-all}
  echo -e "${BLUE}=== Recent Events ===${NC}"
  
  if [ "$component" = "all" ]; then
    kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | tail -20
  else
    kubectl get events -n ${NAMESPACE} --field-selector involvedObject.name=${component} --sort-by='.lastTimestamp'
  fi
}

function check-connectivity() {
  echo -e "${BLUE}=== Checking Connectivity ===${NC}"
  
  SPARK_POD=$(kubectl get pods -n ${NAMESPACE} -l app=spark-processor -o jsonpath='{.items[0].metadata.name}')
  
  echo "Testing Kafka connectivity from Spark..."
  kubectl exec -it ${SPARK_POD} -n ${NAMESPACE} -- nc -zv kafka 9092
  
  echo "Testing BigQuery connectivity..."
  kubectl exec -it ${SPARK_POD} -n ${NAMESPACE} -- python3 -c "from google.cloud import bigquery; print('✅ BigQuery client loaded')" 2>/dev/null || echo "❌ BigQuery connection issue"
  
  echo "Testing Redis connectivity..."
  kubectl exec -it ${SPARK_POD} -n ${NAMESPACE} -- redis-cli -h redis ping || echo "❌ Redis connection issue"
}

# ============================================================================
# LOAD TESTING
# ============================================================================

function start-load-test() {
  local duration=${1:-30}
  local peak_rate=${2:-50000}
  
  echo -e "${YELLOW}🔥 Starting load test...${NC}"
  echo "Duration: ${duration} minutes"
  echo "Peak Rate: ${peak_rate} msgs/sec"
  echo ""
  
  bash scripts/load-test.sh ${duration} ${peak_rate}
}

function simulate-spike() {
  echo -e "${YELLOW}⚡ Simulating Black Friday spike...${NC}"
  echo ""
  echo "Ramping up from 1K to 50K msgs/sec..."
  
  for rate in 1000 5000 10000 25000 50000; do
    echo ""
    echo "Setting rate to ${rate} msgs/sec..."
    set-message-rate ${rate}
    sleep 30
  done
  
  echo ""
  echo "✅ Spike simulation complete"
  echo ""
  echo "Monitor in Grafana:"
  echo "1. Watch 'Messages/Sec' panel - should increase to 50K"
  echo "2. Watch 'HPA Replica Count' - should scale from 2 to 10-15"
  echo "3. Watch 'Consumer Lag' - should stay <60s"
}

# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

function bigquery-query() {
  local query=${1:-"SELECT COUNT(*) as transaction_count FROM payment_dataset.payment_transactions LIMIT 10"}
  
  echo -e "${BLUE}=== BigQuery Query ===${NC}"
  echo "Query: ${query}"
  echo ""
  echo "Run with gcloud:"
  echo "  bq query --use_legacy_sql=false \"${query}\""
}

function view-recent-fraud() {
  echo -e "${BLUE}=== Recent Fraud Alerts ===${NC}"
  echo "BigQuery Query:"
  echo ""
  echo "SELECT"
  echo "  account_id,"
  echo "  COUNT(*) as fraud_count,"
  echo "  SUM(amount) as total_amount,"
  echo "  MAX(timestamp) as latest_alert"
  echo "FROM payment_dataset.fraud_velocity_alerts"
  echo "WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)"
  echo "GROUP BY account_id"
  echo "ORDER BY fraud_count DESC"
  echo "LIMIT 20;"
}

# ============================================================================
# DEPLOYMENT HELPERS
# ============================================================================

function deploy-stack() {
  echo -e "${GREEN}🚀 Deploying full stack...${NC}"
  
  echo "Creating namespaces..."
  kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
  kubectl create namespace ${MONITORING_NS} --dry-run=client -o yaml | kubectl apply -f -
  
  echo "Deploying monitoring stack..."
  kubectl apply -f k8s/prometheus-config.yaml
  kubectl apply -f k8s/alertmanager.yaml
  kubectl apply -f k8s/grafana-dashboard.yaml
  
  echo "Deploying application stack..."
  kubectl apply -f k8s/data-collector-deployment.yaml
  kubectl apply -f k8s/spark-deployment.yaml
  kubectl apply -f k8s/spark-hpa.yaml
  kubectl apply -f k8s/dashboard-deployment.yaml
  
  echo ""
  echo "✅ Deployment complete"
  echo ""
  pipeline-status
}

function cleanup() {
  echo -e "${RED}🗑️ Cleaning up resources...${NC}"
  read -p "Are you sure? (yes/no) " -n 3 -r
  echo
  if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    kubectl delete namespace ${NAMESPACE} ${MONITORING_NS}
    echo "✅ Cleanup complete"
  else
    echo "Cancelled"
  fi
}

# ============================================================================
# HELP & INFO
# ============================================================================

function help() {
  echo -e "${BLUE}=== Payment Pipeline Quick Reference ===${NC}"
  echo ""
  echo "STATUS & MONITORING:"
  echo "  pipeline-status        - Show overall pipeline status"
  echo "  pipeline-logs [comp]   - Stream logs (default: spark-processor)"
  echo "  spark-describe         - Detailed Spark deployment info"
  echo "  hpa-status             - HPA configuration and metrics"
  echo "  check-resources        - Pod and node resource usage"
  echo "  check-connectivity     - Test connectivity between services"
  echo ""
  echo "DASHBOARDS:"
  echo "  grafana-open           - Open Grafana UI (http://localhost:3000)"
  echo "  prometheus-open        - Open Prometheus UI (http://localhost:9090)"
  echo "  alertmanager-open      - Open AlertManager UI (http://localhost:9093)"
  echo "  spark-ui               - Open Spark UI (http://localhost:4040)"
  echo ""
  echo "SCALING & CONFIGURATION:"
  echo "  scale-spark <replicas> - Manually scale Spark (default: 3)"
  echo "  set-message-rate <rate> - Set data collection rate (msgs/sec)"
  echo "  update-hpa             - Show HPA configuration"
  echo ""
  echo "LOAD TESTING:"
  echo "  start-load-test [duration] [peak_rate]"
  echo "  simulate-spike         - Quick Black Friday spike simulation"
  echo ""
  echo "TROUBLESHOOTING:"
  echo "  show-events [component] - Show recent Kubernetes events"
  echo "  restart-component [comp] - Restart a component"
  echo "  get-throughput         - Query current throughput"
  echo "  get-consumer-lag       - Query consumer lag"
  echo "  get-fraud-alerts       - Get fraud alert count from Redis"
  echo ""
  echo "DATABASE:"
  echo "  bigquery-query <query> - Run BigQuery query"
  echo "  view-recent-fraud      - View recent fraud alerts"
  echo ""
  echo "DEPLOYMENT:"
  echo "  deploy-stack           - Deploy full stack"
  echo "  cleanup                - Remove all resources (use with caution!)"
  echo ""
  echo "HELP:"
  echo "  help                   - Show this message"
}

# Print help if sourced without arguments
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  help
fi
