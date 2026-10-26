const AutoReact = require('../models/autoReact');

async function checkAutoReact(message) {
    const autoReactData = await AutoReact.findOne({ guildId: message.guild.id });
    if (!autoReactData || autoReactData.reactions.length === 0) return;

    autoReactData.reactions.forEach(reaction => {
        if (message.content.toLowerCase().includes(reaction.keyword.toLowerCase())) {
            if (isEligibleForReaction(message, reaction)) {
                message.react(reaction.emoji).catch(error => {
                    if (error.code === 10008) {
                        return;
                    } else {
                        console.error("Error reacting to message:", error);
                    }
                });

                if (global.addonLoader) {
                    global.addonLoader.getEventManager().emitSafe('autoReact:triggered', {
                        message: message,
                        keyword: reaction.keyword,
                        emoji: reaction.emoji,
                        reaction: reaction,
                        guild: message.guild,
                        user: message.author
                    });
                }
            }
        }
    });
}

function isEligibleForReaction(message, reaction) {
    const memberRoles = message.member.roles.cache;
    const channelId = message.channel.id;
    const validRoleIds = reaction.whitelistRoles.filter(roleId => !isNaN(roleId));
    const isRoleEligible = validRoleIds.length === 0 || memberRoles.some(role => validRoleIds.includes(role.id));
    const validChannelIds = reaction.whitelistChannels.filter(channelId => !isNaN(channelId));
    const isChannelEligible = validChannelIds.length === 0 || validChannelIds.includes(channelId);
    return isRoleEligible && isChannelEligible;
}

module.exports = {
    checkAutoReact
};