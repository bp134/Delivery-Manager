// UK postcode helpers. Accepts "ol164aa", "OL16 4AA", "ol16  4aa" etc.
const POSTCODE_IN_TEXT = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/i;

function normalisePostcode(value) {
    if (typeof value !== 'string') return null;
    const match = value.toUpperCase().match(POSTCODE_IN_TEXT);
    return match ? `${match[1]} ${match[2]}` : null;
}

// Finds a postcode anywhere in a free-text address (uses the last one if several).
function extractPostcode(address) {
    if (typeof address !== 'string') return null;
    const all = address.toUpperCase().match(new RegExp(POSTCODE_IN_TEXT.source, 'gi'));
    return all ? normalisePostcode(all[all.length - 1]) : null;
}

module.exports = { normalisePostcode, extractPostcode };
