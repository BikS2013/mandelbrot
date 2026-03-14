# Mandelbrot Explorer - Azure Docker Deployment Guide

## 1. Overview

This document describes how to deploy the Mandelbrot Explorer application to Azure using Docker containers. The application is a static web application served by a custom Node.js HTTP server on port **8000**.

---

## 2. Current Docker Configuration

### 2.1 Dockerfile Analysis

The project uses a **multi-stage Docker build** based on `node:20-alpine`:

| Stage | Purpose | Base Image |
|-------|---------|------------|
| **builder** | Installs all dependencies (including devDeps) and compiles TypeScript | `node:20-alpine` |
| **runtime** | Copies compiled output and static assets, installs only production deps | `node:20-alpine` |

**Key parameters extracted from the current setup:**

| Parameter | Value | Source |
|-----------|-------|--------|
| Internal port | `8000` | `serve.js` (hardcoded), `Dockerfile` EXPOSE |
| External port (local) | `8090` | `update-mandelbrot-explorer.sh` (-p 8090:8000) |
| Container name | `mandelbrot-explorer` | `update-mandelbrot-explorer.sh` (--name) |
| Restart policy | `always` | `update-mandelbrot-explorer.sh` (--restart) |
| Host networking | `host.docker.internal:host-gateway` | `update-mandelbrot-explorer.sh` (--add-host) |
| Node.js version | `20` | Dockerfile (node:20-alpine) |
| Entrypoint | `npm run serve` | Dockerfile CMD |

### 2.2 Files Included in the Docker Image

| File/Directory | Purpose |
|----------------|---------|
| `package.json`, `package-lock.json` | Dependency manifest |
| `dist/` | Compiled JavaScript (from builder stage) |
| `index.html` | Main HTML page |
| `serve.js` | HTTP static file server |
| `dev.js` | Development server (not needed in production) |
| `bin/` | CLI entry point |

### 2.3 Files Excluded (.dockerignore)

`node_modules`, `dist`, `.git`, `books`, `*.log`, `.env`, IDE config files.

---

## 3. Azure Deployment Options

### Option A: Azure Container Instances (ACI) - Simplest

Best for: quick deployment, no scaling needed, low cost.

- Single container instance
- Public IP with FQDN
- No load balancer or auto-scaling
- Pay per second of execution

### Option B: Azure App Service (Web App for Containers) - Recommended

Best for: production deployment with managed infrastructure, custom domains, SSL.

- Managed platform with built-in health checks
- Custom domain and free managed SSL
- Deployment slots for blue/green deployments
- Auto-scaling available
- Integrated with Azure Container Registry

### Option C: Azure Kubernetes Service (AKS) - Overkill

Not recommended for this project. AKS is designed for microservice architectures and would add unnecessary complexity for a single static web application.

**Recommended approach: Option B (Azure App Service)**

---

## 4. Prerequisites

### 4.1 Azure CLI

Install and authenticate:

```bash
# Install Azure CLI (macOS)
brew install azure-cli

# Login to Azure
az login

# Verify subscription
az account show
```

### 4.2 Azure Container Registry (ACR)

An ACR instance is required to store the Docker image. If you don't have one:

```bash
# Create a resource group (if needed)
az group create \
  --name rg-mandelbrot \
  --location westeurope

# Create an Azure Container Registry
az acr create \
  --resource-group rg-mandelbrot \
  --name <ACR_NAME> \
  --sku Basic
```

> **`<ACR_NAME>`**: Must be globally unique, 5-50 alphanumeric characters (e.g., `mandelbrotacr`). This becomes your registry URL: `<ACR_NAME>.azurecr.io`.

### 4.3 Docker

Docker Desktop or Docker CLI must be installed and running locally.

---

## 5. Configuration Parameters

### 5.1 Azure Resource Parameters

| Parameter | Description | How to Obtain | Recommended Value | Required |
|-----------|-------------|---------------|-------------------|----------|
| `RESOURCE_GROUP` | Azure resource group name | Create via `az group create` or use existing | `rg-mandelbrot` | Yes |
| `LOCATION` | Azure region for resources | Choose nearest: `az account list-locations -o table` | `westeurope` | Yes |
| `ACR_NAME` | Azure Container Registry name | Create via `az acr create`; must be globally unique | `mandelbrotacr` | Yes |
| `APP_SERVICE_PLAN` | App Service Plan name | Created during deployment | `plan-mandelbrot` | Yes (Option B) |
| `WEB_APP_NAME` | Web App name; becomes the URL `<name>.azurewebsites.net` | Must be globally unique | `mandelbrot-explorer` | Yes (Option B) |
| `ACI_NAME` | Container Instance name | Created during deployment | `mandelbrot-explorer` | Yes (Option A) |

