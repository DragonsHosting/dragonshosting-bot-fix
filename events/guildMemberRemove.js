const { EmbedBuilder, AuditLogEvent, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const moment = require('moment-timezone');

const UserData = require('../models/UserData');
const GuildData = require('../models/guildDataSchema');
const { getConfig } = require('../utils/core/configLoader.js');
const { getLogChannel } = require('../utils/handlers/messageUtils.js');
const { sendComponentsV2Message, deleteComponentsV2Message } = require('../utils/core/componentsV2Builder.js');
const config = getConfig();

const sentLeaveEmbeds = new Set();

function parseTime(timeString) {
    const regex = /^(\d+)([smhd])$/;
    const match = timeString.match(regex);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 0;
    }
}

const LEAVE_EMBED_RESET_INTERVAL = parseTime('5m');

setInterval(() => {
    sentLeaveEmbeds.clear();
}, LEAVE_EMBED_RESET_INTERVAL);

module.exports = async (client, member) => {
    if (!member || member.id === client.user.id) return;


    await saveUserRoles(member);
    await sendLeaveMessage(member);
    await updateMemberCount(member);
    await processKickEvent(member);

    if (config.LevelingSystem?.Enabled && config.LevelingSystem.ResetDataOnLeave) {
        await resetUserDataOnLeave(member);
    }

    await updateInviteUsage(member);
};

