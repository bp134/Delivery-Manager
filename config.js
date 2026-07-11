require('dotenv').config();

function getSslConfig() {
    if (process.env.DB_SSL === 'false') return false;
    // Azure PostgreSQL Flexible Server requires SSL; this CA setup is standard for Azure.
    return { rejectUnauthorized: false };
}

function isDbConfigured() {
    if (process.env.DATABASE_URL) return true;

    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) return false;
    if (DB_HOST.includes('your-server')) return false;
    return true;
}

function buildDbConfig() {
    const ssl = getSslConfig();

    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            ssl
        };
    }

    return {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT) || 5432,
        ssl
    };
}

module.exports = {
    db: buildDbConfig(),
    dbEnabled: isDbConfigured(),
    api: {
        geocodeKey: process.env.GEOCODE_API_KEY
    },
    server: {
        // Railway injects PORT automatically — do not hardcode PORT=3000 in Railway variables.
        port: Number(process.env.PORT) || 3000,
        corsOrigin: process.env.CORS_ORIGIN || null,
        isRailway: Boolean(
            process.env.RAILWAY_ENVIRONMENT ||
            process.env.RAILWAY_SERVICE_ID ||
            process.env.RAILWAY_PROJECT_ID
        )
    }
};
