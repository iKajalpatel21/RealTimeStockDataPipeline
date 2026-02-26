# Production Deployment Checklist

## 1️⃣ Infrastructure Setup (6 items)
- [ ] GKE cluster provisioned (6+ nodes, n1-standard-4)
- [ ] kubectl configured and authenticated
- [ ] Kubernetes version 1.24+
- [ ] Storage class available
- [ ] Ingress controller installed
- [ ] Helm 3.0+ installed

## 2️⃣ GCP Configuration (6 items)
- [ ] GCP service account created
- [ ] BigQuery permissions granted
- [ ] GCS permissions granted
- [ ] Service account key created
- [ ] BigQuery datasets created
- [ ] GCS bucket created for checkpoints

## 3️⃣ Namespaces & Secrets (5 items)
- [ ] Namespaces created (payment-pipeline, monitoring)
- [ ] Namespaces labeled for monitoring
- [ ] GCP credentials secret created
- [ ] Slack webhook secret created
- [ ] BigQuery credentials verified

## 4️⃣ Monitoring Stack (9 items)
- [ ] Prometheus Operator Helm repo added
- [ ] Prometheus Operator installed via Helm
- [ ] Prometheus custom config deployed
- [ ] Prometheus pod running
- [ ] AlertManager deployed
- [ ] AlertManager pod running
- [ ] Grafana deployed
- [ ] Grafana accessible (port 3000)
- [ ] Prometheus targets are healthy

## 5️⃣ Application Deployment (8 items)
- [ ] Docker images pushed to registry
- [ ] ConfigMap created for Spark settings
- [ ] Data Collector deployed
- [ ] Data Collector pod running
- [ ] Spark processor deployed
- [ ] Spark processor pod running (2 initial replicas)
- [ ] HPA created and active
- [ ] HPA metrics available

## 6️⃣ Connectivity Tests (6 items)
- [ ] Kafka connectivity verified
- [ ] BigQuery connectivity verified
- [ ] Redis connectivity verified
- [ ] Prometheus metrics collected
- [ ] Grafana data flowing
- [ ] Spark logs accessible

## 7️⃣ Functionality Tests (7 items)
- [ ] Data flowing to BigQuery
- [ ] Transactions table populated (>1000 rows)
- [ ] PII masking verified
- [ ] Fraud detection triggering
- [ ] Redis alerts flowing
- [ ] Messages/Sec metric shows data
- [ ] Consumer lag metric shows data

## 8️⃣ Auto-Scaling Validation (8 items)
- [ ] Load test script ready
- [ ] Baseline metrics recorded
- [ ] Load test executed (30 min, 50K msgs/sec)
- [ ] HPA scaled up to 5-10 replicas
- [ ] Throughput maintained (85-95K msgs/sec)
- [ ] Consumer lag stayed <60 seconds
- [ ] HPA scaled down after load reduction
- [ ] Fraud detection latency <100ms

## 9️⃣ Alerting Configuration (7 items)
- [ ] AlertManager ConfigMap has Slack webhook
- [ ] AlertManager pods running (2 replicas)
- [ ] Prometheus alert rules loaded
- [ ] Test alert sent successfully
- [ ] Slack receives alerts
- [ ] High consumer lag alert fires (>300s)
- [ ] High fraud rate alert fires (>100/sec)

## 🔟 Documentation & Runbooks (6 items)
- [ ] Kubernetes deployment guide reviewed
- [ ] README.md updated with Kubernetes section
- [ ] Kubernetes hardening summary created
- [ ] On-call runbook created for team
- [ ] Quick reference guide tested
- [ ] Architecture diagram documented

## 1️⃣1️⃣ Security & Compliance (8 items)
- [ ] RBAC roles reviewed
- [ ] Network policies in place
- [ ] Pod disruption budgets configured
- [ ] Resource limits set
- [ ] GCP IAM roles reviewed
- [ ] Secrets not logged in output
- [ ] PII masking verified (GDPR compliance)
- [ ] Encryption at rest enabled

## 1️⃣2️⃣ Performance & Optimization (6 items)
- [ ] Batch duration optimized (<2s p95)
- [ ] Kafka partitions = Spark parallelism
- [ ] GCS checkpoint performance acceptable
- [ ] Deduplication effectiveness >85%
- [ ] Pod resources match actual usage
- [ ] Node autoscaling configured

## 1️⃣3️⃣ Final Verification (8 items)
- [ ] All 12 checklist categories 100% complete
- [ ] Product owner sign-off obtained
- [ ] Operations team trained
- [ ] Backup & disaster recovery plan in place
- [ ] Incident response procedure documented
- [ ] Monitoring coverage >95%
- [ ] Load test results documented
- [ ] Production deployment approved

---

## Summary

**Total Items:** 75+
**Status:** Ready for production deployment

**Success Criteria:**
✓ All pods running
✓ All services healthy
✓ Metrics flowing
✓ Dashboards active
✓ Alerts working
✓ HPA scaling verified

**Next Steps:**
1. Complete all checklist items
2. Schedule deployment window
3. Execute deployment
4. Monitor for 24 hours post-deployment
5. Document any issues
