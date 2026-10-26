const {
    ActionRowBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    LabelBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags
} = require("discord.js");
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { getFormattedReason, replacePlaceholders } = require('./ticketUtils.js');
const { sendComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const Ticket = require('../models/tickets');

const config = getConfig();
const lang = getLang();

async function handleReviewButton(client, interaction) {
    try {
        const [_, channelId] = interaction.customId.split('_');
        if (!channelId) {
            throw new Error('No channelId found in the customId.');
        }

        const ticket = await Ticket.findOne({ channelId: channelId });
        if (ticket && ticket.reviewData && Object.keys(ticket.reviewData).length > 0) {
            await interaction.reply({ content: lang.Tickets.ReviewAlreadySubmitted, flags: MessageFlags.Ephemeral });
            return;
        }

        const hasSelectDropdowns = Object.values(config.Reviews.Questions || {}).length > 0;
        
        if (hasSelectDropdowns) {
            const modal = new ModalBuilder()
                .setCustomId(`reviewModal_${channelId}`)
                .setTitle('Leave a Review');

            const labelComponents = [];

            Object.entries(config.Reviews.Questions || {}).forEach(([key, question], index) => {
                if (index < 4) {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(question.ID)
                        .setPlaceholder(lang.Tickets?.ReviewSelectPlaceholder || 'Choose your rating...')
                        .setMinValues(question.Required ? 1 : 0)
                        .setMaxValues(1);

                    question.Options.forEach(option => {
                        const selectOption = new StringSelectMenuOptionBuilder()
                            .setLabel(option.Label)
                            .setValue(option.Value);
                        
                        if (option.Emoji) selectOption.setEmoji(option.Emoji);
                        
                        selectMenu.addOptions(selectOption);
                    });

                    const labelComponent = new LabelBuilder()
                        .setLabel(question.Label)
                        .setStringSelectMenuComponent(selectMenu);
                    
                    if (question.Description) {
                        labelComponent.setDescription(question.Description);
                    }

                    labelComponents.push(labelComponent);
                }
            });

            if (config.Reviews.FeedbackInput?.Enabled && labelComponents.length < 5) {
                const textInput = new TextInputBuilder()
                    .setCustomId('additionalFeedback')
                    .setPlaceholder(config.Reviews.FeedbackInput.Placeholder)
                    .setStyle(config.Reviews.FeedbackInput.Style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(config.Reviews.FeedbackInput.Required)
                    .setMaxLength(config.Reviews.FeedbackInput.MaxLength || 1000);

                const labelComponent = new LabelBuilder()
                    .setLabel(config.Reviews.FeedbackInput.Label)
                    .setTextInputComponent(textInput);

                labelComponents.push(labelComponent);
            }

            modal.addLabelComponents(...labelComponents);
            await interaction.showModal(modal);
        } else {
            const modal = new ModalBuilder()
                .setCustomId(`reviewModal_${channelId}`)
                .setTitle('Leave a Review');

            if (config.Reviews.FeedbackInput?.Enabled) {
                const textInput = new TextInputBuilder()
                    .setCustomId('additionalFeedback')
                    .setLabel(config.Reviews.FeedbackInput.Label)
                    .setPlaceholder(config.Reviews.FeedbackInput.Placeholder)
                    .setStyle(TextInputStyle[config.Reviews.FeedbackInput.Style])
                    .setRequired(config.Reviews.FeedbackInput.Required);

                if (config.Reviews.FeedbackInput.MaxLength) {
                    textInput.setMaxLength(config.Reviews.FeedbackInput.MaxLength);
                }

                modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            }

            await interaction.showModal(modal);
        }
    } catch (error) {
        console.error('Error handling review button:', error);
        await interaction.reply({ content: 'An error occurred while opening the review form. Please try again later.', flags: MessageFlags.Ephemeral });
    }
}

async function handleReviewSelect(client, interaction) {
    try {
        const [_, channelId] = interaction.customId.split('_');
        if (!channelId) {
            throw new Error('No channelId found in the customId.');
        }

        const ticket = await Ticket.findOne({ channelId: channelId });
        if (ticket && ticket.rating !== lang.Tickets.ReviewNoRating) {
            await interaction.reply({ content: lang.Tickets.ReviewAlreadySubmitted, flags: MessageFlags.Ephemeral });
            return;
        }

        const rating = parseInt(interaction.values[0]);
        const ratingEmoji = config.Reviews.Emoji;
        const ratingString = `${ratingEmoji.repeat(rating)} (${rating}/5)`;

        if (config.Reviews.askWhy) {
            const modal = new ModalBuilder()
                .setCustomId(`reviewWhy_${channelId}_${rating}`)
                .setTitle(lang.Tickets.ReviewTitle)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('reviewFeedback')
                            .setLabel(lang.Tickets.ReviewPlaceholder)
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );

            await interaction.showModal(modal);
        } else {
            await updateReview(channelId, ratingString, interaction);
        }
    } catch (error) {
        console.error('Error handling review select:', error);
        await interaction.reply({ content: 'An error occurred while submitting your review. Please try again later.', flags: MessageFlags.Ephemeral });
    }
}

async function handleReviewFeedbackModal(client, interaction) {
    try {
        const parts = interaction.customId.split('_');
        if (parts.length < 3) {
            throw new Error('Invalid customId format. Expected at least 3 parts.');
        }

        const channelId = parts[1];
        const rating = parts[2];
        if (!channelId || !rating) {
            throw new Error('Missing channelId or rating in the customId.');
        }

        const feedback = interaction.fields.getTextInputValue('reviewFeedback');
        if (!feedback) {
            throw new Error('Review feedback is missing.');
        }

        const ratingEmoji = config.Reviews.Emoji;
        const ratingString = `${ratingEmoji.repeat(rating)} (${rating}/5)`;

        const ticket = await Ticket.findOne({ channelId: channelId });
        if (!ticket) {
            await interaction.reply({ content: 'Ticket not found or already closed.', flags: MessageFlags.Ephemeral });
            return;
        }

        const updatedTicket = await Ticket.findOneAndUpdate(
            { channelId: channelId },
            { rating: ratingString, reviewFeedback: feedback },
            { new: true }
        );

        if (!updatedTicket) {
            await interaction.reply({ content: 'Ticket not found or already closed.', flags: MessageFlags.Ephemeral });
            return;
        }

        await sendReviewToChannel(client, interaction, updatedTicket, ratingString, feedback);

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('ticket:reviewed', {
                ticket: updatedTicket.toObject(),
                rating: ratingString,
                feedback: feedback,
                reviewer: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel
            });
        }

        await interaction.reply({ content: lang.Tickets.ReviewComplete, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('Error handling review feedback modal:', error);
        await interaction.reply({ content: `An error occurred: ${error.message}. Please try again later.`, flags: MessageFlags.Ephemeral });
    }
}

async function updateReview(channelId, ratingString, interaction) {
    try {
        const updatedTicket = await Ticket.findOneAndUpdate(
            { channelId: channelId },
            { rating: ratingString },
            { new: true }
        );

        if (!updatedTicket) {
            await interaction.reply({ content: 'Ticket not found or already closed.', flags: MessageFlags.Ephemeral });
            return;
        }

        await sendReviewToChannel(interaction.client, interaction, updatedTicket, ratingString, 'No additional feedback provided.');

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('ticket:reviewed', {
                ticket: updatedTicket.toObject(),
                rating: ratingString,
                feedback: 'No additional feedback provided.',
                reviewer: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel
            });
        }

        await interaction.reply({ content: lang.Tickets.ReviewComplete, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('Error updating review:', error);
        await interaction.reply({ content: 'An error occurred while updating the review. Please try again later.', flags: MessageFlags.Ephemeral });
    }
}

async function handleReviewModalSubmit(client, interaction) {
    try {
        const [_, channelId] = interaction.customId.split('_');
        if (!channelId) {
            throw new Error('No channelId found in the customId.');
        }

        const ticket = await Ticket.findOne({ channelId: channelId });
        if (!ticket) {
            await interaction.reply({ content: 'Ticket not found or already closed.', flags: MessageFlags.Ephemeral });
            return;
        }

        const reviewData = {};
        let averageRating = 0;
        let ratingCount = 0;

        Object.entries(config.Reviews.Questions || {}).forEach(([key, question]) => {
            try {
                let value;

                if (interaction.components) {
                    for (const row of interaction.components) {
                        if (row.components) {
                            for (const component of row.components) {
                                if (component.customId === question.ID) {
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
                    const originalData = global.originalModalData?.get(interaction.id);
                    
                    if (originalData && originalData.originalComponents) {
                        for (const labelComponent of originalData.originalComponents) {
                            if (labelComponent.type === 18 && labelComponent.component) {
                                const innerComponent = labelComponent.component;
                                if (innerComponent.custom_id === question.ID && innerComponent.values) {
                                    value = innerComponent.values[0];
                                    break;
                                }
                            }
                        }
                    }
                }

                if (!value && interaction.data?.components) {
                    const allComponents = interaction.data.components
                        .flatMap(row => row.components || []);
                    
                    const selectComponent = allComponents.find(comp => comp.custom_id === question.ID);
                    
                    if (selectComponent && selectComponent.values && selectComponent.values.length > 0) {
                        value = selectComponent.values[0];
                    }
                }

                if (!value) {
                    try {
                        const inputValue = interaction.fields.getTextInputValue(question.ID);
                        if (inputValue) {
                            const numericInput = parseInt(inputValue);
                            if (numericInput >= 1 && numericInput <= question.Options.length) {
                                value = question.Options[numericInput - 1].Value;
                            }
                        }
                    } catch (error) {

                    }
                }
                
                if (value) {
                    const selectedOption = question.Options.find(option => option.Value === value);
                    if (selectedOption) {
                        reviewData[question.ID] = {
                            value: value,
                            label: selectedOption.Label,
                            emoji: selectedOption.Emoji || ''
                        };
                        
                        const numericValue = parseInt(value);
                        if (!isNaN(numericValue)) {
                            averageRating += numericValue;
                            ratingCount++;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error extracting value for ${question.ID}:`, error);
            }
        });

        if (config.Reviews.FeedbackInput?.Enabled) {
            try {
                const additionalFeedback = interaction.fields.getTextInputValue('additionalFeedback');
                if (additionalFeedback) {
                    reviewData.additionalFeedback = additionalFeedback;
                }
            } catch (error) {
                console.error('Error extracting additional feedback:', error);
            }
        }

        if (ratingCount > 0) {
            averageRating = (averageRating / ratingCount).toFixed(1);
        } else {
            averageRating = 'N/A';
        }

        const updatedTicket = await Ticket.findOneAndUpdate(
            { channelId: channelId },
            { 
                reviewData: reviewData,
                averageRating: averageRating
            },
            { new: true }
        );

        if (!updatedTicket) {
            await interaction.reply({ content: 'Ticket not found or already closed.', flags: MessageFlags.Ephemeral });
            return;
        }

        let reviewText = `**Average Rating:** ⭐ ${averageRating}\n`;
        
        Object.entries(reviewData).forEach(([key, data]) => {
            if (key !== 'additionalFeedback') {
                const questionConfig = Object.values(config.Reviews.Questions || {}).find(q => q.ID === key);
                if (questionConfig) {
                    reviewText += `> **${questionConfig.Label}:** ${data.emoji} ${data.label}\n`;
                }
            }
        });

        const feedback = reviewData.additionalFeedback || 'No additional feedback provided.';
        await sendReviewToChannel(client, interaction, updatedTicket, reviewText, feedback);

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('ticket:reviewed', {
                ticket: updatedTicket.toObject(),
                rating: reviewText,
                feedback: feedback,
                reviewer: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel
            });
        }

        await interaction.reply({ content: lang.Tickets.ReviewComplete || 'Thank you for your review!', flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('Error handling review modal submit:', error);
        await interaction.reply({ content: 'An error occurred while submitting your review. Please try again later.', flags: MessageFlags.Ephemeral });
    }
}

async function sendReviewToChannel(client, interaction, ticket, ratings, feedback) {
    const reviewChannelIds = config.Reviews?.ChannelID;
    if (!reviewChannelIds) return;

    const guild = client.guilds.cache.get(ticket.guildId);
    if (!guild) {
        console.error('Guild not found for ticket:', ticket.guildId);
        return;
    }

    let reviewChannel = null;
    const channelIds = Array.isArray(reviewChannelIds) ? reviewChannelIds : [reviewChannelIds];
    
    for (const channelId of channelIds) {
        if (!channelId || channelId === "" || channelId === "CHANNEL") continue;
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
            reviewChannel = channel;
            break;
        }
    }

    if (!reviewChannel) {
        return;
    }

    const user = await client.users.fetch(ticket.userId).catch(() => null);
    const userIcon = user?.displayAvatarURL({ dynamic: true }) || '';

    const placeholders = {
        ticketCreator: `<@${ticket.userId}>`,
        channelName: ticket.channelName || 'Unknown Channel',
        claimer: ticket.claimed ? `<@${ticket.claimedBy}>` : "Unclaimed",
        ratings: ratings,
        feedback: feedback,
        userIcon: userIcon
    };

    if (config.Reviews?.Components && Array.isArray(config.Reviews.Components)) {
        const replacer = createSimplePlaceholderReplacer(placeholders);
        await sendComponentsV2Message(client, reviewChannel.id, { Components: config.Reviews.Components }, replacer);
        return;
    }

    const embedConfig = config.Reviews?.Embed;
    if (!embedConfig) return;

    const description = (embedConfig.Description || []).map(line =>
        replacePlaceholders(line, placeholders)
    ).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(embedConfig.Title || 'Ticket Review')
        .setDescription(description)
        .setColor(embedConfig.Color || '#FFD700');

    if (embedConfig.Footer?.Text) {
        embed.setFooter({
            text: embedConfig.Footer.Text,
            iconURL: embedConfig.Footer.Icon || undefined
        });
    }

    if (embedConfig.Author?.Text) {
        embed.setAuthor({
            name: embedConfig.Author.Text,
            iconURL: embedConfig.Author.Icon || undefined
        });
    }

    if (embedConfig.Image) {
        embed.setImage(embedConfig.Image);
    }

    const thumbnail = embedConfig.Thumbnail?.replace('{userIcon}', userIcon);
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }

    await reviewChannel.send({ embeds: [embed] });
}

module.exports = {
    handleReviewButton,
    handleReviewSelect,
    handleReviewFeedbackModal,
    handleReviewModalSubmit,
    updateReview
};