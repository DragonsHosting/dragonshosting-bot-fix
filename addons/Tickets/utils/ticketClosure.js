const {
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require("discord.js");
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { getFormattedReason, replacePlaceholders, deferIfNeeded, replyOrFollowUp, safeInteractionResponse } = require('./ticketUtils.js');
const { sendDMEmbedAndTranscript } = require('./ticketTranscripts.js');
const { buildComponentsV2Payload, sendComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const Ticket = require('../models/tickets');
const { notifyWatchers } = require('./ticketWatchers.js');

const config = getConfig();
const lang = getLang();

async function recoverTicketFromChannel(interaction, ticketId) {
    if (!interaction?.channel || !interaction?.guild) {
        return null;
    }

    const channelName = interaction.channel.name || '';
    const isTicketLikeChannel = channelName.startsWith('ticket-') || channelName.startsWith('sollicitatie-');
    if (!isTicketLikeChannel) {
        return null;
    }

    const existingTicket = await Ticket.findOne({
        $or: [
            { ticketId: ticketId },
            { channelId: interaction.channel.id }
        ]
    });

    if (existingTicket) return existingTicket;

    const ticketTypeEntry = Object.entries(config.TicketTypes || {}).find(([, ticketType]) => {
        const categoryIds = ticketType.CategoryID || ticketType.CategoryId || ticketType.Category || [];
        return Array.isArray(categoryIds)
            ? categoryIds.includes(interaction.channel.parentId)
            : categoryIds === interaction.channel.parentId;
    });

    const userFromTopic = interaction.channel.topic?.match(/\d{17,20}/)?.[0];
    const recoveredTicketId = Number(ticketId);

    return Ticket.findOneAndUpdate(
        { channelId: interaction.channel.id },
        {
            $setOnInsert: {
                ticketId: Number.isFinite(recoveredTicketId) ? recoveredTicketId : Date.now(),
                userId: userFromTopic || interaction.user.id,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                guildId: interaction.guild.id,
                ticketType: ticketTypeEntry?.[0] || Object.keys(config.TicketTypes || {})[0],
                status: 'open',
                createdAt: new Date(),
                claimed: false,
                claimedBy: null,
                channelTopic: interaction.channel.topic || ''
            }
        },
        { upsert: true, new: true }
    );
}

function getArchiveCategoryId(guild, ticketType) {
    const archiveCategoryIds = ticketType.ArchiveCategory;
    if (Array.isArray(archiveCategoryIds)) {
        for (const catId of archiveCategoryIds) {
            if (!catId || catId === "" || catId === "CATEGORY_ID") continue;
            const cat = guild.channels.cache.get(catId);
            if (cat) return catId;
        }
    } else if (archiveCategoryIds && archiveCategoryIds !== "" && archiveCategoryIds !== "CATEGORY_ID") {
        return archiveCategoryIds;
    }
    return null;
}

const TICKET_STATES = {
    OPEN: 'open',
    CLOSED: 'closed',
    DELETING: 'deleting',
    DELETED: 'deleted'
};

async function setArchivePermissions(channel, ticketType, userId) {
    const allowedIds = new Set([
        channel.guild.roles.everyone.id,
        userId,
        channel.client.user.id,
        ...ticketType.SupportRole
    ]);

    const removePromises = [];
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
        if (!allowedIds.has(id)) {
            removePromises.push(overwrite.delete().catch(() => null));
        }
    }
    await Promise.allSettled(removePromises);

    const permissionUpdates = [];
    
    permissionUpdates.push(
        channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            ViewChannel: false
        })
    );

    const member = await channel.guild.members.fetch(userId).catch(() => null);
    if (member) {
        permissionUpdates.push(
            channel.permissionOverwrites.edit(userId, {
                ViewChannel: true,
                SendMessages: false,
                ReadMessageHistory: true,
                AttachFiles: false,
                EmbedLinks: false
            })
        );
    }

    for (const roleId of ticketType.SupportRole) {
        const role = channel.guild.roles.cache.get(roleId);
        if (role) {
            permissionUpdates.push(
                channel.permissionOverwrites.edit(role, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                })
            );
        }
    }

    await Promise.allSettled(permissionUpdates);
}

