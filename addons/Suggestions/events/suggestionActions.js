const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const Suggestion = require('../models/Suggestion');
const suggestionUtils = require('./suggestionUtils');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { getLogChannel } = require('../../../utils/handlers/messageUtils.js');
const config = getConfig();
const lang = getLang();
const GuildData = require('../../../models/guildDataSchema');

const {
	formatLongTime,
	formatShortTime,
	calculatePercent,
    replacePlaceholders
} = require('../utils/helpers');
const { buildSuggestionEmbed, buildVoteRow, buildDecisionEmbed } = require('../utils/embedFactory');
const { REST, Routes, MessageFlags: DiscordMessageFlags } = require('discord.js');

function formatSelectValues(modalData) {
    const formattedData = {};
    
    Object.entries(config.SuggestionSettings.AdditionalModalInputs || {}).forEach(([key, inputConfig]) => {
        const modalKey = `modal_${inputConfig.ID}`;
        const modalValue = modalData[modalKey];
        
        if (inputConfig.Type === 'StringSelect') {
            if (modalValue && inputConfig.Options) {
                const selectedOption = inputConfig.Options.find(option => option.Value === modalValue);
                
                if (selectedOption) {
                    const emoji = selectedOption.Emoji || '';
                    const label = selectedOption.Label || modalValue;
                    formattedData[modalKey] = modalValue;
                    formattedData[`${modalKey}_formatted`] = `${emoji} ${label}`.trim();
                    formattedData[`${modalKey}_label`] = label;
                    formattedData[`${modalKey}_emoji`] = emoji;
                } else {
                    formattedData[modalKey] = modalValue;
                    formattedData[`${modalKey}_formatted`] = modalValue;
                }
            } else {
                formattedData[modalKey] = 'N/A';
                formattedData[`${modalKey}_formatted`] = 'N/A';
                formattedData[`${modalKey}_label`] = 'N/A';
                formattedData[`${modalKey}_emoji`] = '';
            }
        } else {
            if (!modalValue) {
                formattedData[modalKey] = 'N/A';
            }
        }
    });
    return formattedData;
}

 

const generateUniqueId = async() => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result;
    let isUnique = false;
    while (!isUnique) {
        result = '';
        for (let i = 0; i < 5; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        const existingSuggestion = await Suggestion.findOne({
            uniqueId: result
        });
        if (!existingSuggestion) {
            isUnique = true;
        }
    }
    return result;
};

const updateSuggestionEmbed = async(client, suggestionId) => {
    try {
        const updatedSuggestion = await Suggestion.findById(suggestionId);
        if (!updatedSuggestion) throw new Error('Updated suggestion not found.');

        const channel = client.channels.cache.get(updatedSuggestion.channelId);
        const message = await channel.messages.fetch(updatedSuggestion.messageId);
        if (!message) throw new Error('Message not found.');

        const modalData = updatedSuggestion.modalData ? Object.fromEntries(updatedSuggestion.modalData) : {};
        const formattedModalData = formatSelectValues(modalData);

        const user = await client.users.fetch(updatedSuggestion.authorId).catch(() => null);
        if (!user) {
            return;
        }
        const guild = channel.guild;
        const member = await guild.members.fetch(updatedSuggestion.authorId).catch(() => null);
        const displayName = member ? member.displayName : user.username;

        const placeholders = {
            user: user.username,
            displayName: displayName,
            suggestion: updatedSuggestion.text,
            SuggestionID: updatedSuggestion.uniqueId,
            LongTime: formatLongTime(),
            ShortTime: formatShortTime(),
            upvotecount: updatedSuggestion.upvotes,
            downvotecount: updatedSuggestion.downvotes,
            upvoteemoji: config.SuggestionUpvote.upvoteEmoji || '',
            downvoteemoji: config.SuggestionDownvote.downvoteEmoji || '',
            userIcon: user.displayAvatarURL({ dynamic: true }),
            ...calculatePercent(updatedSuggestion.upvotes, updatedSuggestion.downvotes),
            ...modalData,
            ...formattedModalData
        };

        const row = buildVoteRow(updatedSuggestion.uniqueId, placeholders);

        if (updatedSuggestion.threadId) {
            const thread = await client.channels.cache.get(updatedSuggestion.threadId);
            if (thread) {
                const discussButton = new ButtonBuilder()
                    .setLabel(lang.Suggestion.Embed.Button.Discuss)
                    .setStyle(ButtonStyle.Link)
                    .setURL(thread.url);

                row.addComponents(discussButton);
            }
        }

        const componentsPayload = buildSuggestionEmbed(placeholders, user.displayAvatarURL({ dynamic: true }));
        const rest = new REST({ version: '10' }).setToken(client.token);
        await rest.patch(
            Routes.channelMessage(channel.id, message.id),
            {
                body: {
                    components: [...componentsPayload, row.toJSON()],
                    flags: 32768
                }
            }
        );

    } catch (error) {
        console.error('Error updating suggestion embed:', error);
    }
};


