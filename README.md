# Rochdale Delivery Routing App

Geocode delivery addresses and assign them to Rochdale delivery zones. Includes a map UI, manual address entry, and QR label scanning for batch sorting.

## Prerequisites

- Node.js 18+ (for native `fetch`)
- A [geocode.maps.co](https://geocode.maps.co/) API key
- Optional: Azure PostgreSQL for manifest logging

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Edit `.env` and set at minimum:

```
GEOCODE_API_KEY=your_key_here
```

4. Optional — enable database logging. Run the migration against your PostgreSQL database:

```bash
psql "host=YOUR_SERVER.postgres.database.azure.com dbname=YOUR_DB user=YOUR_USER sslmode=require" -f migrations/001_delivery_manifests.sql
```

Then set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`.

## Run locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

For auto-restart during development:

```bash
npm run dev
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server and database status |
| `GET` | `/api/zones` | Delivery zone GeoJSON |
| `POST` | `/api/route-delivery` | Geocode address and assign zone |

Example request:

```json
POST /api/route-delivery
{ "address": "OL16 1AB", "source": "qr" }
```

## Project structure

```
public/index.html   Frontend (map, QR scanner)
server.js           Express API and static file server
zones.json          Single source of truth for delivery boundaries
config.js           Environment configuration
migrations/         Database schema
```

## Deployment (Azure App Service)

This app runs as a single Express server (static frontend + API). Use **Azure App Service** for production. The workflow in `.github/workflows/azure-app-service.yml` deploys automatically on pushes to `master`.

### 1. Create the Web App

In the Azure portal (or CLI), create a **Linux Web App**:

- Runtime: **Node 20 LTS**
- Region: same as your PostgreSQL instance (if used)
- Plan: Basic B1 or higher for production

Set the startup command to:

```
npm start
```

(App Service usually detects this from `package.json` automatically.)

### 2. Configure application settings

In the Web App → **Configuration** → **Application settings**, add:

| Setting | Value |
|---------|-------|
| `GEOCODE_API_KEY` | Your geocode.maps.co API key |
| `DB_HOST` | PostgreSQL host (optional) |
| `DB_USER` | Database user (optional) |
| `DB_PASSWORD` | Database password (optional) |
| `DB_NAME` | Database name (optional) |
| `DB_SSL` | `true` |
| `PORT` | Leave unset — App Service sets this automatically |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

Do not commit secrets to the repository. Use App Service configuration or Azure Key Vault references.

### 3. Set up OIDC in Microsoft Entra ID

OIDC lets GitHub Actions deploy without storing a long-lived publish profile. Each workflow run gets a short-lived token scoped to this repository and branch.

#### Option A — Azure Portal

1. Open **Microsoft Entra ID** → **App registrations** → **New registration**
   - Name: `github-delivery-manager-deploy` (or similar)
   - Supported account types: **Single tenant**
   - Register

2. Note the **Application (client) ID** and **Directory (tenant) ID** from the app overview.

3. Open **Certificates & secrets** → **Federated credentials** → **Add credential**
   - Federated credential scenario: **GitHub Actions deploying Azure resources**
   - Organization: `bp134`
   - Repository: `Delivery-Manager`
   - Entity type: **Branch**
   - Branch name: `master`
   - Name: `github-master`

4. Grant the app permission to deploy the Web App:
   - Open your **Web App** → **Access control (IAM)** → **Add role assignment**
   - Role: **Website Contributor**
   - Members: search for the app registration name and select it
   - Save

#### Option B — Azure CLI

Replace the placeholder values, then run:

```bash
APP_REG_NAME="github-delivery-manager-deploy"
WEBAPP_NAME="your-web-app-name"
RESOURCE_GROUP="your-resource-group"
GITHUB_ORG="bp134"
GITHUB_REPO="Delivery-Manager"

APP_ID=$(az ad app create --display-name "$APP_REG_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters "{
    \"name\": \"github-master\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/master\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"

WEBAPP_ID=$(az webapp show --name "$WEBAPP_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)
az role assignment create \
  --assignee "$APP_ID" \
  --role "Website Contributor" \
  --scope "$WEBAPP_ID"

echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)"
```

### 4. Add GitHub secrets

In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**, add:

| Secret | Value |
|--------|-------|
| `AZURE_CLIENT_ID` | Application (client) ID from the app registration |
| `AZURE_TENANT_ID` | Directory (tenant) ID from Microsoft Entra ID |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID |
| `AZURE_WEBAPP_NAME` | Web App name (e.g. `rochdale-delivery-app`) |

You no longer need `AZURE_WEBAPP_PUBLISH_PROFILE`.

### 5. Deploy

Push to `master`, or run the workflow manually from the **Actions** tab.

After deploy, open:

```
https://<your-app-name>.azurewebsites.net
```

Health check:

```
https://<your-app-name>.azurewebsites.net/api/health
```

If the frontend is hosted on a different origin, set `CORS_ORIGIN` in App Service configuration.

**Important:** Rotate any API keys that were previously committed to source control.

## Updating delivery zones

Edit `zones.json` — each feature should include a `properties.name` field. The map and routing logic both read from this file.