async function handleArchiveProcess(interaction, uniqueId, ticket, ticketType) {
    const archiveCategoryId = getArchiveCategoryId(interaction.guild, ticketType);
    const isArchived = archiveCategoryId && interaction.channel.parentId === archiveCategoryId;

    if (!isArchived && archiveCategoryId) {
        try {
            const archiveCategory = await interaction.guild.channels.fetch(archiveCategoryId).catch(() => null);
            if (archiveCategory && archiveCategory.type === 4) {
                await interaction.channel.setParent(archiveCategory.id);
            } else {
                console.warn(`Archive category ${archiveCategoryId} not found, keeping ticket in current location`);
            }
        } catch (error) {
            console.error('Error moving channel to archive category:', error);
        }
    }

    try {
        await setArchivePermissions(interaction.channel, ticketType, ticket.userId);
    } catch (error) {
        console.error('Error updating channel permissions:', error);
    }

    await sendArchiveMessage(interaction, uniqueId, ticket.userId);
    await safeInteractionResponse(interaction, lang.Tickets.Archive);
}

async function handleTicketClose(client, interaction, uniqueId, closeReason = null, customReason = null) {
    await deferIfNeeded(interaction);
    
    try {
        const ticket = await Ticket.findOne({ ticketId: uniqueId }) || await recoverTicketFromChannel(interaction, uniqueId);
        if (!ticket) {
            console.error(`No ticket found in the database with ticketId: ${uniqueId}`);
            await safeInteractionResponse(interaction, 'Ticket not found.', true);
            return;
        }

        const ticketType = config.TicketTypes[ticket.ticketType];
        if (!ticketType) {
            await safeInteractionResponse(interaction, 'Ticket type configuration not found.', true);
            return;
        }

        const isCloseRequestAccepted = closeReason === 'user_request' && customReason === 'Close request accepted';
        
        if (ticketType.RestrictDeletion && !isCloseRequestAccepted) {
            const hasSupportRole = interaction.member.roles.cache.some(role => 
                ticketType.SupportRole.includes(role.id)
            );
            if (!hasSupportRole) {
                await safeInteractionResponse(interaction, 'You do not have permission to close this ticket.', true);
                return;
            }
        }

        let actualCloseReason = closeReason;
        let actualCustomReason = customReason;

        if (interaction.isCommand()) {
            const commandReason = interaction.options.getString('reason');
            const customCommandReason = interaction.options.getString('custom_reason');
            
            if (commandReason || customCommandReason) {
                actualCloseReason = commandReason;
                actualCustomReason = customCommandReason;
            }
        }

        if (ticket.status === TICKET_STATES.DELETING || ticket.status === TICKET_STATES.DELETED) {
            await safeInteractionResponse(interaction, lang.Tickets.Deleting);
            return;
        }

        const isAutoAlert = interaction.user?.id === client.user.id && actualCloseReason === 'No response after alert';
        const archiveCategoryId = getArchiveCategoryId(interaction.guild, ticketType);

        if (ticket.status === TICKET_STATES.CLOSED && !isAutoAlert) {
            if (archiveCategoryId) {
                await handleArchiveProcess(interaction, uniqueId, ticket, ticketType);
            } else {
                await processTicketDeletion(client, interaction, ticket);
            }
            return;
        }

        const updateFilter = {
            _id: ticket._id,
            status: { $nin: [TICKET_STATES.DELETING, TICKET_STATES.DELETED, TICKET_STATES.CLOSED] }
        };

        const updatedTicket = await Ticket.findOneAndUpdate(
            updateFilter,
            { 
                status: TICKET_STATES.CLOSED, 
                closedAt: new Date(),
                closedBy: interaction.user?.id || interaction.author?.id,
                closeReason: actualCloseReason,
                customCloseReason: actualCustomReason
            },
            { new: true }
        );

        if (!updatedTicket) {
            await safeInteractionResponse(interaction, 'Ticket could not be updated. It may already be closed.', true);
            return;
        }

        notifyWatchers(client, updatedTicket.toObject(), 'closing', {
            closedBy: interaction.user?.id || interaction.author?.id,
            reason: getFormattedReason(actualCloseReason, actualCustomReason),
            excludeUser: interaction.user?.id || interaction.author?.id
        });

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('ticket:closed', {
                ticket: updatedTicket.toObject(),
                ticketType: ticketType,
                closeReason: actualCloseReason,
                customReason: actualCustomReason,
                closedBy: interaction.user || interaction.author,
                guild: interaction.guild,
                isAutoAlert: isAutoAlert
            });
        }

        if (archiveCategoryId && !isAutoAlert) {
            await handleArchiveProcess(interaction, uniqueId, updatedTicket, ticketType);
        } else {
            const forceDelete = isAutoAlert || isCloseRequestAccepted;
            
            await processTicketDeletion(client, interaction, updatedTicket, forceDelete);
        }

    } catch (error) {
        console.error('Error handling ticket closing:', error);
        
        const errorMessage = error.message?.includes('permission') 
            ? 'Permission error occurred while closing the ticket. Please check bot permissions.'
            : error.message?.includes('not found')
            ? 'The ticket or channel could not be found.'
            : 'An error occurred while closing the ticket. Please try again later.';
            
        await safeInteractionResponse(interaction, errorMessage, true);
    }
}

