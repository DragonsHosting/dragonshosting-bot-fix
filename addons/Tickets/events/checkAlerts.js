const Ticket = require('../models/tickets');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const { handleTicketClose } = require('../utils/ticketClosure.js');
const { resetTicketPermissions, updateClaimButton, updateTicketEmbed } = require('../utils/ticketClaiming.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandType, InteractionType } = require('discord.js');

const config = getConfig();

async function triggerAlertCommand(client, channel, ticket) {
    try {
        
        const mockInteraction = {
            client,
            guild: channel.guild,
            channel,
            user: {
                id: client.user.id,
                tag: client.user.tag,
                username: client.user.username
            },
            member: {
                ...await channel.guild.members.fetch(client.user.id),
                roles: {
                    cache: {
                        some: (predicate) => config.TicketTypes[ticket.ticketType].SupportRole.some(roleId => predicate({ id: roleId })),
                        map: (fn) => config.TicketTypes[ticket.ticketType].SupportRole.map(roleId => fn({ id: roleId }))
                    }
                }
            },
            commandId: 'tickets',
            commandName: 'tickets',
            type: InteractionType.ApplicationCommand,
            commandType: ApplicationCommandType.ChatInput,
            deferred: false,
            replied: false,
            options: {
                getSubcommand: () => 'alert',
                getSubcommandGroup: () => null,
                getString: () => 'Auto alert: No response',
                getUser: () => null
            },
            reply: async function(options) {
                this.replied = true;
                return await channel.send(options);
            },
            deferReply: async function() {
                this.deferred = true;
            },
            editReply: async (options) => {
                return null;
            },
            followUp: async (options) => {
                return await channel.send(options);
            }
        };

        const ticketsCommand = client.slashCommands.get('tickets');
        if (ticketsCommand) {
            await ticketsCommand.execute(mockInteraction);
        } else {
            console.error('[DEBUG] Tickets command not found in slashCommands');
        }
    } catch (error) {
        console.error('[DEBUG] Error triggering alert command:', error);
    }
}

function parseDuration(duration) {
    if (!duration) return 0;
    
    duration = duration.toString().trim();
    const match = duration.match(/^(\d+)\s*([smhd])$/i);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        's': 1000,
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000
    };
    
    return value * multipliers[unit];
}

