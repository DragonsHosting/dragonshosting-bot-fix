const {
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    MessageFlags
} = require("discord.js");
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const sharp = require('sharp');
const axios = require('axios');
const { getConfig, getLang, getCommands } = require('../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();
const { handleVerificationInteraction } = require('../events/Verification/VerificationEvent');
const suggestionActions = require('../events/Suggestions/suggestionActions');
const giveawayActions = require('../events/Giveaways/giveawayActions.js');
const { deferIfNeeded, replyOrFollowUp, safeInteractionResponse } = require('../utils/ticketUtils.js');
const { editComponentsV2Message, createSimplePlaceholderReplacer } = require('../utils/core/componentsV2Builder.js');
const { handleTicketCreate, handleModalSubmitTicketCreation } = require('../utils/ticketCreation.js');
const { handleTicketClose, handleDeleteTicket, handleReopenTicket, handleCloseReasonModal } = require('../utils/ticketClosure.js');
const { handleTicketClaim } = require('../utils/ticketClaiming.js');
const { handleTranscriptTicket } = require('../utils/ticketTranscripts.js');
const { handleReviewButton, handleReviewSelect, handleReviewFeedbackModal, handleReviewModalSubmit } = require('../utils/ticketReviews.js');
const Ticket = require('../models/tickets');
const Blacklist = require('../models/blacklist');
const Giveaway = require('../models/Giveaway');
const client = require("../index");

module.exports = async (client, interaction) => {
    try {
        if (interaction.isButton()) {
            if (interaction.customId === 'check_percent' || interaction.customId === 'show_entrants') {
                await giveawayActions.handleButtonInteraction(interaction);
                return;
            }
            await handleButtonInteraction(client, interaction);
        } else if (interaction.isStringSelectMenu()) {
            await handleSelectMenuInteraction(client, interaction);
        } else if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId.startsWith('reviewWhy_')) {
                    await handleReviewFeedbackModal(client, interaction);
                } else if (interaction.customId.startsWith('reviewModal_')) {
                    await handleReviewModalSubmit(client, interaction);
                } else if (interaction.customId.startsWith('ticketcreate-')) {
                    await handleModalSubmitTicketCreation(client, interaction);
                } else if (interaction.customId.startsWith('closeReason-')) {
                    const ticketId = interaction.customId.split('-')[1];
                    await handleCloseReasonModal(interaction, ticketId);
                } else {
                    await handleModalSubmitInteraction(client, interaction);
                }
            } catch (modalError) {
                console.error('Error handling modal submit:', modalError);
                console.error('Modal custom ID:', interaction.customId);
                console.error('Guild ID:', interaction.guild?.id);
                console.error('Channel ID:', interaction.channel?.id);
                await safeInteractionResponse(interaction, 'An error occurred while processing your modal submission. Please try again.', true);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing your interaction. Please try again later.', true);
    }
};