async function handleDeleteTicket(client, interaction, uniqueId) {
    await deferIfNeeded(interaction);
    
    try {
        const ticket = await Ticket.findOne({ ticketId: uniqueId });

        if (!ticket) {
            console.error(`No ticket found in the database with ticketId: ${uniqueId}`);
            await safeInteractionResponse(interaction, 'Ticket not found.', true);
            return;
        }

        if (!interaction.member) {
            interaction.member = await interaction.guild.members.fetch(client.user.id);
        }

        await processTicketDeletion(client, interaction, ticket);
    } catch (error) {
        console.error('Error handling delete ticket:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing the ticket deletion. Please try again later.', true);
    }
}

async function processTicketDeletion(client, interaction, ticket, forceDelete = false) {
    try {
        if (!interaction.member) {
            interaction.member = await interaction.guild.members.fetch(client.user.id);
        }

        if (!interaction.guild) {
            throw new Error('Interaction guild is undefined');
        }

        const memberRoles = interaction.member.roles.cache.map(role => role.id);
        const ticketType = config.TicketTypes[ticket.ticketType];

        if (!forceDelete && ticketType && ticketType.RestrictDeletion) {
            const hasSupportRole = ticketType.SupportRole.some(roleId => memberRoles.includes(roleId));

            if (!hasSupportRole) {
                await safeInteractionResponse(interaction, 'You do not have permission to delete this ticket.', true);
                return;
            }
        }

        if (ticket.status === TICKET_STATES.DELETING || ticket.status === TICKET_STATES.DELETED) {
            await safeInteractionResponse(interaction, lang.Tickets.Deleting);
            return;
        }

        const updatedTicket = await Ticket.findOneAndUpdate(
            { _id: ticket._id, status: { $nin: [TICKET_STATES.DELETING, TICKET_STATES.DELETED] } },
            { status: TICKET_STATES.DELETING },
            { new: true }
        );

        if (!updatedTicket) {
            await safeInteractionResponse(interaction, lang.Tickets.Deleting);
            return;
        }

        const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
        if (channel) {
            const deletionTime = parseInt(config.TicketSettings.DeletionTime, 10) || 0;

            let userMessages;
            try {
                const fetchedMessages = await channel.messages.fetch({ limit: 100 });
                userMessages = fetchedMessages.filter(m => !m.author.bot);
            } catch (fetchError) {
                console.warn('Failed to fetch messages for transcript:', fetchError);
                userMessages = new Map();
            }

            const deleteChannelAndMarkAsDeleted = async () => {
                try {
                    const transcriptPromise = sendDMEmbedAndTranscript(client, interaction, updatedTicket, 'delete', userMessages)
                        .catch(transcriptError => {
                            console.error('Error generating transcript:', transcriptError);
                        });

                    if (channel.deletable) {
                        await channel.delete();

                        const finalTicket = await Ticket.findOneAndUpdate(
                            { _id: ticket._id },
                            { status: TICKET_STATES.DELETED, deletedAt: new Date() },
                            { new: true }
                        );

                        if (global.addonLoader && finalTicket) {
                            global.addonLoader.getEventManager().emitSafe('ticket:deleted', {
                                ticket: finalTicket.toObject(),
                                deletedBy: interaction.user || interaction.author,
                                guild: interaction.guild,
                                forceDelete: forceDelete,
                                channelName: channel.name
                            });
                        }
                    } else {
                        console.error('Channel is not deletable.');
                    }
                } catch (channelError) {
                    console.error('Error deleting the channel:', channelError);
                    if (channelError.code === 10003) {
                        const finalTicket = await Ticket.findOneAndUpdate(
                            { _id: ticket._id },
                            { status: TICKET_STATES.DELETED, deletedAt: new Date() },
                            { new: true }
                        );

                        if (global.addonLoader && finalTicket) {
                            global.addonLoader.getEventManager().emitSafe('ticket:deleted', {
                                ticket: finalTicket.toObject(),
                                deletedBy: interaction.user || interaction.author,
                                guild: interaction.guild,
                                forceDelete: forceDelete,
                                channelName: 'Unknown (channel not found)'
                            });
                        }
                    }
                }
            };

            if (deletionTime > 0) {
                const countdownPlaceholders = { time: deletionTime.toString() };
                
                if (lang.Tickets.DeleteCountDownComponents && Array.isArray(lang.Tickets.DeleteCountDownComponents)) {
                    const replacer = createSimplePlaceholderReplacer(countdownPlaceholders);
                    await sendComponentsV2Message(interaction.client, channel.id, { Components: lang.Tickets.DeleteCountDownComponents }, replacer);
                } else {
                    const countdownEmbed = new EmbedBuilder()
                        .setDescription(lang.Tickets.DeleteCountDown.replace('{time}', deletionTime))
                        .setColor('#FF0000');
                    await channel.send({ embeds: [countdownEmbed] });
                }

                setTimeout(deleteChannelAndMarkAsDeleted, deletionTime * 1000);
            } else {
                await deleteChannelAndMarkAsDeleted();
            }
        } else {
            await safeInteractionResponse(interaction, 'Channel not found.');

            await Ticket.findOneAndUpdate(
                { ticketId: ticket.ticketId },
                { status: TICKET_STATES.DELETED, deletedAt: new Date() },
                { new: true }
            );
        }
    } catch (error) {
        console.error('Error processing ticket deletion:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing the ticket. Please try again later.', true);
    }
}

