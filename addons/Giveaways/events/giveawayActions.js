const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags, REST, Routes } = require("discord.js");

let addonClient = null;

function setClient(client) {
    addonClient = client;
}

const Giveaway = require("../models/Giveaway.js");
const UserData = require('../../../models/UserData.js');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

function parseColor(color) {
    if (typeof color === 'string' && color.startsWith('#')) {
        return parseInt(color.replace('#', ''), 16);
    } else {
        return color;
    }
}

function replacePlaceholders(template, placeholders = {}) {
    if (!template) {
        return '\u200b';
    }

    return Object.keys(placeholders).reduce((acc, key) => {
        const regex = new RegExp(`{${key}}`, 'gi');
        return acc.replace(regex, placeholders[key] || '');
    }, template);
}

function parseDuration(durationString) {
    const regex = /^(\d+)([mhdwy])$/;
    const match = durationString.match(regex);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000,
        'y': 365 * 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit];
}

function buildActiveGiveawayComponentsV2(giveawayData, buttonsRow) {
    const replacer = createSimplePlaceholderReplacer(giveawayData);
    const componentsPayload = buildComponentsV2Payload(config.Giveaways.ActiveGiveaway, replacer);
    
    if (componentsPayload && buttonsRow) {
        componentsPayload.push(buttonsRow);
    }
    
    return componentsPayload;
}

function buildEndedGiveawayComponentsV2(giveawayData) {
    const replacer = createSimplePlaceholderReplacer(giveawayData);
    return buildComponentsV2Payload(config.Giveaways.EndedGiveaway, replacer);
}

async function updateGiveawayMessage(giveaway, channel, message) {
    const isLegacyEmbed = message.embeds && message.embeds.length > 0 && !(message.flags?.has(32768));
    
    if (isLegacyEmbed) {
        await updateLegacyGiveawayMessage(giveaway, channel, message);
        return;
    }

    const placeholders = {
        prize: giveaway.prize,
        hostedBy: giveaway.hostedBy,
        endsIn: `<t:${Math.floor(giveaway.endAt / 1000)}:R>`,
        entries: giveaway.entrants.length,
        giveawayId: giveaway.giveawayId,
        winnerCount: giveaway.winnerCount,
        thumbnail: config.Giveaways.ActiveGiveaway.Thumbnail || '',
        image: config.Giveaways.ActiveGiveaway.Image || ''
    };
    
    const buttonsRow = createGiveawayButtonsRow(giveaway.entrants.length);
    const componentsPayload = buildActiveGiveawayComponentsV2(placeholders, buttonsRow);

    const rest = new REST({ version: '10' }).setToken(addonClient.token);
    await rest.patch(
        Routes.channelMessage(channel.id, message.id),
        { body: { components: componentsPayload, flags: 32768 } }
    );
}

async function updateLegacyGiveawayMessage(giveaway, channel, message) {
    const existingEmbed = message.embeds[0];
    if (!existingEmbed) return;

    const embed = EmbedBuilder.from(existingEmbed);
    
    const descriptionLines = existingEmbed.description?.split('\n') || [];
    const updatedLines = descriptionLines.map(line => {
        if (line.includes('Entries:') || line.includes('entries:')) {
            return line.replace(/\d+/, giveaway.entrants.length.toString());
        }
        return line;
    });
    embed.setDescription(updatedLines.join('\n'));

    const btnConfig = config.Giveaways?.Buttons?.Enter || {};
    const label = btnConfig.ShowEntries 
        ? `${btnConfig.Label || 'Enter'} (${giveaway.entrants.length})`
        : (btnConfig.Label || 'Enter');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('join_giveaway')
            .setLabel(label)
            .setStyle(ButtonStyle.Primary)
    );

    if (config.Giveaways?.Buttons?.Odds) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('check_percent')
                .setLabel(config.Giveaways.Buttons.Odds.Label || 'Odds')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (config.Giveaways?.Buttons?.Entrants) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('show_entrants')
                .setLabel(config.Giveaways.Buttons.Entrants.Label || 'Entrants')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    await message.edit({ embeds: [embed], components: [row] });
}

