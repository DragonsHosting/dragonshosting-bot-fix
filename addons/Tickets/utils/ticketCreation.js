const {
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    LabelBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require("discord.js");
const moment = require('moment-timezone');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replacePlaceholders, deferIfNeeded, getUserPriority, generateUniqueTicketId, parseDuration } = require('./ticketUtils.js');
const { buildComponentsV2Payload, sendComponentsV2Message, createSimplePlaceholderReplacer, replyComponentsV2 } = require('../../../utils/core/componentsV2Builder.js');
const Ticket = require('../models/tickets');
const getBlacklistModel = () => global.addonLoader?.getModel('Blacklist');

const config = getConfig();
const lang = getLang();

async function handleTicketCreate(client, interaction) {
    try {
        let ticketTypeKey;

        if (interaction.customId) {
            const parts = interaction.customId.split('-');
            ticketTypeKey = parts[1] ? parts[1] : interaction.values[0];
        } else {
            ticketTypeKey = interaction.values[0];
        }

        if (ticketTypeKey === 'nothing_selected') {
            return await interaction.reply({
                content: 'Please select a valid ticket type to create a ticket.',
                flags: MessageFlags.Ephemeral
            });
        }

        const ticketType = config.TicketTypes[ticketTypeKey];

        if (!ticketType) {
            console.error(`Ticket type for key "${ticketTypeKey}" not found in configuration.`);
            throw new Error('Ticket type not found.');
        }

        const userRoles = interaction.member.roles.cache.map(role => role.id);
        const hasValidRole = ticketType.UserRole.some(role => role && userRoles.includes(role));

        if (!hasValidRole && ticketType.UserRole.some(role => role)) {
            await interaction.reply({ content: "You do not have the required roles to create this type of ticket.", flags: MessageFlags.Ephemeral });
            return;
        }

        const [blacklistedUser, existingTickets] = await Promise.all([
            getBlacklistModel()?.findOne({ userId: interaction.user.id }),
            Ticket.find({
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                status: { $in: ['open', 'closed'] }
            })
        ]);

        if (blacklistedUser && blacklistedUser.type === 'temporary' && blacklistedUser.expiresAt && new Date() >= blacklistedUser.expiresAt) {
            await getBlacklistModel()?.findOneAndDelete({ userId: interaction.user.id });
        } else if (blacklistedUser) {
            const blacklistConfig = lang.Tickets.Blacklisted;
            const placeholders = {
                user: `<@${interaction.user.id}>`,
                reason: blacklistedUser.reason,
                time: `<t:${Math.floor(new Date(blacklistedUser.addedAt).getTime() / 1000)}:F>`
            };

            if (blacklistConfig.Components && Array.isArray(blacklistConfig.Components)) {
                const replacer = createSimplePlaceholderReplacer(placeholders);
                await replyComponentsV2(interaction, blacklistConfig.Components, replacer, { ephemeral: true });
                return;
            }

            const embedConfig = blacklistConfig.Embed;
            if (embedConfig) {
                const blacklistEmbed = new EmbedBuilder();
                if (embedConfig.Title) blacklistEmbed.setTitle(embedConfig.Title);
                if (embedConfig.Description && embedConfig.Description.length > 0) {
                    blacklistEmbed.setDescription(embedConfig.Description.join('\n')
                        .replace('{user}', placeholders.user)
                        .replace('{reason}', placeholders.reason)
                        .replace('{time}', placeholders.time));
                }
                if (embedConfig.Color) blacklistEmbed.setColor(embedConfig.Color);
                if (embedConfig.Footer && embedConfig.Footer.Text) {
                    blacklistEmbed.setFooter({
                        text: embedConfig.Footer.Text || null,
                        iconURL: embedConfig.Footer.Icon || null
                    });
                }
                if (embedConfig.Author && embedConfig.Author.Text) {
                    blacklistEmbed.setAuthor({
                        name: embedConfig.Author.Text || null,
                        iconURL: embedConfig.Author.Icon || null
                    });
                }
                if (embedConfig.Image) blacklistEmbed.setImage(embedConfig.Image);
                if (embedConfig.Thumbnail) blacklistEmbed.setThumbnail(embedConfig.Thumbnail);
                await interaction.reply({ embeds: [blacklistEmbed], flags: MessageFlags.Ephemeral });
            }
            return;
        }

        const validTickets = [];
        const ticketsToDelete = [];
        
        for (const ticket of existingTickets) {
            if (!ticket.channelId) {
                ticketsToDelete.push(ticket._id);
                continue;
            }

            try {
                const channel = await interaction.guild.channels.fetch(ticket.channelId);
                if (!channel) {
                    ticketsToDelete.push(ticket._id);
                } else {
                    validTickets.push({ ticket, channel });
                }
            } catch {
                ticketsToDelete.push(ticket._id);
            }
        }

        if (ticketsToDelete.length > 0) {
            await Ticket.updateMany(
                { _id: { $in: ticketsToDelete } },
                { $set: { status: 'deleted', deletedAt: new Date() } }
            );
        }

        if (validTickets.length >= config.TicketSettings.MaxTickets) {
            const channelMentions = validTickets
                .map(v => `<#${v.channel.id}>`)
                .join(', ');
            
            const message = `${lang.Tickets.AlreadyOpen}\n\nYour open ticket${validTickets.length > 1 ? 's' : ''}: ${channelMentions}`;
            
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            return;
        }

        if (config.WorkingHours && config.WorkingHours.Enabled) {
            const currentTime = moment().tz(config.WorkingHours.Timezone);
            const currentDay = currentTime.format('dddd');
            
            if (config.WorkingHours.NonWorkingDays && config.WorkingHours.NonWorkingDays.includes(currentDay)) {
                if (!config.WorkingHours.allowOpenTickets) {
                    const workingHoursMessage = lang.Tickets.WorkingHours
                        .replace('{workinghours_start}', 'N/A')
                        .replace('{workinghours_end}', 'N/A');
                    await interaction.reply({ content: workingHoursMessage, flags: MessageFlags.Ephemeral });
                    return;
                }
            } else {
                const workingHours = config.WorkingHours.Schedule[currentDay];

                if (workingHours) {
                    const [start, end] = workingHours.split('-');
                    const [startHour, startMinute] = start.split(':');
                    const [endHour, endMinute] = end.split(':');
                    const startTime = currentTime.clone().hour(parseInt(startHour)).minute(parseInt(startMinute)).second(0).millisecond(0);
                    const endTime = currentTime.clone().hour(parseInt(endHour)).minute(parseInt(endMinute)).second(0).millisecond(0);

                    if (!currentTime.isBetween(startTime, endTime) && !config.WorkingHours.allowOpenTickets) {
                        const workingHoursMessage = lang.Tickets.WorkingHours
                            .replace('{workinghours_start}', `<t:${startTime.unix()}:t>`)
                            .replace('{workinghours_end}', `<t:${endTime.unix()}:t>`);
                        await interaction.reply({ content: workingHoursMessage, flags: MessageFlags.Ephemeral });
                        return;
                    }
                }
            }
        }

        if (Array.isArray(ticketType.Questions) && ticketType.Questions.length > 0) {
            const hasSelectDropdowns = ticketType.Questions.some(question => {
                const questionKey = Object.keys(question)[0];
                const questionConfig = question[questionKey];
                return questionConfig.Type === 'StringSelect';
            });

            if (hasSelectDropdowns) {
                const modal = new ModalBuilder()
                    .setCustomId(`ticketcreate-${ticketTypeKey}`)
                    .setTitle(ticketType.Name || 'Create a Ticket');

                const labelComponents = [];

                ticketType.Questions.forEach((question, index) => {
                    if (index < 5) {
                        const questionKey = Object.keys(question)[0];
                        const questionConfig = question[questionKey];

                        if (questionConfig.Type === 'StringSelect') {
                            const selectMenu = new StringSelectMenuBuilder()
                                .setCustomId(questionKey)
                                .setPlaceholder(questionConfig.Placeholder || 'Select an option...')
                                .setMinValues(questionConfig.Required ? 1 : 0)
                                .setMaxValues(1);

                            questionConfig.Options.forEach(option => {
                                const selectOption = new StringSelectMenuOptionBuilder()
                                    .setLabel(option.Label)
                                    .setValue(option.Value);
                                
                                if (option.Description) selectOption.setDescription(option.Description);
                                if (option.Emoji) selectOption.setEmoji(option.Emoji);
                                
                                selectMenu.addOptions(selectOption);
                            });

                            const labelComponent = new LabelBuilder()
                                .setLabel(questionConfig.Question)
                                .setStringSelectMenuComponent(selectMenu);
                            
                            if (questionConfig.Description) {
                                labelComponent.setDescription(questionConfig.Description);
                            }

                            labelComponents.push(labelComponent);
                        } else {
                            const styleMap = {
                                Short: TextInputStyle.Short,
                                Paragraph: TextInputStyle.Paragraph
                            };

                            const textInput = new TextInputBuilder()
                                .setCustomId(questionKey)
                                .setPlaceholder(questionConfig.Placeholder || '')
                                .setStyle(styleMap[questionConfig.Style] || TextInputStyle.Short)
                                .setRequired(questionConfig.Required || false)
                                .setMaxLength(questionConfig.maxLength || 1000);

                            const labelComponent = new LabelBuilder()
                                .setLabel(questionConfig.Question || '')
                                .setTextInputComponent(textInput);

                            labelComponents.push(labelComponent);
                        }
                    }
                });

                modal.addLabelComponents(...labelComponents);
                await interaction.showModal(modal);
            } else {
                const modal = new ModalBuilder()
                    .setCustomId(`ticketcreate-${ticketTypeKey}`)
                    .setTitle(ticketType.Name || 'Create a Ticket');

                ticketType.Questions.forEach(question => {
                    const questionKey = Object.keys(question)[0];
                    const questionConfig = question[questionKey];

                    const styleMap = {
                        Short: TextInputStyle.Short,
                        Paragraph: TextInputStyle.Paragraph
                    };

                    const input = new TextInputBuilder()
                        .setCustomId(questionKey)
                        .setLabel(questionConfig.Question || '')
                        .setPlaceholder(questionConfig.Placeholder || '')
                        .setStyle(styleMap[questionConfig.Style] || TextInputStyle.Short)
                        .setRequired(questionConfig.Required || false)
                        .setMaxLength(questionConfig.maxLength || 1000);

                    const actionRow = new ActionRowBuilder().addComponents(input);
                    modal.addComponents(actionRow);
                });

                await interaction.showModal(modal);
            }
        } else {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }
            await createTicket(client, interaction, ticketTypeKey, [], ticketType.Panel);
        }
    } catch (error) {
        console.error('Error creating ticket:', error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        await interaction.followUp({ content: 'An error occurred while creating the ticket. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => console.error('Error sending follow-up:', e));
    }
}

async function createTicket(client, interaction, ticketTypeKey, questions, selectedPanel) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const ticketType = config.TicketTypes[ticketTypeKey];
        const member = interaction.member;

        const initialPromises = [
            getUserPriority(member),
            generateUniqueTicketId(),
            config.TicketSettings.DelayedResponse?.Enabled 
                ? Ticket.countDocuments({ guildId: interaction.guild.id, status: 'open' })
                : Promise.resolve(0)
        ];

        const [userPriority, newTicketId, openTickets] = await Promise.all(initialPromises);

        let delayedResponseData = null;
        if (config.TicketSettings.DelayedResponse?.Enabled && 
            openTickets >= config.TicketSettings.DelayedResponse.TicketThreshold) {
            delayedResponseData = { openTickets: openTickets.toString() };
        }
        
        if (typeof newTicketId !== 'number' || isNaN(newTicketId) || newTicketId < 1) {
            console.error('Invalid ticket ID generated:', newTicketId);
            throw new Error('Failed to generate valid ticket ID');
        }

        const ticketName = ticketType.ChannelName.replace('{ticket-id}', newTicketId)
            .replace('{user}', interaction.user.username)
            .replace('{priority}', userPriority);
        const channelTopic = ticketType.ChannelTopic
            .replace('{ticketType}', ticketType.Name)
            .replace('{userid}', `<@!${interaction.user.id}>`)
            .replace('{priority}', userPriority)
            .replace('{claimer}', 'Unclaimed');

        const ticket = new Ticket({
            ticketId: newTicketId,
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            ticketType: ticketTypeKey,
            priority: userPriority,
            questions: questions,
            messageCount: 0,
            alertTime: ticketType.AutoAlert && ticketType.AutoAlert !== "0" ? 
                new Date(Date.now() + parseDuration(ticketType.AutoAlert)) : null,
            claimed: false,
            claimedBy: null,
            channelTopic: channelTopic
        });

        let permissionOverwriteArray = [
            {
                id: interaction.guild.roles.everyone.id,
                deny: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            }
        ];

        if (ticketType.SupportRole && Array.isArray(ticketType.SupportRole)) {
            for (const roleId of ticketType.SupportRole) {
                if (!roleId) continue;
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                    permissionOverwriteArray.push({
                        id: role.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks
                        ]
                    });
                }
            }
        }

        const channelOptions = {
            name: ticketName,
            type: 0,
            topic: channelTopic,
            permissionOverwrites: permissionOverwriteArray
        };

        let targetCategoryId = null;
        let selectedCategory = null;
        
        const categoryIDs = ticketType.CategoryID;
        if (Array.isArray(categoryIDs)) {
            for (const catId of categoryIDs) {
                if (!catId || catId === "" || catId === "CATEGORY_ID") continue;
                const cat = interaction.guild.channels.cache.get(catId);
                if (cat) {
                    targetCategoryId = catId;
                    break;
                }
            }
        } else if (categoryIDs && categoryIDs !== "" && categoryIDs !== "CATEGORY_ID") {
            targetCategoryId = categoryIDs;
        }

        if (targetCategoryId) {
            const mainCategory = interaction.guild.channels.cache.get(targetCategoryId);
            if (mainCategory && mainCategory.children.cache.size >= 50 && config.TicketSettings.overFlow) {
                for (const overflowCategoryId of config.TicketSettings.overFlow) {
                    if (!overflowCategoryId || overflowCategoryId === "" || overflowCategoryId === "CATEGORY_ID") continue;
                    const overflowCategory = interaction.guild.channels.cache.get(overflowCategoryId);
                    if (overflowCategory && overflowCategory.children.cache.size < 50) {
                        targetCategoryId = overflowCategoryId;
                        selectedCategory = overflowCategory;
                        break;
                    }
                }
            } else if (mainCategory) {
                selectedCategory = mainCategory;
            }
        }

        if (selectedCategory) {
            channelOptions.parent = selectedCategory.id;
        }

        let channel;
        try {
            channel = await interaction.guild.channels.create(channelOptions);
            ticket.channelId = channel.id;
            ticket.channelName = channel.name;
        } catch (error) {
            console.error('Error creating channel:', error);
            return await interaction.followUp({ content: 'Failed to create the ticket channel. Please contact an administrator.', flags: MessageFlags.Ephemeral });
        }

        const ticketCreationConfig = config.TicketCreation[ticketTypeKey] || config.TicketCreation.Default;

        let formattedQuestions = '';
        if (questions.length > 0) {
            formattedQuestions = questions.map(q => 
                ticketCreationConfig.QuestionFormat.map(format => 
                    replacePlaceholders(format, { question: q.question, answer: q.answer })
                ).join('\n')
            ).join('\n');
        }

        const placeholders = {
            ticketType: ticketType.Name,
            user: `<@${interaction.user.id}>`,
            guild: interaction.guild.name,
            questions: formattedQuestions,
            claimer: "Unclaimed",
            userIcon: interaction.user.displayAvatarURL({ dynamic: true }),
            guildIcon: interaction.guild.iconURL({ dynamic: true }) || ''
        };

        const row = new ActionRowBuilder();

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ticketclose-${newTicketId}`)
                .setLabel(lang.Tickets.CloseTicketButton)
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        if (ticketType.Claiming && ticketType.Claiming.Enabled) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticketclaim-${newTicketId}`)
                    .setLabel(ticketType.Claiming.Button.Name || "Claim Ticket")
                    .setStyle(ButtonStyle[ticketType.Claiming.Button.Style] || ButtonStyle.Secondary)
                    .setEmoji(ticketType.Claiming.Button.Emoji || '🎫')
            );
        }

        let ticketMessage;
        try {
            if (ticketCreationConfig.Components) {
                const replacer = createSimplePlaceholderReplacer(placeholders);
                ticketMessage = await sendComponentsV2Message(
                    interaction.client,
                    channel.id,
                    { Components: ticketCreationConfig.Components },
                    replacer,
                    [row]
                );
            }
            
            if (ticketMessage) {
                ticket.firstMessageId = ticketMessage.id;
            }
        } catch (error) {
            console.error('Error sending ticket creation message:', error);
        }

        await ticket.save();

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('ticket:created', {
                ticket: ticket.toObject(),
                ticketType: ticketType,
                channel: channel,
                user: interaction.user,
                guild: interaction.guild,
                questions: questions,
                priority: userPriority
            });
        }

        const parallelMessages = [];
        
        if (config.WorkingHours.Enabled) {
            parallelMessages.push(sendWorkingHoursMessage(channel, interaction.client));
        }

        if (ticketType.TagSupport || ticketType.TagCreator) {
            parallelMessages.push(sendTagMessage(channel, interaction, ticketType));
        }

        parallelMessages.push(
            sendFollowupMessage(channel, placeholders, ticketTypeKey, ticketMessage?.id).catch(error => 
                console.error('Error sending follow-up message:', error)
            )
        );

        parallelMessages.push(sendTicketCreatedResponse(interaction, channel, delayedResponseData));

        await Promise.all(parallelMessages);

    } catch (error) {
        console.error('Error creating ticket:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        await interaction.followUp({ content: 'An error occurred while creating the ticket. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => console.error('Error sending follow-up:', e));
    }
}

