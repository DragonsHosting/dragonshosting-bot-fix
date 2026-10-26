const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment-timezone');
const GuildData = require('../models/guildDataSchema');
const UserData = require('../models/UserData');
const { getConfig, getLang, getCommands } = require('../utils/core/configLoader.js');
const { getLogChannel } = require('../utils/handlers/messageUtils.js');
const { sendComponentsV2Message, deleteComponentsV2Message } = require('../utils/core/componentsV2Builder.js');

const lang = getLang();
const config = getConfig();

const sentWelcomeEmbeds = new Set();
const WELCOME_EMBED_RESET_INTERVAL = parseTime('5m');

setInterval(() => {
    sentWelcomeEmbeds.clear();
}, WELCOME_EMBED_RESET_INTERVAL);

module.exports = async (client, member) => {
    if (member.id === client.user.id || member.user.bot) {
        return;
    }

    if (config.AltPrevention.Enabled) {
        const accountAge = Date.now() - member.user.createdAt;
        const requiredAge = parseTime(config.AltPrevention.TimeLimit);

        if (accountAge < requiredAge) {
            if (config.AltPrevention.DM.Enabled) {
                await sendAltPreventionDM(member);
            }

            if (config.AltPrevention.KickAlts) {
                try {
                    await member.kick('Alt account detected');
                } catch (error) {
                    console.error(`Failed to kick alt account ${member.user.tag}:`, error);
                }
            }

            await sendAltPreventionLog(client, member, accountAge < requiredAge);
            return;
        }
    }

    const inviteInfo = await global.addonLoader?.getService('invites')?.resolveJoin(member).catch(() => null);
    const inviterName = inviteInfo?.inviterName || 'Vanity / Unknown';
    const inviterCount = inviteInfo?.inviterCount || 0;

    if (config.WelcomeMessage.Enabled) {
        sendWelcomeMessage(client, member, inviterName, inviterCount);
    }

    await updateStoredMembers(client, member.guild.id);

    try {
        const userData = await UserData.findOne({ userId: member.id, guildId: member.guild.id });
        if (userData && userData.isMuted) {
            const guildData = await GuildData.findOne({ guildID: member.guild.id });
            const timeoutRole = guildData && guildData.timeoutRoleId ? member.guild.roles.cache.get(guildData.timeoutRoleId) : null;

            if (timeoutRole) {
                await member.roles.add(timeoutRole, 'Reapplying muted role on rejoin');
            } else {
            }
        }
    } catch (error) {
        console.error(`Error checking user data on join: ${error}`);
    }
    
};

async function sendAltPreventionDM(member) {
    const dmEmbed = createEmbed(config.AltPrevention.DM.Embed, member);
    try {
        await member.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error(`Failed to send alt prevention DM to ${member.user.tag}:`, error);
    }
}

async function sendAltPreventionLog(client, member, wasKicked) {
    const logChannel = getLogChannel(member.guild, config.AltPrevention.Log.LogsChannelID);
    if (!logChannel) return;

    const logEmbed = createEmbed(config.AltPrevention.Log, member);
    logEmbed.addFields({ name: 'Kicked', value: wasKicked ? 'Yes' : 'No' });

    try {
        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error(`Failed to send alt prevention log for ${member.user.tag}:`, error);
    }
}

function createEmbed(embedConfig, member) {
    const embed = new EmbedBuilder().setColor(embedConfig.Color);
    const userAvatarURL = member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 });
    const guildIconURL = member.guild.iconURL({ format: 'png', dynamic: true, size: 4096 });

    if (embedConfig.Title) embed.setTitle(replacePlaceholders(embedConfig.Title, member, '', 0, userAvatarURL, '', false));
    if (embedConfig.Description) {
        const description = embedConfig.Description.join('\n');
        embed.setDescription(replacePlaceholders(description, member, '', 0, userAvatarURL, '', true));
    }

    if (embedConfig.Author.Text) {
        embed.setAuthor({
            name: replacePlaceholders(embedConfig.Author.Text, member, '', 0, userAvatarURL, '', false, true),
            iconURL: embedConfig.Author.Icon ? replacePlaceholders(embedConfig.Author.Icon, member, '', 0, userAvatarURL, guildIconURL, false, true) : undefined,
        });
    }

    if (embedConfig.Footer.Text) {
        embed.setFooter({
            text: replacePlaceholders(embedConfig.Footer.Text, member, '', 0, userAvatarURL, '', false, true),
            iconURL: embedConfig.Footer.Icon ? replacePlaceholders(embedConfig.Footer.Icon, member, '', 0, userAvatarURL, guildIconURL, false, true) : undefined,
        });
    }

    if (embedConfig.Thumbnail) {
        const thumbnailURL = replacePlaceholders(embedConfig.Thumbnail, member, '', 0, userAvatarURL, guildIconURL, false);
        if (thumbnailURL) embed.setThumbnail(thumbnailURL);
    }

    if (embedConfig.Image) {
        const imageURL = replacePlaceholders(embedConfig.Image, member, '', 0, userAvatarURL, guildIconURL, false);
        if (imageURL) embed.setImage(imageURL);
    }

    return embed;
}

