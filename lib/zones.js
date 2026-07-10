const path = require('path');
const fs = require('fs');

const zonesPath = path.join(__dirname, '..', 'zones.json');
const zones = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));

module.exports = zones;
