const {
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
    REST,
    Routes
} = require("discord.js");
const fs = require('fs');
const path = require('path');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { getFormattedReason, replacePlaceholders } = require('./ticketUtils.js');
const Ticket = require('../models/tickets');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

function formatTicketReview(ticket) {
    const config = getConfig();
    const lang = getLang();

    const reviewFormat = config.Logs?.Close?.ReviewFormat || {};
    const avgRatingLabel = reviewFormat.AverageRating || 'Average Rating';
    const ratingLabel = reviewFormat.Rating || 'Rating';
    const reviewLabel = reviewFormat.Review || 'Review';
    const feedbackLabel = reviewFormat.AdditionalFeedback || 'Additional Feedback';
    const noRatingText = reviewFormat.NoRating || lang.Tickets?.ReviewNoRating || 'No Rating Yet';
    const closeReasonLabel = reviewFormat.CloseReason || 'Close Reason';

    if (ticket.reviewData && Object.keys(ticket.reviewData).length > 0) {
        let reviewText = `> **${avgRatingLabel}:** ⭐ ${ticket.averageRating || 'N/A'}\n`;
        
        Object.entries(ticket.reviewData).forEach(([key, data]) => {
            if (key !== 'additionalFeedback') {
                const questionConfig = Object.values(config.Reviews.Questions || {}).find(q => q.ID === key);
                if (questionConfig) {
                    reviewText += `> **${questionConfig.Label}:** ${data.emoji} ${data.label}\n`;
                }
            }
        });
        
        if (ticket.reviewData.additionalFeedback) {
            reviewText += `> **${feedbackLabel}:**\n> \`\`\`${ticket.reviewData.additionalFeedback}\`\`\``;
        }

        if (ticket.closeReason || ticket.customCloseReason) {
            const reason = ticket.customCloseReason || ticket.closeReason;
            reviewText += `\n> **${closeReasonLabel}:**\n> ${reason}`;
        }
        
        return reviewText;
    }

    if (ticket.rating && ticket.rating !== lang.Tickets?.ReviewNoRating) {
        let reviewText = `> **${ratingLabel}:** ${ticket.rating}`;
        if (ticket.reviewFeedback) {
            reviewText += `\n> **${reviewLabel}:** \`${ticket.reviewFeedback}\``;
        }
        return reviewText;
    }

    return `> **${ratingLabel}:** ${noRatingText}`;
}

const config = getConfig();
const lang = getLang();

async function sendDMEmbedAndTranscript(client, interaction, ticket, action, userMessages) {
    try {
        if (!userMessages) userMessages = new Map();

        const minMessages = parseInt(config.TicketTranscript.MinMessages, 10);
        if (userMessages.size < minMessages) {
            return;
        }

        let transcriptAttachment;
        let transcriptBuffer;
        let transcriptFileName;
        const transcriptType = config.TicketTranscript.Type.toUpperCase();
        
        if (transcriptType === "TXT") {
            const savePath = config.TicketTranscript.SavePath;
            if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
            }
            const transcript = userMessages
                .map(m => `${new Date(m.createdTimestamp).toLocaleString()} - ${m.author.tag}: ${m.content}`)
                .reverse()
                .join('\n');
            const transcriptContent = transcript.length > 0 ? transcript : "No messages in this ticket.";

            transcriptFileName = `${interaction.channel?.name || `ticket-${ticket.ticketId}`}-transcript.${transcriptType.toLowerCase()}`;
            const filePath = path.join(savePath, transcriptFileName);
            let tempFilePath = null;
            
            transcriptBuffer = Buffer.from(transcriptContent);
            transcriptAttachment = new AttachmentBuilder(transcriptBuffer, { name: transcriptFileName });

            if (config.TicketTranscript.Save) {
                try {
                    tempFilePath = `${filePath}.temp`;
                    fs.writeFileSync(tempFilePath, transcriptContent, 'utf8');
                    
                    fs.renameSync(tempFilePath, filePath);
                    tempFilePath = null;
                } catch (error) {
                    console.error('Error saving transcript:', error);
                    if (tempFilePath && fs.existsSync(tempFilePath)) {
                        try {
                            fs.unlinkSync(tempFilePath);
                        } catch (cleanupError) {
                            console.error('Error cleaning up temporary transcript file:', cleanupError);
                        }
                    }
                }
            }
        }

        if (config.TicketSettings.Enabled) {
            await sendLog(client, interaction, ticket, userMessages, transcriptAttachment, transcriptBuffer, transcriptFileName);
        }

        if (config.TicketClosureDM.Enabled) {
            await sendDM(client, interaction, ticket, userMessages, transcriptAttachment, transcriptBuffer, transcriptFileName);
        }
    } catch (error) {
        console.error('Error in sendDMEmbedAndTranscript:', error);
    }
}