### 5.2 Application Parameters

| Parameter | Value | Where Configured | Notes |
|-----------|-------|------------------|-------|
| `PORT` (internal) | `8000` | Hardcoded in `serve.js` | The Node.js server always listens on 8000 |
| `WEBSITES_PORT` | `8000` | Azure App Service setting | Tells Azure which port the container exposes |
| Docker image tag | `mandelbrot-explorer:latest` | Build command | Use semantic versioning in production |

### 5.3 Priority of Configuration

This application has **no external configuration** (no environment variables, no config files). All settings are hardcoded:

1. The port (`8000`) is hardcoded in `serve.js` line 5
2. There are no database connections, API keys, or external service URLs
3. The application is entirely client-side after the initial HTML/JS is served

> **Note**: If you need to change the internal port in the future, modify `serve.js` and rebuild the Docker image. There is no runtime configuration mechanism.

---

## 6. Deployment Instructions

### 6.1 Option A: Azure Container Instances (ACI)

#### Step 1: Build and Push the Docker Image

```bash
# Login to ACR
az acr login --name <ACR_NAME>

# Build the image locally
docker build -t <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest .

# Push to ACR
docker push <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest
```

Alternatively, build directly in ACR (no local Docker needed):

```bash
az acr build \
  --registry <ACR_NAME> \
  --image mandelbrot-explorer:latest \
  .
```

#### Step 2: Deploy to ACI

```bash
# Enable admin access on ACR (required for ACI)
az acr update --name <ACR_NAME> --admin-enabled true

# Get ACR credentials
ACR_PASSWORD=$(az acr credential show --name <ACR_NAME> --query "passwords[0].value" -o tsv)

# Create the container instance
az container create \
  --resource-group rg-mandelbrot \
  --name mandelbrot-explorer \
  --image <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest \
  --registry-login-server <ACR_NAME>.azurecr.io \
  --registry-username <ACR_NAME> \
  --registry-password "$ACR_PASSWORD" \
  --dns-name-label mandelbrot-explorer \
  --ports 8000 \
  --cpu 1 \
  --memory 1 \
  --os-type Linux \
  --restart-policy Always
```

#### Step 3: Access the Application

```bash
# Get the FQDN
az container show \
  --resource-group rg-mandelbrot \
  --name mandelbrot-explorer \
  --query "ipAddress.fqdn" -o tsv
```

The app will be available at: `http://<fqdn>:8000`

#### ACI Management Commands

```bash
# View logs
az container logs --resource-group rg-mandelbrot --name mandelbrot-explorer

# Restart
az container restart --resource-group rg-mandelbrot --name mandelbrot-explorer

# Stop (stops billing)
az container stop --resource-group rg-mandelbrot --name mandelbrot-explorer

# Delete
az container delete --resource-group rg-mandelbrot --name mandelbrot-explorer --yes
```

---

### 6.2 Option B: Azure App Service (Recommended)

#### Step 1: Build and Push the Docker Image

```bash
# Login to ACR
az acr login --name <ACR_NAME>

# Build the image locally
docker build -t <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest .

# Push to ACR
docker push <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest
```

Or build in ACR directly:

```bash
az acr build \
  --registry <ACR_NAME> \
  --image mandelbrot-explorer:latest \
  .
```

#### Step 2: Create the App Service Plan

```bash
az appservice plan create \
  --name plan-mandelbrot \
  --resource-group rg-mandelbrot \
  --is-linux \
  --sku B1 \
  --location westeurope
```

**SKU options:**

| SKU | vCPU | Memory | Cost (approx.) | Use Case |
|-----|------|--------|-----------------|----------|
| `F1` | Shared | 1 GB | Free | Testing only (no custom containers) |
| `B1` | 1 | 1.75 GB | ~$13/month | Development / low traffic |
| `S1` | 1 | 1.75 GB | ~$70/month | Production with auto-scale |
| `P1v3` | 2 | 8 GB | ~$138/month | High performance |

> **Recommended**: `B1` for personal/demo use, `S1` for production with scaling.

#### Step 3: Create the Web App

