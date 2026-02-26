# Kubernetes Deployment Guide: Real-Time Payment Processing Pipeline

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Deployment Steps](#deployment-steps)
4. [Monitoring & Alerting](#monitoring--alerting)
5. [Auto-Scaling Configuration](#auto-scaling-configuration)
6. [Troubleshooting](#troubleshooting)
7. [Performance Tuning](#performance-tuning)

---

## Prerequisites

### Required Tools
- `kubectl` 1.24+ configured with cluster access
- `helm` 3.0+ (for Prometheus Operator)
- Docker images pushed to registry:
  - `gcr.io/payment-project/spark-processor:latest`
  - `gcr.io/payment-project/data-collector:latest`
  - `gcr.io/payment-project/dashboard:latest`

### Cluster Requirements
- Kubernetes 1.24+ cluster
- Minimum 6 nodes (3 for core, 3 for scaling headroom)
- Node machine type: GKE `n1-standard-4` (4 vCPU, 15GB RAM) minimum
- Storage: 100GB persistent volume support
- Network: Ingress controller installed (for dashboard access)

### GCP Setup (if using GKE)
```bash
# Create GKE cluster with autoscaling
gcloud container clusters create payment-pipeline \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-4 \
  --enable-autoscaling \
  --min-nodes 3 \
  --max-nodes 10 \
  --enable-stackdriver-kubernetes \
  --enable-ip-alias

# Get credentials
gcloud container clusters get-credentials payment-pipeline --zone us-central1-a
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Data Collector Pod (2 replicas)                     │      │
│  │  - Simulates payment transactions                    │      │
│  │  - Sends to Kafka at configurable rate              │      │
│  │  - Memory: 512Mi, CPU: 200m                          │      │
│  └────────────────────┬─────────────────────────────────┘      │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Apache Kafka (Managed Service)                      │      │
│  │  - 3 brokers, 3+ partitions for parallelism         │      │
│  │  - Replication factor: 3                             │      │
│  └────────────────────┬─────────────────────────────────┘      │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Spark Streaming Processor (2-20 replicas, HPA)     │      │
│  │  - Consumes from Kafka                              │      │
│  │  - Sliding window fraud detection (60s windows)     │      │
│  │  - PII masking & deduplication                       │      │
│  │  - Per replica: Memory: 4Gi, CPU: 2                  │      │
│  │  - Checkpoints to GCS for fault tolerance            │      │
│  │  - Alerts to Redis (<100ms latency)                  │      │
│  └────────────────────┬─────────────────────────────────┘      │
│                       │                                         │
│           ┌───────────┼───────────┐                            │
│           ▼           ▼           ▼                            │
│    ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│    │  BigQuery  │ │   Redis    │ │   Redis    │               │
│    │ Transactions│ │  Fraud     │ │  Dedup     │               │
│    │   Table    │ │  Alerts    │ │   Cache    │               │
│    └────────────┘ └────────────┘ └────────────┘               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Monitoring Stack (Namespace: monitoring)            │      │
│  │  ┌────────────────────────────────────────────┐      │      │
│  │  │  Prometheus (Storage: 50Gi PVC)            │      │      │
│  │  │  - Scrapes all pods every 15s              │      │      │
│  │  │  - Retention: 30 days                       │      │      │
│  │  │  - Alert rules: 10 critical + 5 warnings   │      │      │
│  │  └────────────────────────────────────────────┘      │      │
│  │  ┌────────────────────────────────────────────┐      │      │
│  │  │  Grafana (3 replicas, HA)                  │      │      │
│  │  │  - Dashboard: 14 visualization panels      │      │      │
│  │  │  - Access: http://grafana:3000             │      │      │
│  │  │  - Default creds: admin/PaymentProcessing@2026  │      │
│  │  └────────────────────────────────────────────┘      │      │
│  │  ┌────────────────────────────────────────────┐      │      │
│  │  │  AlertManager (2 replicas)                 │      │      │
│  │  │  - Routes alerts to Slack/PagerDuty        │      │      │
│  │  │  - Deduplication & grouping                │      │      │
│  │  └────────────────────────────────────────────┘      │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  Dashboard UI (2 replicas)                           │      │
│  │  - React/Next.js frontend                            │      │
│  │  - Port: 80 (internal), 443 (ingress)               │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment Steps

### Step 1: Create Namespaces

```bash
# Create namespaces
kubectl create namespace payment-pipeline
kubectl create namespace monitoring

# Label namespaces for monitoring
kubectl label namespace payment-pipeline monitoring=enabled
kubectl label namespace monitoring monitoring=enabled

# Verify
kubectl get namespaces
```

### Step 2: Create GCP Service Account & Secrets

```bash
# Create GCP service account
gcloud iam service-accounts create payment-pipeline-sa \
  --display-name="Payment Pipeline Service Account"

# Grant BigQuery permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:payment-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"

# Grant GCS permissions (for Spark checkpoints)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:payment-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create /tmp/gcp-key.json \
  --iam-account=payment-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com

# Create Kubernetes secret
kubectl create secret generic gcp-credentials \
  --from-file=/tmp/gcp-key.json \
  -n payment-pipeline

# Clean up
rm /tmp/gcp-key.json
```

### Step 3: Install Prometheus Operator (using Helm)

```bash
# Add Prometheus Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus Operator (CRDs + operator)
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values k8s/prometheus-helm-values.yaml

# Wait for operator to be ready
kubectl wait --for=condition=available --timeout=300s \
  deployment/prometheus-operator -n monitoring
```

### Step 4: Deploy Monitoring Stack

```bash
# Deploy Prometheus configuration
kubectl apply -f k8s/prometheus-config.yaml

# Deploy AlertManager
kubectl apply -f k8s/alertmanager.yaml

# Deploy Grafana
kubectl apply -f k8s/grafana-dashboard.yaml

# Wait for all monitoring pods to be ready
kubectl wait --for=condition=ready pod \
  -l app=prometheus -n monitoring --timeout=300s
kubectl wait --for=condition=ready pod \
  -l app=grafana -n monitoring --timeout=300s
```

### Step 5: Deploy Application

```bash
# Create ConfigMap for Spark config
kubectl create configmap spark-config \
  --from-literal=batch_duration=5s \
  --from-literal=watermark_delay=10s \
  -n payment-pipeline

# Deploy data collector
kubectl apply -f k8s/data-collector-deployment.yaml

# Deploy Spark streaming processor
kubectl apply -f k8s/spark-deployment.yaml

# Deploy HPA
kubectl apply -f k8s/spark-hpa.yaml

# Deploy dashboard UI
kubectl apply -f k8s/dashboard-deployment.yaml

# Verify all pods are running
kubectl get pods -n payment-pipeline
kubectl get pods -n monitoring
```

### Step 6: Verify Deployment

```bash
# Check all pods
kubectl get pods -A

# Check services
kubectl get svc -n payment-pipeline
kubectl get svc -n monitoring

# Check HPA status
kubectl get hpa -n payment-pipeline
kubectl describe hpa spark-processor-hpa -n payment-pipeline

# Check Prometheus targets
kubectl port-forward svc/prometheus-kube-prom-prometheus 9090:9090 -n monitoring
# Visit http://localhost:9090/targets

# Check Grafana
kubectl port-forward svc/grafana 3000:80 -n monitoring
# Visit http://localhost:3000 (admin/PaymentProcessing@2026)
```

---

## Monitoring & Alerting

### Accessing Grafana Dashboard

```bash
# Port-forward to access Grafana locally
kubectl port-forward svc/grafana 3000:80 -n monitoring

# Or create an Ingress (if configured):
# URL: https://grafana.payment-pipeline.example.com
```

**Default Credentials:**
- Username: `admin`
- Password: `PaymentProcessing@2026`

### Dashboard Panels (14 Total)

| Panel | Metric | Threshold | Alert |
|-------|--------|-----------|-------|
| Messages/Sec | `spark_streaming_processed_records_total` rate | N/A | <5K: Warning |
| Consumer Lag | `kafka_consumer_lag_seconds` | <60s (green), >120s (yellow), >300s (red) | >300s: Critical |
| Batch Duration | `spark_streaming_batchDuration_ms` p95 | <2s (green), <5s (yellow) | >5s: Warning |
| Fraud Alerts | `fraud_velocity_alerts_total` rate | N/A | >100/sec: Critical |
| Active Fraud Accounts | Redis SCARD | N/A | N/A |
| Redis Memory | `redis_memory_used_bytes` / max | <50% (green), <80% (yellow) | >90%: Critical |
| Dedup Effectiveness | Dedup ratio | Target: >85% | <85%: Warning |
| CPU Usage | `container_cpu_usage_seconds_total` | Target: <50% | >70%: Scale up |
| Memory Usage | `container_memory_usage_bytes` | Target: <60% | >80%: Scale up |
| HPA Status | Current replicas vs desired | 2-20 range | At max: Warning |
| BigQuery Latency | Write latency p95 | <100ms target | >500ms: Warning |
| System Status | Job health indicators | All green | Any red: Alert |

### Alert Configuration

#### Critical Alerts (Immediate Action Required)
- Consumer lag > 300 seconds
- Executor failures > 5/sec
- Fraud detection rate > 100 alerts/sec
- Redis memory > 90%
- HPA at max replicas

#### Warning Alerts (Scale or Investigate)
- Consumer lag > 120 seconds
- Processing backlog > 100K records
- Throughput < 5K msgs/sec
- CPU throttling detected
- Dedup effectiveness < 85%

#### Slack Integration

```bash
# Create AlertManager secret with Slack webhook
kubectl create secret generic alertmanager-slack \
  --from-literal=webhook_url='https://hooks.slack.com/services/YOUR/WEBHOOK/URL' \
  -n monitoring

# Update AlertManager ConfigMap with webhook URL
# Reference: k8s/alertmanager.yaml line 2
```

---

## Auto-Scaling Configuration

### HPA Details

```yaml
# HPA spec (from k8s/spark-hpa.yaml)
Metrics:
  - CPU: 70% target utilization
  - Memory: 80% target utilization
  - Consumer Lag: >60 seconds (scale by 5 replicas per minute)
  - Throughput: >10K msgs/sec (scale by 2 replicas per minute)

Behavior:
  Scale Up: 100% every 30 seconds (aggressive for spike handling)
  Scale Down: 50% every 60 seconds (conservative to avoid thrashing)

Replicas:
  Min: 2 (always-on baseline)
  Max: 20 (cluster capacity limit)
```

### Simulating Load Spike (Black Friday)

```bash
# Port-forward data-collector to increase message rate
kubectl port-forward svc/data-collector 5000:5000 -n payment-pipeline

# In another terminal, increase production rate:
curl -X POST http://localhost:5000/config/rate \
  -H "Content-Type: application/json" \
  -d '{"messages_per_second": 50000}'

# Watch HPA scale up in real-time
watch kubectl get hpa spark-processor-hpa -n payment-pipeline

# Expected behavior:
# - Consumer lag increases → HPA scales to 5 replicas
# - Throughput increases → HPA scales to 10 replicas
# - CPU usage increases → HPA scales to 15 replicas
# - System stabilizes at 10-15 replicas with <60s lag
```

### HPA Status Monitoring

```bash
# View HPA metrics
kubectl get hpa spark-processor-hpa -n payment-pipeline -w

# Detailed HPA status
kubectl describe hpa spark-processor-hpa -n payment-pipeline

# View scaling events
kubectl get events -n payment-pipeline --sort-by='.lastTimestamp' | grep HPA
```

---

## Troubleshooting

### Issue 1: HPA Not Scaling

**Symptoms:** HPA reports `unknown` for metrics

**Diagnosis:**
```bash
# Check HPA status
kubectl describe hpa spark-processor-hpa -n payment-pipeline

# Check metrics available
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1/namespaces/payment-pipeline/pods/*/spark_streaming_processed_records_total
```

**Solution:**
- Ensure metrics-server is installed: `kubectl get deployment metrics-server -n kube-system`
- Verify ServiceMonitor is created: `kubectl get servicemonitor -n payment-pipeline`
- Check Prometheus scraping: Visit Prometheus UI → Status → Targets

### Issue 2: High Consumer Lag

**Symptoms:** Kafka lag > 120 seconds, messages queuing up

**Diagnosis:**
```bash
# Check Spark pod status
kubectl describe pod -l app=spark-processor -n payment-pipeline

# Check Spark logs
kubectl logs -f deployment/spark-processor -n payment-pipeline --tail=100

# Check Kafka consumer group lag
kafka-consumer-groups --bootstrap-server kafka:9092 \
  --group payment-processor-group --describe
```

**Solution:**
1. Increase Spark executor memory: Edit `k8s/spark-deployment.yaml` (executor.memory)
2. Increase parallelism: Adjust Kafka partitions (must > Spark tasks)
3. Enable adaptive query execution (Spark 3.3+)
4. Check GCS checkpoint performance (network latency, I/O)

### Issue 3: Prometheus Out of Storage

**Symptoms:** Prometheus pod crashes with `disk full` error

**Diagnosis:**
```bash
# Check PVC usage
kubectl get pvc -n monitoring

# Check Prometheus pod logs
kubectl logs -f deployment/prometheus -n monitoring
```

**Solution:**
1. Increase retention policy (currently 30 days): Edit `k8s/prometheus-deployment.yaml`
2. Increase PVC size: Delete PVC and redeploy with larger size
3. Enable compression: Add `walCompression: true` (already enabled)
4. Reduce cardinality (fewer unique label combinations)

### Issue 4: Grafana Dashboard Not Updating

**Symptoms:** Panels show "No data" or old data

**Diagnosis:**
```bash
# Test Prometheus connectivity from Grafana
kubectl exec -it deployment/grafana -n monitoring -- \
  curl http://prometheus:9090/api/v1/query?query=up
```

**Solution:**
1. Verify Prometheus datasource is configured: Grafana → Configuration → Data Sources
2. Check Prometheus scraping targets: http://prometheus:9090/targets
3. Verify metrics are being collected: http://prometheus:9090/api/v1/query?query=up
4. Restart Grafana: `kubectl rollout restart deployment/grafana -n monitoring`

### Issue 5: Fraud Alerts Not Reaching Redis

**Symptoms:** Redis memory usage stuck at baseline, no fraud alerts

**Diagnosis:**
```bash
# Check Redis connection from Spark
kubectl exec -it deployment/spark-processor -n payment-pipeline -- \
  redis-cli -h redis ping

# Check Redis keys
redis-cli keys 'fraud:*'

# Check Spark logs for errors
kubectl logs -f deployment/spark-processor -n payment-pipeline | grep -i redis
```

**Solution:**
1. Verify Redis service DNS: `redis.payment-pipeline.svc.cluster.local`
2. Check Redis credentials in Spark deployment spec
3. Verify Spark code: `spark/payment_processor.py` detect_velocity_fraud() function
4. Check network policy allows Spark → Redis traffic

### Issue 6: Dashboard UI Not Accessible

**Symptoms:** Cannot reach dashboard UI from browser

**Diagnosis:**
```bash
# Check dashboard pod status
kubectl get pods -l app=dashboard -n payment-pipeline

# Check dashboard service
kubectl get svc dashboard -n payment-pipeline

# Test dashboard connectivity
kubectl port-forward svc/dashboard 8080:80 -n payment-pipeline
# Visit http://localhost:8080
```

**Solution:**
1. Verify Ingress configuration points to dashboard service
2. Check SSL certificate if using HTTPS
3. Verify pod has started successfully: `kubectl logs deployment/dashboard -n payment-pipeline`
4. Check resource constraints: `kubectl describe pod -l app=dashboard -n payment-pipeline`

---

## Performance Tuning

### Spark Configuration Optimization

```yaml
# Optimal settings for 10K-100K msgs/sec throughput

spark:
  streaming:
    kafka:
      maxRatePerPartition: 100000  # Per partition rate limit
    batchSize: 5s  # 5-second micro-batches
    watermarkDelay: 10s  # 10-second allowed lateness
    backpressure:
      enabled: true
      initialRate: 100000

  # Executor tuning (per replica)
  executor:
    memory: "4g"
    cores: 2
    memoryOverhead: "1g"

  # Driver tuning
  driver:
    memory: "4g"
    maxResultSize: "1g"

  # Shuffle settings
  shuffle:
    compress: true
    spill:
      compress: true
    service:
      port: 7337

  # SQL settings
  sql:
    adaptive:
      enabled: true
      skewJoin:
        enabled: true
        skewFactor: 5.0
```

### Kubernetes Resource Tuning

```yaml
# Per Spark pod resource allocation (current: optimal for 100K msgs/sec)
resources:
  requests:
    cpu: 2  # 2 CPU cores
    memory: 4Gi  # 4GB RAM
  limits:
    cpu: 2.5
    memory: 5Gi

# For higher throughput (1M+ msgs/sec):
resources:
  requests:
    cpu: 4
    memory: 8Gi
  limits:
    cpu: 5
    memory: 10Gi

# For lower throughput (<10K msgs/sec):
resources:
  requests:
    cpu: 1
    memory: 2Gi
  limits:
    cpu: 1.5
    memory: 3Gi
```

### BigQuery Write Optimization

```python
# In spark/payment_processor.py
query = (
    payment_df
    .writeStream
    .format("bigquery")
    .option("table", "payment_dataset.payment_transactions")
    .option("dataset", "payment_dataset")
    .option("checkpointLocation", "gs://pipeline-checkpoints/payment-processor")
    .option("enableListInference", "true")  # Auto-detect LIST types
    .option("maxFilesPerTrigger", 10)  # Batch optimization
    .option("maxBytesPerTrigger", "100m")  # ~100MB per batch
    .option("partitionByFlushIntervalMs", 5000)  # 5s partition flush
    .start()
)
```

### Monitoring Metrics to Watch

| Metric | Target | Red Flag |
|--------|--------|----------|
| Consumer Lag | <60s | >300s |
| Batch Duration | <2s (p95) | >5s |
| Throughput | 85K-95K msgs/sec | <5K |
| Dedup Effectiveness | >95% | <85% |
| Pod CPU | 40-60% | >80% |
| Pod Memory | 50-70% | >85% |
| Fraud Detection Rate | <50 alerts/sec | >100 |
| Redis Memory | <500MB | >900MB |
| BigQuery Write Latency | <100ms (p95) | >500ms |
| Executor Failures | 0 | >0 for >1 min |

---

## Production Deployment Checklist

- [ ] GKE cluster provisioned with 6+ nodes
- [ ] GCP service accounts created with BigQuery/GCS permissions
- [ ] Docker images built and pushed to registry
- [ ] Prometheus Operator installed via Helm
- [ ] Monitoring namespace created and labeled
- [ ] Prometheus, AlertManager, Grafana deployed
- [ ] Slack webhook configured for alerts
- [ ] Spark deployment running with 2 initial replicas
- [ ] HPA configured and metrics showing in Prometheus
- [ ] Grafana dashboard accessible with all 14 panels showing data
- [ ] Load test passed: Spike from 1K to 50K msgs/sec handled gracefully
- [ ] Scaling verified: HPA scales from 2 to 10+ replicas under load
- [ ] Fraud detection working: Velocity alerts flowing to Redis
- [ ] BigQuery writes validated: Transactions and fraud tables populated
- [ ] Alerts tested: Slack notifications received on critical events
- [ ] Runbook created for on-call engineers
- [ ] Documentation updated with dashboard URLs and credentials
- [ ] Backup strategy defined for Prometheus data
- [ ] Network policies reviewed and applied
- [ ] Log aggregation configured (Stackdriver or ELK)

---

## Additional Resources

- [Kubernetes Auto-scaling Documentation](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Prometheus Operator Documentation](https://prometheus-operator.dev/)
- [Grafana Dashboard Documentation](https://grafana.com/docs/)
- [Spark Structured Streaming Tuning](https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html#where-to-go-from-here)
- [BigQuery Spark Connector](https://cloud.google.com/dataproc/docs/concepts/connectors/bigquery-connector)
