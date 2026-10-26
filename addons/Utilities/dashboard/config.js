'use strict';

module.exports = {
    apiRoutes: [{ method: 'use', fullPath: '/api/templates', useGlobalAuth: false, path: '', handler: require('./routes') }]
};
