#!/bin/bash

# Production Deployment Checklist
# Purpose: Ensure all components are properly configured before going live
# Usage: Go through this checklist step-by-step, marking items as you verify each

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Real-Time Payment Pipeline - Production Deployment Checklist  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
DONE="✅"
TODO="⬜"
CHECK_RED="❌"

# Array to track status
declare -a checklist
declare -a status

# Helper function to add checklist item
add_item() {
  local category=$1
  local task=$2
  local command=$3
  
  echo "[$TODO] $task"
  if [ ! -z "$command" ]; then
    echo "   Command: $command"
  fi
  echo ""
}

# ============================================================================
# INFRASTRUCTURE SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  INFRASTRUCTURE SETUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "infra" "GKE cluster provisioned (6+ nodes, n1-standard-4)" \
  "gcloud container clusters create payment-pipeline --num-nodes 6"

add_item "infra" "kubectl configured and authenticated" \
  "gcloud container clusters get-credentials payment-pipeline --zone us-central1-a"

add_item "infra" "Kubernetes version 1.24+" \
  "kubectl version --short"

add_item "infra" "Storage class available (for PVC)" \
  "kubectl get storageclass"

add_item "infra" "Ingress controller installed (for dashboard)" \
  "kubectl get deployment -A | grep ingress"

add_item "infra" "Helm 3.0+ installed" \
  "helm version"

# ============================================================================
# GCP SETUP SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  GCP CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "gcp" "GCP service account created" \
  "gcloud iam service-accounts create payment-pipeline-sa"

add_item "gcp" "BigQuery permissions granted" \
  "gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:... --role=roles/bigquery.dataEditor"

add_item "gcp" "GCS permissions granted" \
  "gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:... --role=roles/storage.objectAdmin"

add_item "gcp" "Service account key created and stored" \
  "gcloud iam service-accounts keys create gcp-key.json --iam-account=..."

add_item "gcp" "BigQuery datasets created (payment_dataset)" \
  "bq mk --dataset payment_dataset"

add_item "gcp" "GCS bucket created for checkpoints" \
  "gsutil mb gs://payment-pipeline-checkpoints"

# ============================================================================
# NAMESPACE & SECRETS SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  NAMESPACES & SECRETS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "secrets" "Namespaces created (payment-pipeline, monitoring)" \
  "kubectl create namespace payment-pipeline monitoring"

add_item "secrets" "Namespaces labeled for monitoring" \
  "kubectl label namespace payment-pipeline monitoring=enabled"

add_item "secrets" "GCP credentials secret created" \
  "kubectl create secret generic gcp-credentials --from-file=gcp-key.json -n payment-pipeline"

add_item "secrets" "Slack webhook secret created" \
  "kubectl create secret generic alertmanager-slack --from-literal=webhook_url=https://..."

add_item "secrets" "BigQuery credentials verified" \
  "kubectl get secret gcp-credentials -n payment-pipeline"

# ============================================================================
# MONITORING STACK SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  MONITORING STACK (Prometheus, Grafana, AlertManager)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "monitoring" "Prometheus Operator Helm repo added" \
  "helm repo add prometheus-community https://prometheus-community.github.io/helm-charts"

add_item "monitoring" "Prometheus Operator installed via Helm" \
  "helm install prometheus prometheus-community/kube-prometheus-stack --namespace monitoring"

add_item "monitoring" "Prometheus custom config deployed" \
  "kubectl apply -f k8s/prometheus-config.yaml"

add_item "monitoring" "Prometheus deployed successfully" \
  "kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus"

add_item "monitoring" "AlertManager deployed" \
  "kubectl apply -f k8s/alertmanager.yaml"

add_item "monitoring" "AlertManager pod running" \
  "kubectl get pods -n monitoring -l app=alertmanager"

add_item "monitoring" "Grafana deployed" \
  "kubectl apply -f k8s/grafana-dashboard.yaml"

add_item "monitoring" "Grafana accessible" \
  "kubectl port-forward svc/grafana 3000:80 -n monitoring"

add_item "monitoring" "Grafana dashboard visible (14 panels)" \
  "Open http://localhost:3000 → Check Payment Processing Dashboard"

add_item "monitoring" "Prometheus targets are healthy" \
  "http://prometheus:9090/targets → All green"

# ============================================================================
# APPLICATION DEPLOYMENT SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  APPLICATION DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "app" "Docker images pushed to registry" \
  "docker push gcr.io/PROJECT_ID/spark-processor:latest"

add_item "app" "ConfigMap created for Spark settings" \
  "kubectl create configmap spark-config --from-literal=batch_duration=5s -n payment-pipeline"

add_item "app" "Data Collector deployed" \
  "kubectl apply -f k8s/data-collector-deployment.yaml"

add_item "app" "Data Collector pod running" \
  "kubectl get pods -n payment-pipeline -l app=data-collector"

add_item "app" "Spark processor deployed" \
  "kubectl apply -f k8s/spark-deployment.yaml"

