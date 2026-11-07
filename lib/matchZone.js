const turf = require('@turf/turf');
const config = require('../config');
const zones = require('./zones');

const UNCLASSIFIED = 'Unclassified / Out of Bounds';

// How an address was assigned. Stored in delivery_manifests.assignment_method.
// Later stages add 'street_exception' and 'postcode' ahead of these.
const METHOD = Object.freeze({
    POLYGON: 'polygon',
    NEAREST: 'nearest',
    UNCLASSIFIED: 'unclassified'
});

function zoneName(feature, index) {
    return feature.properties?.name || `Grouping ${index + 1}`;
}

// Distance in metres from a point to the edge of a zone (0 if inside).
function distanceToZoneMetres(point, feature) {
    return turf.pointToPolygonDistance(point, feature, { units: 'meters' });
}

function findNearestZone(point) {
    let nearest = null;

    zones.features.forEach((feature, index) => {
        const distance = Math.max(0, distanceToZoneMetres(point, feature));
        if (!nearest || distance < nearest.distanceMetres) {
            nearest = { zone: zoneName(feature, index), distanceMetres: distance };
        }
    });

    return nearest;
}

/**
 * Assign a coordinate to a delivery zone.
 *
 * 1. Inside a zone            -> that zone (method 'polygon').
 * 2. Inside two or more zones -> last listed zone, flagged for review.
 * 3. Within the safety-net distance of a zone -> nearest zone, flagged for review.
 * 4. Otherwise                -> Unclassified, flagged for review.
 */
function matchZone(lng, lat, { maxNearestMetres = config.routing.nearestZoneMaxMetres } = {}) {
    const point = turf.point([lng, lat]);
    const matches = [];

    zones.features.forEach((feature, index) => {
        if (turf.booleanPointInPolygon(point, feature)) {
            matches.push(zoneName(feature, index));
        }
    });

    if (matches.length > 0) {
        const overlap = matches.length > 1;
        return {
            zone: matches[matches.length - 1],
            method: METHOD.POLYGON,
            needsReview: overlap,
            reviewReason: overlap ? `Inside more than one zone: ${matches.join(', ')}` : null,
            overlap,
            allMatches: matches,
            distanceMetres: 0
        };
    }

    const nearest = findNearestZone(point);

    if (nearest && nearest.distanceMetres <= maxNearestMetres) {
        const metres = Math.round(nearest.distanceMetres);
        return {
            zone: nearest.zone,
            method: METHOD.NEAREST,
            needsReview: true,
            reviewReason: `Outside all zones; nearest is ${nearest.zone} (${metres} m away)`,
            overlap: false,
            allMatches: [],
            distanceMetres: metres
        };
    }

    return {
        zone: UNCLASSIFIED,
        method: METHOD.UNCLASSIFIED,
        needsReview: true,
        reviewReason: nearest
            ? `Outside all zones; nearest is ${nearest.zone} (${Math.round(nearest.distanceMetres)} m away, beyond the ${maxNearestMetres} m safety net)`
            : 'No zones loaded',
        overlap: false,
        allMatches: [],
        distanceMetres: nearest ? Math.round(nearest.distanceMetres) : null
    };
}

module.exports = { matchZone, findNearestZone, METHOD, UNCLASSIFIED };