async function createSuggestion(client, interaction, suggestionText, modalData = {}) {
    try {
        const suggestionSettings = config.SuggestionSettings;
        const guild = interaction.guild || (interaction.channel && interaction.channel.guild);
        
        const suggestionChannel = guild ? getLogChannel(guild, suggestionSettings.ChannelID) : null;
        
        if (!suggestionChannel) {
            const errorMsg = 'Suggestion channel not found or bot does not have access to it.';
            if (interaction.commandId || interaction.replied || interaction.deferred) {
                if (interaction.replied) {
                    await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
                } else if (interaction.deferred) {
                    await interaction.editReply({ content: errorMsg });
                } else {
                    await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
                }
            } else if (interaction.author && interaction.channel) {
                const msg = await interaction.channel.send({ content: errorMsg });
                if (config.SuggestionSettings.DeleteFailureMessages) {
                    setTimeout(() => msg.delete().catch(console.error), config.SuggestionSettings.FailureMessageTimeout);
                }
            } else {
            }
            return;
        }
        
        const userIconUrl = interaction.author ? interaction.author.displayAvatarURL() : interaction.user.displayAvatarURL();
        const uniqueId = await generateUniqueId();

        const user = interaction.author || interaction.user;
        const userId = user.id;
        const username = user.username;
        const member = interaction.member || await interaction.guild.members.fetch(userId).catch(() => null);
        const displayName = member ? member.displayName : username;

        const formattedModalData = formatSelectValues(modalData);
        
        const placeholders = {
            ...modalData,
            ...formattedModalData,
            user: username,
            displayName: displayName,
            suggestion: suggestionText,
            SuggestionID: uniqueId,
            LongTime: formatLongTime(),
            ShortTime: formatShortTime(),
            upvotecount: 0,
            downvotecount: 0,
            upvoteemoji: config.SuggestionUpvote.upvoteEmoji || '',
            downvoteemoji: config.SuggestionDownvote.downvoteEmoji || '',
            ...calculatePercent(0, 0)
        };

        const row = buildVoteRow(uniqueId, placeholders);
        let message;

        const componentsPayload = buildSuggestionEmbed(placeholders, userIconUrl);
        const rest = new REST({ version: '10' }).setToken(client.token);
        const response = await rest.post(
            Routes.channelMessages(suggestionChannel.id),
            {
                body: {
                    components: [...componentsPayload, row.toJSON()],
                    flags: 32768
                }
            }
        );
        message = await suggestionChannel.messages.fetch(response.id);

        const newSuggestion = await Suggestion.create({
            uniqueId: uniqueId,
            guildId: interaction.guild.id,
            text: suggestionText,
            authorId: userId,
            messageId: message.id,
            channelId: suggestionChannel.id,
            upvotes: 0,
            downvotes: 0,
            voters: [],
            modalData: modalData
        });

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('suggestion:created', {
                suggestion: newSuggestion.toObject(),
                text: suggestionText,
                author: user,
                guild: interaction.guild,
                channel: suggestionChannel,
                message: message,
                modalData: modalData,
                uniqueId: uniqueId
            });
        }

        const threadName = config.SuggestionSettings.threadName.replace(/{user}/gi, username);
        if (threadName) {
            const thread = await message.startThread({ name: threadName, autoArchiveDuration: 60 });

            if (thread) {
                const discussButton = new ButtonBuilder()
                    .setLabel(lang.Suggestion.Embed.Button.Discuss)
                    .setStyle(ButtonStyle.Link)
                    .setURL(thread.url);

                const updatedRow = new ActionRowBuilder().addComponents(row.components).addComponents(discussButton);

                const componentsPayload = buildSuggestionEmbed(placeholders, userIconUrl);
                const rest = new REST({ version: '10' }).setToken(client.token);
                await rest.patch(
                    Routes.channelMessage(suggestionChannel.id, message.id),
                    {
                        body: {
                            components: [...componentsPayload, updatedRow.toJSON()],
                            flags: 32768
                        }
                    }
                );
                newSuggestion.threadId = thread.id;
                await newSuggestion.save();
            }
        }

        const guildId = interaction.guild.id;
        const guildData = await GuildData.findOne({ guildID: guildId });
        if (guildData) {
            guildData.totalSuggestions = (guildData.totalSuggestions || 0) + 1;
            await guildData.save();
        } else {
            const newGuildData = new GuildData({
                guildID: guildId,
                cases: 0,
                totalMessages: 0,
                stars: {},
                totalSuggestions: 1,
                timesBotStarted: 0
            });
            await newGuildData.save();
        }

        if (interaction.commandId || interaction.replied || interaction.deferred) {
            if (interaction.replied) {
                await interaction.followUp({ content: lang.Suggestion.SuggestionCreated, flags: MessageFlags.Ephemeral });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: lang.Suggestion.SuggestionCreated });
            } else {
                await interaction.reply({ content: lang.Suggestion.SuggestionCreated, flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.author && interaction.channel) {
            const msg = await interaction.channel.send({ 
                content: `${interaction.author}, ${lang.Suggestion.SuggestionCreated}`
            });
            setTimeout(() => msg.delete().catch(console.error), 5000);
        }
    } catch (error) {
        console.error('Error in creating suggestion:', error);
        console.error('Suggestion channel ID from config:', config.SuggestionSettings.ChannelID);
        const errorMsg = lang.Suggestion.Error;
        
        if (interaction.commandId || interaction.replied || interaction.deferred) {
            if (interaction.replied) {
                await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: errorMsg });
            } else {
                await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.author && interaction.channel) {
            const msg = await interaction.channel.send({ 
                content: `${interaction.author}, ${errorMsg}`
            });
            setTimeout(() => msg.delete().catch(console.error), 5000);
        } else {
        }
        throw error;
    }
}

        


