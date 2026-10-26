const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const moment = require('moment-timezone');

const UserData = require('../models/UserData');
const GuildData = require('../models/guildDataSchema');
const { getConfig } = require('../utils/core/configLoader.js');
const { getLogChannel } = require('../utils/handlers/messageUtils.js');
const config = getConfig();

module.exports = async (client, ban) => {
    try {
        const unbanLogCache = global.addonLoader?.getService('moderation.commands')?.unbanLogCache;
        const cachedUnban = unbanLogCache?.get(ban.user.id);
        let moderator, reason;

        if (cachedUnban && Date.now() - cachedUnban.timestamp < 10000) {
            moderator = cachedUnban.moderator;
            reason = cachedUnban.reason;
            unbanLogCache.delete(ban.user.id);
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));

            let unbanLog = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                const fetchedLogs = await ban.guild.fetchAuditLogs({
                    limit: 5,
                    type: AuditLogEvent.MemberBanRemove,
                });

                unbanLog = fetchedLogs.entries.find(entry => 
                    entry.target.id === ban.user.id && 
                    Date.now() - entry.createdTimestamp < 10000
                );

                if (unbanLog) break;
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (!unbanLog) return;

            moderator = unbanLog.executor;
            reason = unbanLog.reason || "No reason provided";
        }

        let guildData = await GuildData.findOneAndUpdate(
            { guildID: ban.guild.id },
            { $inc: { cases: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        let caseNumber = guildData ? guildData.cases : 'N/A';
        let currentTime = moment().tz(config.Timezone);

        const unbanEmbed = new EmbedBuilder()
            .setColor(config.UnbanLogs.Embed.Color || "#00FF00")
            .setTitle(replacePlaceholders(config.UnbanLogs.Embed.Title, ban, moderator, reason, caseNumber, currentTime))
            .setDescription(replacePlaceholders(config.UnbanLogs.Embed.Description.join('\n'), ban, moderator, reason, caseNumber, currentTime))
            .setFooter({ text: replacePlaceholders(config.UnbanLogs.Embed.Footer, ban, moderator, reason, caseNumber, currentTime) });

        if (config.UnbanLogs.Enabled) {
            const logsChannel = getLogChannel(ban.guild, config.UnbanLogs.LogsChannelID);
            if (logsChannel) {
                logsChannel.send({ embeds: [unbanEmbed] });
            }
        }

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('moderation:unban', {
                type: 'unban',
                targetUserId: ban.user.id,
                moderator: moderator,
                reason: reason,
                guild: ban.guild,
                method: 'audit'
            });
        }
    } catch (error) {
        console.error('Error handling unban event:', error);
    }
};

function replacePlaceholders(text, ban, moderator, reason, caseNumber, currentTime) {
    return text
        .replace(/{user}/g, `<@${ban.user.id}>`)
        .replace(/{userName}/g, ban.user.username)
        .replace(/{userTag}/g, ban.user.tag)
        .replace(/{userId}/g, ban.user.id)
        .replace(/{moderator}/g, `<@${moderator.id}>`)
        .replace(/{reason}/g, reason)
        .replace(/{guildName}/g, ban.guild.name)
        .replace(/{caseNumber}/g, caseNumber)
        .replace(/{shorttime}/g, currentTime.format("HH:mm"))
        .replace(/{longtime}/g, currentTime.format('MMMM Do YYYY'))
        .replace(/{botName}/g, config.BotName || 'DragonHosting');
}