async function sendWorkingHoursMessage(channel, client) {
    const currentTime = moment().tz(config.WorkingHours.Timezone);
    const currentDay = currentTime.format('dddd');
    
    const workingHours = config.WorkingHours.Schedule[currentDay];
    let startTimestamp = 'N/A';
    let endTimestamp = 'N/A';
    let shouldSend = false;
    
    if (config.WorkingHours.NonWorkingDays && config.WorkingHours.NonWorkingDays.includes(currentDay)) {
        shouldSend = true;
    } else if (workingHours) {
        const [start, end] = workingHours.split('-');
        const [startHour, startMinute] = start.split(':');
        const [endHour, endMinute] = end.split(':');
        const startTime = currentTime.clone().hour(parseInt(startHour)).minute(parseInt(startMinute)).second(0).millisecond(0);
        const endTime = currentTime.clone().hour(parseInt(endHour)).minute(parseInt(endMinute)).second(0).millisecond(0);
        startTimestamp = `<t:${startTime.unix()}:t>`;
        endTimestamp = `<t:${endTime.unix()}:t>`;
        
        if (!currentTime.isBetween(startTime, endTime)) {
            shouldSend = true;
        }
    }
    
    if (!shouldSend) return;
    
    const placeholders = {
        workinghours_start: startTimestamp,
        workinghours_end: endTimestamp
    };
    
    try {
        const workingHoursConfig = config.WorkingHours;
        if (workingHoursConfig.Components) {
            const replacer = createSimplePlaceholderReplacer(placeholders);
            await sendComponentsV2Message(client, channel.id, { Components: workingHoursConfig.Components }, replacer);
        }
    } catch (error) {
        console.error('Error sending working hours message:', error);
    }
}