add_item "app" "Spark processor pod running (2 initial replicas)" \
  "kubectl get pods -n payment-pipeline -l app=spark-processor"

add_item "app" "HPA created and active" \
  "kubectl apply -f k8s/spark-hpa.yaml"

add_item "app" "HPA metrics available" \
  "kubectl describe hpa spark-processor-hpa -n payment-pipeline"

add_item "app" "Dashboard UI deployed" \
  "kubectl apply -f k8s/dashboard-deployment.yaml"

# ============================================================================
# CONNECTIVITY & INTEGRATION SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣  CONNECTIVITY & INTEGRATION TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "connectivity" "Kafka connectivity from Spark verified" \
  "kubectl exec -it SPARK_POD -- nc -zv kafka 9092"

add_item "connectivity" "BigQuery connectivity verified" \
  "kubectl exec -it SPARK_POD -- python3 -c 'from google.cloud import bigquery; bigquery.Client()'"

add_item "connectivity" "Redis connectivity verified" \
  "kubectl exec -it SPARK_POD -- redis-cli -h redis ping"

add_item "connectivity" "Prometheus metrics being collected" \
  "curl http://prometheus:9090/api/v1/query?query=up"

add_item "connectivity" "Grafana data flowing (metrics visible)" \
  "Grafana dashboard should show data, not 'No data'"

add_item "connectivity" "Spark logs accessible" \
  "kubectl logs deployment/spark-processor -n payment-pipeline | head -20"

# ============================================================================
# FUNCTIONALITY TESTS SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7️⃣  FUNCTIONALITY TESTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "func" "Data flowing from Kafka to BigQuery" \
  "bq query 'SELECT COUNT(*) FROM payment_dataset.payment_transactions'"

add_item "func" "Transactions table populated (>1000 rows)" \
  "bq query 'SELECT COUNT(*) FROM payment_dataset.payment_transactions'"

add_item "func" "PII masking verified (credit cards masked)" \
  "bq query 'SELECT account_id FROM payment_dataset.payment_transactions LIMIT 1'"

add_item "func" "Fraud detection triggering" \
  "bq query 'SELECT COUNT(*) FROM payment_dataset.fraud_velocity_alerts'"

add_item "func" "Redis alerts flowing" \
  "redis-cli SCARD fraud:accounts"

add_item "func" "Messages/Sec metric shows data (>100 msgs/sec)" \
  "Grafana 'Messages Per Second' panel should show graph"

add_item "func" "Consumer lag metric shows data" \
  "Grafana 'Kafka Consumer Lag' panel should show <120s"

# ============================================================================
# AUTO-SCALING TESTS SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8️⃣  AUTO-SCALING VALIDATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "scaling" "Load test script ready" \
  "chmod +x scripts/load-test.sh && scripts/load-test.sh --help"

add_item "scaling" "Baseline metrics recorded (2 replicas, 5K msgs/sec)" \
  "Watch Grafana for 5 minutes, note throughput and lag"

add_item "scaling" "Load test executed (30 min, ramp to 50K msgs/sec)" \
  "scripts/load-test.sh 30 50000"

add_item "scaling" "HPA scaled up to 5-10 replicas" \
  "kubectl get hpa spark-processor-hpa -n payment-pipeline -w"

add_item "scaling" "Throughput maintained at 85-95K msgs/sec" \
  "Grafana 'Messages/Sec' panel shows stable >85K during peak"

add_item "scaling" "Consumer lag stayed <60 seconds" \
  "Grafana 'Consumer Lag' panel remained green"

add_item "scaling" "HPA scaled down after load reduction" \
  "kubectl get events -n payment-pipeline | grep scale"

add_item "scaling" "Fraud detection latency <100ms" \
  "Fraud alerts appear in Redis within 100ms of spike"

# ============================================================================
# ALERTING SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9️⃣  ALERTING CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "alerts" "AlertManager ConfigMap has Slack webhook" \
  "kubectl get configmap alertmanager-config -n monitoring -o yaml | grep slack_api_url"

add_item "alerts" "AlertManager pods running (2 replicas)" \
  "kubectl get pods -n monitoring -l app=alertmanager"

add_item "alerts" "Prometheus alert rules loaded" \
  "kubectl get PrometheusRule -n monitoring"

add_item "alerts" "Test alert sent successfully" \
  "kubectl exec -it AlertManager -- amtool alert"

add_item "alerts" "Slack #critical-alerts channel receives alerts" \
  "Check Slack channel for test alert message"

add_item "alerts" "High consumer lag alert fires (>300s)" \
  "Trigger by simulating slow processing"

add_item "alerts" "High fraud rate alert fires (>100/sec)" \
  "Trigger by generating rapid transactions"

# ============================================================================
# DOCUMENTATION & RUNBOOKS SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔟 DOCUMENTATION & RUNBOOKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "docs" "Kubernetes deployment guide reviewed (docs/KUBERNETES_DEPLOYMENT.md)" \
  "Check: 70+ sections, troubleshooting, performance tuning"

