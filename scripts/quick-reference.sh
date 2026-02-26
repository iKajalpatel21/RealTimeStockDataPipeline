#!/bin/bash

# Quick Reference: Common Operations for Payment Pipeline
# Usage: Source this file in your shell to access helper functions

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NAMESPACE="payment-pipeline"
MONITORING_NS="monitoring"

# STATUS & MONITORING
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

# DASHBOARDS
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

function spark-ui() {
  echo -e "${GREEN}🔓 Opening Spark UI...${NC}"
  SPARK_POD=$(kubectl get pods -n ${NAMESPACE} -l app=spark-processor -o jsonpath='{.items[0].metadata.name}')
  echo "Spark Pod: ${SPARK_POD}"
  kubectl port-forward pod/${SPARK_POD} 4040:4040 -n ${NAMESPACE}
}

# SCALING
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

# METRICS
function get-throughput() {
  echo -e "${BLUE}=== Current Throughput ===${NC}"
  echo "Query: rate(spark_streaming_processed_records_total[5m])"
}

function check-resources() {
  echo -e "${BLUE}=== Resource Usage ===${NC}"
  echo ""
  echo "Pod Resource Usage:"
  kubectl top pods -n ${NAMESPACE}
  echo ""
  echo "Node Resource Usage:"
  kubectl top nodes
}

# TROUBLESHOOTING
function show-events() {
  local component=${1:-all}
  echo -e "${BLUE}=== Recent Events ===${NC}"
  
  if [ "$component" = "all" ]; then
    kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | tail -20
  else
    kubectl get events -n ${NAMESPACE} --field-selector involvedObject.name=${component} --sort-by='.lastTimestamp'
  fi
}

function restart-component() {
  local component=${1:-spark-processor}
  echo -e "${YELLOW}🔄 Restarting ${component}...${NC}"
  kubectl rollout restart deployment/${component} -n ${NAMESPACE}
  kubectl rollout status deployment/${component} -n ${NAMESPACE}
  echo "✅ ${component} restarted"
}

# LOAD TESTING
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
}

# DEPLOYMENT
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

# HELP
function help() {
  echo -e "${BLUE}=== Payment Pipeline Quick Reference ===${NC}"
  echo ""
  echo "STATUS:"
  echo "  pipeline-status - Show overall status"
  echo "  hpa-status - Check HPA metrics"
  echo "  check-resources - Pod and node resource usage"
  echo ""
  echo "DASHBOARDS:"
  echo "  grafana-open - Open Grafana (http://localhost:3000)"
  echo "  prometheus-open - Open Prometheus (http://localhost:9090)"
  echo "  spark-ui - Open Spark UI (http://localhost:4040)"
  echo ""
  echo "SCALING:"
  echo "  scale-spark <replicas> - Set replica count"
  echo "  set-message-rate <rate> - Set msg/sec rate"
  echo "  simulate-spike - Quick Black Friday test"
  echo ""
  echo "METRICS:"
  echo "  get-throughput - Query throughput"
  echo ""
  echo "TROUBLESHOOTING:"
  echo "  show-events [component] - Show Kubernetes events"
  echo "  restart-component [comp] - Restart a component"
  echo ""
  echo "DEPLOYMENT:"
  echo "  deploy-stack - Deploy full stack"
  echo "  cleanup - Remove all resources"
  echo ""
}

# Print help if sourced without arguments
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  help
fi
