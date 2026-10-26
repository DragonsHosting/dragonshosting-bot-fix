'use strict';

const { getConfig, getLang } = require('../../../utils/core/configLoader');
const { checkBlacklistWords } = require('../../../utils/handlers/messageUtils');
const suggestionActions = require('./suggestionActions');
const { isBlacklisted } = require('../utils/blacklist');

const BLACKLIST_CACHE_DURATION = 5 * 60 * 1000;

module.exports = async function handleSuggestionMessage(client, message) {
    if (!message?.guild || !message.member || message.author?.bot || !message.deletable) return false;
    const config = getConfig();
    const lang = getLang();
    const settings = config.SuggestionSettings;
    if (!settings) return false;

    const configuredChannels = settings.ChannelSuggestionID || settings.ChannelID;
    const channelIds = Array.isArray(configuredChannels) ? configuredChannels : [configuredChannels];
    const isSuggestionChannel = channelIds.some(id => id && id !== 'CHANNEL_ID' && message.channel.id === id);
    if (!isSuggestionChannel) return false;

    try {
        if (!settings.AllowChannelSuggestions) return true;
        const validRoles = (settings.AllowedRoles || []).filter(id => id && id !== 'ROLE_ID' && message.guild.roles.cache.has(id));
        const hasAllowedRole = !validRoles.length || validRoles.some(id => message.member.roles.cache.has(id));
        if (!hasAllowedRole) {
            const errorMessage = await message.channel.send({ content: lang.NoPermsMessage });
            if (settings.DeleteFailureMessages) setTimeout(() => errorMessage.delete().catch(() => {}), settings.FailureMessageTimeout);
            if (settings.DeleteOriginalMessage) await message.delete().catch(() => {});
            return true;
        }

        if (await isBlacklisted(message.author.id, BLACKLIST_CACHE_DURATION)) {
            const errorMessage = await message.channel.send({ content: lang.Suggestion.BlacklistMessage });
            if (settings.DeleteFailureMessages) setTimeout(() => errorMessage.delete().catch(() => {}), settings.FailureMessageTimeout);
            if (settings.DeleteOriginalMessage) await message.delete().catch(() => {});
            return true;
        }

        if (settings.blockBlacklistWords && await checkBlacklistWords(message, false)) {
            const errorMessage = await message.channel.send({
                content: lang.BlacklistWords.Message.replace(/{user}/g, message.author.toString())
            });
            if (settings.DeleteFailureMessages) setTimeout(() => errorMessage.delete().catch(() => {}), settings.FailureMessageTimeout);
            if (settings.DeleteOriginalMessage) await message.delete().catch(() => {});
            return true;
        }

        await suggestionActions.createSuggestion(client, message, message.content);
        if (settings.DeleteOriginalMessage) await message.delete().catch(error => {
            if (error.code !== 10008) console.error('[Suggestions] Could not delete source message:', error);
        });
    } catch (error) {
        console.error('[Suggestions] Channel suggestion failed:', error);
        const errorMessage = await message.channel.send({ content: `${message.author}, ${lang.Suggestion.Error}` }).catch(() => null);
        if (errorMessage) setTimeout(() => errorMessage.delete().catch(() => {}), 5000);
    }
    return true;
};
