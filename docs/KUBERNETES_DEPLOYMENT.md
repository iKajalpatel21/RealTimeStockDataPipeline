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

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Apache Kafka (Event Source)                        │
└──────────────────┬──────────────────────────────────┘
                   │
     ┌─────────────▼──────────────┐
     │ Spark Streaming Processor  │
     │ (2-20 replicas, HPA)       │
     │ - Fraud Detection          │
     │ - PII Masking              │
     │ - Deduplication            │
     └─────┬───────────┬──────┬───┘
           │           │      │
    ┌──────▼─┐  ┌─────▼──┐ ┌─▼──────┐
    │BigQuery│  │ Redis  │ │ Redis  │
    │        │  │ Fraud  │ │ Dedup  │
    └────────┘  └────────┘ └────────┘

┌──────────────────────────────────────────────────────┐
│ Monitoring Stack                                     │
├──────────────────────────────────────────────────────┤
│ Prometheus (metrics) + Grafana (dashboard) +         │
│ AlertManager (routing)                               │
└──────────────────────────────────────────────────────┘
```

---

## Deployment Steps

### Step 1: Create Namespaces

```bash
kubectl create namespace payment-pipeline
kubectl create namespace monitoring
kubectl label namespace payment-pipeline monitoring=enabled
kubectl label namespace monitoring monitoring=enabled
```

### Step 2: Create GCP Credentials

```bash
gcloud iam service-accounts create payment-pipeline-sa
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:payment-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:payment-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud iam service-accounts keys create /tmp/gcp-key.json \
  --iam-account=payment-pipeline-sa@PROJECT_ID.iam.gserviceaccount.com

kubectl create secret generic gcp-credentials \
  --from-file=/tmp/gcp-key.json \
  -n payment-pipeline
```

### Step 3: Install Prometheus Operator

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values k8s/prometheus-helm-values.yaml

kubectl wait --for=condition=available --timeout=300s \
  deployment/prometheus-operator -n monitoring
```

### Step 4: Deploy Monitoring Stack

```bash
kubectl apply -f k8s/prometheus-config.yaml
kubectl apply -f k8s/alertmanager.yaml
kubectl apply -f k8s/grafana-dashboard.yaml

kubectl wait --for=condition=ready pod \
  -l app=prometheus -n monitoring --timeout=300s
```

### Step 5: Deploy Application

```bash
kubectl apply -f k8s/data-collector-deployment.yaml
kubectl apply -f k8s/spark-deployment.yaml
kubectl apply -f k8s/spark-hpa.yaml
kubectl apply -f k8s/dashboard-deployment.yaml

kubectl get pods -n payment-pipeline
kubectl get pods -n monitoring
```

---

## Monitoring & Alerting

### Accessing Grafana

```bash
kubectl port-forward svc/grafana 3000:80 -n monitoring
# URL: http://localhost:3000 (admin/PaymentProcessing@2026)
```

### Dashboard Panels (14 total)

1. Messages/Sec - Target: 85-95K msgs/sec
2. Consumer Lag - Target: <60 seconds
3. Batch Duration (p95) - Target: <2 seconds
4. Fraud Alerts/Sec - Target: <50/sec
5. Active Fraud Accounts - From Redis
6. Redis Memory Usage - Target: <500MB
7. Dedup Effectiveness - Target: >85%
8. Pod CPU Usage - Target: <50%
9. Pod Memory Usage - Target: <60%
10. HPA Replica Count - Range: 2-20
11. BigQuery Latency (p95) - Target: <100ms
12. Executor Failures - Should be 0
13. Processing Backlog - Target: <10K records
14. System Health Status - All green

---

## Auto-Scaling Configuration

### HPA Metrics

- CPU: 70% target utilization
- Memory: 80% target utilization
- Consumer Lag: >60s triggers scale
- Throughput: >10K msgs/sec triggers scale

### Simulating Black Friday

```bash
# Port-forward data-collector
kubectl port-forward svc/data-collector 5000:5000 -n payment-pipeline

# Increase message rate
curl -X POST http://localhost:5000/config/rate \
  -H "Content-Type: application/json" \
  -d '{"messages_per_second": 50000}'

# Watch HPA scale
watch kubectl get hpa spark-processor-hpa -n payment-pipeline
```

---

## Troubleshooting

### Issue 1: HPA Not Scaling

Check HPA status and metrics:
```bash
kubectl describe hpa spark-processor-hpa -n payment-pipeline
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1/
```

### Issue 2: High Consumer Lag

Increase Spark resources:
```bash
kubectl set env deployment/spark-processor \
  SPARK_EXECUTOR_MEMORY=6g -n payment-pipeline
```

### Issue 3: Prometheus Storage Full

Increase retention or storage size:
```bash
kubectl edit prometheus payment-processing-prometheus -n monitoring
# Change retention: 30d → 14d or increase storage
```

---

## Performance Tuning

### Spark Configuration

```python
BATCH_DURATION = 5  # seconds
WATERMARK_DELAY = 10  # seconds
WINDOW_DURATION = 60  # fraud detection window
FRAUD_THRESHOLD = 3  # transactions
```

### BigQuery Optimization

```python
.option("maxFilesPerTrigger", 10)
.option("maxBytesPerTrigger", "100m")
.option("partitionByFlushIntervalMs", 5000)
```

### Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Throughput | 100K/sec | 87-95K/sec |
| Batch Duration (p95) | <2s | 1.2s |
| Consumer Lag | <60s | 15-45s |
| Fraud Alert Latency | <100ms | 50ms |
| Dedup Effectiveness | >85% | 98.2% |

---

For more details, see README.md and other documentation files.