async function upvoteSuggestion(client, interaction, uniqueId) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const suggestion = await Suggestion.findOne({ uniqueId: uniqueId });
        if (!suggestion) {
            return interaction.followUp({
                content: lang.Suggestion.SuggestionNotFound || 'Suggestion not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (suggestionUtils.hasUserVoted(suggestion, interaction.user.id)) {
            const previousVoteType = suggestionUtils.getUserVoteType(suggestion, interaction.user.id);
            if (previousVoteType === 'upvote') {
                return interaction.followUp({
                    content: lang.Suggestion.AlreadyUpvoted || 'You have already upvoted this suggestion.',
                    flags: MessageFlags.Ephemeral
                });
            } else if (previousVoteType === 'downvote') {
                await suggestionUtils.removeVote(suggestion, interaction.user.id);
            }
        }

        await suggestionUtils.addVote(suggestion, interaction.user.id, 'upvote');
        await updateSuggestionEmbed(client, suggestion._id);

        await interaction.followUp({
            content: lang.Suggestion.Upvoted || 'You have upvoted the suggestion.',
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Error in upvoteSuggestion:', error);
        await interaction.followUp({
            content: lang.Suggestion.Error || 'An error occurred while upvoting the suggestion.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function acceptSuggestion(client, interaction, uniqueId, reason) {
    try {
        const suggestion = await Suggestion.findOne({ uniqueId: uniqueId });
        if (!suggestion) {
            if (interaction.reply) {
                return interaction.reply({ content: lang.Suggestion.SuggestionNotFound, flags: MessageFlags.Ephemeral });
            }
            throw new Error('Suggestion not found');
        }

        if (suggestion.status !== 'Pending') {
            if (interaction.reply) {
                return interaction.reply({ content: lang.Suggestion.AlreadyProcessed, flags: MessageFlags.Ephemeral });
            }
            throw new Error('Suggestion already processed');
        }

        suggestion.status = 'Accepted';
        suggestion.reason = reason;

        if (suggestion.threadId) {
            const thread = await client.channels.cache.get(suggestion.threadId);
            if (thread) await thread.delete().catch(error => console.error('Error deleting thread:', error));
        }

        const user = await client.users.fetch(suggestion.authorId).catch(() => null);
        if (!user) {
            return interaction.editReply({ content: 'Unable to process suggestion: User not found.', flags: MessageFlags.Ephemeral });
        }
        const username = user.username;
        const guild = interaction.guild;
        const member = await guild.members.fetch(suggestion.authorId).catch(() => null);
        const displayName = member ? member.displayName : username;
        suggestion.UserIcon = user.displayAvatarURL();

        const acceptChannel = getLogChannel(interaction.guild, config.SuggestionAcceptEmbed.AcceptChannelID);

        const decisionPayload = buildDecisionEmbed(username, suggestion, 'accept', reason, displayName);
        const rest = new REST({ version: '10' }).setToken(client.token);
        
        if (acceptChannel) {
            await rest.post(
                Routes.channelMessages(acceptChannel.id),
                { body: { components: decisionPayload, flags: 32768 } }
            );
            const originalChannel = client.channels.cache.get(suggestion.channelId);
            const originalMessage = await originalChannel.messages.fetch(suggestion.messageId);
            await originalMessage.delete();
        } else {
            const channel = client.channels.cache.get(suggestion.channelId);
            await rest.patch(
                Routes.channelMessage(channel.id, suggestion.messageId),
                { body: { components: decisionPayload, flags: 32768 } }
            );
        }

        await suggestion.save();

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('suggestion:accepted', {
                suggestion: suggestion.toObject(),
                reason: reason,
                acceptedBy: interaction.user || interaction.author,
                guild: interaction.guild,
                originalAuthor: user
            });
        }

        if (config.SuggestionSettings.sendDM) {
            await sendSuggestionDM(client, suggestion, 'accept', decisionPayload);
        }

        if (interaction.reply) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: lang.Suggestion.SuggestionAccepted, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.editReply({ content: lang.Suggestion.SuggestionAccepted });
            }
        }
    } catch (error) {
        console.error('Error in accepting suggestion:', error);
        if (interaction.reply) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.editReply({ content: lang.Suggestion.Error });
            }
        }
        throw error;
    }
}

