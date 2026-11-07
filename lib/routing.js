const config = require('../config');
const { validateAddress } = require('./validate');
const { matchZone } = require('./matchZone');
const { persistManifest } = require('./db');
const { extractPostcode } = require('./postcode');
const { lookupPostcode, NOT_DELIVERED } = require('./postcodeZones');
const { UNCLASSIFIED } = require('./matchZone');

/**
 * Assignment order:
 *   1. Postcode list (delivery_postcode_zones)   -> method 'postcode', no outside lookup needed.
 *   2. Address lookup + zone map                 -> method 'polygon'
 *   3. Nearest zone within the safety net        -> method 'nearest' (flagged)
 *   4. Unclassified                              -> flagged
 * Stage 3 adds street exceptions ahead of step 1.
 */
async function routeDelivery({ address, source = 'manual' }) {
    const validatedAddress = validateAddress(address);

    if (!validatedAddress) {
        return { status: 400, body: { success: false, message: 'A valid address is required (max 255 characters)' } };
    }

    const normalizedSource = source === 'qr' ? 'qr' : 'manual';
    const postcode = extractPostcode(validatedAddress);
    const entry = postcode ? lookupPostcode(postcode) : null;

    if (entry && entry.zone === NOT_DELIVERED) {
        return finish({
            address: validatedAddress,
            source: normalizedSource,
            postcode,
            lat: entry.lat,
            lng: entry.lng,
            match: {
                zone: UNCLASSIFIED,
                method: 'postcode',
                needsReview: true,
                reviewReason: `Postcode ${postcode} is marked as outside the delivery area`,
                overlap: false,
                allMatches: [],
                distanceMetres: null
            }
        });
    }

    if (entry && !entry.isSplit) {
        const needsReview = entry.status === 'check';
        return finish({
            address: validatedAddress,
            source: normalizedSource,
            postcode,
            lat: entry.lat,
            lng: entry.lng,
            match: {
                zone: entry.zone,
                method: 'postcode',
                needsReview,
                reviewReason: needsReview ? `Postcode ${postcode} not yet confirmed in the postcode list` : null,
                overlap: false,
                allMatches: [],
                distanceMetres: null
            }
        });
    }

    // Postcode missing from the list, or split between zones: fall back to the map.
    const geo = await geocode(validatedAddress);
    if (geo.error) return geo.error;

    const match = matchZone(geo.lng, geo.lat);

    if (entry && entry.isSplit) {
        match.needsReview = true;
        match.reviewReason = `Postcode ${postcode} is split between zones — check the street` +
            (match.reviewReason ? `; ${match.reviewReason}` : '');
    }

    return finish({ address: validatedAddress, source: normalizedSource, postcode, lat: geo.lat, lng: geo.lng, match });
}

async function geocode(address) {
    if (!config.api.geocodeKey) {
        return { error: { status: 503, body: { success: false, message: 'Postcode not in the postcode list and address lookup is not configured on the server' } } };
    }

    const searchString = `${address}, Rochdale, Greater Manchester, UK`;
    const geocodeUrl = `https://geocode.maps.co/search?q=${encodeURIComponent(searchString)}&api_key=${config.api.geocodeKey}`;
    const apiResponse = await fetch(geocodeUrl);

    if (!apiResponse.ok) {
        console.error('Geocode API error:', apiResponse.status, apiResponse.statusText);
        return { error: { status: 502, body: { success: false, message: 'Geocoding service unavailable' } } };
    }

    const data = await apiResponse.json();

    if (!Array.isArray(data) || data.length === 0) {
        return { error: { status: 404, body: { success: false, message: 'Address not found by geocoder' } } };
    }

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return { error: { status: 502, body: { success: false, message: 'Invalid coordinates returned by geocoder' } } };
    }

    return { lat, lng };
}

async function finish({ address, source, postcode, lat, lng, match }) {
    const { zone, overlap, allMatches } = match;
    const persistResult = await persistManifest({
        address,
        lat,
        lng,
        zone,
        source,
        postcode,
        method: match.method,
        needsReview: match.needsReview,
        reviewReason: match.reviewReason
    });

    return {
        status: 200,
        body: {
            success: true,
            lat,
            lng,
            zone,
            postcode,
            overlap,
            allMatches: overlap ? allMatches : undefined,
            method: match.method,
            needsReview: match.needsReview,
            reviewReason: match.reviewReason,
            distanceMetres: match.distanceMetres,
            logged: persistResult.logged,
            logError: persistResult.error || null
        }
    };
}

module.exports = { routeDelivery };
