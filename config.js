// This command immediately loads the variables from your .env file into Node's memory
require('dotenv').config();

// We export them as a structured object so server.js can easily read them
module.exports = {
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: 5432,
        ssl: true // Required for Azure Flexible Server
    },
    api: {
        geocodeKey: process.env.GEOCODE_API_KEY
    },
    server: {
        port: process.env.PORT || 3000
    }
};