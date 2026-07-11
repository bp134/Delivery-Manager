const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const zones = require('./lib/zones');
const { routeDelivery } = require('./lib/routing');
const { checkDbConnection, initDatabase, closeDatabase } = require('./lib/db');

const app = express();
const port = Number(process.env.PORT) || config.server.port || 3000;

// Required when running behind Railway's reverse proxy (rate limiting, client IP).
if (config.server.isRailway) {
    app.set('trust proxy', 1);
}

if (config.server.corsOrigin) {
    app.use(cors({ origin: config.server.corsOrigin }));
}

app.use(express.json({ limit: '16kb' }));

const routeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests — please wait a moment' }
});

// Instant liveness probe for Railway — no database or external calls.
app.get('/api/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/health', async (_req, res) => {
    try {
        const dbStatus = await checkDbConnection();

        res.json({
            status: 'ok',
            database: dbStatus.connected ? 'connected' : 'disconnected',
            databaseConfigured: dbStatus.configured,
            tableReady: dbStatus.tableReady,
            databaseError: dbStatus.error || null,
            geocodeConfigured: Boolean(config.api.geocodeKey),
            platform: config.server.isRailway ? 'railway' : 'local',
            port
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/zones', (_req, res) => {
    res.json(zones);
});

app.post('/api/route-delivery', routeLimiter, async (req, res) => {
    try {
        const { status, body } = await routeDelivery({
            address: req.body?.address,
            source: req.body?.source
        });
        res.status(status).json(body);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(port, '0.0.0.0', () => {
    const address = server.address();
    console.log(`Server running on port ${port} (${config.server.isRailway ? 'railway' : 'local'})`);
    console.log('Listening on', address);

    initDatabase().catch((error) => {
        console.error('Database init failed:', error.message);
    });
});

server.on('error', (error) => {
    console.error('Server listen error:', error);
    process.exit(1);
});

function shutdown() {
    server.close(async () => {
        await closeDatabase();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});