async function sendTagMessage(channel, interaction, ticketType) {
    let tagMessageContent = '';
    if (ticketType.TagSupport) {
        const supportTags = ticketType.SupportRole
            .map(roleId => interaction.guild.roles.cache.has(roleId) ? `<@&${roleId}>` : null)
            .filter(Boolean)
            .join(' ');
        tagMessageContent += supportTags;
    }
    if (ticketType.TagCreator) {
        tagMessageContent += ` <@${interaction.user.id}>`;
    }
    if (tagMessageContent) {
        try {
            const tagMessage = await channel.send({ content: tagMessageContent.trim() });
            await tagMessage.delete().catch(error => {
                if (error.code !== 10008) {
                    console.error('Error deleting tag message:', error);
                }
            });
        } catch (error) {
            console.error('Error sending tag message:', error);
        }
    }
}

async function sendFollowupMessage(channel, placeholders, ticketTypeKey, replyToMessageId) {
    const ticketConfig = config.TicketCreation[ticketTypeKey] || config.TicketCreation.Default;
    const followupConfig = ticketConfig.Followup;

    if (followupConfig?.Message && followupConfig.Message !== "") {
        const followupMessage = replacePlaceholders(followupConfig.Message, placeholders);
        const messageOptions = { content: followupMessage };
        if (replyToMessageId) {
            messageOptions.reply = { messageReference: replyToMessageId, failIfNotExists: false };
        }
        await channel.send(messageOptions);
    }
}

