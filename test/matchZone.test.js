const test = require('node:test');
const assert = require('node:assert/strict');
const turf = require('@turf/turf');
const zones = require('../lib/zones');
const { matchZone, METHOD, UNCLASSIFIED } = require('../lib/matchZone');

const byName = (name) => zones.features.find((f) => f.properties.name === name);

test('every zone is a valid, non-overlapping shape', () => {
    const names = zones.features.map((f) => f.properties.name);
    for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
            const overlap = turf.intersect(turf.featureCollection([zones.features[i], zones.features[j]]));
            const area = overlap ? turf.area(overlap) : 0;
            assert.ok(area < 1, `${names[i]} overlaps ${names[j]} by ${area.toFixed(0)} m²`);
        }
    }
});

test('a point inside a zone is assigned by polygon with no review flag', () => {
    const [lng, lat] = turf.pointOnFeature(byName('Spotland')).geometry.coordinates;
    const result = matchZone(lng, lat);
    assert.equal(result.zone, 'Spotland');
    assert.equal(result.method, METHOD.POLYGON);
    assert.equal(result.needsReview, false);
});

test('a point just outside a zone uses the nearest-zone safety net and is flagged', () => {
    // 100 m due west of the most westerly corner of Norden/Bamford.
    const coords = turf.coordAll(byName('Norden/Bamford'));
    const west = coords.reduce((a, b) => (b[0] < a[0] ? b : a));
    const p = turf.destination(west, 0.1, -90, { units: 'kilometers' }).geometry.coordinates;
    const result = matchZone(p[0], p[1]);
    assert.equal(result.zone, 'Norden/Bamford');
    assert.equal(result.method, METHOD.NEAREST);
    assert.equal(result.needsReview, true);
    assert.ok(result.distanceMetres > 50 && result.distanceMetres <= 200, String(result.distanceMetres));
});

test('a point beyond the safety net stays unclassified and is flagged', () => {
    const result = matchZone(-2.0, 53.7); // several km from any zone
    assert.equal(result.zone, UNCLASSIFIED);
    assert.equal(result.method, METHOD.UNCLASSIFIED);
    assert.equal(result.needsReview, true);
});

test('the safety-net distance can be changed', () => {
    const coords = turf.coordAll(byName('Norden/Bamford'));
    const west = coords.reduce((a, b) => (b[0] < a[0] ? b : a));
    const p = turf.destination(west, 0.1, -90, { units: 'kilometers' }).geometry.coordinates;
    assert.equal(matchZone(p[0], p[1], { maxNearestMetres: 50 }).method, METHOD.UNCLASSIFIED);
});