async function denySuggestion(client, interaction, uniqueId, reason) {
    try {
        const suggestion = await Suggestion.findOne({ uniqueId: uniqueId });
        if (!suggestion) {
            if (interaction.reply) {
                return interaction.reply({ content: lang.Suggestion.SuggestionNotFound, flags: MessageFlags.Ephemeral });
            }
            throw new Error('Suggestion not found');
        }

        if (suggestion.status !== 'Pending') {
            if (interaction.reply) {
                return interaction.reply({ content: lang.Suggestion.AlreadyProcessed, flags: MessageFlags.Ephemeral });
            }
            throw new Error('Suggestion already processed');
        }

        suggestion.status = 'Denied';
        suggestion.reason = reason;

        if (suggestion.threadId) {
            const thread = await client.channels.cache.get(suggestion.threadId);
            if (thread) await thread.delete().catch(error => console.error('Error deleting thread:', error));
        }

        const user = await client.users.fetch(suggestion.authorId).catch(() => null);
        if (!user) {
            console.warn(`Suggestion author not found: ${suggestion.authorId}`);
            return interaction.editReply({ content: 'Unable to process suggestion: User not found.', flags: MessageFlags.Ephemeral });
        }
        const username = user.username;
        const guild = interaction.guild;
        const member = await guild.members.fetch(suggestion.authorId).catch(() => null);
        const displayName = member ? member.displayName : username;
        suggestion.UserIcon = user.displayAvatarURL();

        const denyChannel = getLogChannel(interaction.guild, config.SuggestionDenyEmbed.DenyChannelID);
        
        const decisionPayload = buildDecisionEmbed(username, suggestion, 'deny', reason, displayName);
        const rest = new REST({ version: '10' }).setToken(client.token);
        
        if (denyChannel) {
            await rest.post(
                Routes.channelMessages(denyChannel.id),
                { body: { components: decisionPayload, flags: 32768 } }
            );
            const originalChannel = client.channels.cache.get(suggestion.channelId);
            const originalMessage = await originalChannel.messages.fetch(suggestion.messageId);
            await originalMessage.delete();
        } else {
            const channel = client.channels.cache.get(suggestion.channelId);
            await rest.patch(
                Routes.channelMessage(channel.id, suggestion.messageId),
                { body: { components: decisionPayload, flags: 32768 } }
            );
        }

        await suggestion.save();

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('suggestion:denied', {
                suggestion: suggestion.toObject(),
                reason: reason,
                deniedBy: interaction.user || interaction.author,
                guild: interaction.guild,
                originalAuthor: user
            });
        }

        if (config.SuggestionSettings.sendDM) {
            await sendSuggestionDM(client, suggestion, 'deny', decisionPayload);
        }

        if (interaction.reply) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: lang.Suggestion.SuggestionDenied, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.editReply({ content: lang.Suggestion.SuggestionDenied });
            }
        }
    } catch (error) {
        console.error('Error in denying suggestion:', error);
        if (interaction.reply) {
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.editReply({ content: lang.Suggestion.Error });
            }
        }
        throw error;
    }
}

