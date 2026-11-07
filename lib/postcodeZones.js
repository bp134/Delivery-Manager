const { withDb } = require('./db');
const config = require('../config');
const zones = require('./zones');
const { normalisePostcode } = require('./postcode');

// In-memory copy of delivery_postcode_zones, refreshed regularly so edits made in
// pgAdmin take effect without redeploying the app.
const REFRESH_MS = 5 * 60 * 1000;
// Use this zone name in the table for postcodes the pharmacy does not deliver to.
const NOT_DELIVERED = 'Not delivered';
const knownZones = new Set([...zones.features.map((f) => f.properties?.name).filter(Boolean), NOT_DELIVERED]);

let byPostcode = new Map();
let lastLoadedAt = null;
let lastError = null;
let skippedRows = 0;
let timer = null;

function toEntry(row) {
    const postcode = normalisePostcode(row.postcode);
    if (!postcode || !knownZones.has(row.zone)) return null;
    return {
        postcode,
        zone: row.zone,
        status: row.status,
        isSplit: Boolean(row.is_split),
        lat: row.latitude === null ? null : Number(row.latitude),
        lng: row.longitude === null ? null : Number(row.longitude)
    };
}

function setRows(rows) {
    const next = new Map();
    skippedRows = 0;
    for (const row of rows) {
        const entry = toEntry(row);
        if (entry) next.set(entry.postcode, entry);
        else skippedRows += 1;
    }
    if (skippedRows > 0) {
        console.warn(`delivery_postcode_zones: ignored ${skippedRows} row(s) with an invalid postcode or a zone name not in zones.json`);
    }
    byPostcode = next;
    lastLoadedAt = new Date();
}

async function loadPostcodeZones() {
    if (!config.dbEnabled) return { loaded: false, count: 0 };
    try {
        await withDb(async (client) => {
            const exists = await client.query(
                `SELECT to_regclass('public.delivery_postcode_zones') IS NOT NULL AS ok`
            );
            if (!exists.rows[0].ok) {
                lastError = 'Table delivery_postcode_zones does not exist — run migrations/004_postcode_zones.sql';
                return;
            }
            const result = await client.query(
                `SELECT postcode, zone, status, is_split, latitude, longitude FROM delivery_postcode_zones`
            );
            setRows(result.rows);
            lastError = null;
        });
    } catch (err) {
        lastError = err.message;
        console.error('Failed to load postcode zones:', err.message);
    }
    return { loaded: lastError === null, count: byPostcode.size, error: lastError };
}

function startPostcodeZoneRefresh() {
    if (timer || !config.dbEnabled) return;
    loadPostcodeZones().then((r) => {
        if (r.loaded) console.log(`Loaded ${r.count} postcode zone(s)`);
    });
    timer = setInterval(loadPostcodeZones, REFRESH_MS);
    timer.unref();
}

function stopPostcodeZoneRefresh() {
    if (timer) clearInterval(timer);
    timer = null;
}

function lookupPostcode(postcode) {
    const key = normalisePostcode(postcode);
    return key ? byPostcode.get(key) || null : null;
}

function postcodeZoneStatus() {
    return { count: byPostcode.size, lastLoadedAt, skippedRows, error: lastError };
}

module.exports = {
    NOT_DELIVERED,
    loadPostcodeZones,
    startPostcodeZoneRefresh,
    stopPostcodeZoneRefresh,
    lookupPostcode,
    postcodeZoneStatus,
    _setRowsForTesting: setRows
};
