const { ChannelType, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const moment = require('moment-timezone');
const { getConfig, getLang, replacePlaceholders: globalReplacePlaceholders } = require('../utils/core/configLoader');
const { getLogChannel } = require('../utils/handlers/messageUtils.js');
const config = getConfig();
const lang = getLang();

async function handleVoiceStateUpdate(client, oldState, newState) {
    try {

        const voiceConfigKey = getVoiceStateConfig(oldState, newState);
        if (voiceConfigKey) {
            await sendVoiceStateEmbed(oldState, newState, voiceConfigKey);
        }
    } catch (error) {
        console.error('Error in voiceStateUpdate event:', error);
    }
}

function getVoiceStateConfig(oldState, newState) {
    if (oldState.channelId === null && newState.channelId !== null && config.VoiceChannelJoin && config.VoiceChannelJoin.Enabled) {
        return 'VoiceChannelJoin';
    } else if (oldState.channelId !== null && newState.channelId === null && config.VoiceChannelLeave && config.VoiceChannelLeave.Enabled) {
        return 'VoiceChannelLeave';
    } else if (oldState.channelId !== newState.channelId && oldState.channelId !== null && newState.channelId !== null && oldState.member.id === newState.member.id && config.VoiceChannelSwitch && config.VoiceChannelSwitch.Enabled) {
        return 'VoiceChannelSwitch';
    } else if (oldState.streaming !== newState.streaming) {
        if (newState.streaming && config.VoiceChannelStreamStart && config.VoiceChannelStreamStart.Enabled) {
            return 'VoiceChannelStreamStart';
        } else if (!newState.streaming && config.VoiceChannelStreamStop && config.VoiceChannelStreamStop.Enabled) {
            return 'VoiceChannelStreamStop';
        }
    }
    return null;
}

function replacePlaceholders(text, oldState, newState, moderator = null) {
    const currentTime = moment().tz(config.Timezone);
    const shortTime = currentTime.format("HH:mm");
    const longTime = currentTime.format('MMMM Do YYYY');
    const oldChannelName = oldState.channel ? oldState.channel.name : "None";
    const newChannelName = newState.channel ? newState.channel.name : "None";

    const channelName = newState.channelId ? newChannelName : oldChannelName;

    return text.replace(/{user}/g, newState.member ? `<@${newState.member.id}>` : "N/A")
        .replace(/{moderator}/g, moderator ? `<@${moderator.id}>` : "N/A")
        .replace(/{oldChannel}/g, oldChannelName)
        .replace(/{newChannel}/g, newChannelName)
        .replace(/{channel}/g, channelName)
        .replace(/{shorttime}/g, shortTime)
        .replace(/{longtime}/g, longTime);
}

async function sendVoiceStateEmbed(oldState, newState, voiceConfigKey, moderator = null) {
    if (!voiceConfigKey) return;

    const voiceConfig = config[voiceConfigKey];
    const embedConfig = lang[voiceConfigKey].Embed;

    const embed = new EmbedBuilder()
        .setColor(embedConfig.Color)
        .setTitle(replacePlaceholders(embedConfig.Title, oldState, newState, moderator))
        .setDescription(embedConfig.Description.map(line => replacePlaceholders(line, oldState, newState, moderator)).join("\n"));

    if (embedConfig.Footer.Text) {
        embed.setFooter({ text: globalReplacePlaceholders(embedConfig.Footer.Text), iconURL: embedConfig.Footer.Icon || undefined });
    }

    if (embedConfig.Author.Text) {
        embed.setAuthor({ name: embedConfig.Author.Text, iconURL: embedConfig.Author.Icon || undefined });
    }

    if (embedConfig.Thumbnail && newState.member) {
        embed.setThumbnail(newState.member.user.displayAvatarURL());
    }

    if (embedConfig.Image) {
        embed.setImage(embedConfig.Image);
    }

    const voiceLogChannel = getLogChannel(newState.guild, voiceConfig.LogsChannelID);
    if (voiceLogChannel) {
        try {
            await voiceLogChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending voice state embed:', error);
        }
    }
}


module.exports = handleVoiceStateUpdate;