async function sendWelcomeMessage(client, member, inviterName, inviterCount) {
    let welcomeChannel = null;
    const channelIDs = config.WelcomeMessage.ChannelID;
    
    if (Array.isArray(channelIDs)) {
        for (const channelId of channelIDs) {
            if (!channelId || channelId === "" || channelId === "CHANNEL_ID") continue;
            const channel = member.guild.channels.cache.get(channelId);
            if (channel) {
                welcomeChannel = channel;
                break;
            }
        }
    } else if (channelIDs && channelIDs !== "" && channelIDs !== "CHANNEL_ID") {
        welcomeChannel = member.guild.channels.cache.get(channelIDs);
    }

    if (welcomeChannel && !sentWelcomeEmbeds.has(member.id)) {
        sentWelcomeEmbeds.add(member.id);
        const userAvatarURL = member.user.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 });
        const userBannerURL = await getUserBannerURL(member);

        if (config.WelcomeMessage.UseComponentsV2 && config.WelcomeMessage.ComponentsV2) {
            try {
                const placeholderReplacer = (text) => replacePlaceholders(text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, true);
                const message = await sendComponentsV2Message(client, welcomeChannel.id, config.WelcomeMessage.ComponentsV2, placeholderReplacer);

                const autoDeleteEnabled = Boolean(config?.WelcomeMessage?.AutoDelete?.Enabled);
                const autoDeleteDelayStr = config?.WelcomeMessage?.AutoDelete?.Delay || "";
                const autoDeleteDelayMs = autoDeleteEnabled ? parseTime(autoDeleteDelayStr) : 0;
                if (message && autoDeleteEnabled && autoDeleteDelayMs > 0) {
                    setTimeout(async () => {
                        await deleteComponentsV2Message(client, welcomeChannel.id, message.id);
                    }, autoDeleteDelayMs);
                }
            } catch (error) {
                console.error(`[ERROR] Failed to send ComponentsV2 welcome message:`, error);
            }

            if (config.WelcomeMessage.DM.Enabled) {
                sendWelcomeDM(client, member, inviterName, inviterCount, userAvatarURL, userBannerURL);
            }
            return;
        }

        let welcomeText = "";
        if (config.WelcomeMessage.Type === "MESSAGE" || config.WelcomeMessage.Type === "BOTH") {
            welcomeText = replacePlaceholders(config.WelcomeMessage.Text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false);
        }

        let welcomeEmbed = null;
        if (config.WelcomeMessage.Type === "EMBED" || config.WelcomeMessage.Type === "BOTH") {
            welcomeEmbed = new EmbedBuilder().setColor(config.WelcomeMessage.Embed.Color);

            let title = replacePlaceholders(config.WelcomeMessage.Embed.Title, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false);
            if (title && title !== "") {
                welcomeEmbed.setTitle(title);
            }

            let description = replacePlaceholders(config.WelcomeMessage.Embed.Description.join('\n'), member, inviterName, inviterCount, userAvatarURL, userBannerURL, true);
            if (description && description !== "") {
                welcomeEmbed.setDescription(description);
            }

            let authorText = replacePlaceholders(config.WelcomeMessage.Embed.Author.Text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
            let authorIcon = replacePlaceholders(config.WelcomeMessage.Embed.Author.Icon, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
            if (authorText && authorText !== "") {
                welcomeEmbed.setAuthor({
                    name: authorText,
                    iconURL: authorIcon || undefined,
                });
            }

            let footerText = replacePlaceholders(config.WelcomeMessage.Embed.Footer.Text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
            let footerIcon = replacePlaceholders(config.WelcomeMessage.Embed.Footer.Icon, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
            if (footerText && footerText !== "") {
                welcomeEmbed.setFooter({
                    text: footerText,
                    iconURL: footerIcon || undefined,
                });
            }

            if (config.WelcomeMessage.Embed.Thumbnail && config.WelcomeMessage.Embed.Thumbnail !== "") {
                let thumbnailURL = config.WelcomeMessage.Embed.Thumbnail === "{user-avatar}" ? userAvatarURL : config.WelcomeMessage.Embed.Thumbnail;
                if (thumbnailURL) {
                    welcomeEmbed.setThumbnail(thumbnailURL);
                }
            }

            if (config.WelcomeMessage.Embed.Image && config.WelcomeMessage.Embed.Image !== "") {
                let imageURL = config.WelcomeMessage.Embed.Image === "{userBanner}" ? userBannerURL : config.WelcomeMessage.Embed.Image;
                if (imageURL) {
                    welcomeEmbed.setImage(imageURL);
                }
            }
        }

        let components = [];
        if (config.WelcomeMessage.Embed.Buttons && Array.isArray(config.WelcomeMessage.Embed.Buttons) && config.WelcomeMessage.Embed.Buttons.length > 0) {
            const row = new ActionRowBuilder();
            
            for (const buttonConfig of config.WelcomeMessage.Embed.Buttons) {
                if (buttonConfig.Type === "LINK") {
                    const button = new ButtonBuilder()
                        .setLabel(buttonConfig.Name)
                        .setStyle(ButtonStyle.Link)
                        .setURL(replacePlaceholders(buttonConfig.Link, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false));

                    if (buttonConfig.Emoji) {
                        button.setEmoji(buttonConfig.Emoji);
                    }

                    row.addComponents(button);
                }
            }

            if (row.components.length > 0) {
                components.push(row);
            }
        }

        try {
            let sentMessage;
            if (config.WelcomeMessage.Type === "BOTH") {
                sentMessage = await welcomeChannel.send({ 
                    content: welcomeText, 
                    embeds: [welcomeEmbed],
                    components: components.length > 0 ? components : undefined
                });
            } else if (config.WelcomeMessage.Type === "MESSAGE") {
                sentMessage = await welcomeChannel.send({
                    content: welcomeText,
                    components: components.length > 0 ? components : undefined
                });
            } else if (config.WelcomeMessage.Type === "EMBED") {
                sentMessage = await welcomeChannel.send({ 
                    embeds: [welcomeEmbed],
                    components: components.length > 0 ? components : undefined
                });
            }

            const autoDeleteEnabled = Boolean(config?.WelcomeMessage?.AutoDelete?.Enabled);
            const autoDeleteDelayStr = config?.WelcomeMessage?.AutoDelete?.Delay || "";
            const autoDeleteDelayMs = autoDeleteEnabled ? parseTime(autoDeleteDelayStr) : 0;
            if (sentMessage && autoDeleteEnabled && autoDeleteDelayMs > 0) {
                setTimeout(() => {
                    sentMessage.delete().catch(() => {});
                }, autoDeleteDelayMs);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to send welcome message: ${error}`);
        }

        if (config.WelcomeMessage.DM.Enabled) {
            sendWelcomeDM(client, member, inviterName, inviterCount, userAvatarURL, userBannerURL);
        }
    }
}

async function sendWelcomeDM(client, member, inviterName, inviterCount, userAvatarURL, userBannerURL) {
    if (config.WelcomeMessage.DM.UseComponentsV2 && config.WelcomeMessage.DM.ComponentsV2) {
        try {
            const dmChannel = await member.createDM();
            const placeholderReplacer = (text) => replacePlaceholders(text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, true);
            await sendComponentsV2Message(client, dmChannel.id, config.WelcomeMessage.DM.ComponentsV2, placeholderReplacer);
        } catch (error) {
            console.error(`[ERROR] Failed to send ComponentsV2 welcome DM: ${error}`);
        }
        return;
    }

    let dmEmbed = new EmbedBuilder().setColor(config.WelcomeMessage.DM.Embed.Color);

    let dmTitle = replacePlaceholders(config.WelcomeMessage.DM.Embed.Title, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false);
    if (dmTitle && dmTitle !== "") dmEmbed.setTitle(dmTitle);

    let dmDescription = replacePlaceholders(config.WelcomeMessage.DM.Embed.Description.join('\n'), member, inviterName, inviterCount, userAvatarURL, userBannerURL, true);
    if (dmDescription && dmDescription !== "") dmEmbed.setDescription(dmDescription);

    let dmAuthorText = replacePlaceholders(config.WelcomeMessage.DM.Embed.Author.Text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
    let dmAuthorIcon = replacePlaceholders(config.WelcomeMessage.DM.Embed.Author.Icon, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
    if (dmAuthorText && dmAuthorText !== "") {
        dmEmbed.setAuthor({
            name: dmAuthorText,
            iconURL: dmAuthorIcon || undefined,
        });
    }

    let dmFooterText = replacePlaceholders(config.WelcomeMessage.DM.Embed.Footer.Text, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
    let dmFooterIcon = replacePlaceholders(config.WelcomeMessage.DM.Embed.Footer.Icon, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false, true);
    if (dmFooterText && dmFooterText !== "") {
        dmEmbed.setFooter({
            text: dmFooterText,
            iconURL: dmFooterIcon || undefined,
        });
    }

    if (config.WelcomeMessage.DM.Embed.Thumbnail && config.WelcomeMessage.DM.Embed.Thumbnail !== "") {
        let dmThumbnailURL = config.WelcomeMessage.DM.Embed.Thumbnail === "{user-avatar}" ? userAvatarURL : config.WelcomeMessage.DM.Embed.Thumbnail;
        if (dmThumbnailURL) {
            dmEmbed.setThumbnail(dmThumbnailURL);
        }
    }

    if (config.WelcomeMessage.DM.Embed.Image && config.WelcomeMessage.DM.Embed.Image !== "") {
        let dmImageURL = config.WelcomeMessage.DM.Embed.Image === "{userBanner}" ? userBannerURL : config.WelcomeMessage.DM.Embed.Image;
        if (dmImageURL) {
            dmEmbed.setImage(dmImageURL);
        }
    }

    let dmComponents = [];
    if (config.WelcomeMessage.DM.Embed.Buttons && Array.isArray(config.WelcomeMessage.DM.Embed.Buttons) && config.WelcomeMessage.DM.Embed.Buttons.length > 0) {
        const row = new ActionRowBuilder();
        
        for (const buttonConfig of config.WelcomeMessage.DM.Embed.Buttons) {
            if (buttonConfig.Type === "LINK") {
                const button = new ButtonBuilder()
                    .setLabel(buttonConfig.Name)
                    .setStyle(ButtonStyle.Link)
                    .setURL(replacePlaceholders(buttonConfig.Link, member, inviterName, inviterCount, userAvatarURL, userBannerURL, false));

                if (buttonConfig.Emoji) {
                    button.setEmoji(buttonConfig.Emoji);
                }

                row.addComponents(button);
            }
        }

        if (row.components.length > 0) {
            dmComponents.push(row);
        }
    }

    try {
        await member.send({ 
            embeds: [dmEmbed],
            components: dmComponents
        });
    } catch (error) {
        console.error(`[ERROR] Failed to send welcome DM: ${error}`);
    }
}

async function getUserBannerURL(member) {
    try {
        const user = await member.user.fetch();
        return user.bannerURL({ format: 'png', dynamic: true, size: 4096 }) || '';
    } catch (error) {
        return '';
    }
}

function replacePlaceholders(text, member, inviterName = '', inviterCount = 0, userAvatarURL, userBannerURL, isEmbed, useStaticTime = false) {
    const currentTime = moment().tz(config.Timezone);
    const guildIconURL = member.guild.iconURL({ format: 'png', dynamic: true, size: 4096 }) || '';

    const joinTimestamp = Math.floor(member.joinedAt.getTime() / 1000);
    const createdTimestamp = Math.floor(member.user.createdAt.getTime() / 1000);
    const nowTimestamp = Math.floor(Date.now() / 1000);
    const autoKickTimestamp = getAutoKickTimestamp(config.AutoKick.Time);

    const joinMoment = moment(member.joinedAt).tz(config.Timezone);
    const createdMoment = moment(member.user.createdAt).tz(config.Timezone);

    let result = text
        .replace(/{user}/g, `<@${member.id}>`)
        .replace(/{newDisplayName}/g, member.displayName)
        .replace(/{userName}/g, member.user.username)
        .replace(/{userTag}/g, member.user.tag)
        .replace(/{userId}/g, member.user.id)
        .replace(/{memberCount}/g, getOrdinalSuffix(member.guild.memberCount))
        .replace(/{memberCountNumeric}/g, member.guild.memberCount)
        .replace(/{guildName}/g, member.guild.name)
        .replace(/{user-avatar}/g, userAvatarURL || '')
        .replace(/{userAvatar}/g, userAvatarURL || '')
        .replace(/{userBanner}/g, userBannerURL || '')
        .replace(/{guildIcon}/g, guildIconURL || '')
        .replace(/{invitedBy}/g, inviterName)
        .replace(/{invitedByCount}/g, inviterCount)
        .replace(/{guildId}/g, member.guild.id);

    if (useStaticTime) {
        result = result
            .replace(/{user-createdAt}/g, createdMoment.format('MM/DD/YYYY'))
            .replace(/{user-joinedAt}/g, joinMoment.format('MM/DD/YYYY'))
            .replace(/{shortTime}/g, currentTime.format('h:mm A'))
            .replace(/{longTime}/g, currentTime.format('MMMM D, YYYY'))
            .replace(/{joinDate}/g, joinMoment.format('MM/DD/YYYY'))
            .replace(/{joinTime}/g, joinMoment.format('h:mm A'))
            .replace(/{joinDateTime}/g, joinMoment.format('MMMM D, YYYY h:mm A'))
            .replace(/{joinRelative}/g, joinMoment.fromNow())
            .replace(/{UserCreation}/g, createdMoment.fromNow())
            .replace(/{createdDate}/g, createdMoment.format('MM/DD/YYYY'))
            .replace(/{createdDateTime}/g, createdMoment.format('MMMM D, YYYY h:mm A'))
            .replace(/{createdRelative}/g, createdMoment.fromNow())
            .replace(/{autoKickTime}/g, moment().tz(config.Timezone).add(parseTime(config.AutoKick.Time), 'milliseconds').fromNow());
    } else {
        result = result
            .replace(/{user-createdAt}/g, `<t:${createdTimestamp}:d>`)
            .replace(/{user-joinedAt}/g, `<t:${joinTimestamp}:d>`)
            .replace(/{shortTime}/g, `<t:${nowTimestamp}:t>`)
            .replace(/{longTime}/g, `<t:${nowTimestamp}:D>`)
            .replace(/{joinDate}/g, `<t:${joinTimestamp}:d>`)
            .replace(/{joinTime}/g, `<t:${joinTimestamp}:t>`)
            .replace(/{joinDateTime}/g, `<t:${joinTimestamp}:f>`)
            .replace(/{joinRelative}/g, `<t:${joinTimestamp}:R>`)
            .replace(/{UserCreation}/g, `<t:${createdTimestamp}:R>`)
            .replace(/{createdDate}/g, `<t:${createdTimestamp}:d>`)
            .replace(/{createdDateTime}/g, `<t:${createdTimestamp}:f>`)
            .replace(/{createdRelative}/g, `<t:${createdTimestamp}:R>`)
            .replace(/{autoKickTime}/g, `<t:${autoKickTimestamp}:R>`);
    }

    return result;
}


function getAutoKickTimestamp(timeString) {
    const milliseconds = parseTime(timeString);
    return Math.floor((Date.now() + milliseconds) / 1000);
}

function getOrdinalSuffix(number) {
    let j = number % 10,
        k = number % 100;
    if (j == 1 && k != 11) {
        return number + "st";
    }
    if (j == 2 && k != 12) {
        return number + "nd";
    }
    if (j == 3 && k != 13) {
        return number + "rd";
    }
    return number + "th";
}

async function updateStoredMembers(client, guildId) {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const guildData = await GuildData.findOne({ guildID: guildId });
            if (!guildData) {
                const newGuildData = new GuildData({ guildID: guildId });
                const members = await client.guilds.cache.get(guildId).members.fetch();
                newGuildData.members = members.map(member => member.id);
                await newGuildData.save();
                return;
            }

            const members = await client.guilds.cache.get(guildId).members.fetch();
            guildData.members = members.map(member => member.id);
            await guildData.save();
            return;
        } catch (error) {
            if (error.name === 'VersionError' && retries < maxRetries - 1) {
                retries++;
            } else {
                return;
            }
        }
    }
}

function parseTime(timeString) {
    const regex = /^(\d+)([smhd])$/;
    const match = timeString.match(regex);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 0;
    }
}

