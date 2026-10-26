'use strict';

module.exports = {
    name: 'AutoResponse',
    version: '1.0.0',
    description: 'Configurable automatic message responses',
    async run(client, eventManager, api) {
        const model = require('./models/autoResponse');
        const { processAutoResponses } = require('./utils/autoResponseHandler');
        api.registerModel('AutoResponse', model);
        api.onDiscord('messageCreate', async ({ message }) => {
            if (message?.guild && !message.author?.bot && message.deletable) await processAutoResponses(message);
            return false;
        });
        return () => {};
    }
};
