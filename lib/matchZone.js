const turf = require('@turf/turf');
const zones = require('./zones');

function matchZone(lng, lat) {
    const point = turf.point([lng, lat]);
    const matches = [];

    zones.features.forEach((feature, index) => {
        if (turf.booleanPointInPolygon(point, feature)) {
            matches.push(feature.properties?.name || `Grouping ${index + 1}`);
        }
    });

    if (matches.length === 0) {
        return { zone: 'Unclassified / Out of Bounds', overlap: false };
    }

    return {
        zone: matches[matches.length - 1],
        overlap: matches.length > 1,
        allMatches: matches
    };
}

module.exports = { matchZone };
