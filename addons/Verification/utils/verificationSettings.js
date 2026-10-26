const { EmbedBuilder } = require('discord.js');

function getLogChannel(guild, channelId) {
    const ids = Array.isArray(channelId) ? channelId : [channelId];
    return ids.filter(id => id && id !== 'CHANNEL_ID').map(id => guild.channels.cache.get(id)).find(Boolean) || null;
}

function handleVerificationSettings(message, config) {
    try {
        if (!message?.deletable) return;
        if (!config.VerificationSettings?.Enabled || !message?.channel) return;
        if (config.VerificationSettings.DeleteAllMessages &&
            message.channel.id === config.VerificationSettings.ChannelID) {
            message.delete().catch(error => {
                if (error.code !== 10008) console.error('Error deleting verification message:', error);
            });
        }
        if (config.VerificationSettings.SendEmbedOnJoin && message.type === 'GUILD_MEMBER_JOIN') {
            const embed = new EmbedBuilder()
                .setColor(config.VerificationSettings.Embed.Color)
                .setTitle(config.VerificationSettings.Embed.Title)
                .setDescription(config.VerificationSettings.Embed.Description)
                .setFooter({ text: config.VerificationSettings.Embed.Footer });
            const channel = message.guild
                ? getLogChannel(message.guild, config.VerificationSettings.ChannelID)
                : null;
            channel?.send({ embeds: [embed] }).catch(console.error);
        }
    } catch (error) {
        console.error('An unexpected error occurred in verification message handling:', error);
    }
}

module.exports = { handleVerificationSettings };
