function validateAddress(address) {
    if (typeof address !== 'string') return null;
    const trimmed = address.trim();
    if (!trimmed || trimmed.length > 255) return null;
    return trimmed;
}

module.exports = { validateAddress };