async function sendArchiveMessage(interaction, uniqueId, userId) {
    const ticket = await Ticket.findOne({ ticketId: uniqueId });
    
    let ticketType;
    if (interaction.channel.topic) {
        const topicParts = interaction.channel.topic.split(" ");
        ticketType = config.TicketTypes[topicParts[1]];
    }
    
    if (!ticketType && ticket) {
        ticketType = config.TicketTypes[ticket.ticketType];
    }
    
    if (!ticketType) {
        console.error(`Unable to determine ticket type for ticket ${uniqueId}`);
        ticketType = Object.values(config.TicketTypes)[0];
    }
    
    const closeReason = ticket.customCloseReason || 
        (ticket.closeReason ? getFormattedReason(ticket.closeReason) : config.TicketSettings.CloseReasons.DefaultReason);

    const placeholders = {
        user: interaction.user.username,
        userTag: `<@${ticket.userId}>`,
        reason: closeReason
    };

    const archiveRow = new ActionRowBuilder();
    const buttons = Object.values(config.ArchiveDesign.Buttons || {});

    const styleMap = {
        "PRIMARY": ButtonStyle.Primary,
        "SECONDARY": ButtonStyle.Secondary,
        "SUCCESS": ButtonStyle.Success,
        "DANGER": ButtonStyle.Danger,
        "LINK": ButtonStyle.Link
    };

    buttons.forEach(button => {
        const buttonStyle = styleMap[button.Style.toUpperCase()];
        if (buttonStyle) {
            archiveRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticketarchive-${uniqueId}-${button.Type.toLowerCase()}`)
                    .setLabel(button.Name)
                    .setStyle(buttonStyle)
                    .setEmoji(button.Emoji)
            );
        }
    });

    if (config.ArchiveDesign.Components) {
        const replacer = createSimplePlaceholderReplacer(placeholders);
        await sendComponentsV2Message(interaction.client, interaction.channel.id, { Components: config.ArchiveDesign.Components }, replacer, [archiveRow]);
    }
}

async function handleReopenTicket(client, interaction, uniqueId) {
    try {
        const ticket = await Ticket.findOneAndUpdate(
            { ticketId: uniqueId },
            { status: TICKET_STATES.OPEN, closedAt: null },
            { new: true }
        );

        if (!ticket) {
            console.error(`No ticket found in the database with ticketId: ${uniqueId}`);
            await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const channel = await client.channels.fetch(ticket.channelId);
        if (!channel) {
            console.error(`No channel found with channelId: ${ticket.channelId}`);
            await interaction.reply({ content: 'Channel not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const ticketType = config.TicketTypes[ticket.ticketType];
        if (!ticketType) {
            console.error(`No ticket type found in the configuration for ticketType: ${ticket.ticketType}`);
            await interaction.reply({ content: 'Ticket type configuration not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const archiveMessage = messages.find(msg => 
            msg.flags.has(32768) || 
            (msg.embeds.length > 0 && msg.embeds[0].title === 'Ticket Archived')
        );
        if (archiveMessage) {
            await archiveMessage.delete().catch(console.error);
        }

        if (ticketType.CategoryID) {
            try {
                const targetCategory = await channel.guild.channels.fetch(ticketType.CategoryID).catch(() => null);
                if (targetCategory && targetCategory.type === 4) {
                    await channel.setParent(ticketType.CategoryID);
                } else {
                    console.warn(`Category ${ticketType.CategoryID} not found, moving ticket outside of category`);
                    await channel.setParent(null);
                }
            } catch (error) {
                console.error('Error moving channel to category:', error);
                await channel.setParent(null);
            }
        } else {
            await channel.setParent(null);
        }

        const permissionOverwrites = [
            {
                id: ticket.userId,
                allow: ['SendMessages', 'ViewChannel', 'AttachFiles', 'EmbedLinks', 'ReadMessageHistory']
            },
            {
                id: channel.guild.roles.everyone.id,
                deny: ['SendMessages', 'ViewChannel']
            },
            {
                id: client.user.id,
                allow: ['SendMessages', 'ViewChannel']
            }
        ];

        ticketType.SupportRole.forEach(roleid => {
            let role = channel.guild.roles.cache.get(roleid);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: ['SendMessages', 'ViewChannel', 'AttachFiles', 'EmbedLinks', 'ReadMessageHistory']
                });
            }
        });

        await channel.permissionOverwrites.set(permissionOverwrites);

        const reopenPlaceholders = { userId: interaction.user.id, user: `<@${interaction.user.id}>` };

        if (lang.Tickets.TicketReopenComponents && Array.isArray(lang.Tickets.TicketReopenComponents)) {
            const replacer = createSimplePlaceholderReplacer(reopenPlaceholders);
            await sendComponentsV2Message(interaction.client, channel.id, { Components: lang.Tickets.TicketReopenComponents }, replacer);
        } else {
            const reopenEmbed = new EmbedBuilder()
                .setTitle(lang.Tickets.TicketReopenTitle)
                .setColor("Green")
                .setDescription(replacePlaceholders(lang.Tickets.TicketReopenDescription, reopenPlaceholders))
                .setTimestamp();
            await channel.send({ embeds: [reopenEmbed] });
        }

        await interaction.reply({ content: lang.Tickets.TicketReopen, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('Error handling ticket reopening:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'An error occurred while reopening the ticket. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => console.error('Error sending reply:', e));
        } else {
            await interaction.followUp({ content: 'An error occurred while reopening the ticket. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => console.error('Error sending follow-up:', e));
        }
    }
}

async function handleCloseReasonModal(interaction, ticketId) {
    try {
        await interaction.deferUpdate();
        
        const reason = interaction.fields.getTextInputValue('closeReason');
        await handleTicketClose(interaction.client, interaction, ticketId, null, reason);
    } catch (error) {
        console.error('Error handling close reason modal:', error);
        try {
            await handleTicketClose(interaction.client, interaction, ticketId);
        } catch (secondError) {
            console.error('Error handling fallback ticket close:', secondError);
            await safeInteractionResponse(interaction, 'An error occurred while closing the ticket. Please try again.', true);
        }
    }
}

module.exports = {
    handleTicketClose,
    handleDeleteTicket,
    processTicketDeletion,
    sendArchiveMessage,
    handleReopenTicket,
    handleCloseReasonModal
};
