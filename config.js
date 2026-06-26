require('dotenv').config();

function isDbConfigured() {
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) return false;
    if (DB_HOST.includes('YOUR_SERVER_NAME')) return false;
    return true;
}

module.exports = {
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT) || 5432,
        ssl: process.env.DB_SSL !== 'false'
    },
    dbEnabled: isDbConfigured(),
    api: {
        geocodeKey: process.env.GEOCODE_API_KEY
    },
    server: {
        port: Number(process.env.PORT) || 3000,
        corsOrigin: process.env.CORS_ORIGIN || null
    }
};