'use strict';
module.exports = {
 apiRoutes: [{ method: 'use', fullPath: '/api/tickets', useGlobalAuth: false, path: '', handler: require('./routes') }]
};
