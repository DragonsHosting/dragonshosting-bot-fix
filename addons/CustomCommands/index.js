'use strict';

module.exports = {
    name: 'CustomCommands',
    version: '1.0.0',
    description: 'Database backed custom commands and reply buttons',
    async run(client, eventManager, api) {
        const model = require('./models/CustomCommand');
        const handler = require('./utils/customCommandHandler');
        api.registerModel('CustomCommand', model);
        api.registerService('customCommands', handler);
        api.onDiscord('messageCreate', async ({ message }) => {
            if (!message?.guild || message.author?.bot) return false;
            if (message.content.startsWith(api.config.CommandsPrefix)) await handler.processCustomCommands(client, message);
            return false;
        });
        api.onDiscord('interactionCreate', async ({ interaction }) => {
            if (!interaction?.isButton?.() || !interaction.customId.startsWith('reply_')) return false;
            await handler.handleButtonInteraction(interaction);
            return true;
        }, { priority: 50 });
        return () => {};
    }
};
