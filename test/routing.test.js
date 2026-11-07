const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const { normalisePostcode, extractPostcode } = require('../lib/postcode');
const postcodeZones = require('../lib/postcodeZones');
const { routeDelivery } = require('../lib/routing');

test('postcodes are normalised and found inside addresses', () => {
    assert.equal(normalisePostcode('ol164aa'), 'OL16 4AA');
    assert.equal(normalisePostcode(' OL16   4AA '), 'OL16 4AA');
    assert.equal(normalisePostcode('not a postcode'), null);
    assert.equal(extractPostcode('12 Halifax Road, Rochdale OL12 9BA'), 'OL12 9BA');
    assert.equal(extractPostcode('12 Halifax Road'), null);
});

const rows = [
    { postcode: 'OL16 4AA', zone: 'Belfield Estate', status: 'seeded', is_split: false, latitude: '53.61', longitude: '-2.13' },
    { postcode: 'OL16 4AB', zone: 'Newbold', status: 'check', is_split: false, latitude: '53.61', longitude: '-2.14' },
    { postcode: 'OL16 4AD', zone: 'Newbold', status: 'confirmed', is_split: true, latitude: '53.61', longitude: '-2.14' },
    { postcode: 'OL16 4AE', zone: 'Not delivered', status: 'confirmed', is_split: false, latitude: '53.61', longitude: '-2.14' },
    { postcode: 'OL16 9ZZ', zone: 'Typo Zone', status: 'seeded', is_split: false, latitude: null, longitude: null }
];

function withFakeGeocoder(lat, lng, fn) {
    const realFetch = global.fetch;
    const realKey = config.api.geocodeKey;
    let calls = 0;
    global.fetch = async () => { calls += 1; return { ok: true, json: async () => [{ lat: String(lat), lon: String(lng) }] }; };
    config.api.geocodeKey = 'test';
    return fn().then((r) => ({ r, calls })).finally(() => { global.fetch = realFetch; config.api.geocodeKey = realKey; });
}

test('a listed postcode is assigned from the list without an outside lookup', async () => {
    postcodeZones._setRowsForTesting(rows);
    const { r, calls } = await withFakeGeocoder(0, 0, () => routeDelivery({ address: 'ol16 4aa', source: 'qr' }));
    assert.equal(calls, 0);
    assert.equal(r.body.zone, 'Belfield Estate');
    assert.equal(r.body.method, 'postcode');
    assert.equal(r.body.needsReview, false);
});

test('a postcode marked "check" is assigned but flagged', async () => {
    postcodeZones._setRowsForTesting(rows);
    const { r } = await withFakeGeocoder(0, 0, () => routeDelivery({ address: 'OL16 4AB' }));
    assert.equal(r.body.zone, 'Newbold');
    assert.equal(r.body.needsReview, true);
});

test('a split postcode falls back to the map and is flagged', async () => {
    postcodeZones._setRowsForTesting(rows);
    // A point well inside Spotland.
    const turf = require('@turf/turf');
    const spot = require('../lib/zones').features.find((f) => f.properties.name === 'Spotland');
    const [lng, lat] = turf.pointOnFeature(spot).geometry.coordinates;
    const { r, calls } = await withFakeGeocoder(lat, lng, () => routeDelivery({ address: '5 Some Street OL16 4AD' }));
    assert.equal(calls, 1);
    assert.equal(r.body.zone, 'Spotland');
    assert.equal(r.body.method, 'polygon');
    assert.equal(r.body.needsReview, true);
    assert.match(r.body.reviewReason, /split/);
});

test('rows with an unknown zone name are ignored', async () => {
    postcodeZones._setRowsForTesting(rows);
    assert.equal(postcodeZones.lookupPostcode('OL16 9ZZ'), null);
    assert.equal(postcodeZones.postcodeZoneStatus().skippedRows, 1);
});

test('an unlisted postcode uses the map as before', async () => {
    postcodeZones._setRowsForTesting(rows);
    const { r, calls } = await withFakeGeocoder(53.7, -2.0, () => routeDelivery({ address: 'OL99 9XX' }));
    assert.equal(calls, 1);
    assert.equal(r.body.method, 'unclassified');
});

test('a postcode marked "Not delivered" is unclassified and flagged without a lookup', async () => {
    postcodeZones._setRowsForTesting(rows);
    const { r, calls } = await withFakeGeocoder(0, 0, () => routeDelivery({ address: 'OL16 4AE' }));
    assert.equal(calls, 0);
    assert.equal(r.body.zone, 'Unclassified / Out of Bounds');
    assert.equal(r.body.needsReview, true);
    assert.match(r.body.reviewReason, /outside the delivery area/);
});
