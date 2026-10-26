const applyConfigUpdates = require('./config');
const applyLangUpdates = require('./lang');

module.exports = function apply(helpers) {
    applyConfigUpdates(helpers);
    applyLangUpdates(helpers);
};