function createGiveawayButtonsRow(entriesCount = 0) {
    const buttons = [];
    const btnConfig = config.Giveaways.Buttons;
    
    if (btnConfig.Enter) {
        const label = btnConfig.Enter.ShowEntries 
            ? `${btnConfig.Enter.Label} (${entriesCount})`
            : btnConfig.Enter.Label;
        buttons.push({
            type: 2,
            style: getButtonStyleNum(btnConfig.Enter.Style),
            label: label,
            custom_id: 'join_giveaway',
            emoji: btnConfig.Enter.Emoji ? { name: btnConfig.Enter.Emoji } : undefined
        });
    }
    
    if (btnConfig.Odds) {
        buttons.push({
            type: 2,
            style: getButtonStyleNum(btnConfig.Odds.Style),
            label: btnConfig.Odds.Label,
            custom_id: 'check_percent',
            emoji: btnConfig.Odds.Emoji ? { name: btnConfig.Odds.Emoji } : undefined
        });
    }
    
    if (btnConfig.Entrants) {
        buttons.push({
            type: 2,
            style: getButtonStyleNum(btnConfig.Entrants.Style),
            label: btnConfig.Entrants.Label,
            custom_id: 'show_entrants',
            emoji: btnConfig.Entrants.Emoji ? { name: btnConfig.Entrants.Emoji } : undefined
        });
    }
    
    return { type: 1, components: buttons };
}

function getButtonStyleNum(styleString) {
    if (!styleString) return 1;
    switch (styleString.toLowerCase()) {
        case 'primary': return 1;
        case 'secondary': return 2;
        case 'success': return 3;
        case 'danger': return 4;
        default: return 1;
    }
}

const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { getLogChannel } = require('../../../utils/handlers/messageUtils.js');
const config = getConfig();
const lang = getLang();

async function getUserInviteCount(guildId, userId) {
    const Invite = global.addonLoader?.getModel('Invite');
    if (!Invite) return 0;
    const invites = await Invite.find({ guildID: guildId, inviterID: userId });
    let inviteCount = 0;

    for (const invite of invites) {
        inviteCount += invite.uses;
    }

    return inviteCount;
}