function getLogsChannel(guild) {
    const logsChannelIds = config.TicketSettings.LogsChannelID;
    if (Array.isArray(logsChannelIds)) {
        for (const channelId of logsChannelIds) {
            if (!channelId || channelId === "" || channelId === "CHANNEL_ID") continue;
            const channel = guild.channels.cache.get(channelId);
            if (channel) return channel;
        }
    } else if (logsChannelIds && logsChannelIds !== "" && logsChannelIds !== "CHANNEL_ID") {
        return guild.channels.cache.get(logsChannelIds);
    }
    return null;
}

async function sendLog(client, interaction, ticket, userMessages, transcriptAttachment, transcriptBuffer, transcriptFileName) {
    try {
        const logsChannel = getLogsChannel(interaction.guild);
        if (!logsChannel) {
            return;
        }

        const userTagReplacementForLog = interaction.user.tag === '/alert'
            ? `<@${interaction.user.id}> (\`/alert\`)`
            : `<@${interaction.user.id}>`;

        const closeReason = ticket.customCloseReason || 
            (ticket.closeReason ? getFormattedReason(ticket.closeReason) : config.TicketSettings.CloseReasons.DefaultReason);

        const placeholders = {
            userTag: userTagReplacementForLog,
            ticketCreator: `<@${ticket.userId}>`,
            messageCount: userMessages.size.toString(),
            priority: ticket.priority || 'N/A',
            rating: formatTicketReview(ticket),
            channelName: interaction.channel?.name || `ticket-${ticket.ticketId}`,
            claimer: ticket.claimed ? `<@${ticket.claimedBy}>` : "Unclaimed",
            reason: closeReason || config.TicketSettings.CloseReasons.DefaultReason
        };

        const useComponentsV2 = config.Logs?.Close?.Components && Array.isArray(config.Logs.Close.Components);

        if (useComponentsV2) {
            const placeholderReplacer = createSimplePlaceholderReplacer(placeholders);
            const v2Components = buildComponentsV2Payload(config.Logs.Close, placeholderReplacer, []);
            
            if (v2Components && v2Components.length > 0) {
                const rest = new REST({ version: '10' }).setToken(client.token);
                const body = { 
                    flags: 32768, 
                    components: v2Components,
                    allowed_mentions: { parse: [] }
                };

                if (config.TicketTranscript.Type.toUpperCase() === "WEB") {
                    const baseURL = config.Dashboard.Url;
                    const webUrl = `${baseURL}/tickets/${ticket.ticketId}/transcript`;
                    const transcriptRow = {
                        type: 1,
                        components: [{
                            type: 2,
                            style: 5,
                            label: lang?.Tickets?.ViewTranscriptButton || 'View Transcript',
                            url: webUrl
                        }]
                    };
                    body.components.push(transcriptRow);
                }

                try {
                    let logMessage;
                    if (config.TicketTranscript.Type.toUpperCase() !== "WEB" && transcriptBuffer) {
                        const fileName = transcriptFileName || 'transcript.txt';
                        body.attachments = [{ id: 0, filename: fileName }];
                        body.components.push({
                            type: 13,
                            file: { url: `attachment://${fileName}` }
                        });
                        logMessage = await rest.post(Routes.channelMessages(logsChannel.id), { 
                            body, 
                            files: [{ name: fileName, data: transcriptBuffer }] 
                        });
                    } else {
                        logMessage = await rest.post(Routes.channelMessages(logsChannel.id), { body });
                    }
                    if (logMessage) {
                        ticket.logMessageId = logMessage.id;
                        await ticket.save();
                    }
                } catch (error) {
                    console.error('Error sending Components V2 log:', error);
                }
                return;
            }
        }

        const logEmbedConfig = config.Logs?.Close?.Embed;
        if (!logEmbedConfig) {
            console.warn('Logs.Close.Embed config not found, skipping log');
            return;
        }

        const logEmbed = new EmbedBuilder()
            .setColor(logEmbedConfig.Color)
            .setTimestamp();

        if (logEmbedConfig.Title) logEmbed.setTitle(logEmbedConfig.Title);
        if (logEmbedConfig.Footer && logEmbedConfig.Footer.Text) {
            logEmbed.setFooter({ text: logEmbedConfig.Footer.Text, iconURL: logEmbedConfig.Footer.Icon || null });
        }
        if (logEmbedConfig.Image) logEmbed.setImage(logEmbedConfig.Image);
        if (logEmbedConfig.Thumbnail) logEmbed.setThumbnail(logEmbedConfig.Thumbnail);

        const descriptionLinesForLog = logEmbedConfig.Description.map(line =>
            replacePlaceholders(line, placeholders)
        ).join('\n');

        logEmbed.setDescription(descriptionLinesForLog);

        if (ticket.closeReason || ticket.customCloseReason) {
            const reason = ticket.customCloseReason || ticket.closeReason || 'No reason provided';
            logEmbed.addFields({
                name: 'Close Reason',
                value: reason,
                inline: true
            });
        }

        const messageOptions = { embeds: [logEmbed] };
        const components = [];

        if (config.TicketTranscript.Type.toUpperCase() === "WEB") {
            const baseURL = config.Dashboard.Url;
            const webUrl = `${baseURL}/tickets/${ticket.ticketId}/transcript`;
            const transcriptButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel(lang?.Tickets?.ViewTranscriptButton || 'View Transcript')
                        .setStyle(ButtonStyle.Link)
                        .setURL(webUrl)
                );
            components.push(transcriptButton);
            messageOptions.components = components;
        } else if (transcriptAttachment) {
            messageOptions.files = [transcriptAttachment];
        }

        const logMessage = await logsChannel.send(messageOptions);
        ticket.logMessageId = logMessage.id;
        await ticket.save();
    } catch (error) {
        console.error('Error sending log:', error);
    }
}