async function sendTicketCreatedResponse(interaction, channel, delayedResponseData = null) {
    if (interaction?.skipTicketCreatedResponse || !interaction?.token) return;

    const ticketCreatedConfig = lang?.Tickets?.TicketCreated;
    if (!ticketCreatedConfig) return;
    
    const channelLink = `https://discord.com/channels/${interaction.guild.id}/${channel.id}`;
    const placeholders = {
        link: `[${ticketCreatedConfig.LinkText || 'Go to ticket'}](${channelLink})`,
        channel: `<#${channel.id}>`
    };

    const buttonConfig = ticketCreatedConfig.Button || {};
    const buttonRow = {
        type: 1,
        components: [{
            type: 2,
            style: 5,
            label: buttonConfig.Text || 'Go to Ticket',
            url: channelLink,
            emoji: buttonConfig.Emoji ? { name: buttonConfig.Emoji } : undefined
        }]
    };

    if (ticketCreatedConfig.Components && Array.isArray(ticketCreatedConfig.Components)) {
        const replacer = createSimplePlaceholderReplacer(placeholders);
        const v2Components = buildComponentsV2Payload({ Components: ticketCreatedConfig.Components }, replacer, []);
        if (v2Components && v2Components.length > 0) {
            const allComponents = [];
            
            if (delayedResponseData && config.TicketSettings.DelayedResponse?.Components) {
                const delayedReplacer = createSimplePlaceholderReplacer(delayedResponseData);
                const delayedComponents = buildComponentsV2Payload(
                    { Components: config.TicketSettings.DelayedResponse.Components }, 
                    delayedReplacer, 
                    []
                );
                if (delayedComponents && delayedComponents.length > 0) {
                    allComponents.push(...delayedComponents);
                }
            }
            
            allComponents.push(...v2Components);
            allComponents.push(buttonRow);
            
            const { REST, Routes } = require('discord.js');
            const rest = new REST({ version: '10' }).setToken(interaction.client.token);
            try {
                await rest.patch(
                    Routes.webhookMessage(interaction.client.user.id, interaction.token),
                    { body: { flags: 32768 | 64, components: allComponents, allowed_mentions: { parse: [] } } }
                );
            } catch (error) {
                console.error('Error sending Components V2 ticket created response:', error);
            }
            return;
        }
    }

    if (delayedResponseData && config.TicketSettings.DelayedResponse?.Components) {
        const { REST, Routes } = require('discord.js');
        const rest = new REST({ version: '10' }).setToken(interaction.client.token);
        const delayedReplacer = createSimplePlaceholderReplacer(delayedResponseData);
        const delayedComponents = buildComponentsV2Payload(
            { Components: config.TicketSettings.DelayedResponse.Components }, 
            delayedReplacer, 
            []
        );
        if (delayedComponents && delayedComponents.length > 0) {
            delayedComponents.push(buttonRow);
            try {
                await rest.patch(
                    Routes.webhookMessage(interaction.client.user.id, interaction.token),
                    { body: { flags: 32768 | 64, components: delayedComponents, allowed_mentions: { parse: [] } } }
                );
            } catch (error) {
                console.error('Error sending delayed response:', error);
            }
            return;
        }
    }

    const ticketCreatedEmbedConfig = ticketCreatedConfig.Embed;
    if (!ticketCreatedEmbedConfig) return;

    const embed = new EmbedBuilder();
    if (ticketCreatedEmbedConfig.Title) embed.setTitle(ticketCreatedEmbedConfig.Title);
    if (ticketCreatedEmbedConfig.Description && ticketCreatedEmbedConfig.Description.length > 0) {
        embed.setDescription(ticketCreatedEmbedConfig.Description.join('\n')
            .replace('{link}', placeholders.link));
    }
    if (ticketCreatedEmbedConfig.Color) embed.setColor(ticketCreatedEmbedConfig.Color);
    if (ticketCreatedEmbedConfig.Footer && ticketCreatedEmbedConfig.Footer.Text) {
        if (ticketCreatedEmbedConfig.Footer.Text !== "") {
            embed.setFooter({
                text: ticketCreatedEmbedConfig.Footer.Text,
                iconURL: ticketCreatedEmbedConfig.Footer.Icon || null
            });
        }
    }
    if (ticketCreatedEmbedConfig.Author && ticketCreatedEmbedConfig.Author.Text) {
        if (ticketCreatedEmbedConfig.Author.Text !== "") {
            embed.setAuthor({
                name: ticketCreatedEmbedConfig.Author.Text,
                iconURL: ticketCreatedEmbedConfig.Author.Icon || null
            });
        }
    }
    if (ticketCreatedEmbedConfig.Image) embed.setImage(ticketCreatedEmbedConfig.Image);
    if (ticketCreatedEmbedConfig.Thumbnail) embed.setThumbnail(ticketCreatedEmbedConfig.Thumbnail);

    const button = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel(buttonConfig.Text || 'Go to Ticket')
                .setStyle(ButtonStyle.Link)
                .setURL(channelLink)
                .setEmoji(buttonConfig.Emoji || null)
        );

    await interaction.followUp({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
}

async function handleModalSubmitTicketCreation(client, interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const [modalAction, ticketTypeKey] = interaction.customId.split('-');
        if (modalAction === 'ticketcreate') {
            const ticketType = config.TicketTypes[ticketTypeKey];
            let questions = [];

            if (Array.isArray(ticketType.Questions) && ticketType.Questions.length > 0) {
                for (const questionConfig of ticketType.Questions) {
                    const questionKey = Object.keys(questionConfig)[0];
                    const questionData = questionConfig[questionKey];
                    const question = questionData.Question;
                    let answer = "N/A";

                    try {
                        if (questionData.Type === 'StringSelect') {
                            let value;

                            if (interaction.components) {
                                for (const row of interaction.components) {
                                    if (row.components) {
                                        for (const component of row.components) {
                                            if (component.customId === questionKey) {
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
                                            if (innerComponent.custom_id === questionKey && innerComponent.values) {
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
                                
                                const selectComponent = allComponents.find(comp => comp.custom_id === questionKey);
                                
                                if (selectComponent && selectComponent.values && selectComponent.values.length > 0) {
                                    value = selectComponent.values[0];
                                }
                            }

                            if (value && questionData.Options) {
                                const selectedOption = questionData.Options.find(option => option.Value === value);
                                if (selectedOption) {
                                    const emoji = selectedOption.Emoji || '';
                                    const label = selectedOption.Label || value;
                                    answer = `${emoji} ${label}`.trim();
                                } else {
                                    answer = value;
                                }
                            } else if (value) {
                                answer = value;
                            }
                        } else {
                            answer = interaction.fields.getTextInputValue(questionKey) || "N/A";
                        }
                    } catch (error) {
                        console.error(`Error getting value for ${questionKey}:`, error);
                        answer = "N/A";
                    }

                    questions.push({ question, answer });
                }

                await createTicket(client, interaction, ticketTypeKey, questions, ticketType.Panel);
            } else {
                await createTicket(client, interaction, ticketTypeKey, [], ticketType.Panel);
            }
        }
    } catch (error) {
        console.error('Error handling modal submission:', error);
        await interaction.followUp({ content: 'An error occurred while processing your modal submission. Please try again later.', flags: MessageFlags.Ephemeral }).catch(e => console.error('Error sending follow-up:', e));
    }
}

module.exports = {
    handleTicketCreate,
    createTicket,
    handleModalSubmitTicketCreation
};