async function handleSelectMenuInteraction(client, interaction) {
    try {
        if (interaction.customId === 'store_category') {
            const storeCommand = require('../commands/Fun/Economy/store');
            await storeCommand.handleCategorySelect(interaction);
            return;
        }
        
        if (interaction.customId === 'store_purchase') {
            const storeCommand = require('../commands/Fun/Economy/store');
            await storeCommand.handlePurchase(interaction);
            return;
        }

        if (interaction.customId === 'pet_select' || interaction.customId === 'adventure_start') {
            const User = require('../models/UserData');
            const petsCommand = require('../commands/Fun/Economy/pets');
            let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (user) {
                await petsCommand.handleInteraction(interaction, user);
            }
            return;
        }
        
        if (interaction.customId === 'ticketcreate') {
            await handleTicketCreate(client, interaction);

            const originalMessage = await interaction.channel.messages.fetch(interaction.message.id);
            const selectMenu = interaction.component;
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticketcreate')
                    .setPlaceholder(lang.Tickets.TicketTypePlaceholder)
                    .addOptions(selectMenu.options.map((option, index) => ({
                        label: option.label,
                        emoji: option.emoji,
                        value: option.value,
                        description: option.description,
                        default: option.value === 'nothing_selected'
                    })))
            );

            if (originalMessage.flags.has(32768)) {
                const panelConfig = config.TicketPanelSettings?.Panel1;
                if (panelConfig?.Components) {
                    const workingHoursPlaceholders = { guildIcon: interaction.guild.iconURL({ dynamic: true }) || '' };
                    if (config.WorkingHours?.Schedule) {
                        Object.keys(config.WorkingHours.Schedule).forEach(day => {
                            const dayLower = day.toLowerCase();
                            if (config.WorkingHours.NonWorkingDays?.includes(day)) {
                                workingHoursPlaceholders[`workinghours_start_${dayLower}`] = "N/A";
                                workingHoursPlaceholders[`workinghours_end_${dayLower}`] = "N/A";
                            } else {
                                const [dayStart, dayEnd] = config.WorkingHours.Schedule[day].split('-');
                                const [startHour, startMinute] = dayStart.split(':');
                                const [endHour, endMinute] = dayEnd.split(':');
                                const now = moment().tz(config.WorkingHours.Timezone || 'UTC');
                                const dayStartTime = now.clone().hour(parseInt(startHour)).minute(parseInt(startMinute));
                                const dayEndTime = now.clone().hour(parseInt(endHour)).minute(parseInt(endMinute));
                                workingHoursPlaceholders[`workinghours_start_${dayLower}`] = `<t:${dayStartTime.unix()}:t>`;
                                workingHoursPlaceholders[`workinghours_end_${dayLower}`] = `<t:${dayEndTime.unix()}:t>`;
                            }
                        });
                    }
                    const replacer = createSimplePlaceholderReplacer(workingHoursPlaceholders);
                    await editComponentsV2Message(
                        client,
                        interaction.channel.id,
                        originalMessage.id,
                        { Components: panelConfig.Components },
                        replacer,
                        [row]
                    );
                }
            } else {
                await originalMessage.edit({ components: [row] });
            }
        } else if (interaction.customId.startsWith('review_')) {
            await handleReviewSelect(client, interaction);
        } else {
            const suggestionInputConfigs = config.SuggestionSettings?.AdditionalModalInputs || {};
            const matchingConfig = Object.values(suggestionInputConfigs).find(inputConfig => 
                inputConfig && inputConfig.Type === 'StringSelect' && inputConfig.ID === interaction.customId
            );
            
            if (matchingConfig) {
                console.log(`Handling suggestion StringSelect interaction for ${interaction.customId}`);
                const selectedValue = interaction.values[0];
                console.log(`Selected value: ${selectedValue}`);
                
                if (!global.originalModalData) {
                    global.originalModalData = new Map();
                }
                
                const storedData = global.originalModalData.get(interaction.user.id) || { selectValues: {} };
                storedData.selectValues[interaction.customId] = selectedValue;
                global.originalModalData.set(interaction.user.id, storedData);
                
                console.log(`Stored StringSelect value for user ${interaction.user.id}:`, storedData);
                
                await interaction.reply({
                    content: `Ã¢ÂÂ Selected: **${matchingConfig.Options.find(opt => opt.Value === selectedValue)?.Label || selectedValue}**\n\nNow please use the \`/suggest\` command to submit your suggestion.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    } catch (error) {
        console.error('Error handling select menu interaction:', error);
    }
}

async function handleButtonInteraction(client, interaction) {
    if (interaction.customId === 'store_back') {
        const storeCommand = require('../commands/Fun/Economy/store');
        await storeCommand.handleBackButton(interaction);
        return;
    }
    
    if (interaction.customId.startsWith('reviewButton_')) {
        await handleReviewButton(client, interaction);
        return;
    }

    if (interaction.customId.startsWith('pet_') || interaction.customId.startsWith('train_') || interaction.customId.startsWith('adventure_')) {
        const User = require('../models/UserData');
        const petsCommand = require('../commands/Fun/Economy/pets');
        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (user) {
            await petsCommand.handleInteraction(interaction, user);
        }
        return;
    }

    const [action, uniqueId, subAction] = interaction.customId.split('-');

    if (interaction.customId.startsWith('music_') || interaction.customId.startsWith('queue_')) {
        const musicInteractionHandler = require('./musicInteraction');
        return musicInteractionHandler(client, interaction);
    }

    switch (action) {
        case 'verifyButton':
            await handleVerificationInteraction(client, interaction);
            break;
        case 'upvote':
            await suggestionActions.upvoteSuggestion(client, interaction, uniqueId);
            break;
        case 'downvote':
            await suggestionActions.downvoteSuggestion(client, interaction, uniqueId);
            break;
        case 'ticketcreate':
            await handleTicketCreate(client, interaction);
            break;
        case 'ticketdelete':
            await handleDeleteTicket(client, interaction, uniqueId);
            break;
        case 'ticketclose':
            try {
                const ticket = await Ticket.findOne({ ticketId: uniqueId });
                if (!ticket) {
                    return interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
                }

                const ticketType = config.TicketTypes[ticket.ticketType];
                if (!ticketType) {
                    return interaction.reply({ content: 'Ticket type configuration not found.', flags: MessageFlags.Ephemeral });
                }

                if (ticketType.RestrictDeletion) {
                    const hasSupportRole = interaction.member.roles.cache.some(role => 
                        ticketType.SupportRole.includes(role.id)
                    );
                    if (!hasSupportRole) {
                        return interaction.reply({ content: 'You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
                    }
                }

                if (config.TicketSettings.CloseReasons.Enabled) {
                    const modal = new ModalBuilder()
                        .setCustomId(`closeReason-${uniqueId}`)
                        .setTitle(lang.Tickets?.CloseTicketTitle || 'Close Ticket');

                    const reasonInput = new TextInputBuilder()
                        .setCustomId('closeReason')
                        .setLabel(lang.Tickets?.CloseReasonLabel || 'Reason for closing (optional)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setPlaceholder(lang.Tickets?.CloseReasonPlaceholder || 'Enter a reason for closing the ticket');

                    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                    
                    try {
                        await interaction.showModal(modal);
                    } catch (modalError) {
                        console.error('Error showing modal:', modalError);
                        await handleTicketClose(client, interaction, uniqueId);
                    }
                } else {
                    await handleTicketClose(client, interaction, uniqueId);
                }
            } catch (error) {
                console.error('Error in ticketclose button handler:', error);
                await safeInteractionResponse(interaction, 'An error occurred while processing the ticket close. Please try again.', true);
            }
            break;
        case 'join_giveaway':
            await handleJoinGiveaway(client, interaction);
            break;
        case 'ticketarchive':
            if (subAction === 'reopen') {
                await handleReopenTicket(client, interaction, uniqueId);
            } else if (subAction === 'delete') {
                await handleDeleteTicket(client, interaction, uniqueId);
            } else if (subAction === 'transcript') {
                await handleTranscriptTicket(client, interaction, uniqueId);
            } else {
                console.warn(`Unknown sub-action: ${subAction}`);
            }
            break;
        case 'ticketclaim':
            await handleTicketClaim(client, interaction, uniqueId);
            break;
        case 'closerequest':
            try {
                const ticket = await Ticket.findOne({ ticketId: uniqueId });
                if (!ticket) {
                    return interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
                }

                if (!ticket.closeRequestPending) {
                    return interaction.reply({ content: 'No pending close request for this ticket.', flags: MessageFlags.Ephemeral });
                }

                const isTicketOwner = interaction.user.id === ticket.userId;
                if (!isTicketOwner) {
                    return interaction.reply({ content: 'Only the ticket creator can respond to close requests.', flags: MessageFlags.Ephemeral });
                }

                const closeRequestConfig = config.CloseRequest;
                
                if (subAction === 'accept') {
                    await Ticket.updateOne(
                        { ticketId: uniqueId },
                        { 
                            closeRequestPending: false,
                            closeRequestBy: null,
                            closeRequestReason: null,
                            closeRequestAt: null,
                            closeRequestMessageId: null
                        }
                    );

                    if (ticket.closeRequestMessageId) {
                        try {
                            const requestMessage = await interaction.channel.messages.fetch(ticket.closeRequestMessageId);
                            if (requestMessage) await requestMessage.delete();
                        } catch (e) {}
                    }

                    const acceptedMessage = (closeRequestConfig?.Messages?.Accepted || 'Close request accepted by {user}. Closing ticket...')
                        .replace('{user}', `<@${interaction.user.id}>`);

                    const acceptEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(acceptedMessage);

                    await interaction.channel.send({ embeds: [acceptEmbed] });
                    await interaction.deferUpdate();

                    if (closeRequestConfig?.AutoCloseOnAccept !== false) {
                        await handleTicketClose(client, interaction, uniqueId, 'user_request', 'Close request accepted');
                    }

                } else if (subAction === 'decline') {
                    await Ticket.updateOne(
                        { ticketId: uniqueId },
                        { 
                            closeRequestPending: false,
                            closeRequestBy: null,
                            closeRequestReason: null,
                            closeRequestAt: null,
                            closeRequestMessageId: null
                        }
                    );

                    if (ticket.closeRequestMessageId) {
                        try {
                            const requestMessage = await interaction.channel.messages.fetch(ticket.closeRequestMessageId);
                            if (requestMessage) await requestMessage.delete();
                        } catch (e) {}
                    }

                    const declinedMessage = (closeRequestConfig?.Messages?.Declined || 'Close request declined by {user}. Staff will continue to assist.')
                        .replace('{user}', `<@${interaction.user.id}>`);

                    const declineEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setDescription(declinedMessage);

                    await interaction.channel.send({ embeds: [declineEmbed] });
                    await interaction.deferUpdate();
                }
            } catch (error) {
                console.error('Error handling close request response:', error);
                await safeInteractionResponse(interaction, 'An error occurred while processing your response.', true);
            }
            break;
        default:
            break;
    }
}

const { containsBlacklistedWordsText, buildBlacklistResponse } = require('../utils/suggestions/validation');

async function handleJoinGiveaway(client, interaction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const member = interaction.member;
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const channelId = interaction.channelId;
        const messageId = interaction.message.id;

        await giveawayActions.joinGiveaway(client, userId, username, member, interaction, channelId, messageId);

    } catch (error) {
        console.error('Error in handleJoinGiveaway:', error);
        await interaction.followUp({ content: 'An error occurred while joining the giveaway. Please try again later.', flags: MessageFlags.Ephemeral });
    }
}


async function handleModalSubmitInteraction(client, interaction) {
    try {
        const [modalAction, ticketTypeKey] = interaction.customId.split('-');
        if (modalAction === 'suggestionModal') {
            const modalData = {};
            let suggestionText;

            try {
                suggestionText = interaction.fields.getTextInputValue('suggestionText');
            } catch (error) {
                console.error('Error getting suggestion text:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
                }
                return;
            }

            Object.entries(config.SuggestionSettings.AdditionalModalInputs || {}).forEach(([key, inputConfig]) => {
                let value;
                
                if (inputConfig.Type === 'StringSelect') {
                    try {
                        
                        if (interaction.components) {
                            for (const row of interaction.components) {
                                if (row.components) {
                                    for (const component of row.components) {
                                        if (component.customId === inputConfig.ID) {
                                            if (component.values && component.values.length > 0) {
                                                value = component.values[0];
                                                break;
                                            } else if (component.value) {
                                                value = component.value;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (value) break;
                            }
                        }
                        
                        if (!value) {
                            const originalData = global.originalModalData?.get(interaction.user.id);
                            
                            if (originalData) {
                                if (originalData.selectValues && originalData.selectValues[inputConfig.ID]) {
                                    value = originalData.selectValues[inputConfig.ID];
                                } else if (originalData.originalComponents) {
                                    for (const labelComponent of originalData.originalComponents) {
                                        if (labelComponent.type === 18 && labelComponent.component) {
                                            const innerComponent = labelComponent.component;
                                            if (innerComponent.custom_id === inputConfig.ID && innerComponent.values) {
                                                value = innerComponent.values[0];
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (!value && interaction.data?.components) {
                            const allComponents = interaction.data.components
                                .flatMap(row => row.components || []);
                            
                            const selectComponent = allComponents.find(comp => comp.custom_id === inputConfig.ID);
                            
                            if (selectComponent && selectComponent.values && selectComponent.values.length > 0) {
                                value = selectComponent.values[0];
                            }
                        }
                        
                        if (!value) {
                            console.warn(`No StringSelect value found for ${inputConfig.ID}`);
                        }
                    } catch (error) {
                        console.error(`Error extracting StringSelect value for ${inputConfig.ID}:`, error);
                    }
                } else {
                    try {
                        value = interaction.fields.getTextInputValue(inputConfig.ID);
                    } catch (error) {
                        console.error(`Error extracting TextInput value for ${inputConfig.ID}:`, error);
                    }
                }
                
                if (value) {
                    modalData[`modal_${inputConfig.ID}`] = value;
                } else {
                    console.log(`No value found for ${inputConfig.ID}`);
                }
            });
                if (config.SuggestionSettings.blockBlacklistWords && await containsBlacklistedWordsText(suggestionText)) {
                    const blacklistMessage = buildBlacklistResponse(interaction.user);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: blacklistMessage, flags: MessageFlags.Ephemeral });
                    } else if (interaction.deferred) {
                        await interaction.followUp({ content: blacklistMessage, flags: MessageFlags.Ephemeral });
                    }
                    return;
                }

            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }

            await suggestionActions.createSuggestion(client, interaction, suggestionText, modalData);
            await interaction.editReply({ content: lang.Suggestion.SuggestionCreated });
            
            if (global.originalModalData) {
                global.originalModalData.delete(interaction.user.id);
            }
        }
    } catch (error) {
        console.error('Error handling modal submission:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        await interaction.followUp({ content: 'An error occurred while processing your modal submission. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => console.error('Error sending follow-up:', e));
    }
}