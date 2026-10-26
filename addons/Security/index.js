'use strict';

module.exports = {
    name: 'Security',
    version: '1.0.0',
    description: 'Anti spam, anti mass mention, anti nuke and security alerts',
    async run(client, eventManager, api) {
        const antiSpam = require('./utils/antiSpamHandler');
        const antiNuke = require('./utils/antiNukeHandler');

        api.registerModel('Alert', require('./models/alerts'));
        api.registerModel('SystemAlert', require('./models/systemAlert'));
        api.registerService('security.antiSpam', antiSpam);
        api.registerService('security.antiNuke', antiNuke);

        api.onDiscord('messageCreate', async ({ message }) => {
            if (!message?.guild || !message.member || message.author?.bot || !message.deletable) return false;
            await Promise.allSettled([
                antiSpam.checkAntiMassMention(message),
                antiSpam.checkAntiSpam(message)
            ]);
            return false;
        });

        return () => {};
    }
};
