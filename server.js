const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Client } = require('pg');
const turf = require('@turf/turf');
const config = require('./config');

const app = express();
const zones = JSON.parse(fs.readFileSync(path.join(__dirname, 'zones.json'), 'utf8'));

let dbClient = null;
let dbConnected = false;

if (config.dbEnabled) {
    dbClient = new Client(config.db);
    dbClient.connect()
        .then(() => {
            dbConnected = true;
            console.log('Connected to PostgreSQL');
        })
        .catch((err) => {
            console.error('Database connection error:', err.message);
        });
} else {
    console.log('Database not configured — routing will work without persistence');
}

if (config.server.corsOrigin) {
    app.use(cors({ origin: config.server.corsOrigin }));
}

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const routeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests — please wait a moment' }
});

function validateAddress(address) {
    if (typeof address !== 'string') return null;
    const trimmed = address.trim();
    if (!trimmed || trimmed.length > 255) return null;
    return trimmed;
}

function matchZone(lng, lat) {
    const point = turf.point([lng, lat]);
    const matches = [];

    zones.features.forEach((feature, index) => {
        if (turf.booleanPointInPolygon(point, feature)) {
            matches.push(feature.properties?.name || `Grouping ${index + 1}`);
        }
    });

    if (matches.length === 0) {
        return { zone: 'Unclassified / Out of Bounds', overlap: false };
    }

    return {
        zone: matches[matches.length - 1],
        overlap: matches.length > 1,
        allMatches: matches
    };
}

async function persistManifest({ address, lat, lng, zone, source }) {
    if (!dbConnected || !dbClient) return false;

    await dbClient.query(
        `INSERT INTO delivery_manifests (scanned_address, latitude, longitude, assigned_grouping, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [address, lat, lng, zone, source]
    );
    return true;
}

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        database: dbConnected ? 'connected' : 'disconnected',
        geocodeConfigured: Boolean(config.api.geocodeKey)
    });
});

app.get('/api/zones', (_req, res) => {
    res.json(zones);
});

app.post('/api/route-delivery', routeLimiter, async (req, res) => {
    const address = validateAddress(req.body?.address);
    const source = req.body?.source === 'qr' ? 'qr' : 'manual';

    if (!address) {
        return res.status(400).json({ success: false, message: 'A valid address is required (max 255 characters)' });
    }

    if (!config.api.geocodeKey) {
        return res.status(503).json({ success: false, message: 'Geocoding is not configured on the server' });
    }

    console.log(`Route request: ${address} (${source})`);

    const searchString = `${address}, Rochdale, Greater Manchester, UK`;
    const geocodeUrl = `https://geocode.maps.co/search?q=${encodeURIComponent(searchString)}&api_key=${config.api.geocodeKey}`;

    try {
        const apiResponse = await fetch(geocodeUrl);

        if (!apiResponse.ok) {
            console.error('Geocode API error:', apiResponse.status, apiResponse.statusText);
            return res.status(502).json({ success: false, message: 'Geocoding service unavailable' });
        }

        const data = await apiResponse.json();

        if (!Array.isArray(data) || data.length === 0) {
            return res.status(404).json({ success: false, message: 'Address not found by geocoder' });
        }

        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return res.status(502).json({ success: false, message: 'Invalid coordinates returned by geocoder' });
        }

        const { zone, overlap, allMatches } = matchZone(lng, lat);
        let logged = false;

        try {
            logged = await persistManifest({ address, lat, lng, zone, source });
        } catch (dbError) {
            console.error('Failed to persist manifest:', dbError.message);
        }

        res.json({
            success: true,
            lat,
            lng,
            zone,
            overlap,
            allMatches: overlap ? allMatches : undefined,
            logged
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

const server = app.listen(config.server.port, () => {
    console.log(`Server running at http://localhost:${config.server.port}`);
});

function shutdown() {
    server.close(async () => {
        if (dbClient) {
            try {
                await dbClient.end();
            } catch (err) {
                console.error('Error closing database connection:', err.message);
            }
        }
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
