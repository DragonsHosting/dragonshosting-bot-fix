'use strict';

module.exports = {
    name: 'AutoReact',
    version: '1.0.0',
    description: 'Configurable automatic message reactions',
    async run(client, eventManager, api) {
        const model = require('./models/autoReact');
        const { checkAutoReact } = require('./utils/autoReactHandler');
        api.registerModel('AutoReact', model);
        api.onDiscord('messageCreate', async ({ message }) => {
            if (message?.guild && !message.author?.bot && message.deletable) await checkAutoReact(message);
            return false;
        });
        return () => {};
    }
};
