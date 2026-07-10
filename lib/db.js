const { Client } = require('pg');
const config = require('../config');

async function withDb(fn) {
    if (!config.dbEnabled) {
        return fn(null);
    }

    const client = new Client(config.db);
    await client.connect();

    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

async function persistManifest({ address, lat, lng, zone, source }) {
    return withDb(async (client) => {
        if (!client) return false;

        await client.query(
            `INSERT INTO delivery_manifests (scanned_address, latitude, longitude, assigned_grouping, source)
             VALUES ($1, $2, $3, $4, $5)`,
            [address, lat, lng, zone, source]
        );
        return true;
    });
}

async function checkDbConnection() {
    try {
        await withDb(async (client) => Boolean(client));
        return config.dbEnabled;
    } catch {
        return false;
    }
}

module.exports = { persistManifest, checkDbConnection, withDb };
