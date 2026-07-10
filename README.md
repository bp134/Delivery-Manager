# Rochdale Delivery Routing App

Geocode delivery addresses and assign them to Rochdale delivery zones. Includes a map UI, manual address entry, and QR label scanning for batch sorting.

## Architecture

| Layer | Provider | Region | Role |
|-------|----------|--------|------|
| **App & API** | Railway | EU (closest available) | Express server, geocoding, zone matching |
| **Database** | Azure PostgreSQL | UK South (London) | Manifest logging (`delivery_manifests`) |

Azure hosts the database in London. Railway runs the Node.js app as a long-running service.

## Prerequisites

- Node.js 18+
- A [geocode.maps.co](https://geocode.maps.co/) API key
- Azure PostgreSQL Flexible Server in **UK South (London)**

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

4. Run the database migration against Azure PostgreSQL:

```bash
psql "host=YOUR_SERVER.postgres.database.azure.com dbname=YOUR_DB user=YOUR_USER sslmode=require" -f migrations/001_delivery_manifests.sql
```

5. Set the `DB_*` variables in `.env` (see `.env.example`).

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

## Deployment (Railway)

Railway runs `npm start` via `server.js`. No build step is required.

### 1. Connect the repository

1. Sign in at [railway.com](https://railway.com)
2. **New Project** → **Deploy from GitHub repo**
3. Select this repository — Railway detects Node.js automatically

### 2. Environment variables

In Railway → your service → **Variables**, add:

| Variable | Required | Example |
|----------|----------|---------|
| `GEOCODE_API_KEY` | Yes | Your geocode.maps.co key |
| `DB_HOST` | Yes | `your-server.postgres.database.azure.com` |
| `DB_USER` | Yes | Azure PostgreSQL admin username |
| `DB_PASSWORD` | Yes | Azure PostgreSQL password |
| `DB_NAME` | Yes | Database name |
| `DB_SSL` | Yes | `true` |
| `DB_PORT` | No | `5432` (default) |

Alternatively, set a single `DATABASE_URL`:

```
postgresql://user:password@your-server.postgres.database.azure.com:5432/your_db?sslmode=require
```

Do **not** set `PORT` on Railway — Railway assigns it automatically.

### 3. Allow Railway to reach Azure PostgreSQL

This is the most common reason the app deploys but the database shows as disconnected.

1. In **Railway** → your service → **Settings** → **Networking**, note the **outbound/static IP** (if available on your plan)
2. In **Azure Portal** → PostgreSQL server → **Networking** → **Firewall rules**
3. Add a rule allowing Railway's outbound IP address
4. Ensure **Public access** is enabled on the Azure PostgreSQL server

For local testing, also add your home/office public IP temporarily.

### 4. Deploy and verify

Push to your default branch — Railway redeploys automatically.

Check health:

```
https://your-app.up.railway.app/api/health
```

A working database connection returns:

```json
{
  "status": "ok",
  "database": "connected",
  "databaseConfigured": true,
  "databaseError": null,
  "geocodeConfigured": true,
  "platform": "railway"
}
```

If disconnected, `databaseError` will show the reason (e.g. firewall timeout, wrong password, SSL error).

### Troubleshooting database connection

| `databaseError` | Fix |
|-----------------|-----|
| `Database environment variables are not set` | Add `DB_*` or `DATABASE_URL` in Railway Variables |
| `connect ETIMEDOUT` or `Connection timed out` | Azure firewall is blocking Railway — add Railway's IP |
| `password authentication failed` | Check `DB_USER` and `DB_PASSWORD` |
| `no pg_hba.conf entry` | Enable public access on Azure PostgreSQL |
| SSL-related errors | Ensure `DB_SSL=true` |

## UK GDPR considerations

| Component | Location |
|-----------|----------|
| **Database** | Azure PostgreSQL, UK South (London) |
| **App** | Railway (check Railway region and DPA for your plan) |
| **Geocoding** | Third party — review geocode.maps.co privacy policy |

## Updating delivery zones

Edit `zones.json` — each feature should include a `properties.name` field.