async function sendDM(client, interaction, ticket, userMessages, transcriptAttachment, transcriptBuffer, transcriptFileName) {
    try {
        const ticketOwner = await client.users.fetch(ticket.userId).catch(() => null);
        if (!ticketOwner) {
            console.warn(`Ticket owner not found for ticket ${ticket._id}, user ID: ${ticket.userId}`);
            return;
        }
        const closeReason = ticket.customCloseReason || 
            (ticket.closeReason ? getFormattedReason(ticket.closeReason) : config.TicketSettings.CloseReasons.DefaultReason);

        const placeholders = {
            user: ticketOwner.username,
            userTag: `<@${ticket.userId}>`,
            guild: interaction.guild?.name || 'Unknown Server',
            messageCount: userMessages.size.toString(),
            priority: ticket.priority || 'N/A',
            claimer: ticket.claimed ? `<@${ticket.claimedBy}>` : "Unclaimed",
            reason: closeReason
        };

        const useComponentsV2 = config.TicketClosureDM.Components && Array.isArray(config.TicketClosureDM.Components);

        if (useComponentsV2) {
            const additionalRows = [];

            if (config.Reviews.Enabled) {
                const reviewButton = {
                    type: 2,
                    style: ButtonStyle[config.Reviews.ButtonStyle] || 1,
                    label: config.Reviews.Placeholder,
                    emoji: config.Reviews.ButtonEmoji ? { name: config.Reviews.ButtonEmoji } : undefined,
                    custom_id: `reviewButton_${ticket.channelId}`
                };
                additionalRows.push({ type: 1, components: [reviewButton] });
            }

            if (config.TicketClosureDM.Transcript && config.TicketTranscript.Type.toUpperCase() === "WEB") {
                const baseURL = config.Dashboard.Url;
                const webUrl = `${baseURL}/tickets/${ticket.ticketId}/transcript`;
                const transcriptButton = {
                    type: 2,
                    style: 5,
                    label: lang?.Tickets?.ViewTranscriptButton || 'View Transcript',
                    url: webUrl
                };
                if (additionalRows.length > 0 && additionalRows[additionalRows.length - 1].components.length < 5) {
                    additionalRows[additionalRows.length - 1].components.push(transcriptButton);
                } else {
                    additionalRows.push({ type: 1, components: [transcriptButton] });
                }
            }

            const placeholderReplacer = createSimplePlaceholderReplacer(placeholders);
            const v2Components = buildComponentsV2Payload(config.TicketClosureDM, placeholderReplacer, []);
            
            if (v2Components && v2Components.length > 0) {
                const allComponents = [...v2Components, ...additionalRows];
                const rest = new REST({ version: '10' }).setToken(client.token);
                
                const dmChannel = await ticketOwner.createDM();
                const body = { 
                    flags: 32768, 
                    components: allComponents,
                    allowed_mentions: { parse: [] }
                };

                try {
                    if (config.TicketClosureDM.Transcript && config.TicketTranscript.Type.toUpperCase() !== "WEB" && transcriptBuffer) {
                        const fileName = transcriptFileName || 'transcript.txt';
                        body.attachments = [{ id: 0, filename: fileName }];
                        body.components.push({
                            type: 13,
                            file: { url: `attachment://${fileName}` }
                        });
                        await rest.post(Routes.channelMessages(dmChannel.id), { 
                            body, 
                            files: [{ name: fileName, data: transcriptBuffer }] 
                        });
                    } else {
                        await rest.post(Routes.channelMessages(dmChannel.id), { body });
                    }
                } catch (dmError) {
                    if (dmError.code === 50007) {
                        const serverMessage = `Could not send the ticket closure details via DM. Direct messages are disabled.`;
                        if (interaction.channel) {
                            await interaction.channel.send({ content: serverMessage });
                        }
                    } else {
                        console.error(`Could not send Components V2 DM to user ${ticket.userId}:`, dmError);
                    }
                }
                return;
            }
        }

        const dmEmbedConfig = config.TicketClosureDM.Embed;
        if (!dmEmbedConfig) {
            console.warn('TicketClosureDM.Embed config not found, skipping DM');
            return;
        }

        const dmEmbed = new EmbedBuilder()
            .setColor(dmEmbedConfig.Color)
            .setDescription(replacePlaceholders(dmEmbedConfig.Description.join('\n'), placeholders));

        if (dmEmbedConfig.Title) dmEmbed.setTitle(dmEmbedConfig.Title);
        if (dmEmbedConfig.Footer && dmEmbedConfig.Footer.Text) {
            dmEmbed.setFooter({ text: dmEmbedConfig.Footer.Text, iconURL: dmEmbedConfig.Footer.Icon || null });
        }
        if (dmEmbedConfig.Image) dmEmbed.setImage(dmEmbedConfig.Image);
        if (dmEmbedConfig.Thumbnail) dmEmbed.setThumbnail(dmEmbedConfig.Thumbnail);

        const components = [];
        const buttonRow = new ActionRowBuilder();
        let hasButtons = false;

        if (config.Reviews.Enabled) {
            const reviewButton = new ButtonBuilder()
                .setCustomId(`reviewButton_${ticket.channelId}`)
                .setLabel(config.Reviews.Placeholder)
                .setEmoji(config.Reviews.ButtonEmoji)
                .setStyle(ButtonStyle[config.Reviews.ButtonStyle]);

            buttonRow.addComponents(reviewButton);
            hasButtons = true;
        }

        if (config.TicketClosureDM.Transcript && config.TicketTranscript.Type.toUpperCase() === "WEB") {
            const baseURL = config.Dashboard.Url;
            const webUrl = `${baseURL}/tickets/${ticket.ticketId}/transcript`;
            const transcriptButton = new ButtonBuilder()
                .setLabel(lang?.Tickets?.ViewTranscriptButton || 'View Transcript')
                .setStyle(ButtonStyle.Link)
                .setURL(webUrl);

            buttonRow.addComponents(transcriptButton);
            hasButtons = true;
        }

        if (hasButtons) {
            components.push(buttonRow);
        }

        const messageOptions = { embeds: [dmEmbed], components };

        if (config.TicketClosureDM.Transcript && config.TicketTranscript.Type.toUpperCase() !== "WEB" && transcriptAttachment) {
            messageOptions.files = [transcriptAttachment];
        }

        try {
            await ticketOwner.send(messageOptions);
        } catch (dmError) {
            if (dmError.code === 50007) {
                const serverMessage = `Could not send the ticket closure details via DM. Direct messages are disabled.`;
                if (interaction.channel) {
                    await interaction.channel.send({ content: serverMessage });
                }
            } else {
                console.error(`Could not send DM to user ${ticket.userId}:`, dmError);
            }
        }
    } catch (error) {
        console.error('Error sending DM:', error);
    }
}

