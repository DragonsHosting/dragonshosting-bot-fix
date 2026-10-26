'use strict';

module.exports = {
    name: 'DragonHostingStaff',
    version: '1.0.0',
    description: 'DragonHosting staff panels, applications and role controls',
    async run(client, eventManager, api) {
        const handleInteraction = require('./events/interactionCreate');
        api.onDiscord('interactionCreate', async ({ interaction }) => {
            if (!interaction) return false;
            await handleInteraction(client, interaction);
            return interaction.replied || interaction.deferred;
        }, { priority: -100 });
        return () => {};
    }
};