async function saveUserRoles(member) {
    try {
        const roles = member.roles.cache.filter(role => role.id !== member.guild.id).map(role => role.id);

        await UserData.findOneAndUpdate(
            { userId: member.id, guildId: member.guild.id },
            { roles: roles },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Error saving user roles:', error);
    }
}

async function updateInviteUsage(member) {
    try {
        await global.addonLoader?.getService('invites')?.handleLeave(member);
    } catch (error) {
        console.error('Error updating invite usage:', error);
    }
}

async function sendLeaveMessage(member) {
    if (!config.LeaveMessage.Enabled) {
        return;
    }

    let leaveChannel = null;
    const channelIDs = config.LeaveMessage.ChannelID;
    
    if (Array.isArray(channelIDs)) {
        for (const channelId of channelIDs) {
            if (!channelId || channelId === "" || channelId === "CHANNEL_ID") continue;
            const channel = member.guild.channels.cache.get(channelId);
            if (channel) {
                leaveChannel = channel;
                break;
            }
        }
    } else if (channelIDs && channelIDs !== "" && channelIDs !== "CHANNEL_ID") {
        leaveChannel = member.guild.channels.cache.get(channelIDs);
    }
    
    if (!leaveChannel) {
        return;
    }

    if (sentLeaveEmbeds.has(member.id)) {
        return;
    }

    const userAvatarURL = member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 });
    const userBannerURL = await getUserBannerURL(member);

    let inviterName = 'Unknown';
    let inviterCount = 0;
    try {
        const invite = await global.addonLoader?.getService('invites')?.getMemberInvite(member);
        if (invite && invite.inviterID) {
            const inviter = await member.guild.members.fetch(invite.inviterID).catch(() => null);
            if (inviter) {
                inviterName = inviter.user.username;
                inviterCount = invite.uses || 0;
            }
        }
    } catch (error) {
    }

    if (config.LeaveMessage.UseComponentsV2 && config.LeaveMessage.ComponentsV2) {
        try {
            const placeholderReplacer = (text) => replacePlaceholders(text || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, true);
            const message = await sendComponentsV2Message(member.client, leaveChannel.id, config.LeaveMessage.ComponentsV2, placeholderReplacer);

            if (message) {
                const autoDeleteEnabled = Boolean(config?.LeaveMessage?.AutoDelete?.Enabled);
                const autoDeleteDelayStr = config?.LeaveMessage?.AutoDelete?.Delay || "";
                const autoDeleteDelayMs = autoDeleteEnabled ? parseTime(autoDeleteDelayStr) : 0;
                if (autoDeleteEnabled && autoDeleteDelayMs > 0) {
                    setTimeout(async () => {
                        await deleteComponentsV2Message(member.client, leaveChannel.id, message.id);
                    }, autoDeleteDelayMs);
                }

                sentLeaveEmbeds.add(member.id);
            }
        } catch (error) {
            console.error('[ERROR] Failed to send ComponentsV2 leave message:', error);
        }
        return;
    }

    let leaveText = "";
    if (config.LeaveMessage.Type === "MESSAGE" || config.LeaveMessage.Type === "BOTH") {
        leaveText = replacePlaceholders(config.LeaveMessage.Text || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, false);
    }

    let leaveEmbed = null;
    if (config.LeaveMessage.Type === "EMBED" || config.LeaveMessage.Type === "BOTH") {
        leaveEmbed = new EmbedBuilder().setColor(config.LeaveMessage.Embed.Color || "#FF0000");

        const title = replacePlaceholders(config.LeaveMessage.Embed.Title || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, false);
        if (title && title.trim() !== "") leaveEmbed.setTitle(title);

        const description = replacePlaceholders(config.LeaveMessage.Embed.Description.join('\n') || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, true);
        if (description && description.trim() !== "") leaveEmbed.setDescription(description);

        const footerText = replacePlaceholders(config.LeaveMessage.Embed.Footer.Text || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
        const footerIcon = replacePlaceholders(config.LeaveMessage.Embed.Footer.Icon || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
        if (footerText && footerText.trim() !== "") {
            leaveEmbed.setFooter({
                text: footerText,
                iconURL: footerIcon || undefined
            });
        }

        const authorText = replacePlaceholders(config.LeaveMessage.Embed.Author.Text || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
        const authorIcon = replacePlaceholders(config.LeaveMessage.Embed.Author.Icon || '', member, "", null, "", inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
        if (authorText && authorText.trim() !== "") {
            leaveEmbed.setAuthor({
                name: authorText,
                iconURL: authorIcon || undefined
            });
        }

        if (config.LeaveMessage.Embed.Thumbnail && config.LeaveMessage.Embed.Thumbnail.trim() !== "") {
            let thumbnailURL = config.LeaveMessage.Embed.Thumbnail === "{user-avatar}" ? userAvatarURL : config.LeaveMessage.Embed.Thumbnail;
            leaveEmbed.setThumbnail(thumbnailURL);
        }

        if (config.LeaveMessage.Embed.Image && config.LeaveMessage.Embed.Image.trim() !== "") {
            let imageURL = config.LeaveMessage.Embed.Image === "{userBanner}" ? userBannerURL : config.LeaveMessage.Embed.Image;
            if (imageURL && imageURL !== '') {
                leaveEmbed.setImage(imageURL);
            }
        }
    }

    try {
        let sentMessage;
        if (config.LeaveMessage.Type === "BOTH") {
            sentMessage = await leaveChannel.send({ content: leaveText, embeds: [leaveEmbed] });
        } else if (config.LeaveMessage.Type === "MESSAGE") {
            sentMessage = await leaveChannel.send(leaveText);
        } else if (config.LeaveMessage.Type === "EMBED") {
            sentMessage = await leaveChannel.send({ embeds: [leaveEmbed] });
        }

        const autoDeleteEnabled = Boolean(config?.LeaveMessage?.AutoDelete?.Enabled);
        const autoDeleteDelayStr = config?.LeaveMessage?.AutoDelete?.Delay || "";
        const autoDeleteDelayMs = autoDeleteEnabled ? parseTime(autoDeleteDelayStr) : 0;
        if (sentMessage && autoDeleteEnabled && autoDeleteDelayMs > 0) {
            setTimeout(() => {
                sentMessage.delete().catch(() => {});
            }, autoDeleteDelayMs);
        }
    } catch (error) {
        console.error('[ERROR] Failed to send leave message:', error);
    }

    sentLeaveEmbeds.add(member.id);
}

async function getUserBannerURL(member) {
    try {
        const user = await member.user.fetch();
        return user.bannerURL({ format: 'png', dynamic: true, size: 4096 }) || null;
    } catch (error) {
        console.error('Error fetching user banner:', error);
        return null;
    }
}

async function updateMemberCount(member) {
    let memberCountChannel = getLogChannel(member.guild, config.MemberCountChannel);
    if (memberCountChannel) {
        let memberCountMsg = replacePlaceholders(config.MemberCountChannelName || '', member, "", null, "", "", false);
        memberCountChannel.setName(memberCountMsg).catch(console.error);
    }
}

async function resetUserDataOnLeave(member) {
    try {
        await UserData.findOneAndUpdate(
            { userId: member.id, guildId: member.guild.id },
            { xp: 0, level: 0 },
            { new: true }
        );
    } catch (error) {
        console.error('Error resetting user data on leave:', error);
    }
}

async function processKickEvent(member) {
    const kickLogCache = global.addonLoader?.getService('moderation.commands')?.kickLogCache;
    const timeWindowMs = 10000;
    const now = Date.now();

    try {
        const fetchedLogs = await member.guild.fetchAuditLogs({
            limit: 20,
            type: AuditLogEvent.MemberKick,
        });

        const relevantLogs = fetchedLogs.entries.filter(entry => {
            const isWithinTimeWindow = now - entry.createdTimestamp < timeWindowMs;
            const isTargetMember = entry.target.id === member.id;
            return isWithinTimeWindow && isTargetMember;
        });

        const sortedLogs = relevantLogs.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        const kickLog = sortedLogs.first();

        let moderator = kickLog?.executor || { id: 'unknown', username: 'Unknown', tag: 'Unknown' };
        let reason = kickLog?.reason || "No reason specified";

        if (kickLogCache?.has(member.id)) {
            const cachedKick = kickLogCache.get(member.id);
            if (now - cachedKick.timestamp < timeWindowMs) {
                moderator = cachedKick.moderator;
                reason = cachedKick.reason;
            }
        }

        if (kickLog) {
            const antiNuke = global.addonLoader?.getService('security.antiNuke');
            await antiNuke?.handleKickEvent(member.client, member, kickLog);
            const updatedGuildData = await GuildData.findOneAndUpdate(
                { guildID: member.guild.id },
                { $inc: { cases: 1 } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const caseNumber = updatedGuildData ? updatedGuildData.cases : 'N/A';

            await UserData.findOneAndUpdate(
                { userId: member.id, guildId: member.guild.id },
                { $inc: { kicks: 1 } },
                { upsert: true, new: true }
            );

            logKick(member, reason, moderator, caseNumber);
        } else {
        }
    } catch (error) {
        console.error('Error processing kick event:', error);
    }
}

function logKick(member, reason, moderator, caseNumber) {
    const currentTime = moment().tz(config.Timezone);
    const placeholders = {
        user: `<@${member.id}>`,
        userName: member.user.username,
        userTag: member.user.tag,
        userId: member.id,
        moderator: `<@${moderator.id}>`,
        moderatorName: moderator.username,
        moderatorTag: moderator.tag,
        moderatorId: moderator.id,
        reason: reason,
        shorttime: currentTime.format("HH:mm"),
        longtime: currentTime.format('MMMM Do YYYY'),
        caseNumber: caseNumber
    };

    const description = replacePlaceholders(config.KickLogs.Embed.Description.join('\n') || '', member, reason, moderator, caseNumber, "", 0, "", "", true);
    const kickEmbed = new EmbedBuilder()
        .setColor(config.KickLogs.Embed.Color || "#FF5555")
        .setTitle(replacePlaceholders(config.KickLogs.Embed.Title || '', member, reason, moderator, caseNumber, "", 0, "", "", true))
        .setDescription(description);

    const footerText = replacePlaceholders(config.KickLogs.Embed.Footer.Text || '', member, reason, moderator, caseNumber, "", 0, "", "", true);
    if (footerText && footerText.trim() !== "") {
        kickEmbed.setFooter({
            text: footerText,
            iconURL: config.KickLogs.Embed.Footer.Icon || undefined
        });
    }

    const thumbnailURL = member.user.displayAvatarURL({ dynamic: true });
    if (thumbnailURL) {
        kickEmbed.setThumbnail(thumbnailURL);
    }

    const logsChannel = getLogChannel(member.guild, config.KickLogs.LogsChannelID);
    if (logsChannel) {
        logsChannel.send({ embeds: [kickEmbed] });
    }
}

function replacePlaceholders(text, member, reason = '', moderator = {}, caseNumber = '', inviterName = '', inviterCount = 0, userAvatarURL = '', userBannerURL = '', isEmbed = false, useStaticTime = false) {
    if (!text) {
        return '';
    }
    const guildIconURL = member.guild.iconURL({ format: 'png', dynamic: true }) || '';
    const currentTime = moment().tz(config.Timezone);

    const joinTimestamp = member.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : Math.floor(Date.now() / 1000);
    const createdTimestamp = Math.floor(member.user.createdAt.getTime() / 1000);
    const nowTimestamp = Math.floor(Date.now() / 1000);

    const joinMoment = member.joinedAt ? moment(member.joinedAt).tz(config.Timezone) : currentTime;
    const createdMoment = moment(member.user.createdAt).tz(config.Timezone);

    let result = text
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{userName}/g, member.user.username)
        .replace(/{userTag}/g, member.user.tag)
        .replace(/{userId}/g, member.user.id)
        .replace(/{reason}/g, reason)
        .replace(/{moderator}/g, moderator ? `<@${moderator.id}>` : 'Unknown')
        .replace(/{caseNumber}/g, caseNumber)
        .replace(/{memberCount}/g, member.guild.memberCount)
        .replace(/{memberCountNumeric}/g, member.guild.memberCount)
        .replace(/{guildName}/g, member.guild.name)
        .replace(/{user-avatar}/g, userAvatarURL || '')
        .replace(/{userAvatar}/g, userAvatarURL || '')
        .replace(/{userBanner}/g, userBannerURL || '')
        .replace(/{guildIcon}/g, guildIconURL || '')
        .replace(/{invitedBy}/g, inviterName)
        .replace(/{invitedByCount}/g, inviterCount);

    if (useStaticTime) {
        result = result
            .replace(/{user-createdAt}/g, createdMoment.format('MM/DD/YYYY'))
            .replace(/{user-joinedAt}/g, joinMoment.format('MM/DD/YYYY'))
            .replace(/{shortTime}/g, currentTime.format('h:mm A'))
            .replace(/{longTime}/g, currentTime.format('MMMM D, YYYY'))
            .replace(/{joinDate}/g, joinMoment.format('MM/DD/YYYY'))
            .replace(/{joinTime}/g, joinMoment.format('h:mm A'))
            .replace(/{joinDateTime}/g, joinMoment.format('MMMM D, YYYY h:mm A'))
            .replace(/{joinRelative}/g, joinMoment.fromNow())
            .replace(/{leaveDate}/g, currentTime.format('MM/DD/YYYY'))
            .replace(/{leaveTime}/g, currentTime.format('h:mm A'))
            .replace(/{leaveDateTime}/g, currentTime.format('MMMM D, YYYY h:mm A'))
            .replace(/{leaveRelative}/g, 'just now')
            .replace(/{UserCreation}/g, createdMoment.fromNow())
            .replace(/{createdDate}/g, createdMoment.format('MM/DD/YYYY'))
            .replace(/{createdDateTime}/g, createdMoment.format('MMMM D, YYYY h:mm A'))
            .replace(/{createdRelative}/g, createdMoment.fromNow());
    } else {
        result = result
            .replace(/{user-createdAt}/g, `<t:${createdTimestamp}:d>`)
            .replace(/{user-joinedAt}/g, `<t:${joinTimestamp}:d>`)
            .replace(/{shortTime}/g, `<t:${nowTimestamp}:t>`)
            .replace(/{longTime}/g, `<t:${nowTimestamp}:D>`)
            .replace(/{joinDate}/g, `<t:${joinTimestamp}:d>`)
            .replace(/{joinTime}/g, `<t:${joinTimestamp}:t>`)
            .replace(/{joinDateTime}/g, `<t:${joinTimestamp}:f>`)
            .replace(/{joinRelative}/g, `<t:${joinTimestamp}:R>`)
            .replace(/{leaveDate}/g, `<t:${nowTimestamp}:d>`)
            .replace(/{leaveTime}/g, `<t:${nowTimestamp}:t>`)
            .replace(/{leaveDateTime}/g, `<t:${nowTimestamp}:f>`)
            .replace(/{leaveRelative}/g, `<t:${nowTimestamp}:R>`)
            .replace(/{UserCreation}/g, `<t:${createdTimestamp}:R>`)
            .replace(/{createdDate}/g, `<t:${createdTimestamp}:d>`)
            .replace(/{createdDateTime}/g, `<t:${createdTimestamp}:f>`)
            .replace(/{createdRelative}/g, `<t:${createdTimestamp}:R>`);
    }

    return result;
}

