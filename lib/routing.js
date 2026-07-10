const config = require('../config');
const { validateAddress } = require('./validate');
const { matchZone } = require('./matchZone');
const { persistManifest } = require('./db');

async function routeDelivery({ address, source = 'manual' }) {
    const validatedAddress = validateAddress(address);

    if (!validatedAddress) {
        return { status: 400, body: { success: false, message: 'A valid address is required (max 255 characters)' } };
    }

    if (!config.api.geocodeKey) {
        return { status: 503, body: { success: false, message: 'Geocoding is not configured on the server' } };
    }

    const normalizedSource = source === 'qr' ? 'qr' : 'manual';
    const searchString = `${validatedAddress}, Rochdale, Greater Manchester, UK`;
    const geocodeUrl = `https://geocode.maps.co/search?q=${encodeURIComponent(searchString)}&api_key=${config.api.geocodeKey}`;

    const apiResponse = await fetch(geocodeUrl);

    if (!apiResponse.ok) {
        console.error('Geocode API error:', apiResponse.status, apiResponse.statusText);
        return { status: 502, body: { success: false, message: 'Geocoding service unavailable' } };
    }

    const data = await apiResponse.json();

    if (!Array.isArray(data) || data.length === 0) {
        return { status: 404, body: { success: false, message: 'Address not found by geocoder' } };
    }

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return { status: 502, body: { success: false, message: 'Invalid coordinates returned by geocoder' } };
    }

    const { zone, overlap, allMatches } = matchZone(lng, lat);
    let logged = false;

    try {
        logged = await persistManifest({
            address: validatedAddress,
            lat,
            lng,
            zone,
            source: normalizedSource
        });
    } catch (dbError) {
        console.error('Failed to persist manifest:', dbError.message);
    }

    return {
        status: 200,
        body: {
            success: true,
            lat,
            lng,
            zone,
            overlap,
            allMatches: overlap ? allMatches : undefined,
            logged
        }
    };
}

module.exports = { routeDelivery };