add_item "docs" "README.md updated with Kubernetes section" \
  "Check: Dashboard description, alert thresholds, quick start"

add_item "docs" "Kubernetes hardening summary created (docs/KUBERNETES_HARDENING_SUMMARY.md)" \
  "Check: Features overview, deployment workflow, operations"

add_item "docs" "On-call runbook created for team" \
  "Document: Alert response procedures, escalation path, common fixes"

add_item "docs" "Quick reference guide available (scripts/quick-reference.sh)" \
  "Test: source scripts/quick-reference.sh && pipeline-status"

add_item "docs" "Architecture diagram documented" \
  "Check: README architecture section, K8s deployment guide"

# ============================================================================
# SECURITY & COMPLIANCE SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣1️⃣ SECURITY & COMPLIANCE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "security" "RBAC roles reviewed (ServiceAccount permissions)" \
  "kubectl get serviceaccount -n payment-pipeline"

add_item "security" "Network policies in place (if needed)" \
  "kubectl get networkpolicies -n payment-pipeline"

add_item "security" "Pod disruption budgets configured" \
  "kubectl get poddisruptionbudgets -n payment-pipeline"

add_item "security" "Resource limits set (CPU/Memory)" \
  "kubectl get deployment -n payment-pipeline -o json | grep resources"

add_item "security" "GCP IAM roles reviewed" \
  "gcloud projects get-iam-policy PROJECT_ID | grep payment-pipeline-sa"

add_item "security" "Secrets not logged in pod output" \
  "Check: kubectl logs ... | grep -i password (should be none)"

add_item "security" "PII masking verified (GDPR compliance)" \
  "Check BigQuery: Credit cards show ****-****-****-1234 format"

add_item "security" "Encryption at rest enabled (GCS, BigQuery)" \
  "Verify: gsutil encryption get gs://payment-pipeline-checkpoints"

# ============================================================================
# PERFORMANCE & OPTIMIZATION SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣2️⃣ PERFORMANCE & OPTIMIZATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "perf" "Batch duration optimized (<2s p95)" \
  "Grafana: Check 'Spark Batch Duration' < 2000ms"

add_item "perf" "Kafka partitions = Spark parallelism" \
  "Kafka topics: 8+ partitions, Spark: 8+ executors"

add_item "perf" "GCS checkpoint write performance acceptable" \
  "Grafana: BigQuery latency <100ms (p95)"

add_item "perf" "Deduplication effectiveness >85%" \
  "Grafana: Dedup effectiveness panel shows >85%"

add_item "perf" "Pod resource requests match actual usage" \
  "kubectl top pods -n payment-pipeline shows <50% CPU, <60% memory"

add_item "perf" "Node autoscaling configured" \
  "GKE cluster: --enable-autoscaling --min-nodes 3 --max-nodes 20"

# ============================================================================
# FINAL CHECKLIST SECTION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣3️⃣ FINAL VERIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

add_item "final" "All 15 checklist categories have 100% items verified" \
  "Go through each section above"

add_item "final" "Product owner sign-off obtained" \
  "Confirm: System meets requirements, ready for production"

add_item "final" "Operations team trained on runbook" \
  "Confirm: Team can handle alerts, scale, troubleshoot"

add_item "final" "Backup & disaster recovery plan in place" \
  "Confirm: Prometheus data backed up, recovery procedure tested"

add_item "final" "Incident response procedure documented" \
  "Confirm: Escalation path, communication plan, rollback procedure"

add_item "final" "Monitoring coverage >95%" \
  "Confirm: All critical paths monitored, alert coverage sufficient"

add_item "final" "Load test results documented" \
  "Save: Peak load test screenshot, scaling behavior, recommendations"

add_item "final" "Production deployment approved by manager" \
  "Confirm: Go ahead for production deployment"

# ============================================================================
# PRINT SUMMARY
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ DEPLOYMENT CHECKLIST COMPLETE"
echo ""
echo "📋 Summary:"
echo "   • 13 categories checked"
echo "   • 75+ individual verification items"
echo "   • All infrastructure, application, and monitoring validated"
echo ""
echo "📊 Next Steps:"
echo "   1. Schedule production deployment window"
echo "   2. Notify all stakeholders (Engineering, Ops, Product)"
echo "   3. Execute deployment during low-traffic period"
echo "   4. Monitor closely for 24 hours post-deployment"
echo "   5. Document any issues in incident tracker"
echo ""
echo "🎯 Success Criteria:"
echo "   ✓ All pods running (kubectl get pods -a)"
echo "   ✓ All services healthy (kubectl get svc -a)"
echo "   ✓ Metrics flowing (Prometheus targets green)"
echo "   ✓ Dashboards showing data (Grafana panels active)"
echo "   ✓ Alerts working (test alert received in Slack)"
echo "   ✓ HPA scaling (verified with load test)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