```bash
az webapp create \
  --resource-group rg-mandelbrot \
  --plan plan-mandelbrot \
  --name <WEB_APP_NAME> \
  --deployment-container-image-name <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest
```

#### Step 4: Configure ACR Authentication

```bash
# Grant the Web App access to pull from ACR using managed identity
az webapp identity assign \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME>

# Get the principal ID
PRINCIPAL_ID=$(az webapp identity show --resource-group rg-mandelbrot --name <WEB_APP_NAME> --query principalId -o tsv)

# Get ACR resource ID
ACR_ID=$(az acr show --name <ACR_NAME> --query id -o tsv)

# Grant AcrPull role
az role assignment create \
  --assignee "$PRINCIPAL_ID" \
  --role AcrPull \
  --scope "$ACR_ID"

# Configure the Web App to use managed identity for ACR
az webapp config set \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --generic-configurations '{"acrUseManagedIdentityCreds": true}'
```

#### Step 5: Configure the Container Port

```bash
# Tell App Service which port the container listens on
az webapp config appsettings set \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --settings WEBSITES_PORT=8000
```

#### Step 6: Access the Application

The app is available at: `https://<WEB_APP_NAME>.azurewebsites.net`

> App Service provides HTTPS automatically with a managed SSL certificate on the `.azurewebsites.net` domain.

#### App Service Management Commands

```bash
# View container logs
az webapp log tail --resource-group rg-mandelbrot --name <WEB_APP_NAME>

# Restart the app
az webapp restart --resource-group rg-mandelbrot --name <WEB_APP_NAME>

# Stop the app (stops billing for compute)
az webapp stop --resource-group rg-mandelbrot --name <WEB_APP_NAME>

# Start the app
az webapp start --resource-group rg-mandelbrot --name <WEB_APP_NAME>

# Delete the app
az webapp delete --resource-group rg-mandelbrot --name <WEB_APP_NAME>
```

---

## 7. Updating the Deployment

When you make code changes and want to redeploy:

### 7.1 Using Versioned Tags (Recommended)

```bash
# Build with a version tag
docker build -t <ACR_NAME>.azurecr.io/mandelbrot-explorer:v1.1.0 .
docker push <ACR_NAME>.azurecr.io/mandelbrot-explorer:v1.1.0

# Update the Web App to use the new image
az webapp config container set \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --container-image-name <ACR_NAME>.azurecr.io/mandelbrot-explorer:v1.1.0

# Restart to pick up the change
az webapp restart --resource-group rg-mandelbrot --name <WEB_APP_NAME>
```

### 7.2 Using Latest Tag

```bash
# Rebuild and push with :latest
docker build -t <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest .
docker push <ACR_NAME>.azurecr.io/mandelbrot-explorer:latest

# Restart the Web App (it will pull the new :latest)
az webapp restart --resource-group rg-mandelbrot --name <WEB_APP_NAME>
```

### 7.3 Enabling Continuous Deployment (Optional)

Enable webhook-based auto-deploy whenever a new image is pushed to ACR:

```bash
az webapp deployment container config \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --enable-cd true
```

This creates a webhook URL. Register it in ACR:

```bash
# Get the webhook URL
WEBHOOK_URL=$(az webapp deployment container show-cd-url \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --query "CI_CD_URL" -o tsv)

# Create ACR webhook
az acr webhook create \
  --name mandelbrotDeploy \
  --registry <ACR_NAME> \
  --uri "$WEBHOOK_URL" \
  --actions push \
  --scope mandelbrot-explorer:latest
```

Now every `docker push` to `:latest` will automatically trigger a redeployment.

---

## 8. Custom Domain and SSL (Optional)

To use a custom domain instead of `<name>.azurewebsites.net`:

```bash
# Add custom domain
az webapp config hostname add \
  --resource-group rg-mandelbrot \
  --webapp-name <WEB_APP_NAME> \
  --hostname www.yourdomain.com

# Enable free managed SSL certificate
az webapp config ssl create \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --hostname www.yourdomain.com

# Bind the certificate
az webapp config ssl bind \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --certificate-thumbprint <THUMBPRINT> \
  --ssl-type SNI
```

> You must first configure a CNAME record pointing `www.yourdomain.com` to `<WEB_APP_NAME>.azurewebsites.net` at your DNS provider.

---

## 9. Monitoring and Health Checks

### 9.1 Health Check (App Service)

```bash
az webapp config set \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --generic-configurations '{"healthCheckPath": "/"}'
```

