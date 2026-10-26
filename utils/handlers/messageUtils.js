const { EmbedBuilder } = require("discord.js");
const moment = require('moment-timezone');
const { getConfig, getLang } = require('../core/configLoader.js');
const Settings = require('../../models/Settings');

const config = getConfig();
const lang = getLang();

let precompiledBlacklist = null;
let precompiledWhitelistWords = null;

const dbSettingsCache = new Map();
const DB_CACHE_TTL = 30000;

function convertPatternToRegex(pattern) {
    if (pattern.startsWith('regex:')) {
        return new RegExp(pattern.slice(6), 'i');
    }

    let regexPattern = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');

    if (pattern.includes('*')) {
        return new RegExp(regexPattern, 'i');
    }
    
    return new RegExp(`^${regexPattern}$`, 'i');
}

async function getBlacklistSettings(guildId) {
    const cached = dbSettingsCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < DB_CACHE_TTL) {
        return cached.settings;
    }

    try {
        const settings = await Settings.findOne({ guildId }).lean();
        const dbSettings = settings?.blacklistWords || null;
        dbSettingsCache.set(guildId, { settings: dbSettings, timestamp: Date.now() });
        return dbSettings;
    } catch (error) {
        console.error('Error fetching blacklist settings:', error);
        return null;
    }
}

function clearBlacklistCache(guildId) {
    if (guildId) {
        dbSettingsCache.delete(guildId);
    } else {
        dbSettingsCache.clear();
    }
    precompiledBlacklist = null;
    precompiledWhitelistWords = null;
}

