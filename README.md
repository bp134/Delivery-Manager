# Rochdale Delivery Routing App

Geocode delivery addresses and assign them to Rochdale delivery zones. Includes a map UI, manual address entry, and QR label scanning for batch sorting.

## Architecture

This app uses a **hybrid UK hosting model**:

| Layer | Provider | Region | Role |
|-------|----------|--------|------|
| **App & API** | Vercel | London (`lhr1`) | Frontend, serverless API, geocoding |
| **Database** | Azure PostgreSQL | UK South (London) | Manifest logging (`delivery_manifests`) |

Azure hosts the database in London but cannot currently provide additional compute hosting (e.g. App Service) in London or Europe to meet requirements. Vercel fills that gap with London-region serverless functions while data at rest stays in your existing Azure PostgreSQL instance.

## Prerequisites

- Node.js 18+
- A [geocode.maps.co](https://geocode.maps.co/) API key
- Azure PostgreSQL Flexible Server in **UK South (London)** (optional, for manifest logging)

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

4. Optional — enable database logging. Run the migration against your Azure PostgreSQL database:

```bash
psql "host=YOUR_SERVER.postgres.database.azure.com dbname=YOUR_DB user=YOUR_USER sslmode=require" -f migrations/001_delivery_manifests.sql
```

Then set the `DB_*` variables in `.env` (see `.env.example`).

## Run locally

**Express (simple local server):**

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

**Vercel dev (matches production serverless behaviour):**

```bash
npx vercel dev
```

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
public/index.html      Frontend (map, QR scanner)
api/                   Vercel serverless API routes
lib/                   Shared routing, zone matching, database logic
server.js              Local Express server (development)
zones.json             Single source of truth for delivery boundaries
config.js              Environment configuration
vercel.json            Vercel config (London region)
migrations/            Database schema
```

## Deployment (Vercel)

The frontend is served from `public/` and the API runs as serverless functions in `api/`.

### 1. Connect the repository

1. Sign in at [vercel.com](https://vercel.com)
2. **Add New Project** → import your GitHub repository
3. Vercel auto-detects the project — no build command needed

### 2. London region

`vercel.json` pins serverless functions to **`lhr1` (London)**:

```json
{
  "regions": ["lhr1"]
}
```

This keeps API execution in the UK, close to your Azure PostgreSQL instance in London.

### 3. Environment variables

In the Vercel project → **Settings** → **Environment Variables**, add:

| Variable | Required | Notes |
|----------|----------|-------|
| `GEOCODE_API_KEY` | Yes | geocode.maps.co API key |
| `DB_HOST` | No | Azure PostgreSQL host (`*.postgres.database.azure.com`) |
| `DB_USER` | No | Database admin user |
| `DB_PASSWORD` | No | Database password |
| `DB_NAME` | No | Database name |
| `DB_SSL` | No | `true` (required for Azure PostgreSQL) |

Apply to **Production**, **Preview**, and **Development** as needed.

### 4. Connect Vercel to Azure PostgreSQL

Your Azure PostgreSQL firewall must allow inbound connections from Vercel's serverless functions. Vercel outbound IPs are not fixed on all plans, so check your options:

1. **Azure Portal** → your PostgreSQL server → **Networking** → add firewall rules for Vercel's egress IPs
2. On Vercel **Pro/Enterprise**, consider **Static IPs** for predictable outbound addresses
3. For local testing, add your current public IP to the Azure firewall temporarily

Both Vercel (`lhr1`) and Azure PostgreSQL (UK South) are in London, keeping latency and data residency aligned.

### 5. Deploy

Push to your default branch — Vercel deploys automatically.

Verify after deploy:

```
https://your-project.vercel.app/api/health
```

A successful database connection shows `"database": "connected"`. The health response also includes `"region": "lhr1"` when running in London.

## UK GDPR considerations

| Component | Location | Notes |
|-----------|----------|-------|
| **App & API** | Vercel London (`lhr1`) | Configured in `vercel.json` |
| **Database** | Azure PostgreSQL, UK South (London) | Manifest data at rest in UK |
| **Geocoding API** | Third party | Review [geocode.maps.co](https://geocode.maps.co/) privacy policy and DPA |
| **Secrets** | Vercel environment variables | Not stored in source code |

The split between Vercel (compute) and Azure (database) is intentional: Azure provides UK data residency for stored manifests; Vercel provides UK compute where Azure currently cannot.

Document data flows in your privacy notice and maintain DPAs with Vercel, Microsoft Azure, and your geocoding provider.

**Important:** Rotate any API keys that were previously committed to source code.

## Updating delivery zones

Edit `zones.json` — each feature should include a `properties.name` field. The map and routing logic both read from this file.
