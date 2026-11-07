#!/usr/bin/env node
// Loads data/postcode_zones_seed.csv into delivery_postcode_zones.
// Existing rows are never overwritten, so corrections made in pgAdmin are kept.
// Usage: npm run seed:postcodes   (uses the same DB_* / DATABASE_URL settings as the app)
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { withDb, closeDatabase } = require('../lib/db');
const { normalisePostcode } = require('../lib/postcode');
const zones = require('../lib/zones');

const CSV_PATH = path.join(__dirname, '..', 'data', 'postcode_zones_seed.csv');
const knownZones = new Set(zones.features.map((f) => f.properties.name));

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out;
}

async function main() {
    if (!config.dbEnabled) throw new Error('Database settings are not configured (see .env.example)');

    const [header, ...lines] = fs.readFileSync(CSV_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
    const cols = parseCsvLine(header);
    const rows = lines.map((l) => Object.fromEntries(parseCsvLine(l).map((v, i) => [cols[i], v])));

    for (const r of rows) {
        if (!normalisePostcode(r.postcode)) throw new Error(`Invalid postcode in seed file: ${r.postcode}`);
        if (!knownZones.has(r.zone)) throw new Error(`Unknown zone in seed file: ${r.zone}`);
    }

    const inserted = await withDb(async (client) => {
        let count = 0;
        await client.query('BEGIN');
        try {
            for (const r of rows) {
                const res = await client.query(
                    `INSERT INTO delivery_postcode_zones
                        (postcode, zone, status, is_split, latitude, longitude, notes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (postcode) DO NOTHING`,
                    [normalisePostcode(r.postcode), r.zone, r.status, r.is_split === 'true',
                        r.latitude || null, r.longitude || null, r.notes || null]
                );
                count += res.rowCount;
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        return count;
    });

    console.log(`Seed file rows: ${rows.length}. Inserted: ${inserted}. Already present (left unchanged): ${rows.length - inserted}.`);
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => closeDatabase());
