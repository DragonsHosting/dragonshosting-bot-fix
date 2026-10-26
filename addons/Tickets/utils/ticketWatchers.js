const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, REST, Routes } = require('discord.js');
const Ticket = require('../models/tickets');
const { getConfig } = require('../../../utils/core/configLoader.js');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const notificationCooldowns = new Map();
const COOLDOWN_MS = 30000;

const PRIORITY_COLORS = {
    'High': '#ff0000',
    'Medium': '#ffff00',
    'Low': '#00ff00'
};

async function notifyWatchers(client, ticket, eventType, data = {}) {
    try {
        if (!ticket.watchers || ticket.watchers.length === 0) return;

        const cooldownKey = `${ticket.channelId}-${eventType}`;
        const now = Date.now();
        const lastNotification = notificationCooldowns.get(cooldownKey);
        
        if (eventType === 'message' && lastNotification && now - lastNotification < COOLDOWN_MS) {
            return;
        }
        
        notificationCooldowns.set(cooldownKey, now);

        const guild = client.guilds.cache.get(ticket.guildId);
        if (!guild) return;

        const config = getConfig();
        const watcherConfig = config.WatcherNotifications;

        const buttonRow = {
            type: 1,
            components: [{
                type: 2,
                style: 5,
                label: 'Go to Ticket',
                url: `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}`,
                emoji: { name: '🎫' }
            }]
        };

        for (const watcherId of ticket.watchers) {
            if (eventType === 'message' && data.authorId === watcherId) continue;
            if (data.excludeUser === watcherId) continue;

            try {
                const user = await client.users.fetch(watcherId).catch(() => null);
                if (!user) continue;

                const dmChannel = await user.createDM().catch(() => null);
                if (!dmChannel) continue;

                const eventConfig = getEventConfig(watcherConfig, eventType);
                
                if (eventConfig?.Components) {
                    const placeholders = buildPlaceholders(eventType, data, ticket, guild);
                    const replacer = createSimplePlaceholderReplacer(placeholders);
                    const v2Components = buildComponentsV2Payload({ Components: eventConfig.Components }, replacer, []);
                    
                    if (v2Components && v2Components.length > 0) {
                        v2Components.push(buttonRow);
                        const rest = new REST({ version: '10' }).setToken(client.token);
                        await rest.post(Routes.channelMessages(dmChannel.id), {
                            body: { flags: 32768, components: v2Components }
                        }).catch(() => {});
                        continue;
                    }
                }

                const embed = createWatcherEmbed(eventType, data, ticket, guild);
                if (embed) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Go to Ticket')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/channels/${ticket.guildId}/${ticket.channelId}`)
                            .setEmoji('🎫')
                    );
                    await user.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } catch (error) {
            }
        }
    } catch (error) {
        console.error('Error notifying watchers:', error);
    }
}

function getEventConfig(watcherConfig, eventType) {
    if (!watcherConfig) return null;
    const eventMap = {
        'message': watcherConfig.Message,
        'claimed': watcherConfig.Claimed,
        'unclaimed': watcherConfig.Unclaimed,
        'priority': watcherConfig.Priority,
        'user_added': watcherConfig.UserAdded,
        'user_removed': watcherConfig.UserRemoved,
        'alert': watcherConfig.Alert,
        'closing': watcherConfig.Closing,
        'close_request': watcherConfig.CloseRequest
    };
    return eventMap[eventType] || null;
}

function buildPlaceholders(eventType, data, ticket, guild) {
    const base = {
        ticketId: ticket.ticketId,
        guildName: guild.name
    };

    switch (eventType) {
        case 'message':
            return { ...base, authorId: data.authorId, content: data.content?.substring(0, 200) || '*No text content*' };
        case 'claimed':
            return { ...base, claimerId: data.claimerId };
        case 'unclaimed':
            return { ...base, unclaimerId: data.unclaimerId };
        case 'priority':
            return { ...base, oldPriority: data.oldPriority, newPriority: data.newPriority, changedBy: data.changedBy, priorityColor: PRIORITY_COLORS[data.newPriority] || '#5865F2' };
        case 'user_added':
            return { ...base, addedUser: data.addedUser, addedBy: data.addedBy };
        case 'user_removed':
            return { ...base, removedUser: data.removedUser, removedBy: data.removedBy };
        case 'closing':
            return { ...base, closedBy: data.closedBy, reason: data.reason ? `**Reason:** ${data.reason}` : '' };
        case 'close_request':
            return { ...base, requestedBy: data.requestedBy, reason: data.reason || 'No reason provided' };
        default:
            return base;
    }
}

function createWatcherEmbed(eventType, data, ticket, guild) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setFooter({ text: `Ticket #${ticket.ticketId} • ${guild.name}`, iconURL: guild.iconURL() })
        .setTimestamp();

    switch (eventType) {
        case 'message':
            embed.setTitle('💬 New Message in Watched Ticket')
                .setDescription(
                    `**Author:** <@${data.authorId}>\n` +
                    `**Message:** ${data.content?.substring(0, 200) || '*No text content*'}${data.content?.length > 200 ? '...' : ''}`
                );
            if (data.attachments > 0) {
                embed.addFields({ name: '📎 Attachments', value: `${data.attachments} file(s)`, inline: true });
            }
            break;

        case 'claimed':
            embed.setTitle('🎫 Ticket Claimed')
                .setColor('#00FF00')
                .setDescription(`Ticket has been claimed by <@${data.claimerId}>.`);
            break;

        case 'unclaimed':
            embed.setTitle('🔓 Ticket Unclaimed')
                .setColor('#FFA500')
                .setDescription(`Ticket has been unclaimed by <@${data.unclaimerId}>.`);
            break;

        case 'priority':
            embed.setTitle('📋 Priority Changed')
                .setColor(data.newPriority === 'High' ? '#FF0000' : data.newPriority === 'Medium' ? '#FFFF00' : '#00FF00')
                .setDescription(`Priority changed from **${data.oldPriority}** to **${data.newPriority}** by <@${data.changedBy}>.`);
            break;

        case 'user_added':
            embed.setTitle('👤 User Added')
                .setDescription(`<@${data.addedUser}> was added to the ticket by <@${data.addedBy}>.`);
            break;

        case 'user_removed':
            embed.setTitle('👤 User Removed')
                .setColor('#FF0000')
                .setDescription(`<@${data.removedUser}> was removed from the ticket by <@${data.removedBy}>.`);
            break;

        case 'alert':
            embed.setTitle('⚠️ Ticket Alert Sent')
                .setColor('#FF0000')
                .setDescription(`An inactivity alert was sent. The ticket will close if no response is received.`);
            break;

        case 'closing':
            embed.setTitle('🔒 Ticket Closing')
                .setColor('#FF0000')
                .setDescription(`Ticket is being closed by <@${data.closedBy}>.${data.reason ? `\n**Reason:** ${data.reason}` : ''}`);
            break;

        default:
            return null;
    }

    return embed;
}

async function addWatcher(channelId, userId) {
    return Ticket.updateOne(
        { channelId },
        { $addToSet: { watchers: userId } }
    );
}

async function removeWatcher(channelId, userId) {
    return Ticket.updateOne(
        { channelId },
        { $pull: { watchers: userId } }
    );
}

async function getWatchers(channelId) {
    const ticket = await Ticket.findOne({ channelId }).select('watchers').lean();
    return ticket?.watchers || [];
}

module.exports = {
    notifyWatchers,
    addWatcher,
    removeWatcher,
    getWatchers
};

