'use strict';

const {
    ActionRowBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const moment = require('moment-timezone');
const Ticket = require('../models/tickets');
const { safeInteractionResponse } = require('../utils/ticketUtils');
const { editComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder');
const { handleTicketCreate, handleModalSubmitTicketCreation } = require('../utils/ticketCreation');
const { handleTicketClose, handleDeleteTicket, handleReopenTicket, handleCloseReasonModal } = require('../utils/ticketClosure');
const { handleTicketClaim } = require('../utils/ticketClaiming');
const { handleTranscriptTicket } = require('../utils/ticketTranscripts');
const { handleReviewButton, handleReviewSelect, handleReviewFeedbackModal, handleReviewModalSubmit } = require('../utils/ticketReviews');

async function recoverTicketFromChannel(interaction, ticketId, config) {
    const channel = interaction?.channel;
    const guild = interaction?.guild;
    if (!channel || !guild) return null;
    if (!/^(ticket-|sollicitatie-)/i.test(channel.name || '')) return null;

    const existing = await Ticket.findOne({
        $or: [{ ticketId }, { channelId: channel.id }]
    });
    if (existing) return existing;

    const typeEntry = Object.entries(config.TicketTypes || {}).find(([, type]) => {
        const categories = type.CategoryID || type.CategoryId || type.Category || [];
        return Array.isArray(categories)
            ? categories.includes(channel.parentId)
            : categories === channel.parentId;
    });
    const parsedId = Number(ticketId);
    const topicUserId = channel.topic?.match(/\d{17,20}/)?.[0];
    return Ticket.findOneAndUpdate(
        { channelId: channel.id },
        { $setOnInsert: {
            ticketId: Number.isFinite(parsedId) ? parsedId : Date.now(),
            userId: topicUserId || interaction.user.id,
            channelId: channel.id,
            channelName: channel.name,
            guildId: guild.id,
            ticketType: typeEntry?.[0] || Object.keys(config.TicketTypes || {})[0],
            status: 'open',
            createdAt: new Date(),
            claimed: false,
            claimedBy: null,
            channelTopic: channel.topic || ''
        } },
        { upsert: true, new: true }
    );
}

async function handleTicketCloseButton(client, interaction, ticketId, config, lang) {
    try {
        const ticket = await Ticket.findOne({ ticketId }) ||
            await recoverTicketFromChannel(interaction, ticketId, config);
        if (!ticket) return interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });

        const type = config.TicketTypes?.[ticket.ticketType];
        if (!type) return interaction.reply({ content: 'Ticket type configuration not found.', flags: MessageFlags.Ephemeral });
        if (type.RestrictDeletion) {
            const supportRoles = type.SupportRole || [];
            const allowed = interaction.member?.roles?.cache?.some(role => supportRoles.includes(role.id));
            if (!allowed) return interaction.reply({ content: 'You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
        }

        if (!config.TicketSettings?.CloseReasons?.Enabled) {
            await handleTicketClose(client, interaction, ticketId);
            return;
        }
        const modal = new ModalBuilder()
            .setCustomId(`closeReason-${ticketId}`)
            .setTitle(lang.Tickets?.CloseTicketTitle || 'Close Ticket');
        const reason = new TextInputBuilder()
            .setCustomId('closeReason')
            .setLabel(lang.Tickets?.CloseReasonLabel || 'Reason for closing (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder(lang.Tickets?.CloseReasonPlaceholder || 'Enter a reason for closing the ticket');
        modal.addComponents(new ActionRowBuilder().addComponents(reason));
        try {
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing ticket close modal:', error);
            await handleTicketClose(client, interaction, ticketId);
        }
    } catch (error) {
        console.error('Error in ticket close interaction:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing the ticket close. Please try again.', true);
    }
}

async function handleCloseRequest(client, interaction, ticketId, subAction, config) {
    try {
        const ticket = await Ticket.findOne({ ticketId }) ||
            await recoverTicketFromChannel(interaction, ticketId, config);
        if (!ticket) return interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
        if (!ticket.closeRequestPending) return interaction.reply({ content: 'No pending close request for this ticket.', flags: MessageFlags.Ephemeral });
        if (interaction.user.id !== ticket.userId) {
            return interaction.reply({ content: 'Only the ticket creator can respond to close requests.', flags: MessageFlags.Ephemeral });
        }

        const fields = {
            closeRequestPending: false,
            closeRequestBy: null,
            closeRequestReason: null,
            closeRequestAt: null,
            closeRequestMessageId: null
        };
        await Ticket.updateOne({ ticketId }, fields);
        if (ticket.closeRequestMessageId) {
            const requestMessage = await interaction.channel.messages.fetch(ticket.closeRequestMessageId).catch(() => null);
            await requestMessage?.delete().catch(() => {});
        }

        const accepted = subAction === 'accept';
        const text = accepted
            ? (config.CloseRequest?.Messages?.Accepted || 'Close request accepted by {user}. Closing ticket...')
            : (config.CloseRequest?.Messages?.Declined || 'Close request declined by {user}. Staff will continue to assist.');
        const embed = new EmbedBuilder()
            .setColor(accepted ? '#00FF00' : '#FFA500')
            .setDescription(text.replace('{user}', `<@${interaction.user.id}>`));
        await interaction.channel.send({ embeds: [embed] });
        await interaction.deferUpdate();
        if (accepted && config.CloseRequest?.AutoCloseOnAccept !== false) {
            await handleTicketClose(client, interaction, ticketId, 'user_request', 'Close request accepted');
        }
    } catch (error) {
        console.error('Error handling ticket close request:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing your response.', true);
    }
}

async function resetTicketPanel(client, interaction, lang, config) {
    const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
    const select = interaction.component;
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticketcreate')
            .setPlaceholder(lang.Tickets?.TicketTypePlaceholder || 'Select a ticket type')
            .addOptions(select.options.map(option => ({
                label: option.label,
                emoji: option.emoji,
                value: option.value,
                description: option.description,
                default: option.value === 'nothing_selected'
            })))
    );
    if (originalMessage.flags.has(32768)) {
        const panel = config.TicketPanelSettings?.Panel1;
        if (panel?.Components) {
            const placeholders = { guildIcon: interaction.guild.iconURL({ dynamic: true }) || '' };
            if (config.WorkingHours?.Schedule) {
                for (const day of Object.keys(config.WorkingHours.Schedule)) {
                    const key = day.toLowerCase();
                    if (config.WorkingHours.NonWorkingDays?.includes(day)) {
                        placeholders[`workinghours_start_${key}`] = 'N/A';
                        placeholders[`workinghours_end_${key}`] = 'N/A';
                        continue;
                    }
                    const [from, to] = config.WorkingHours.Schedule[day].split('-');
                    const [fromHour, fromMinute] = from.split(':');
                    const [toHour, toMinute] = to.split(':');
                    const now = moment().tz(config.WorkingHours.Timezone || 'UTC');
                    placeholders[`workinghours_start_${key}`] = `<t:${now.clone().hour(+fromHour).minute(+fromMinute).unix()}:t>`;
                    placeholders[`workinghours_end_${key}`] = `<t:${now.clone().hour(+toHour).minute(+toMinute).unix()}:t>`;
                }
            }
            await editComponentsV2Message(
                client,
                interaction.channel.id,
                originalMessage.id,
                { Components: panel.Components },
                createSimplePlaceholderReplacer(placeholders),
                [row]
            );
        }
    } else {
        await originalMessage.edit({ components: [row] });
    }
}

module.exports = async (client, interaction, config, lang) => {
    const customId = interaction?.customId || '';
    try {
        if (interaction.isStringSelectMenu?.()) {
            if (customId === 'ticketcreate') {
                await handleTicketCreate(client, interaction);
                await resetTicketPanel(client, interaction, lang, config);
                return true;
            }
            if (customId.startsWith('review_')) {
                await handleReviewSelect(client, interaction);
                return true;
            }
        }

        if (interaction.isButton?.()) {
            if (customId.startsWith('reviewButton_')) {
                await handleReviewButton(client, interaction);
                return true;
            }
            const [action, ticketId, subAction] = customId.split('-');
            switch (action) {
                case 'ticketcreate':
                    await handleTicketCreate(client, interaction);
                    return true;
                case 'ticketdelete':
                    await handleDeleteTicket(client, interaction, ticketId);
                    return true;
                case 'ticketclose':
                    await handleTicketCloseButton(client, interaction, ticketId, config, lang);
                    return true;
                case 'ticketarchive':
                    if (subAction === 'reopen') await handleReopenTicket(client, interaction, ticketId);
                    else if (subAction === 'delete') await handleDeleteTicket(client, interaction, ticketId);
                    else if (subAction === 'transcript') await handleTranscriptTicket(client, interaction, ticketId);
                    return true;
                case 'ticketclaim':
                    await recoverTicketFromChannel(interaction, ticketId, config);
                    await handleTicketClaim(client, interaction, ticketId);
                    return true;
                case 'closerequest':
                    await handleCloseRequest(client, interaction, ticketId, subAction, config);
                    return true;
                default:
                    return false;
            }
        }

        if (interaction.isModalSubmit?.()) {
            if (customId.startsWith('reviewWhy_')) {
                await handleReviewFeedbackModal(client, interaction);
                return true;
            }
            if (customId.startsWith('reviewModal_')) {
                await handleReviewModalSubmit(client, interaction);
                return true;
            }
            if (customId.startsWith('ticketcreate-')) {
                await handleModalSubmitTicketCreation(client, interaction);
                return true;
            }
            if (customId.startsWith('closeReason-')) {
                const ticketId = customId.split('-')[1];
                await recoverTicketFromChannel(interaction, ticketId, config);
                await handleCloseReasonModal(interaction, ticketId);
                return true;
            }
        }
    } catch (error) {
        console.error('Error handling ticket interaction:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing your interaction. Please try again.', true);
        return true;
    }
    return false;
};
