'use strict';

module.exports = async (client, interaction) => {
    const eventManager = global.addonLoader?.getEventManager();
    if (!eventManager) return;
    await eventManager.emitAddonEvent('discord:interactionCreate', { interaction }, {
        allowParallel: false,
        stopOnResult: true
    });
};
