'use strict';

module.exports = {
    apiRoutes: [{
        method: 'use',
        fullPath: '/api/custom-commands',
        useGlobalAuth: false,
        path: '',
        handler: require('./routes')
    }]
};
