#!/bin/bash

# This script deploys the entire data pipeline to production

# Exit on error
set -e

echo "Deploying Real-Time Stock Market Data Pipeline..."

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting."; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed. Aborting."; exit 1; }

# Load environment variables
if [ -f .env ]; then
  source .env
else
  echo "Error: .env file not found. Create one based on .env.example"
  exit 1
fi

# Validate required environment variables
if [ -z "$FINNHUB_API_KEY" ]; then
  echo "Error: FINNHUB_API_KEY environment variable is required"
  exit 1
fi

if [ -z "$BIGQUERY_PROJECT" ]; then
  echo "Error: BIGQUERY_PROJECT environment variable is required"
  exit 1
fi

# Build Docker images
echo "Building Docker images..."
docker build -t stock-market-data-collector:latest ./data-collector
docker build -t stock-market-spark-processor:latest ./spark
docker build -t stock-market-dashboard:latest ./dashboard

# Tag images for the registry
REGISTRY=${DOCKER_REGISTRY:-"localhost:5000"}
docker tag stock-market-data-collector:latest $REGISTRY/stock-market-data-collector:latest
docker tag stock-market-spark-processor:latest $REGISTRY/stock-market-spark-processor:latest
docker tag stock-market-dashboard:latest $REGISTRY/stock-market-dashboard:latest

# Push images to registry
echo "Pushing Docker images to registry..."
docker push $REGISTRY/stock-market-data-collector:latest
docker push $REGISTRY/stock-market-spark-processor:latest
docker push $REGISTRY/stock-market-dashboard:latest

# Deploy to Kubernetes
echo "Deploying to Kubernetes..."
export DOCKER_REGISTRY=$REGISTRY

# Create secrets
kubectl create secret generic finnhub-credentials \
  --from-literal=api-key=$FINNHUB_API_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic gcp-credentials \
  --from-file=service-account.json=./credentials/service-account.json \
  --from-literal=project-id=$BIGQUERY_PROJECT \
  --dry-run=client -o yaml | kubectl apply -f -

# Create persistent volume claim for Spark checkpoint
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: spark-checkpoint-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
EOF

# Apply Kubernetes manifests
envsubst &lt; k8s/data-collector-deployment.yaml | kubectl apply -f -
envsubst &lt; k8s/spark-deployment.yaml | kubectl apply -f -
envsubst &lt; k8s/dashboard-deployment.yaml | kubectl apply -f -

echo "Deployment completed successfully!"
echo "Access the dashboard at: http://$(kubectl get svc dashboard -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
