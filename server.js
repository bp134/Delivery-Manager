const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const zones = require('./lib/zones');
const { routeDelivery } = require('./lib/routing');
const { checkDbConnection, initDatabase, closeDatabase } = require('./lib/db');

const app = express();

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

app.get('/api/health', async (_req, res) => {
    const dbStatus = await checkDbConnection();

    res.json({
        status: 'ok',
        database: dbStatus.connected ? 'connected' : 'disconnected',
        databaseConfigured: dbStatus.configured,
        tableReady: dbStatus.tableReady,
        databaseError: dbStatus.error || null,
        geocodeConfigured: Boolean(config.api.geocodeKey),
        platform: config.server.isRailway ? 'railway' : 'local',
        port: config.server.port
    });
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

const server = app.listen(config.server.port, '0.0.0.0', () => {
    console.log(`Server running on port ${config.server.port} (${config.server.isRailway ? 'railway' : 'local'})`);
    initDatabase().catch((error) => {
        console.error('Database init failed:', error.message);
    });
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
