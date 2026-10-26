'use strict';

module.exports = {
    name: 'Leveling',
    version: '1.0.0',
    description: 'Message, voice XP and leaderboard features',
    async run(client, eventManager, api) {
        const { handleXP } = require('./events/handleXP');
        const handleMessageCount = require('./events/handleMessageCount');
        const voiceXP = require('./events/voiceXP');
        const leaderboardCache = require('./utils/leaderboard-cache');

        api.registerService('leveling.cache', leaderboardCache);
        api.onDiscord('messageCreate', async ({ message }) => {
            if (!message || message.author?.bot) return false;
            await handleMessageCount(message);
            await handleXP(message);
            return false;
        });
        api.onDiscord('voiceStateUpdate', async ({ oldState, newState }) => {
            voiceXP.handleVoiceState(client, oldState, newState);
            return false;
        });
        voiceXP.startCleanup();

        return () => {
            voiceXP.cleanup();
            leaderboardCache.stopBackgroundUpdates?.();
        };
    }
};
