const { EmbedBuilder, AuditLogEvent } = require('discord.js');

const moment = require('moment-timezone');
const UserData = require('../models/UserData');
const GuildData = require('../models/guildDataSchema');
const { getConfig } = require('../utils/core/configLoader.js');
const { getLogChannel } = require('../utils/handlers/messageUtils.js');
const config = getConfig();

module.exports = async (client, ban) => {
    try {
        const banLogCache = global.addonLoader?.getService('moderation.commands')?.banLogCache;
        const cachedBan = banLogCache?.get(ban.user.id);
        let moderator, reason, banLog = null;

        if (cachedBan && Date.now() - cachedBan.timestamp < 10000) {
            moderator = cachedBan.moderator;
            reason = cachedBan.reason;
            banLogCache.delete(ban.user.id);
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));

            for (let attempt = 0; attempt < 3; attempt++) {
                const fetchedLogs = await ban.guild.fetchAuditLogs({
                    limit: 5,
                    type: AuditLogEvent.MemberBanAdd,
                });

                banLog = fetchedLogs.entries.find(entry => 
                    entry.target.id === ban.user.id && 
                    Date.now() - entry.createdTimestamp < 10000
                );

                if (banLog) break;
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (!banLog) return;

            moderator = banLog.executor;
            reason = banLog.reason;
        }

        if (banLog) {
            const antiNuke = global.addonLoader?.getService('security.antiNuke');
            await antiNuke?.handleBanEvent(client, ban, banLog);
        }

        let guildData = await GuildData.findOneAndUpdate(
            { guildID: ban.guild.id },
            { $inc: { cases: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        let caseNumber = guildData ? guildData.cases : 'N/A';
        let currentTime = moment().tz(config.Timezone);

        logBan(ban, reason, moderator, caseNumber, currentTime);

        await UserData.findOneAndUpdate(
            { userId: ban.user.id, guildId: ban.guild.id },
            { $inc: { bans: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('moderation:ban', {
                type: 'ban',
                target: ban.user,
                moderator: moderator,
                reason: reason || 'No reason provided',
                guild: ban.guild,
                dmSent: false,
                method: 'audit'
            });
        }
    } catch (error) {
        console.error('Error handling ban event:', error);
    }
};

async function logBan(ban, reason, moderator, caseNumber, currentTime) {
    if (!config.BanLogs.Enabled) return;
    
    const logChannel = getLogChannel(ban.guild, config.BanLogs.LogsChannelID);
    if (!logChannel) return;

    const logMessageEmbed = new EmbedBuilder()
        .setColor(config.BanLogs.Embed.Color || "#FF0000")
        .setTitle(replacePlaceholders(config.BanLogs.Embed.Title, ban, reason, moderator, caseNumber, currentTime))
        .setDescription(replacePlaceholders(config.BanLogs.Embed.Description.join('\n'), ban, reason, moderator, caseNumber, currentTime))
        .setFooter({ text: replacePlaceholders(config.BanLogs.Embed.Footer, ban, reason, moderator, caseNumber, currentTime) });

    try {
        await logChannel.send({ embeds: [logMessageEmbed] });
    } catch (error) {
        console.error(`Failed to log ban in channel: ${error}`);
    }
}

function replacePlaceholders(text, ban, reason, moderator, caseNumber, currentTime) {
    return text
        .replace(/{user}/g, `<@${ban.user.id}>`)
        .replace(/{userName}/g, ban.user.username)
        .replace(/{userTag}/g, ban.user.tag)
        .replace(/{userId}/g, ban.user.id)
        .replace(/{guildName}/g, ban.guild.name)
        .replace(/{moderator}/g, `<@${moderator.id}>`)
        .replace(/{reason}/g, reason || 'No reason provided')
        .replace(/{caseNumber}/g, caseNumber)
        .replace(/{shorttime}/g, currentTime.format("HH:mm"))
        .replace(/{longtime}/g, currentTime.format('MMMM Do YYYY'))
        .replace(/{botName}/g, config.BotName || 'DragonHosting');
}