const giveawayActions = {
    setClient,
    handleButtonInteraction: async (interaction) => {
        try {
            if (interaction.customId === 'check_percent') {
                const giveaway = await Giveaway.findOne({ 
                    messageId: interaction.message.id,
                    channelId: interaction.channelId,
                    ended: false
                });

                if (!giveaway) {
                    await interaction.reply({
                        content: "This giveaway has ended or doesn't exist.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await giveawayActions.calculateChance(interaction, giveaway);
            } else if (interaction.customId === 'show_entrants') {
                await giveawayActions.showEntrants(interaction);
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
            await interaction.reply({
                content: "An error occurred while processing your request.",
                flags: MessageFlags.Ephemeral
            });
        }
    },

    startGiveaway: async (interaction, giveawayDetails) => {
        const { giveawayId, time, prize, channel, winnerCount, whitelistRoles, blacklistRoles, minServerJoinDate, minAccountAge, minInvites, minMessages, hostedBy, notifyUsers } = giveawayDetails;
        
        const duration = typeof time === 'string' ? parseDuration(time) : time;
        if (duration === null) {
            throw new Error("Invalid time format");
        }

        const endAt = Date.now() + duration;
        const giveawayEndsIn = `<t:${Math.floor(endAt / 1000)}:R>`;

        const whitelistRoleMentions = whitelistRoles?.length ? whitelistRoles.map(r => `<@&${r}>`).join(', ') : 'None';
        const blacklistRoleMentions = blacklistRoles?.length ? blacklistRoles.map(r => `<@&${r}>`).join(', ') : 'None';
        const minServerJoinDateFormatted = minServerJoinDate ? `<t:${Math.floor(new Date(minServerJoinDate).getTime() / 1000)}:D>` : 'None';
        const minAccountAgeFormatted = minAccountAge ? `<t:${Math.floor(new Date(minAccountAge).getTime() / 1000)}:D>` : 'None';

        const placeholders = {
            prize,
            hostedBy,
            endsIn: giveawayEndsIn,
            entries: 0,
            giveawayId,
            winnerCount,
            serverName: interaction.guild.name,
            whitelistRoles: whitelistRoleMentions,
            blacklistRoles: blacklistRoleMentions,
            minServerJoinDate: minServerJoinDateFormatted,
            minAccountAge: minAccountAgeFormatted,
            minInvites: minInvites || 0,
            minMessages: minMessages || 0,
            thumbnail: config.Giveaways.ActiveGiveaway.Thumbnail || '',
            image: config.Giveaways.ActiveGiveaway.Image || ''
        };

        let messageContent = '';
        if (typeof notifyUsers === 'string' && (notifyUsers === '@everyone' || notifyUsers === '')) {
            messageContent = notifyUsers;
        } else if (Array.isArray(notifyUsers) && notifyUsers.length > 0) {
            messageContent = notifyUsers.map(roleId => `<@&${roleId}>`).join(' ');
        }

        const buttonsRow = createGiveawayButtonsRow(0);
        const componentsPayload = buildActiveGiveawayComponentsV2(placeholders, buttonsRow);

        const rest = new REST({ version: '10' }).setToken(addonClient.token);
        const result = await rest.post(
            Routes.channelMessages(channel.id),
            { body: { components: componentsPayload, flags: 32768 } }
        );
        const giveawayMessage = { id: result.id };

        if (messageContent) {
            await channel.send({ content: messageContent });
        }

        const successEmbed = new EmbedBuilder()
            .setAuthor({
                name: `${lang.SuccessEmbedTitle}`,
                iconURL: `https://i.imgur.com/7SlmRRa.png`,
            })
            .setColor(config.SuccessEmbedColor);

        const newGiveaway = new Giveaway({
            giveawayId: giveawayId,
            messageId: giveawayMessage.id,
            channelId: channel.id,
            guildId: interaction.guildId,
            startAt: Date.now(),
            endAt: endAt,
            ended: false,
            winnerCount: winnerCount,
            hostedBy: hostedBy,
            prize: prize,
            entries: 0,
            messageWinner: false,
            notifyEntrantOnEnter: false,
            requirements: {
                whitelistRoles: whitelistRoles,
                blacklistRoles: blacklistRoles,
                minServerJoinDate: minServerJoinDate,
                minAccountAge: minAccountAge,
                minInvites: minInvites,
                minMessages: minMessages
            },
            winners: [],
            entrants: [],
            extraEntries: giveawayDetails.extraEntries || [],
        });

        await newGiveaway.save();

        if (global.addonLoader) {
            global.addonLoader.getEventManager().emitSafe('giveaway:created', {
                giveaway: newGiveaway.toObject(),
                guild: interaction.guild,
                channel: channel,
                prize: prize,
                winnerCount: winnerCount,
                duration: endAt - Date.now(),
                hostedBy: hostedBy,
                requirements: newGiveaway.requirements
            });
        }

        if (config.GiveawayLogs.Enabled) {
            let embedData = config.GiveawayLogs.GiveawayStarted.Embed;

            let logEmbed = new EmbedBuilder()
                .setColor(parseColor(embedData.Color || "#00FF00"))
                .setTitle(replacePlaceholders(embedData.Title, placeholders))
                .setDescription(replacePlaceholders(embedData.Description.join('\n'), placeholders))
                .setFooter({ text: replacePlaceholders(embedData.Footer, placeholders) });

            if (config.GiveawayLogs.GiveawayStarted.Embed.Thumbnail && config.GiveawayLogs.GiveawayStarted.Embed.ThumbnailUrl) {
                logEmbed.setThumbnail(config.GiveawayLogs.GiveawayStarted.Embed.ThumbnailUrl)
            }

            let giveawayStartedLog = getLogChannel(interaction.guild, config.GiveawayLogs.LogsChannelID);
            if (giveawayStartedLog) giveawayStartedLog.send({ embeds: [logEmbed] });
        }

        await interaction.editReply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    },

    joinGiveaway: async (client, userId, username, member, interaction, channelId, messageId) => {
        try {
            const giveaway = await Giveaway.findOne({ channelId: channelId, messageId: messageId });
            if (!giveaway) {
                const messageContent = replacePlaceholders(lang.Giveaways.GiveawayNotFound, {});
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: messageContent, flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: messageContent, flags: MessageFlags.Ephemeral });
                }
                return;
            }

            const serverName = interaction.guild.name;
            const requirements = giveaway.requirements;

            const whitelistRoleMentions = requirements.whitelistRoles.map(roleId => `<@&${roleId}>`).join(', ');
            const blacklistRoleMentions = requirements.blacklistRoles.map(roleId => `<@&${roleId}>`).join(', ');
            const placeholders = {
                prize: giveaway.prize,
                serverName: serverName,
                hostedBy: giveaway.hostedBy,
                whitelistRoles: whitelistRoleMentions,
                blacklistRoles: blacklistRoleMentions,
                channel: `<#${giveaway.channelId}>`,
                winnerCount: giveaway.winnerCount,
                minInvites: requirements.minInvites || 0
            };

            if (giveaway.ended) {
                const messageContent = replacePlaceholders(lang.Giveaways.EndMessage, placeholders);
                await interaction.reply({ content: messageContent, flags: MessageFlags.Ephemeral });
                return;
            }

            if (requirements.whitelistRoles && requirements.whitelistRoles.length > 0 && !requirements.whitelistRoles.some(roleId => member.roles.cache.has(roleId))) {
                const messageContent = replacePlaceholders(lang.Giveaways.IncorrectRoleMessage, placeholders);
                await interaction.editReply({ content: messageContent, flags: MessageFlags.Ephemeral });
                return;
            }

            if (requirements.blacklistRoles && requirements.blacklistRoles.length > 0 && requirements.blacklistRoles.some(roleId => member.roles.cache.has(roleId))) {
                const messageContent = replacePlaceholders(lang.Giveaways.IncorrectRoleMessage, placeholders);
                await interaction.editReply({ content: messageContent, flags: MessageFlags.Ephemeral });
                return;
            }

            if (requirements.minServerJoinDate && member.joinedTimestamp > new Date(requirements.minServerJoinDate).getTime()) {
                const messageContent = replacePlaceholders(lang.Giveaways.IncorrectMinimumServerJoinDateMessage, placeholders);
                await interaction.editReply({ content: messageContent, flags: MessageFlags.Ephemeral });
                return;
            }

            if (requirements.minAccountAge && member.user.createdTimestamp > new Date(requirements.minAccountAge).getTime()) {
                const messageContent = replacePlaceholders(lang.Giveaways.IncorrectMinimumAccountAgeMessage, placeholders);
                await interaction.editReply({ content: messageContent, flags: MessageFlags.Ephemeral });
                return;
            }

            const userInviteCount = await getUserInviteCount(interaction.guild.id, userId);
            if (requirements.minInvites > 0 && userInviteCount < requirements.minInvites) {
                const messageContent = replacePlaceholders(lang.Giveaways.IncorrectInviteCountMessage, placeholders);
                await interaction.editReply({ content: messageContent, flags: MessageFlags.Ephemeral });
                return;
            }

            if (requirements.minMessages > 0) {
                const userData = await UserData.findOne({ 
                    userId: userId,
                    guildId: interaction.guildId 
                });
                
                const currentMessages = userData ? userData.totalMessages : 0;
                if (currentMessages < requirements.minMessages) {
                    const messageContent = replacePlaceholders(lang.Giveaways.IncorrectMessageCountMessage, {
                        ...placeholders,
                        required: requirements.minMessages,
                        current: currentMessages
                    });
                    await interaction.editReply({ content: messageContent, flags: MessageFlags.Ephemeral });
                    return;
                }
            }

            if (giveaway.entrants.some(entrant => entrant.entrantId === userId)) {
                giveaway.entrants = giveaway.entrants.filter(entrant => entrant.entrantId !== userId);
                giveaway.entries = giveaway.entrants.length;
                await giveaway.save();

                const channel = client.channels.cache.get(channelId);
                const message = await channel.messages.fetch(messageId);

                await updateGiveawayMessage(giveaway, channel, message);

                const successMessageContent = replacePlaceholders(lang.Giveaways.LeaveSuccessMessage, placeholders);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: successMessageContent, flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: successMessageContent, flags: MessageFlags.Ephemeral });
                }
                return;
            }

            let extraEntriesCount = 0;
            const memberRoles = member.roles.cache;
            
            for (const extraEntry of giveaway.extraEntries) {
                if (memberRoles.has(extraEntry.roleId)) {
                    extraEntriesCount += extraEntry.entries;
                }
            }

            giveaway.entrants.push({ 
                entrantId: userId, 
                entrantUsername: username,
                extraEntries: extraEntriesCount
            });
            giveaway.entries = giveaway.entrants.length;
            await giveaway.save();

            const channel = client.channels.cache.get(channelId);
            const message = await channel.messages.fetch(messageId);

            await updateGiveawayMessage(giveaway, channel, message);

            let successMessageContent = replacePlaceholders(lang.Giveaways.EntrySuccessMessage, placeholders);
            if (extraEntriesCount > 0) {
                successMessageContent += `\n${replacePlaceholders(lang.Giveaways.ExtraEntriesMessage, { extraEntries: extraEntriesCount })}`;
            }

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: successMessageContent, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: successMessageContent, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error(`Error joining giveaway: ${error}`);
            const errorMessageContent = replacePlaceholders(lang.Giveaways.EntryErrorMessage, {});
            await interaction.editReply({ content: errorMessageContent, flags: MessageFlags.Ephemeral });
        }
    },

    endGiveaway: async (giveawayId) => {
        try {
            const giveaway = await Giveaway.findOne({ giveawayId: giveawayId });
            if (!giveaway) {
                console.error('Giveaway not found:', giveawayId);
                return;
            }

            const guild = client.guilds.cache.get(giveaway.guildId);
            if (!guild) {
                console.error('Guild not found:', giveaway.guildId);
                return;
            }

            if (giveaway.ended) {
                console.error('Giveaway already ended:', giveawayId);
                return;
            }

            const channel = client.channels.cache.get(giveaway.channelId);
            if (!channel) {
                console.error('Channel not found:', giveaway.channelId);
                await Giveaway.findOneAndUpdate(
                    { giveawayId: giveawayId },
                    { $set: { winners: [], ended: true } },
                    { new: true, runValidators: true }
                );
                return 'Giveaway ended without winners (channel was deleted).';
            }

            let messageExists = true;
            try {
                await channel.messages.fetch(giveaway.messageId);
            } catch (error) {
                messageExists = false;
            }

            if (!messageExists) {
                await Giveaway.findOneAndUpdate(
                    { giveawayId: giveawayId },
                    { $set: { winners: [], ended: true } },
                    { new: true, runValidators: true }
                );
                return 'Giveaway ended without winners (message was deleted).';
            }

            const serverName = guild.name;
            const requirements = giveaway.requirements;

            const whitelistRoleMentions = requirements.whitelistRoles.map(roleId => `<@&${roleId}>`).join(', ');
            const blacklistRoleMentions = requirements.blacklistRoles.map(roleId => `<@&${roleId}>`).join(', ');

            const placeholders = {
                prize: giveaway.prize,
                serverName: serverName,
                hostedBy: giveaway.hostedBy,
                whitelistRoles: whitelistRoleMentions,
                blacklistRoles: blacklistRoleMentions,
                channel: `<#${giveaway.channelId}>`,
                winnerCount: giveaway.winnerCount
            };

            const winnerCount = giveaway.winnerCount;
            const entrants = giveaway.entrants;
            let winners = [];

            let weightedPool = [];
            for (const entrant of entrants) {
                const totalEntries = 1 + (entrant.extraEntries || 0);
                for (let i = 0; i < totalEntries; i++) {
                    weightedPool.push(entrant);
                }
            }

            for (let i = 0; i < winnerCount && weightedPool.length > 0; i++) {
                let randomIndex = Math.floor(Math.random() * weightedPool.length);
                let winner = weightedPool[randomIndex];
                
                weightedPool = weightedPool.filter(entry => entry.entrantId !== winner.entrantId);
                
                winners.push({ winnerId: winner.entrantId });
            }

            const updatedGiveaway = await Giveaway.findOneAndUpdate(
                { giveawayId: giveawayId },
                { $set: { winners: winners, ended: true } },
                { new: true, runValidators: true }
            );

            if (global.addonLoader) {
                global.addonLoader.getEventManager().emitSafe('giveaway:ended', {
                    giveaway: updatedGiveaway.toObject(),
                    winners: winners,
                    guild: guild,
                    channel: channel,
                    prize: giveaway.prize,
                    totalEntries: giveaway.entrants.length,
                    hostedBy: giveaway.hostedBy
                });
            }

            if (!updatedGiveaway) {
                console.error('Failed to update giveaway:', giveawayId);
                return;
            }

            const message = await channel.messages.fetch(giveaway.messageId);
            let winnerList = winners.map(w => `<@${w.winnerId}>`).join('\n');
            if (winnerList.length === 0) {
                winnerList = replacePlaceholders(lang.Giveaways.NoParticipationMessage, placeholders);
            }

            if (config.Giveaways.DirectMessageWinners) {
                winners.forEach(async (winnerObj) => {
                    const winnerId = winnerObj.winnerId;
                    try {
                        const winner = await guild.members.fetch(winnerId);
                        if (winner && winner.user) {
                            await winner.user.send(replacePlaceholders(lang.Giveaways.WinnerDirectMessage, placeholders));
                        }
                    } catch (dmError) {
                        console.error('Error sending DM to winner:', winnerId, dmError);
                    }
                });
            }

            let winnerMentions = winners.map(winner => `<@${winner.winnerId}>`).join(', ');
            if (winnerMentions.length === 0) {
                await channel.send(replacePlaceholders(lang.Giveaways.NoParticipationMessage, placeholders));
            } else {
                await channel.send(replacePlaceholders(lang.Giveaways.WinMessage, placeholders).replace("{winners}", winnerMentions));
            }

            const isLegacyEmbed = message.embeds && message.embeds.length > 0 && !(message.flags?.has(32768));

            if (isLegacyEmbed) {
                const existingEmbed = message.embeds[0];
                const embed = EmbedBuilder.from(existingEmbed)
                    .setColor('#808080')
                    .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnerList}\n**Entries:** ${giveaway.entrants.length}\n**Hosted by:** ${giveaway.hostedBy}\n\n🎉 Giveaway Ended!`);
                
                await message.edit({ embeds: [embed], components: [] });
            } else {
                const endedPlaceholders = {
                    prize: giveaway.prize,
                    winners: winnerList,
                    entries: giveaway.entrants.length,
                    giveawayId: giveaway.giveawayId,
                    hostedBy: giveaway.hostedBy,
                    serverName: guild.name,
                    thumbnail: config.Giveaways.EndedGiveaway.Thumbnail || '',
                    image: config.Giveaways.EndedGiveaway.Image || ''
                };
                const componentsPayload = buildEndedGiveawayComponentsV2(endedPlaceholders);

                const rest = new REST({ version: '10' }).setToken(addonClient.token);
                await rest.patch(
                    Routes.channelMessage(channel.id, message.id),
                    { body: { components: componentsPayload, flags: 32768 } }
                );
            }

            if (config.GiveawayLogs.Enabled) {
                let embedData = config.GiveawayLogs.GiveawayEnded.Embed;
                let logEmbed = new EmbedBuilder()
                    .setColor(parseColor(embedData.Color || "#00FF00"))
                    .setTitle(replacePlaceholders(embedData.Title, placeholders))
                    .setDescription(replacePlaceholders(embedData.Description.join('\n'), placeholders).replace("{winners}", winnerMentions))
                    .setFooter({ text: replacePlaceholders(embedData.Footer, placeholders) });

                if (config.GiveawayLogs.GiveawayEnded.Embed.Thumbnail && config.GiveawayLogs.GiveawayEnded.Embed.ThumbnailUrl) {
                    logEmbed.setThumbnail(config.GiveawayLogs.GiveawayEnded.Embed.ThumbnailUrl);
                }

                const giveawayEndedLog = getLogChannel(guild, config.GiveawayLogs.LogsChannelID);
                if (giveawayEndedLog) giveawayEndedLog.send({ embeds: [logEmbed] });
            }

            return 'Giveaway ended successfully.';
        } catch (error) {
            console.error('Error ending the giveaway with ID:', giveawayId, error);
            throw error;
        }
    },
    rerollGiveaway: async (interaction, giveawayId, userIdsToReroll = []) => {
        try {
            const giveaway = await Giveaway.findOne({ giveawayId: giveawayId });
            if (!giveaway) {
                return await interaction.reply({ content: lang.Giveaways.GiveawayNotFound, flags: MessageFlags.Ephemeral });
            }

            if (!giveaway.ended) {
                return await interaction.reply({ content: lang.Giveaways.GiveawayHasntEnded, flags: MessageFlags.Ephemeral });
            }

            if (userIdsToReroll.length > 0 && !giveaway.winners.some(winner => userIdsToReroll.includes(winner.winnerId))) {
                return await interaction.reply({ content: 'None of the specified users are previous winners.', flags: MessageFlags.Ephemeral });
            }

            let eligibleEntrants = giveaway.entrants.filter(entrant =>
                !giveaway.winners.some(winner => winner.winnerId === entrant.entrantId)
            );

            let rerollCount = userIdsToReroll.length > 0 ? userIdsToReroll.length : giveaway.winnerCount;
            if (userIdsToReroll.length === 0) {
                giveaway.winners = [];
            } else {
                giveaway.winners = giveaway.winners.filter(winner => !userIdsToReroll.includes(winner.winnerId));
            }

            for (let i = 0; i < rerollCount && eligibleEntrants.length > 0; i++) {
                let randomIndex = Math.floor(Math.random() * eligibleEntrants.length);
                giveaway.winners.push({ winnerId: eligibleEntrants[randomIndex].entrantId });
                eligibleEntrants.splice(randomIndex, 1);
            }

            await giveaway.save();

            const guild = client.guilds.cache.get(giveaway.guildId);
            const channel = guild.channels.cache.get(giveaway.channelId);
            const message = await channel.messages.fetch(giveaway.messageId);

            let winnerMentions = giveaway.winners.map(winner => `<@${winner.winnerId}>`).join(', ');

            const placeholders = {
                prize: giveaway.prize,
                serverName: guild.name,
                hostedBy: giveaway.hostedBy,
                channel: `<#${giveaway.channelId}>`,
                winnerCount: giveaway.winnerCount,
                winners: winnerMentions
            };

            for (const winner of giveaway.winners) {
                try {
                    const user = await client.users.fetch(winner.winnerId);
                    await user.send(replacePlaceholders(lang.Giveaways.WinnerDirectMessage, placeholders));
                } catch (error) {

                }
            }

            const isLegacyEmbed = message.embeds && message.embeds.length > 0 && !(message.flags?.has(32768));

            if (isLegacyEmbed) {
                const existingEmbed = message.embeds[0];
                const embed = EmbedBuilder.from(existingEmbed)
                    .setColor('#808080')
                    .setDescription(`**Prize:** ${giveaway.prize}\n**Winners:** ${winnerMentions || 'No winners'}\n**Entries:** ${giveaway.entrants.length}\n**Hosted by:** ${giveaway.hostedBy}\n\n🎉 Giveaway Ended! (Rerolled)`);
                
                await message.edit({ embeds: [embed], components: [] });
            } else {
                const endedPlaceholders = {
                    ...placeholders,
                    winners: winnerMentions.length > 0 ? winnerMentions : 'No winners',
                    entries: giveaway.entrants.length,
                    giveawayId: giveaway.giveawayId,
                    thumbnail: config.Giveaways.EndedGiveaway.Thumbnail || '',
                    image: config.Giveaways.EndedGiveaway.Image || ''
                };
                const componentsPayload = buildEndedGiveawayComponentsV2(endedPlaceholders);

                const rest = new REST({ version: '10' }).setToken(addonClient.token);
                await rest.patch(
                    Routes.channelMessage(channel.id, message.id),
                    { body: { components: componentsPayload, flags: 32768 } }
                );
            }

            const rerollConfirmationMessage = `Giveaway rerolled! Congratulations to the new winners of the "${placeholders.prize}" giveaway: ${winnerMentions}`;
            await channel.send(rerollConfirmationMessage);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Giveaway winners rerolled successfully.', flags: MessageFlags.Ephemeral });
            }

            try {
                if (config.GiveawayLogs.Enabled) {
                    let embedData = config.GiveawayLogs.GiveawayRerolled.Embed;
                    let logEmbed = new EmbedBuilder()
                        .setColor(parseColor(embedData.Color || "#00FF00"))
                        .setTitle(replacePlaceholders(embedData.Title, placeholders))
                        .setDescription(replacePlaceholders(embedData.Description.join('\n'), placeholders).replace("{winners}", winnerMentions))
                        .setFooter({ text: replacePlaceholders(embedData.Footer, placeholders) });

                    if (config.GiveawayLogs.GiveawayRerolled.Embed.Thumbnail && config.GiveawayLogs.GiveawayRerolled.Embed.ThumbnailUrl) {
                        logEmbed.setThumbnail(config.GiveawayLogs.GiveawayRerolled.Embed.ThumbnailUrl);
                    }

                    const giveawayRerolledChannel = getLogChannel(guild, config.GiveawayLogs.LogsChannelID);
                    if (giveawayRerolledChannel) {
                        giveawayRerolledChannel.send({ embeds: [logEmbed] });
                    }
                }
            } catch (error) {
                console.error('Error logging giveaway reroll:', error);
            }

        } catch (error) {
            console.error(`Error rerolling the giveaway with ID: ${giveawayId}`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred while rerolling the giveaway.', flags: MessageFlags.Ephemeral });
            }
        }
    },
    calculateChance: async (interaction, giveaway) => {
        try {
            const userId = interaction.user.id;
            const entrant = giveaway.entrants.find(e => e.entrantId === userId);
            
            if (!entrant) {
                await interaction.reply({
                    content: lang.Giveaways.NotJoinedGiveaway,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let totalEntries = 0;
            for (const e of giveaway.entrants) {
                const entrantEntries = 1 + (e.extraEntries || 0);
                totalEntries += entrantEntries;
            }
            
            const userEntries = 1 + (entrant.extraEntries || 0);
            
            let winChance;
            if (giveaway.winnerCount === 1) {
                winChance = (userEntries / totalEntries) * 100;
            } else {
                const approximateChance = Math.min(1, (userEntries / totalEntries) * giveaway.winnerCount) * 100;
                winChance = approximateChance;
            }

            const placeholders = {
                user: interaction.user,
                winChance: winChance.toFixed(2),
                userEntries: userEntries,
                extraEntries: entrant.extraEntries || 0
            };

            const chanceMessage = replacePlaceholders(lang.Giveaways.chanceMessage, placeholders);

            await interaction.reply({
                content: chanceMessage,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error calculating chance:', error);
            await interaction.reply({
                content: lang.Giveaways.CalculationError,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    showEntrants: async (interaction) => {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const giveaway = await Giveaway.findOne({ 
                messageId: interaction.message.id,
                channelId: interaction.channelId
            });

            if (!giveaway) {
                await interaction.editReply({
                    content: "This giveaway has ended or doesn't exist.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (giveaway.entrants.length === 0) {
                await interaction.editReply({
                    content: "No one has entered this giveaway yet!",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const ENTRIES_PER_PAGE = 25;
            const userEntries = new Map();
            giveaway.entrants.forEach(entrant => {
                const entries = (entrant.extraEntries || 0) + 1;
                if (userEntries.has(entrant.entrantId)) {
                    userEntries.set(entrant.entrantId, userEntries.get(entrant.entrantId) + entries);
                } else {
                    userEntries.set(entrant.entrantId, entries);
                }
            });

            const sortedEntrants = Array.from(userEntries.entries())
                .sort((a, b) => b[1] - a[1])
                .map((entry, index) => {
                    const [userId, entries] = entry;
                    return `${index + 1}. <@${userId}> (${entries} entries)`;
                });

            const totalPages = Math.ceil(sortedEntrants.length / ENTRIES_PER_PAGE);
            let currentPage = 1;

            const getPageEmbed = (page) => {
                const startIndex = (page - 1) * ENTRIES_PER_PAGE;
                const endIndex = startIndex + ENTRIES_PER_PAGE;
                const pageEntrants = sortedEntrants.slice(startIndex, endIndex);

                const embedConfig = config.Giveaways.EntrantsEmbed || {};
                const embed = new EmbedBuilder()
                    .setTitle((embedConfig.Title || 'Giveaway Entrants - {prize}').replace('{prize}', giveaway.prize))
                    .setDescription(pageEntrants.join('\n') || 'No entrants')
                    .setColor(embedConfig.Color || '#5865F2')
                    .setFooter({
                        text: (embedConfig.Footer || 'Total: {totalEntrants} • Page {currentPage}/{totalPages}')
                            .replace('{totalEntrants}', userEntries.size)
                            .replace('{currentPage}', page)
                            .replace('{totalPages}', totalPages)
                    });

                return embed;
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('first')
                    .setLabel('≪')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(totalPages === 1),
                new ButtonBuilder()
                    .setCustomId('last')
                    .setLabel('≫')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(totalPages === 1)
            );

            const message = await interaction.editReply({
                embeds: [getPageEmbed(currentPage)],
                components: totalPages > 1 ? [row] : [],
                flags: MessageFlags.Ephemeral
            });

            if (totalPages > 1) {
                const collector = message.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id,
                    time: 300000
                });

                collector.on('collect', async (i) => {
                    switch (i.customId) {
                        case 'first':
                            currentPage = 1;
                            break;
                        case 'prev':
                            currentPage--;
                            break;
                        case 'next':
                            currentPage++;
                            break;
                        case 'last':
                            currentPage = totalPages;
                            break;
                    }

                    const newRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('first')
                            .setLabel('≪')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 1),
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setLabel('◀')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 1),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('▶')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === totalPages),
                        new ButtonBuilder()
                            .setCustomId('last')
                            .setLabel('≫')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === totalPages)
                    );

                    await i.update({
                        embeds: [getPageEmbed(currentPage)],
                        components: [newRow]
                    });
                });

                collector.on('end', async () => {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        row.components.map(component => 
                            ButtonBuilder.from(component).setDisabled(true)
                        )
                    );
                    await message.edit({ components: [disabledRow] }).catch(() => {});
                });
            }
        } catch (error) {
            console.error('Error showing entrants:', error);
            await interaction.editReply({
                content: "An error occurred while fetching the entrants list.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
}


module.exports = giveawayActions;
