const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const zones = require('./lib/zones');
const { routeDelivery } = require('./lib/routing');
const { checkDbConnection, initDatabase, closeDatabase } = require('./lib/db');

const app = express();
const isRailway = config.server.isRailway;
const port = Number(process.env.PORT) || config.server.port || 3000;
const host = process.env.HOST || '0.0.0.0';

if (isRailway || process.env.NODE_ENV === 'production') {
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

app.get('/api/health/live', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        port,
        host,
        pid: process.pid
    });
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
            platform: isRailway ? 'railway' : 'local',
            port,
            host
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

function logStartupEnv() {
    const railwayVars = Object.keys(process.env)
        .filter((key) => key.startsWith('RAILWAY_') || key === 'PORT' || key === 'HOST')
        .sort()
        .reduce((acc, key) => {
            acc[key] = process.env[key];
            return acc;
        }, {});

    console.log('Startup environment:', railwayVars);
}

const server = http.createServer(app);

server.listen(port, host, () => {
    const address = server.address();
    console.log(`Server running on ${host}:${port} (${isRailway ? 'railway' : 'local'})`);
    console.log('Listening on', address);
    logStartupEnv();

    if (isRailway) {
        console.log(
            'If you still see 502: open Service -> Settings -> Networking, ' +
            'delete the public domain, generate a new one, and set Target Port to ' +
            `${port}. Also confirm this domain is attached to THIS service (not another).`
        );
    }

    initDatabase().catch((error) => {
        console.error('Database init failed:', error.message);
    });

    setTimeout(() => {
        console.log(`[heartbeat] pid=${process.pid} uptime=${Math.floor(process.uptime())}s still listening on ${port}`);
    }, 10000);
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
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    shutdown();
});
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});
