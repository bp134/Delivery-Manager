const config = require('../config');
const zones = require('../lib/zones');
const { checkDbConnection } = require('../lib/db');

module.exports = async (_req, res) => {
    const dbConnected = await checkDbConnection();

    res.status(200).json({
        status: 'ok',
        database: dbConnected ? 'connected' : 'disconnected',
        geocodeConfigured: Boolean(config.api.geocodeKey),
        region: process.env.VERCEL_REGION || 'local'
    });
};