async function sendSuggestionDM(client, suggestion, action, decisionPayload) {
    try {
        const user = await client.users.fetch(suggestion.authorId).catch(() => null);
        if (!user) {
            console.warn(`Suggestion author not found: ${suggestion.authorId}`);
            return;
        }
        
        const rest = new REST({ version: '10' }).setToken(client.token);
        const dmChannel = await user.createDM();
        await rest.post(
            Routes.channelMessages(dmChannel.id),
            { body: { components: decisionPayload, flags: 32768 } }
        );
    } catch (error) {
        if (error.code === 50007) {} else {
            console.error('Error sending DM:', error);
        }
    }
}

 

async function downvoteSuggestion(client, interaction, uniqueId) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const suggestion = await Suggestion.findOne({ uniqueId: uniqueId });
        if (!suggestion) {
            return interaction.followUp({
                content: lang.Suggestion.SuggestionNotFound || 'Suggestion not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (suggestionUtils.hasUserVoted(suggestion, interaction.user.id)) {
            const previousVoteType = suggestionUtils.getUserVoteType(suggestion, interaction.user.id);
            if (previousVoteType === 'downvote') {
                return interaction.followUp({
                    content: lang.Suggestion.AlreadyDownvoted || 'You have already downvoted this suggestion.',
                    flags: MessageFlags.Ephemeral
                });
            } else if (previousVoteType === 'upvote') {
                await suggestionUtils.removeVote(suggestion, interaction.user.id);
            }
        }

        await suggestionUtils.addVote(suggestion, interaction.user.id, 'downvote');
        await updateSuggestionEmbed(client, suggestion._id);

        await interaction.followUp({
            content: lang.Suggestion.Downvoted || 'You have downvoted the suggestion.',
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Error in downvoteSuggestion:', error);
        await interaction.followUp({
            content: lang.Suggestion.Error || 'An error occurred while downvoting the suggestion.',
            flags: MessageFlags.Ephemeral
        });
    }
}

 

module.exports = {
    createSuggestion,
    upvoteSuggestion,
    downvoteSuggestion,
    updateSuggestionEmbed,
    acceptSuggestion,
    denySuggestion
};