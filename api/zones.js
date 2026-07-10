const zones = require('../lib/zones');

module.exports = (_req, res) => {
    res.status(200).json(zones);
};