async function checkBlacklistWords(message, dmSent = false) {
    const dbSettings = await getBlacklistSettings(message.guild.id);
    
    const configEnabled = config.BlacklistWords?.Enabled;
    const dbEnabled = dbSettings?.enabled;
    
    if (!configEnabled && !dbEnabled) return dmSent;

    const bypassPerms = config.BlacklistWords?.BypassPerms || [];
    if (bypassPerms.length > 0 && message.member.permissions.has(bypassPerms)) {
        return dmSent;
    }

    const bypassRoles = [
        ...(config.BlacklistWords?.BypassRoles || []),
        ...(dbSettings?.bypassRoles || [])
    ];
    const hasBypassRole = message.member.roles.cache.some(role => bypassRoles.includes(role.id));
    if (hasBypassRole) {
        return dmSent;
    }

    const whitelistChannels = [
        ...(config.BlacklistWords?.WhitelistChannels || []),
        ...(dbSettings?.whitelistChannels || [])
    ];
    const whitelistCategories = [
        ...(config.BlacklistWords?.WhitelistCategories || []),
        ...(dbSettings?.whitelistCategories || [])
    ];
    
    if (whitelistChannels.includes(message.channel.id) ||
        (message.channel.parentId && whitelistCategories.includes(message.channel.parentId))) {
        return dmSent;
    }

    const content = message.content;

    const allWhitelistWords = [
        ...(config.BlacklistWords?.WhitelistWords || []),
        ...(dbSettings?.whitelistWords || [])
    ];
    const whitelistRegexes = allWhitelistWords.map(convertPatternToRegex);
    const whitelistMatched = whitelistRegexes.some((regex) => regex.test(content));

    if (whitelistMatched) {
        return dmSent;
    }

    const allPatterns = [
        ...(configEnabled ? (config.BlacklistWords?.Patterns || []) : []),
        ...(dbEnabled ? (dbSettings?.patterns || []) : [])
    ];
    const blacklistRegexes = allPatterns.map((pattern) => ({ pattern, regex: convertPatternToRegex(pattern) }));

    let triggeredPattern = null;
    for (const { pattern, regex } of blacklistRegexes) {
        if (regex.test(content)) {
            triggeredPattern = pattern;
            break;
        }
    }

    if (triggeredPattern) {
        try {
            await message.delete();
            
            const notificationMessage = dbSettings?.notificationMessage || config.BlacklistWords?.Message || '{user}, you used a blacklisted word!';
            const filterWordsMsg = notificationMessage.replace(/{user}/g, `<@${message.author.id}>`);
            const notificationMsg = await message.channel.send(filterWordsMsg);
            setTimeout(() => notificationMsg.delete().catch(console.error), 3000);

            if (config.BlacklistWords?.DM?.Enabled && !dmSent) {
                const currentTime = moment().tz(config.Timezone);
                const replacements = {
                    user: message.author.username,
                    blacklistedword: triggeredPattern,
                    shorttime: currentTime.format("HH:mm"),
                    longtime: currentTime.format('MMMM Do YYYY')
                };

                try {
                    if (config.BlacklistWords.DM.Type === "Message") {
                        let dmMessage = config.BlacklistWords.DM.Message;
                        Object.entries(replacements).forEach(([key, value]) => {
                            dmMessage = dmMessage.replace(new RegExp(`{${key}}`, 'g'), value);
                        });
                        await message.author.send(dmMessage);
                    } else if (config.BlacklistWords.DM.Type === "Embed") {
                        const embedConfig = config.BlacklistWords.DM.Embed;
                        const embed = new EmbedBuilder()
                            .setColor(embedConfig.Color)
                            .setTitle(embedConfig.Title)
                            .setDescription(embedConfig.Description.map(line => 
                                Object.entries(replacements).reduce((str, [key, value]) => 
                                    str.replace(new RegExp(`{${key}}`, 'g'), value)
                                , line)
                            ).join('\n'));

                        if (embedConfig.Footer) {
                            embed.setFooter({ 
                                text: embedConfig.Footer.replace(/{shorttime}/g, replacements.shorttime) 
                            });
                        }

                        if (embedConfig.Thumbnail) {
                            embed.setThumbnail(message.author.displayAvatarURL());
                        }

                        await message.author.send({ embeds: [embed] });
                    }
                    dmSent = true;
                } catch (err) {
                    if (err.code === 50007) {
                        return dmSent;
                    }
                    console.error('Failed to send DM:', err);
                }
            }

            const logsChannelId = dbSettings?.logsChannelId || config.BlacklistWords?.LogsChannelID;
            const logsChannel = logsChannelId ? getLogChannel(message.guild, logsChannelId) : null;
            if (logsChannel) {
                    const embedConfig = config.BlacklistWords?.Embed;
                    const currentTime = moment().tz(config.Timezone);
                    const logReplacements = {
                        user: `<@${message.author.id}>`,
                        userName: message.author.username,
                        userId: message.author.id,
                        blacklistedword: triggeredPattern,
                        channel: `<#${message.channel.id}>`,
                        shorttime: currentTime.format("HH:mm"),
                        longtime: currentTime.format('MMMM Do YYYY'),
                        guildName: message.guild.name,
                        guildIcon: message.guild.iconURL(),
                        userBanner: message.author.bannerURL?.() || '',
                        'user-avatar': message.author.displayAvatarURL()
                    };
                    const replace = (str) => Object.entries(logReplacements).reduce(
                        (s, [key, value]) => s.replace(new RegExp(`{${key}}`, 'g'), value || ''), str
                    );

                    const embed = new EmbedBuilder()
                        .setColor(embedConfig?.Color || '#FF0000')
                        .setTimestamp();

                    if (embedConfig?.Title) embed.setTitle(replace(embedConfig.Title));
                    if (embedConfig?.Description) {
                        embed.setDescription(embedConfig.Description.map(line => replace(line)).join('\n'));
                    }
                    if (embedConfig?.Footer?.Text) {
                        embed.setFooter({
                            text: replace(embedConfig.Footer.Text),
                            iconURL: embedConfig.Footer.Icon ? replace(embedConfig.Footer.Icon) : undefined
                        });
                    }
                    if (embedConfig?.Author?.Text) {
                        embed.setAuthor({
                            name: replace(embedConfig.Author.Text),
                            iconURL: embedConfig.Author.Icon ? replace(embedConfig.Author.Icon) : undefined
                        });
                    }
                    if (embedConfig?.Image) embed.setImage(replace(embedConfig.Image));
                    if (embedConfig?.Thumbnail) {
                        embed.setThumbnail(replace(embedConfig.Thumbnail));
                    }

                    await logsChannel.send({ embeds: [embed] });
                }

            return true;
        } catch (error) {
            console.error('Error handling blacklisted word:', error);
        }
    }
    
    return dmSent;
}

