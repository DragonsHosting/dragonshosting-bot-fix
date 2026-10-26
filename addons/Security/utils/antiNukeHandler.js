const { getConfig } = require('../../../utils/core/configLoader.js');
const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');

const config = getConfig();
let actions = {};

function parseDuration(duration) {
    const match = duration.match(/(\d+)([smhd])/);
    if (!match) return 0;

    const amount = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 's': return amount * 1000;
        case 'm': return amount * 60 * 1000;
        case 'h': return amount * 60 * 60 * 1000;
        case 'd': return amount * 24 * 60 * 60 * 1000;
        default: return 0;
    }
}

async function canTakeAction(client, guild, executor) {
    try {
        if (executor.id === guild.ownerId) {
            return false;
        }

        const botMember = await guild.members.fetch(client.user.id);
        const executorMember = await guild.members.fetch(executor.id);

        const whitelistedRoles = config.AntiNuke.WhitelistedRoles || [];
        if (executorMember.roles.cache.some(role => whitelistedRoles.includes(role.id))) {
            return false;
        }

        return executorMember.roles.highest.comparePositionTo(botMember.roles.highest) < 0;
    } catch (err) {
        return false;
    }
}

async function checkAntiNuke(client, guild, type, executor) {
    const { AntiNuke } = config;
    if (!AntiNuke.Enabled) return;

    if (executor.id === client.user.id) return;
    if (executor.id === guild.ownerId) return;

    const tiers = AntiNuke.Default.Tiers;
    const now = Date.now();
    const id = executor.id;

    if (!actions[id]) {
        actions[id] = {
            kickThreshold: 0,
            banThreshold: 0,
            channelDeleteThreshold: 0,
            roleDeleteThreshold: 0,
            lastAction: now,
            lastTier: null
        };
    }

    const action = actions[id];
    const timeDifference = now - action.lastAction;

    const maxDuration = Math.max(...Object.values(tiers).map(tier => parseDuration(tier.Protection.duration)));

    if (timeDifference > maxDuration) {
        action.kickThreshold = 0;
        action.banThreshold = 0;
        action.channelDeleteThreshold = 0;
        action.roleDeleteThreshold = 0;
        action.lastTier = null;
    }

    if (typeof action[type] === 'undefined') {
        action[type] = 0;
    }
    action[type] += 1;
    action.lastAction = now;

    const tierNumbers = Object.keys(tiers).map(key => parseInt(key.replace('Tier', '')));
    const maxTier = Math.max(...tierNumbers);

    for (let i = maxTier; i >= 1; i--) {
        const tier = tiers[`Tier${i}`];
        if (tier && action[type] >= tier.Protection[type]) {
            if (action.lastTier !== `Tier${i}`) {
                await applyActions(client, guild, executor, tier, type, action[type]);
                action.lastTier = `Tier${i}`;
                break;
            }
        }
    }
}

function findLogsChannel(guild, logsChannelIdConfig) {
    if (!logsChannelIdConfig) return null;
    const channelIds = Array.isArray(logsChannelIdConfig) ? logsChannelIdConfig : [logsChannelIdConfig];
    for (const channelId of channelIds) {
        if (!channelId || channelId === "" || channelId === "CHANNEL_ID") continue;
        const channel = guild.channels.cache.get(channelId);
        if (channel) return channel;
    }
    return null;
}

async function applyActions(client, guild, executor, tier, type, count) {
    const logsChannel = findLogsChannel(guild, tier.Logs.LogsChannelID);
    const embed = {
        title: tier.Logs.Embed.Title,
        description: tier.Logs.Embed.Description.join('\n')
            .replace('{user}', `<@${executor.id}>`)
            .replace('{threshold}', type)
            .replace('{threshold_amount}', count)
            .replace('{timestamp}', new Date().toLocaleString()),
        color: parseInt(tier.Logs.Embed.Color.replace('#', ''), 16),
        footer: { text: tier.Logs.Embed.Footer },
        thumbnail: tier.Logs.Embed.Thumbnail ? { url: executor.displayAvatarURL() } : null
    };

    if (tier.Actions.notify.length > 0) {
        for (const userID of tier.Actions.notify) {
            const user = client.users.cache.get(userID);
            if (user) {
                try {
                    await user.send({ embeds: [embed] });
                } catch (err) {
                    if (err.code === 50007) {
                        console.error(`Cannot send messages to this user (AntiNuke)`);
                    }
                }
            }
        }
    }

    if (tier.Actions.removeRole) {
        try {
            const member = await guild.members.fetch(executor.id);
            if (member) {
                const rolesToRemove = member.roles.cache.filter(r => r.permissions.has(PermissionFlagsBits.ManageGuild));
                if (rolesToRemove.size > 0) {
                    for (const role of rolesToRemove.values()) {
                        await member.roles.remove(role);
                    }
                }
            }
        } catch (err) {
            console.error(`Failed to remove roles from ${executor.tag || executor.username}: ${err.message}`);
        }
    }

    if (tier.Actions.mute) {
        try {
            const member = await guild.members.fetch(executor.id);
            if (member) {
                await member.timeout(600000);
            }
        } catch (err) {
            if (err.code === 50013) {
                console.error(`Failed to mute user ${executor.tag || executor.username}: Missing Permissions (Move bots role higher or they have admin perms)`);
            } else {
                console.error(`Failed to mute user ${executor.tag || executor.username}: ${err.message}`);
            }
        }
    }

    if (tier.Actions.ban) {
        try {
            await guild.members.ban(executor.id, { reason: 'Anti-Nuke System' });
        } catch (err) {
            console.error(`Failed to ban user ${executor.tag || executor.username}: ${err.message}`);
        }
    }

    if (logsChannel) {
        try {
            await logsChannel.send({ embeds: [embed] });
        } catch (err) {
            console.error(`Failed to send log message to ${logsChannel.name}: ${err.message}`);
        }
    }
}

async function handleKickEvent(client, member, auditLogEntry) {
    if (auditLogEntry && await canTakeAction(client, member.guild, auditLogEntry.executor)) {
        await checkAntiNuke(client, member.guild, 'kickThreshold', auditLogEntry.executor);
    }
}

async function handleBanEvent(client, ban, auditLogEntry) {
    if (auditLogEntry && await canTakeAction(client, ban.guild, auditLogEntry.executor)) {
        await checkAntiNuke(client, ban.guild, 'banThreshold', auditLogEntry.executor);
    }
}

async function handleChannelDeleteEvent(client, channel, auditLogEntry) {
    if (auditLogEntry && await canTakeAction(client, channel.guild, auditLogEntry.executor)) {
        await checkAntiNuke(client, channel.guild, 'channelDeleteThreshold', auditLogEntry.executor);
    }
}

async function handleRoleDeleteEvent(client, role, auditLogEntry) {
    if (auditLogEntry && await canTakeAction(client, role.guild, auditLogEntry.executor)) {
        await checkAntiNuke(client, role.guild, 'roleDeleteThreshold', auditLogEntry.executor);
    }
}

module.exports = {
    handleKickEvent,
    handleBanEvent,
    handleChannelDeleteEvent,
    handleRoleDeleteEvent
};