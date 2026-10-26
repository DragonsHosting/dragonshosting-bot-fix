'use strict';
module.exports = {
 apiRoutes: [{ method: 'use', fullPath: '/api/suggestions', useGlobalAuth: false, path: '', handler: require('./routes') }]
};