function replacePlaceholders(text, message, extraData = {}, currentTime = null) {
    if (!currentTime) {
        currentTime = moment().tz(config.Timezone);
    }

    let replacedText = text
        .replace(/{user}/g, `<@${message.author.id}>`)
        .replace(/{userName}/g, message.author.username)
        .replace(/{userTag}/g, message.author.tag)
        .replace(/{userId}/g, message.author.id)
        .replace(/{channel}/g, `<#${message.channel.id}>`)
        .replace(/{shorttime}/g, currentTime.format("HH:mm"))
        .replace(/{longtime}/g, currentTime.format('MMMM Do YYYY'))
        .replace(/{guildName}/g, message.guild.name);

    Object.entries(extraData).forEach(([key, value]) => {
        replacedText = replacedText.replace(new RegExp(`{${key}}`, 'g'), value);
    });

    return replacedText;
}

function hasPermissionOrRole(member, permissions = [], roles = []) {
    if (!member) return false;
    
    if (permissions.length > 0) {
        if (member.permissions.has(permissions)) return true;
    }
    
    if (roles.length > 0) {
        return member.roles.cache.some(role => roles.includes(role.id));
    }
    
    return false;
}

function parseDuration(duration) {
    if (!duration) return 0;
    
    const regex = /(\d+)([smhd])/;
    const match = duration.match(regex);
    
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

function humanReadableDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

function getTimeoutExpiryTimestamp(timeoutDurationMs) {
    const expiryTime = new Date(Date.now() + timeoutDurationMs);
    const timestamp = Math.floor(expiryTime.getTime() / 1000);
    return `<t:${timestamp}:R>`;
}

function createLogEmbed(title, color, header, description, fields = [], footer = '') {
    const embed = new EmbedBuilder()
        .setTitle(header)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

    if (fields.length > 0) {
        fields.forEach(field => {
            embed.addFields({ name: field.name, value: field.value, inline: field.inline || false });
        });
    }

    if (footer) {
        embed.setFooter({ text: footer });
    }

    return embed;
}

function getLogChannel(guild, channelIdConfig) {
    if (!channelIdConfig) return null;
    const channelIds = Array.isArray(channelIdConfig) ? channelIdConfig : [channelIdConfig];
    for (const channelId of channelIds) {
        if (!channelId || channelId === "" || channelId === "CHANNEL_ID") continue;
        const channel = guild.channels.cache.get(channelId);
        if (channel) return channel;
    }
    return null;
}

function sendLogMessage(guild, channelIdConfig, embed) {
    const channel = getLogChannel(guild, channelIdConfig);
    if (channel) {
        channel.send({ embeds: [embed] }).catch(console.error);
    }
}

async function sendDirectMessage(user, message, data) {
    try {
        let formattedMessage = message;
        for (const [key, value] of Object.entries(data)) {
            formattedMessage = formattedMessage.replace(`{${key}}`, value);
        }
        await user.send(formattedMessage);
    } catch (error) {
        if (error.code === 50007) {
            return;
        }
        console.error('Failed to send DM:', error);
    }
}

module.exports = {
    convertPatternToRegex,
    checkBlacklistWords,
    clearBlacklistCache,
    replacePlaceholders,
    hasPermissionOrRole,
    parseDuration,
    humanReadableDuration,
    getTimeoutExpiryTimestamp,
    createLogEmbed,
    getLogChannel,
    sendLogMessage,
    sendDirectMessage
};