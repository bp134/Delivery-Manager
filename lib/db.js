const { Pool } = require('pg');
const config = require('../config');

let pool = null;

function getPool() {
    if (!config.dbEnabled) return null;

    if (!pool) {
        pool = new Pool({
            ...config.db,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000
        });

        pool.on('error', (err) => {
            console.error('Unexpected database pool error:', err.message);
        });
    }

    return pool;
}

async function withDb(fn) {
    const dbPool = getPool();
    if (!dbPool) {
        return fn(null);
    }

    const client = await dbPool.connect();

    try {
        return await fn(client);
    } finally {
        client.release();
    }
}

async function tableExists(client) {
    const result = await client.query(
        `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'delivery_manifests'
        ) AS table_exists`
    );
    return Boolean(result.rows[0]?.table_exists);
}

async function columnExists(client, tableName, columnName) {
    const result = await client.query(
        `SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ) AS column_exists`,
        [tableName, columnName]
    );
    return Boolean(result.rows[0]?.column_exists);
}

async function ensureSchema(client) {
    if (!(await tableExists(client))) return false;

    if (!(await columnExists(client, 'delivery_manifests', 'source'))) {
        await client.query(
            `ALTER TABLE delivery_manifests ADD COLUMN source VARCHAR(20) DEFAULT 'manual'`
        );
        console.log('Applied schema patch: added delivery_manifests.source column');
    }

    return true;
}

async function persistManifest({ address, lat, lng, zone, source }) {
    try {
        return await withDb(async (client) => {
            if (!client) {
                return { logged: false, error: 'Database environment variables are not set' };
            }

            if (!(await tableExists(client))) {
                return {
                    logged: false,
                    error: 'Table delivery_manifests does not exist — run migrations/001_delivery_manifests.sql'
                };
            }

            await client.query(
                `INSERT INTO delivery_manifests (scanned_address, latitude, longitude, assigned_grouping, source)
                 VALUES ($1, $2, $3, $4, $5)`,
                [address, lat, lng, zone, source]
            );

            return { logged: true };
        });
    } catch (err) {
        console.error('Failed to persist manifest:', err.message);
        return { logged: false, error: err.message };
    }
}

async function checkDbConnection() {
    if (!config.dbEnabled) {
        return {
            connected: false,
            configured: false,
            tableReady: false,
            error: 'Database environment variables are not set'
        };
    }

    try {
        const dbPool = getPool();
        const client = await dbPool.connect();
        await client.query('SELECT 1');

        const exists = await tableExists(client);

        if (!exists) {
            client.release();
            return {
                connected: true,
                configured: true,
                tableReady: false,
                error: 'Connected to PostgreSQL but table delivery_manifests is missing — run migrations/001_delivery_manifests.sql'
            };
        }

        await ensureSchema(client);
        client.release();

        return { connected: true, configured: true, tableReady: true };
    } catch (err) {
        console.error('Database connection check failed:', err.message);
        return {
            connected: false,
            configured: true,
            tableReady: false,
            error: err.message
        };
    }
}

async function initDatabase() {
    const status = await checkDbConnection();

    if (!status.configured) {
        console.log('Database not configured — routing will work without persistence');
        return status;
    }

    if (status.connected && status.tableReady) {
        console.log('Connected to PostgreSQL (delivery_manifests ready)');
    } else if (status.connected) {
        console.error('PostgreSQL connected but not ready:', status.error);
    } else {
        console.error('Database connection failed:', status.error);
    }

    return status;
}

async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

module.exports = {
    persistManifest,
    checkDbConnection,
    initDatabase,
    closeDatabase,
    withDb
};
