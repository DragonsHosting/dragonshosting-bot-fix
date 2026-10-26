const {
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require("discord.js");
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replacePlaceholders, deferIfNeeded, safeInteractionResponse } = require('./ticketUtils.js');
const { editComponentsV2Message, sendComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const Ticket = require('../models/tickets');
const { notifyWatchers } = require('./ticketWatchers');

const claimLocks = new Map();
const LOCK_TIMEOUT = 10000;

function acquireLocalLock(ticketId) {
    const now = Date.now();
    const existing = claimLocks.get(ticketId);
    
    if (existing && now - existing.timestamp < LOCK_TIMEOUT) {
        return false;
    }
    
    claimLocks.set(ticketId, { timestamp: now });
    return true;
}

function releaseLocalLock(ticketId) {
    claimLocks.delete(ticketId);
}

function isValidRoleId(roleId) {
    return roleId && roleId.length > 10 && /^\d+$/.test(roleId);
}

async function handleTicketClaim(client, interaction, uniqueId) {
    const config = getConfig();
    const lang = getLang();
    let hasLocalLock = false;
    
    try {
        await deferIfNeeded(interaction);

        hasLocalLock = acquireLocalLock(uniqueId);
        if (!hasLocalLock) {
            await safeInteractionResponse(interaction, lang?.Tickets?.Claim?.Processing || 'This ticket is currently being processed. Please wait.');
            return;
        }

        const currentTicket = await Ticket.findOne({ ticketId: uniqueId });
        if (!currentTicket) {
            await safeInteractionResponse(interaction, 'Ticket not found.');
            return;
        }

        const channel = interaction.channel;
        if (!channel) {
            await safeInteractionResponse(interaction, 'Channel not found or inaccessible.');
            return;
        }

        const ticketType = config.TicketTypes[currentTicket.ticketType];
        if (!ticketType || !ticketType.Claiming || !ticketType.Claiming.Enabled) {
            await safeInteractionResponse(interaction, lang?.Tickets?.Claim?.NotClaimable || 'Ticket claiming is not enabled for this ticket type.');
            return;
        }

        const supportRoles = (ticketType.SupportRole || []).filter(isValidRoleId);
        const memberRoles = interaction.member.roles.cache.map(role => role.id);
        const hasSupportRole = supportRoles.length > 0 && supportRoles.some(roleId => memberRoles.includes(roleId));

        if (!hasSupportRole) {
            await safeInteractionResponse(interaction, 'You do not have permission to claim tickets.');
            return;
        }

        if (currentTicket.claimed) {
            if (currentTicket.claimedBy === interaction.user.id) {
                const unclaimedTicket = await Ticket.findOneAndUpdate(
                    { 
                        ticketId: uniqueId,
                        claimed: true,
                        claimedBy: interaction.user.id
                    },
                    { 
                        claimed: false,
                        claimedBy: null
                    },
                    { new: true }
                );

                if (!unclaimedTicket) {
                    await safeInteractionResponse(interaction, 'Could not unclaim - ticket state changed.');
                    return;
                }

                await resetTicketPermissions(channel, currentTicket, ticketType);
                
                const ticketMessage = await channel.messages.fetch(currentTicket.firstMessageId).catch(() => null);
                if (ticketMessage) {
                    await Promise.all([
                        updateClaimButton(ticketMessage, ticketType, null),
                        updateTicketEmbed(ticketMessage, currentTicket, ticketType, null, client)
                    ]);
                }

                if (global.addonLoader) {
                    global.addonLoader.getEventManager().emitSafe('ticket:unclaimed', {
                        ticket: unclaimedTicket.toObject(),
                        previousClaimer: interaction.user,
                        guild: interaction.guild,
                        channel: channel
                    });
                }

                notifyWatchers(client, unclaimedTicket.toObject(), 'unclaimed', {
                    unclaimerId: interaction.user.id,
                    excludeUser: interaction.user.id
                });

                const unclaimPlaceholders = { user: interaction.user.toString() };
                if (lang?.Tickets?.Claim?.UnclaimedComponents && Array.isArray(lang.Tickets.Claim.UnclaimedComponents)) {
                    const replacer = createSimplePlaceholderReplacer(unclaimPlaceholders);
                    await safeInteractionResponse(interaction, lang.Tickets.Claim.Unclaimed || 'Ticket has been unclaimed.');
                } else {
                    const unclaimEmbed = new EmbedBuilder()
                        .setDescription(lang?.Tickets?.Claim?.Unclaimed || 'Ticket has been unclaimed.')
                        .setColor(config.EmbedColors);
                    await safeInteractionResponse(interaction, { embeds: [unclaimEmbed] });
                }

                if (ticketType.Claiming.AnnounceClaim) {
                    if (lang?.Tickets?.Claim?.Announcements?.UnclaimedComponents && Array.isArray(lang.Tickets.Claim.Announcements.UnclaimedComponents)) {
                        const replacer = createSimplePlaceholderReplacer(unclaimPlaceholders);
                        await sendComponentsV2Message(client, channel.id, { Components: lang.Tickets.Claim.Announcements.UnclaimedComponents }, replacer);
                    } else {
                        const announceEmbed = new EmbedBuilder()
                            .setColor("Red")
                            .setDescription((lang?.Tickets?.Claim?.Announcements?.Unclaimed || '🔓 {user} has unclaimed this ticket.').replace('{user}', interaction.user.toString()));
                        await channel.send({ embeds: [announceEmbed] });
                    }
                }
            } else {
                const freshTicket = await Ticket.findOne({ ticketId: uniqueId }).select('claimedBy').lean();
                await safeInteractionResponse(interaction, 
                    (lang?.Tickets?.Claim?.AlreadyClaimed || 'This ticket is already claimed by {claimer}.').replace('{claimer}', `<@${freshTicket?.claimedBy || currentTicket.claimedBy}>`)
                );
            }
        } else {
            const claimedTicket = await Ticket.findOneAndUpdate(
                { 
                    ticketId: uniqueId,
                    claimed: false
                },
                { 
                    claimed: true,
                    claimedBy: interaction.user.id,
                    lastStaffResponse: new Date()
                },
                { new: true }
            );

            if (!claimedTicket) {
                const freshTicket = await Ticket.findOne({ ticketId: uniqueId }).select('claimedBy claimed').lean();
                if (freshTicket?.claimed) {
                    await safeInteractionResponse(interaction, 
                        (lang?.Tickets?.Claim?.AlreadyClaimed || 'This ticket is already claimed by {claimer}.').replace('{claimer}', `<@${freshTicket.claimedBy}>`)
                    );
                } else {
                    await safeInteractionResponse(interaction, 'Could not claim ticket. Please try again.');
                }
                return;
            }

            await setClaimPermissions(channel, currentTicket, ticketType, interaction.user.id);
            
            const ticketMessage = await channel.messages.fetch(currentTicket.firstMessageId).catch(() => null);
            if (ticketMessage) {
                await Promise.all([
                    updateClaimButton(ticketMessage, ticketType, interaction.user),
                    updateTicketEmbed(ticketMessage, currentTicket, ticketType, interaction.user, client)
                ]);
            }

            if (global.addonLoader) {
                global.addonLoader.getEventManager().emitSafe('ticket:claimed', {
                    ticket: claimedTicket.toObject(),
                    claimer: interaction.user,
                    guild: interaction.guild,
                    channel: channel
                });
            }

            notifyWatchers(client, claimedTicket.toObject(), 'claimed', {
                claimerId: interaction.user.id,
                excludeUser: interaction.user.id
            });

            const claimPlaceholders = { user: interaction.user.toString() };
            if (lang?.Tickets?.Claim?.SuccessComponents && Array.isArray(lang.Tickets.Claim.SuccessComponents)) {
                await safeInteractionResponse(interaction, lang.Tickets.Claim.Success || 'You have successfully claimed this ticket.');
            } else {
                const claimEmbed = new EmbedBuilder()
                    .setDescription(lang?.Tickets?.Claim?.Success || 'You have successfully claimed this ticket.')
                    .setColor(config.EmbedColors);
                await safeInteractionResponse(interaction, { embeds: [claimEmbed] });
            }

            if (ticketType.Claiming.AnnounceClaim) {
                if (lang?.Tickets?.Claim?.Announcements?.ClaimedComponents && Array.isArray(lang.Tickets.Claim.Announcements.ClaimedComponents)) {
                    const replacer = createSimplePlaceholderReplacer(claimPlaceholders);
                    await sendComponentsV2Message(client, channel.id, { Components: lang.Tickets.Claim.Announcements.ClaimedComponents }, replacer);
                } else {
                    const announceEmbed = new EmbedBuilder()
                        .setColor("Green")
                        .setDescription((lang?.Tickets?.Claim?.Announcements?.Claimed || '🎫 {user} has claimed this ticket.').replace('{user}', interaction.user.toString()));
                    await channel.send({ embeds: [announceEmbed] });
                }
            }
        }
    } catch (error) {
        console.error('Error handling ticket claim:', error);
        await safeInteractionResponse(interaction, 
            'An error occurred while processing the ticket claim.', true
        );
    } finally {
        if (hasLocalLock) {
            releaseLocalLock(uniqueId);
        }
    }
}

async function updateClaimButton(ticketMessage, ticketType, user) {
    const lang = getLang();
    try {
        if (!ticketMessage.components?.length) return;
        
        if (ticketMessage.flags?.has(32768)) {
            return;
        }
        
        const actionRows = ticketMessage.components.filter(c => c.type === 1);
        if (!actionRows.length) return;

        const row = ActionRowBuilder.from(actionRows[0]);
        const claimButton = row.components.find(c => c.data?.custom_id?.startsWith('ticketclaim'));
        if (claimButton) {
            claimButton.setLabel(user ? (lang?.Tickets?.Claim?.ClaimedByButton || 'Claimed by {claimer}').replace('{claimer}', user.username) : (ticketType.Claiming.Button.Name || "Claim Ticket"));
            await ticketMessage.edit({ components: [row] }).catch(() => {});
        }
    } catch (error) {
        console.error('Error updating claim button:', error);
    }
}

async function updateTicketEmbed(ticketMessage, ticket, ticketType, user, client) {
    const config = getConfig();
    const lang = getLang();
    try {
        const ticketCreationConfig = config.TicketCreation[ticket.ticketType] || config.TicketCreation.Default;

        let formattedQuestions = '';
        if (ticket.questions && ticket.questions.length > 0) {
            formattedQuestions = ticket.questions.map(q => 
                ticketCreationConfig.QuestionFormat.map(format => 
                    replacePlaceholders(format, { 
                        question: q.question, 
                        answer: q.answer 
                    })
                ).join('\n')
            ).join('\n');
        }

        if (ticketMessage.flags?.has(32768) && ticketCreationConfig.Components) {
            const guildIcon = ticketMessage.guild?.iconURL({ dynamic: true });
            const placeholders = {
                ticketType: ticketType.Name,
                user: `<@${ticket.userId}>`,
                userIcon: guildIcon || '',
                guildIcon: guildIcon || '',
                guild: ticketMessage.guild?.name || '',
                questions: formattedQuestions || '',
                claimer: user ? `<@${user.id}>` : "Unclaimed"
            };

            const existingRows = ticketMessage.components
                ?.filter(c => c.type === 1)
                ?.map(row => ActionRowBuilder.from(row)) || [];

            for (const row of existingRows) {
                const claimButton = row.components.find(c => c.data?.custom_id?.startsWith('ticketclaim'));
                if (claimButton) {
                    claimButton.setLabel(user 
                        ? (lang?.Tickets?.Claim?.ClaimedByButton || 'Claimed by {claimer}').replace('{claimer}', user.username) 
                        : (ticketType.Claiming?.Button?.Name || "Claim Ticket"));
                }
            }

            const replacer = createSimplePlaceholderReplacer(placeholders);
            await editComponentsV2Message(
                client,
                ticketMessage.channel.id,
                ticketMessage.id,
                { Components: ticketCreationConfig.Components },
                replacer,
                existingRows
            );
        } else if (ticketMessage.embeds?.[0] && ticketCreationConfig.Embed?.Description) {
            const updatedEmbed = EmbedBuilder.from(ticketMessage.embeds[0]);
            const newDescription = ticketCreationConfig.Embed.Description.map(line => 
                replacePlaceholders(line, {
                    ticketType: ticketType.Name,
                    user: `<@${ticket.userId}>`,
                    guild: ticketMessage.guild.name,
                    questions: formattedQuestions,
                    claimer: user ? `<@${user.id}>` : "Unclaimed"
                })
            ).join('\n');
            
            updatedEmbed.setDescription(newDescription);
            await ticketMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
        }
    } catch (error) {
        console.error('Error updating ticket embed:', error);
    }
}

async function setClaimPermissions(channel, ticket, ticketType, claimerId) {
    try {
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false
        });

        if (ticket.userId) {
            try {
                const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);
                if (user) {
                    await channel.permissionOverwrites.edit(ticket.userId, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true,
                        EmbedLinks: true
                    });
                }
            } catch (error) {
                console.error(`Error setting permissions for user ${ticket.userId}:`, error);
            }
        }

        if (claimerId) {
            try {
                const claimer = await channel.guild.members.fetch(claimerId).catch(() => null);
                if (claimer) {
                    await channel.permissionOverwrites.edit(claimerId, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true,
                        EmbedLinks: true
                    });
                }
            } catch (error) {
                console.error(`Error setting permissions for claimer ${claimerId}:`, error);
            }
        }

        if (ticketType.SupportRole && Array.isArray(ticketType.SupportRole)) {
            const restrictResponse = ticketType.Claiming && ticketType.Claiming.RestrictResponse;
            const restrictView = ticketType.Claiming && ticketType.Claiming.RestrictView;
            
            for (const roleId of ticketType.SupportRole) {
                if (!isValidRoleId(roleId)) continue;
                const supportRole = channel.guild.roles.cache.get(roleId);
                if (!supportRole) continue;
                
                try {
                    await channel.permissionOverwrites.edit(supportRole, {
                        ViewChannel: restrictView ? false : true,
                        SendMessages: (restrictView || restrictResponse) ? false : true,
                        ReadMessageHistory: restrictView ? false : true,
                        AttachFiles: (restrictView || restrictResponse) ? false : true,
                        EmbedLinks: (restrictView || restrictResponse) ? false : true
                    });
                } catch (error) {
                    console.error(`Error updating permissions for role ${roleId}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error in setClaimPermissions:', error);
        throw error;
    }
}

async function resetTicketPermissions(channel, ticket, ticketType) {
    try {
        if (ticket.claimedBy) {
            try {
                await channel.permissionOverwrites.delete(ticket.claimedBy);
            } catch (removeError) {
                console.error('Error removing claimer permissions:', removeError);
            }
        }

        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false
        });

        if (ticket.userId) {
            try {
                const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);
                if (user) {
                    await channel.permissionOverwrites.edit(ticket.userId, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true,
                        EmbedLinks: true
                    });
                }
            } catch (error) {
                console.error(`Error setting permissions for user ${ticket.userId}:`, error);
            }
        }

        if (ticketType.SupportRole && Array.isArray(ticketType.SupportRole)) {
            for (const roleId of ticketType.SupportRole) {
                if (!isValidRoleId(roleId)) continue;
                const role = channel.guild.roles.cache.get(roleId);
                if (!role) continue;

                await channel.permissionOverwrites.edit(role, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                });
            }
        }

    } catch (error) {
        console.error('Error in resetTicketPermissions:', error);
        throw error;
    }
}

async function handleAutoClaim(client, message, ticket) {
    const config = getConfig();
    const lang = getLang();
    let hasLocalLock = false;
    
    try {
        const ticketType = config.TicketTypes[ticket.ticketType];
        if (!ticketType) {
            return false;
        }
        
        if (!ticketType.Claiming?.Enabled || !ticketType.Claiming?.AutoClaim) {
            return false;
        }

        if (ticket.claimed) {
            return false;
        }

        if (ticket.userId === message.author.id) {
            return false;
        }

        const supportRoles = (ticketType.SupportRole || []).filter(isValidRoleId);
        
        if (supportRoles.length === 0) {
            return false;
        }

        const memberRoles = message.member.roles.cache.map(role => role.id);
        const hasSupportRole = supportRoles.some(roleId => memberRoles.includes(roleId));

        if (!hasSupportRole) {
            return false;
        }

        hasLocalLock = acquireLocalLock(ticket.ticketId);
        if (!hasLocalLock) {
            return false;
        }

        const claimedTicket = await Ticket.findOneAndUpdate(
            { 
                ticketId: ticket.ticketId,
                claimed: false
            },
            { 
                claimed: true,
                claimedBy: message.author.id,
                lastStaffResponse: new Date()
            },
            { new: true }
        );

        if (!claimedTicket) {
            return false;
        }

        const channel = message.channel;

        setClaimPermissions(channel, ticket, ticketType, message.author.id).catch(err => {
            console.error('Error setting claim permissions:', err);
        });

        const ticketMessage = await channel.messages.fetch(ticket.firstMessageId).catch(() => null);
        if (ticketMessage) {
            Promise.all([
                updateClaimButton(ticketMessage, ticketType, message.author),
                updateTicketEmbed(ticketMessage, ticket, ticketType, message.author, client)
            ]).catch(() => {});
        }

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('ticket:claimed', {
                ticket: claimedTicket.toObject(),
                claimer: message.author,
                guild: message.guild,
                channel: channel,
                autoClaimed: true
            });
        }

        notifyWatchers(client, claimedTicket.toObject(), 'claimed', {
            claimerId: message.author.id,
            excludeUser: message.author.id
        });

        if (ticketType.Claiming.AnnounceClaim) {
            const claimPlaceholders = { user: message.author.toString() };
            if (lang?.Tickets?.Claim?.Announcements?.ClaimedComponents && Array.isArray(lang.Tickets.Claim.Announcements.ClaimedComponents)) {
                const replacer = createSimplePlaceholderReplacer(claimPlaceholders);
                sendComponentsV2Message(client, channel.id, { Components: lang.Tickets.Claim.Announcements.ClaimedComponents }, replacer).catch(() => {});
            } else {
                const announceEmbed = new EmbedBuilder()
                    .setColor("Green")
                    .setDescription((lang?.Tickets?.Claim?.Announcements?.Claimed || '🎫 {user} has claimed this ticket.').replace('{user}', message.author.toString()));
                channel.send({ embeds: [announceEmbed] }).catch(() => {});
            }
        }

        return true;
    } catch (error) {
        console.error('Error handling auto claim:', error);
        return false;
    } finally {
        if (hasLocalLock) {
            releaseLocalLock(ticket.ticketId);
        }
    }
}

module.exports = {
    handleTicketClaim,
    handleAutoClaim,
    updateClaimButton,
    updateTicketEmbed,
    setClaimPermissions,
    resetTicketPermissions
};