async function handleTranscriptTicket(client, interaction, uniqueId) {
    try {
        const ticket = await Ticket.findOne({ ticketId: uniqueId });

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

        const fetchedMessages = await channel.messages.fetch({ limit: 100 });
        const userMessages = fetchedMessages.filter(m => !m.author.bot);

        const minMessages = parseInt(config.TicketTranscript.MinMessages, 10);

        if (userMessages.size >= minMessages) {
            const transcriptType = config.TicketTranscript.Type.toUpperCase();

            if (transcriptType === "WEB") {
                const baseURL = config.Dashboard.Url;
                const webUrl = `${baseURL}/tickets/${uniqueId}/transcript`;

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel(lang?.Tickets?.ViewTranscriptButton || 'View Transcript')
                            .setStyle(ButtonStyle.Link)
                            .setURL(webUrl)
                    );

                const logEmbed = new EmbedBuilder()
                    .setTitle(lang.Tickets.TranscriptTitle)
                    .setColor("Blue")
                    .setDescription(replacePlaceholders(lang.Tickets.TranscriptDescription, { 
                        ticketId: uniqueId, 
                        userId: interaction.user.id 
                    }))
                    .setTimestamp();

                await interaction.reply({ 
                    content: lang.Tickets.TranscriptTitle, 
                    components: [row],
                    flags: MessageFlags.Ephemeral 
                });

                const logsChannel = getLogsChannel(interaction.guild);
                if (logsChannel) {
                    await logsChannel.send({ 
                        embeds: [logEmbed], 
                        components: [row]
                    });
                }

                try {
                    await interaction.user.send({ 
                        content: lang.Tickets.TranscriptReady, 
                        components: [row]
                    });
                } catch (dmError) {
                    console.error('Could not send transcript to user\'s DM:', dmError);
                }
            } else if (transcriptType === "TXT") {
                const transcript = userMessages
                    .map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`)
                    .reverse()
                    .join('\n');
                
                const transcriptContent = transcript.length > 0 ? transcript : "No messages in this ticket.";

                const savePath = path.resolve(config.TicketTranscript.SavePath);
                if (!fs.existsSync(savePath)) {
                    fs.mkdirSync(savePath, { recursive: true });
                }

                const fileName = `ticket-${uniqueId}-${Date.now()}.${transcriptType.toLowerCase()}`;
                const filePath = path.join(savePath, fileName);
                let tempFilePath = null;

                if (config.TicketTranscript.Save) {
                    try {
                        tempFilePath = `${filePath}.temp`;
                        fs.writeFileSync(tempFilePath, transcriptContent, 'utf8');

                        fs.renameSync(tempFilePath, filePath);
                        tempFilePath = null;
                    } catch (error) {
                        console.error('Error saving transcript:', error);
                        if (tempFilePath && fs.existsSync(tempFilePath)) {
                            try {
                                fs.unlinkSync(tempFilePath);
                            } catch (cleanupError) {
                                console.error('Error cleaning up temporary transcript file:', cleanupError);
                            }
                        }
                    }
                }

                const transcriptAttachment = new AttachmentBuilder(Buffer.from(transcriptContent), { 
                    name: fileName,
                    description: `Transcript for ticket #${uniqueId}`
                });

                const logEmbed = new EmbedBuilder()
                    .setTitle(lang.Tickets.TranscriptTitle)
                    .setColor("Blue")
                    .setDescription(replacePlaceholders(lang.Tickets.TranscriptDescription, { 
                        ticketId: uniqueId, 
                        userId: interaction.user.id 
                    }))
                    .setTimestamp();

                await interaction.reply({ content: lang.Tickets.TranscriptTitle, flags: MessageFlags.Ephemeral });

                const logsChannel2 = getLogsChannel(interaction.guild);
                if (logsChannel2) {
                    await logsChannel2.send({ 
                        embeds: [logEmbed], 
                        files: [transcriptAttachment] 
                    });
                }

                try {
                    await interaction.user.send({ 
                        content: lang.Tickets.TranscriptReady, 
                        files: [transcriptAttachment] 
                    });
                } catch (dmError) {
                    console.error('Could not send transcript to user\'s DM:', dmError);
                }
            }
        } else {
            await interaction.reply({ 
                content: lang.Tickets.TranscriptNotEnough, 
                flags: MessageFlags.Ephemeral 
            });
        }
    } catch (error) {
        console.error('Error handling transcript generation:', error);
        await interaction.reply({ 
            content: 'An error occurred while generating the transcript. Please try again later.', 
            flags: MessageFlags.Ephemeral 
        });
    }
}

module.exports = {
    sendDMEmbedAndTranscript,
    sendLog,
    sendDM,
    handleTranscriptTicket
};