async function checkAutoUnclaim(client) {
    try {
        const config = getConfig();
        const lang = getLang();
        const now = new Date();
        
        const claimedTickets = await Ticket.find({
            status: 'open',
            claimed: true,
            claimedBy: { $ne: null }
        }).limit(20).select('_id ticketId channelId userId claimedBy ticketType lastStaffResponse firstMessageId createdAt').lean();

        for (const ticket of claimedTickets) {
            try {
                const ticketType = config.TicketTypes[ticket.ticketType];
                if (!ticketType?.Claiming?.AutoUnclaim?.Enabled) continue;
                
                const inactiveTime = parseDuration(ticketType.Claiming.AutoUnclaim.InactiveTime);
                if (!inactiveTime) continue;
                
                const lastResponse = ticket.lastStaffResponse || ticket.createdAt;
                const timeSinceResponse = now - new Date(lastResponse);
                
                if (timeSinceResponse < inactiveTime) continue;
                
                const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
                if (!channel) {
                    await Ticket.findOneAndUpdate(
                        { ticketId: ticket.ticketId },
                        { status: 'deleted', deletedAt: new Date() }
                    );
                    continue;
                }
                
                const previousClaimer = ticket.claimedBy;
                
                await Ticket.findOneAndUpdate(
                    { ticketId: ticket.ticketId, claimed: true },
                    { claimed: false, claimedBy: null, lastStaffResponse: null },
                    { new: true }
                );
                
                await resetTicketPermissions(channel, ticket, ticketType).catch(err => {
                    console.error('Error resetting permissions during auto-unclaim:', err);
                });
                
                const ticketMessage = await channel.messages.fetch(ticket.firstMessageId).catch(() => null);
                if (ticketMessage) {
                    await Promise.all([
                        updateClaimButton(ticketMessage, ticketType, null),
                        updateTicketEmbed(ticketMessage, ticket, ticketType, null)
                    ]).catch(() => {});
                }
                
                if (ticketType.Claiming.AutoUnclaim.NotifyChannel) {
                    const unclaimEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setDescription(
                            (lang?.Tickets?.AutoUnclaim?.Message || '⚠️ This ticket has been automatically unclaimed due to inactivity from <@{claimer}>. Any available staff member can now respond.')
                                .replace('{claimer}', previousClaimer)
                        );
                    
                    await channel.send({ embeds: [unclaimEmbed] }).catch(() => {});
                }
                
                if (global.addonLoader) {
                    global.addonLoader.getEventManager().emitSafe('ticket:autoUnclaimed', {
                        ticketId: ticket.ticketId,
                        previousClaimer: previousClaimer,
                        guild: channel.guild,
                        channel: channel
                    });
                }
                
            } catch (error) {
                console.error(`Error auto-unclaiming ticket ${ticket.ticketId}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in checkAutoUnclaim:', error);
    }
}

async function checkAlerts(client) {
    try {
        const config = getConfig();
        const now = new Date();
        const { observeAsync } = require('../../../utils/core/perfMonitor');
        const tickets = await observeAsync('tickets.alert.scan', async () => await Ticket.find({ 
            status: 'open',
            $or: [
                { alertTime: { $lte: now } },
                { alertTime: null },
                { alertTime: { $exists: false } }
            ]
        }).limit(20).select('_id ticketId channelId userId alertTime alertMessageId ticketType').lean());



        for (const ticket of tickets) {
            try {
                
                const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
                if (!channel) {
                    continue;
                }

                const channelTopic = channel.topic;
                const ticketTypeMatch = channelTopic?.match(/Category:\s*([^|]+)/);
                const ticketTypeName = ticketTypeMatch ? ticketTypeMatch[1].trim() : null;

                let ticketTypeConfig = null;
                for (const [key, type] of Object.entries(config.TicketTypes)) {
                    if (type.Name === ticketTypeName) {
                        ticketTypeConfig = type;
                        ticket.ticketType = key;
                        try {
                            await Ticket.updateOne({ _id: ticket._id }, { $set: { ticketType: key } });
                        } catch (_) {}
                        break;
                    }
                }

                if (!ticketTypeConfig || !ticketTypeConfig.AutoAlert) {
                    continue;
                }

                const autoAlertDuration = parseDuration(ticketTypeConfig.AutoAlert);
                if (!autoAlertDuration) {
                    continue;
                }


                const fetchedMessages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
                if (!fetchedMessages || fetchedMessages.size === 0) {
                    continue;
                }

                const sortedMessages = Array.from(fetchedMessages.values())
                    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

                const supportRoleIds = ticketTypeConfig.SupportRole || [];

                let lastUserMessage = null;
                let lastStaffMessage = null;
                let mostRecentMessage = null;
                let isWaitingForUserResponse = false;
                let hasTicketCreatorMessage = false;
                
                for (const msg of sortedMessages) {
                    try {
                        const isTicketCreator = msg.author.id === ticket.userId;
                        const isBotMessage = msg.author.bot || msg.author.id === client.user.id;
                        
                        if (isBotMessage) {
                            continue;
                        }
                        
                        if (isTicketCreator) {
                            hasTicketCreatorMessage = true;
                        }
                        
                        let isStaff = false;
                        let staffRoleFound = [];
                        
                        if (!isTicketCreator) {
                            const member = msg.guild.members.cache.get(msg.author.id);
                            if (member) {
                                const memberRoles = member.roles.cache.map(r => r.id);
                                staffRoleFound = memberRoles.filter(roleId => supportRoleIds.includes(roleId));
                                isStaff = staffRoleFound.length > 0;
                            } else {
                                try {
                                    const fetchedMember = await msg.guild.members.fetch(msg.author.id);
                                    const memberRoles = fetchedMember.roles.cache.map(r => r.id);
                                    staffRoleFound = memberRoles.filter(roleId => supportRoleIds.includes(roleId));
                                    isStaff = staffRoleFound.length > 0;
                                } catch {
                                    continue;
                                }
                            }
                        }
                        
                        if (!mostRecentMessage) {
                            mostRecentMessage = msg;
                            isWaitingForUserResponse = isStaff;
                        }
                        
                        if (!isStaff && !lastUserMessage) {
                            lastUserMessage = msg;
                        } else if (isStaff && !lastStaffMessage) {
                            lastStaffMessage = msg;
                        }

                        if (lastUserMessage && lastStaffMessage) break;
                    } catch (error) {
                        continue;
                    }
                }

                if (!lastUserMessage && !hasTicketCreatorMessage && !isWaitingForUserResponse) {
                    continue;
                }

                const timeSinceMostRecentMessage = mostRecentMessage ? now - mostRecentMessage.createdTimestamp : 0;

                if (isWaitingForUserResponse && timeSinceMostRecentMessage >= autoAlertDuration) {
                    if (!ticket.alertMessageId && (!ticket.alertTime || ticket.alertTime <= new Date())) {
                        await triggerAlertCommand(client, channel, ticket);
                        continue;
                    }
                }

                if (ticket.alertMessageId && ticket.alertTime && now >= ticket.alertTime) {
                    
                    const mockInteraction = {
                        client,
                        guild: channel.guild,
                        channel,
                        user: {
                            id: client.user.id,
                            tag: '/alert',
                            username: client.user.username
                        },
                        member: {
                            ...await channel.guild.members.fetch(client.user.id),
                            roles: {
                                cache: {
                                    some: (predicate) => {
                                        const supportRoleIds = config.TicketTypes[ticket.ticketType].SupportRole || [];
                                        return supportRoleIds.some(roleId => predicate({ id: roleId }));
                                    },
                                    map: (fn) => {
                                        const supportRoleIds = config.TicketTypes[ticket.ticketType].SupportRole || [];
                                        return supportRoleIds.map(roleId => fn({ id: roleId }));
                                    }
                                }
                            }
                        },
                        deferred: false,
                        replied: false,
                        isCommand: () => false,
                        reply: async function() { this.replied = true; },
                        deferReply: async function() { this.deferred = true; },
                        editReply: async () => {},
                        followUp: async () => {}
                    };

                    await handleTicketClose(client, mockInteraction, ticket.ticketId, 'No response after alert');
                }
            } catch (error) {
                console.error(`Error processing ticket ${ticket._id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in checkAlerts:', error);
    }
}

function startAlertScheduler(client) {
    const timers = [];
    if (config.Alert && config.Alert.Enabled) {
        timers.push(setInterval(() => {
            checkAlerts(client);
        }, 60000));
    }
    
    timers.push(setInterval(() => {
        checkAutoUnclaim(client);
    }, 60000));
    for (const timer of timers) timer.unref?.();
    return () => timers.forEach(clearInterval);
}

module.exports = { startAlertScheduler };