This pings the root URL periodically. If it fails, App Service will restart the container.

### 9.2 Enable Application Logging

```bash
az webapp log config \
  --resource-group rg-mandelbrot \
  --name <WEB_APP_NAME> \
  --docker-container-logging filesystem
```

### 9.3 View Logs

```bash
# Stream live logs
az webapp log tail --resource-group rg-mandelbrot --name <WEB_APP_NAME>

# Download log files
az webapp log download --resource-group rg-mandelbrot --name <WEB_APP_NAME>
```

---

## 10. Cost Estimation

| Resource | SKU | Estimated Monthly Cost |
|----------|-----|----------------------|
| Azure Container Registry | Basic | ~$5 |
| App Service Plan (B1) | B1 Linux | ~$13 |
| App Service Plan (S1) | S1 Linux | ~$70 |
| Container Instance (1 vCPU, 1 GB) | N/A | ~$35 (always-on) |
| Custom Domain SSL | Managed (free) | $0 |

> **Cheapest production setup**: ACR Basic + App Service B1 = **~$18/month**

---

## 11. Cleanup

To remove all Azure resources when no longer needed:

```bash
# Delete the entire resource group (removes everything inside it)
az group delete --name rg-mandelbrot --yes --no-wait
```

---

## 12. Quick Reference - Complete Deployment Script

Below is a complete script combining all steps for Option B (App Service). Replace the placeholder values before running.

```bash
#!/bin/bash
set -e

# ============================================
# CONFIGURATION - Replace these values
# ============================================
RESOURCE_GROUP="rg-mandelbrot"
LOCATION="westeurope"
ACR_NAME="mandelbrotacr"          # Must be globally unique
APP_PLAN="plan-mandelbrot"
WEB_APP="mandelbrot-explorer"     # Must be globally unique
IMAGE_TAG="latest"

# ============================================
# 1. Create Resource Group
# ============================================
echo "Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# ============================================
# 2. Create Container Registry
# ============================================
echo "Creating container registry..."
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic

# ============================================
# 3. Build Image in ACR
# ============================================
echo "Building image in ACR..."
az acr build --registry $ACR_NAME --image mandelbrot-explorer:$IMAGE_TAG .

# ============================================
# 4. Create App Service Plan
# ============================================
echo "Creating App Service Plan..."
az appservice plan create \
  --name $APP_PLAN \
  --resource-group $RESOURCE_GROUP \
  --is-linux \
  --sku B1 \
  --location $LOCATION

# ============================================
# 5. Create Web App
# ============================================
echo "Creating Web App..."
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_PLAN \
  --name $WEB_APP \
  --deployment-container-image-name $ACR_NAME.azurecr.io/mandelbrot-explorer:$IMAGE_TAG

# ============================================
# 6. Configure ACR Authentication
# ============================================
echo "Configuring managed identity..."
az webapp identity assign --resource-group $RESOURCE_GROUP --name $WEB_APP

PRINCIPAL_ID=$(az webapp identity show --resource-group $RESOURCE_GROUP --name $WEB_APP --query principalId -o tsv)
ACR_ID=$(az acr show --name $ACR_NAME --query id -o tsv)

az role assignment create --assignee "$PRINCIPAL_ID" --role AcrPull --scope "$ACR_ID"

az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP \
  --generic-configurations '{"acrUseManagedIdentityCreds": true}'

# ============================================
# 7. Configure Port
# ============================================
echo "Configuring container port..."
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP \
  --settings WEBSITES_PORT=8000

# ============================================
# 8. Enable Health Check and Logging
# ============================================
echo "Configuring health check and logging..."
az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP \
  --generic-configurations '{"healthCheckPath": "/"}'

az webapp log config \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP \
  --docker-container-logging filesystem

# ============================================
# Done
# ============================================
echo ""
echo "Deployment complete!"
echo "Application URL: https://$WEB_APP.azurewebsites.net"
echo ""
echo "Useful commands:"
echo "  View logs:    az webapp log tail --resource-group $RESOURCE_GROUP --name $WEB_APP"
echo "  Restart:      az webapp restart --resource-group $RESOURCE_GROUP --name $WEB_APP"
echo "  Stop:         az webapp stop --resource-group $RESOURCE_GROUP --name $WEB_APP"
```

Save this as `deploy-azure.sh` and run with:

```bash
chmod +x deploy-azure.sh
./deploy-azure.sh
```
