const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const turf = require('@turf/turf');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Azure PostgreSQL Connection (You can fill these details in later when you are ready to write to the DB)
const dbClient = new Client({
     host: 'YOUR_SERVER_NAME.postgres.database.azure.com',
    user: 'YOUR_ENTRA_ADMIN_USER',
    password: 'YOUR_PASSWORD',
    database: 'YOUR_DATABASE_NAME',
    port: 5432,
    ssl: true
});

dbClient.connect()
    .then(() => console.log('Successfully connected to Azure PostgreSQL'))
    .catch(err => console.error('Database connection error', err));

// 2. Server-Side Custom Boundaries
const myZoneNames = [
    "Smallbridge/Littleborough", "Belfield Estate", "Milnrow/Newhey", "Newbold", 
        "Kingsway/Queensway", "Deeplish", "Norden/Bamford", "Spotland", "Wardleworth"
];

const savedGeoJSON = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.133708,53.622906],[-2.138257,53.626749],[-2.140274,53.624459],[-2.145038,53.623517],[-2.145166,53.6282],[-2.143021,53.631915],[-2.108688,53.642397],[-2.140617,53.628657],[-2.133708,53.622906]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.13933,53.628352],[-2.132978,53.622855],[-2.136583,53.621379],[-2.129374,53.616491],[-2.127142,53.616746],[-2.126713,53.623466],[-2.131605,53.62708],[-2.13933,53.628352]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.126799,53.616593],[-2.131519,53.631914],[-2.092896,53.644026],[-2.081909,53.621938],[-2.088947,53.596986],[-2.107658,53.60483],[-2.117615,53.613792],[-2.126799,53.616593]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.129202,53.616288],[-2.133064,53.618273],[-2.152033,53.614047],[-2.146454,53.604219],[-2.136154,53.607529],[-2.129202,53.616288]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.128859,53.616288],[-2.118387,53.601978],[-2.122421,53.597904],[-2.159758,53.597038],[-2.160273,53.599839],[-2.135038,53.607682],[-2.128859,53.616288]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.147055,53.604372],[-2.152634,53.614302],[-2.149372,53.614964],[-2.153921,53.619953],[-2.159929,53.618629],[-2.163019,53.613334],[-2.165508,53.606918],[-2.172203,53.603608],[-2.180271,53.59882],[-2.183018,53.613182],[-2.175035,53.611399],[-2.169371,53.615524],[-2.165766,53.6142],[-2.147055,53.604372]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.169714,53.615576],[-2.177696,53.627028],[-2.219925,53.62937],[-2.224388,53.605033],[-2.182159,53.613486],[-2.169714,53.615576]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.169199,53.61583],[-2.171516,53.621021],[-2.187138,53.648503],[-2.146111,53.633238],[-2.146025,53.62316],[-2.154779,53.62092],[-2.160015,53.619139],[-2.169199,53.61583]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-2.153277,53.620259],[-2.148471,53.615193],[-2.13285,53.618681],[-2.13697,53.62143],[-2.133794,53.622779],[-2.143621,53.623644],[-2.153277,53.620259]]]}}]};

// 3. The Secure Pipeline
app.post('/api/route-delivery', async (req, res) => {
    const { address } = req.body;
    console.log(`\n--- New Request: ${address} ---`);
    
    // REPLACE THIS WITH YOUR REAL API KEY
    const API_KEY = '6a3bb9ca621d3166269760edo344b01'; 
    const searchString = address + ", Rochdale, Greater Manchester, UK";
    const geocodeUrl = `https://geocode.maps.co/search?q=${encodeURIComponent(searchString)}&api_key=${API_KEY}`;

    try {
        const apiResponse = await fetch(geocodeUrl);
        const data = await apiResponse.json();

        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            console.log(`Geocoded Coordinates: [Lng: ${lng}, Lat: ${lat}]`);

            const point = turf.point([lng, lat]);
            let matchedZone = "Unclassified / Out of Bounds";

            // Check every polygon
            savedGeoJSON.features.forEach((feature, index) => {
                const isInside = turf.booleanPointInPolygon(point, feature);
                if (isInside) {
                    matchedZone = myZoneNames[index] || `Grouping ${index + 1}`;
                }
            });

            console.log(`Calculated Grouping: ${matchedZone}`);

            // Send the payload back to the browser
            res.json({ success: true, lat: lat, lng: lng, zone: matchedZone });
        } else {
            console.log("Geocode API returned no results.");
            res.status(404).json({ success: false, message: 'Address not found by Geocoder' });
        }
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

app.listen(3000, () => {
    console.log('Secure routing server is running on http://localhost:3000');
});