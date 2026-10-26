const { EmbedBuilder } = require("discord.js");
const moment = require('moment-timezone');
const { getConfig, getLang, replacePlaceholders: globalReplacePlaceholders } = require('../utils/core/configLoader.js');
const { checkBlacklistWords, replacePlaceholders, getLogChannel } = require('../utils/handlers/messageUtils');

const config = getConfig();
const lang = getLang();

module.exports = async (client, oldMessage, newMessage) => {
    if (!newMessage.guild || !newMessage.author || newMessage.author.bot || !newMessage.content) {
        return;
    }
    if (oldMessage.content === newMessage.content) {
        return;
    }

    let dmSent = false;
    dmSent = await checkBlacklistWords(newMessage, dmSent);
    
    if (!dmSent && config.MessageUpdateLogs.Enabled) {
        const currentTime = moment().tz(config.Timezone);
        const editLogChannel = getLogChannel(newMessage.guild, config.MessageUpdateLogs.LogsChannelID);
        if (!editLogChannel) return;

        let embedData = lang.MessageUpdateLogs.Embed;
        let embed = new EmbedBuilder()
            .setColor(embedData.Color || "#FF9800")
            .setTitle(replacePlaceholders(embedData.Title, newMessage, { oldmessage: oldMessage ? oldMessage.content : 'None', newmessage: newMessage.content }, currentTime))
            .setDescription(replacePlaceholders(embedData.Description.join('\n'), newMessage, { oldmessage: oldMessage ? oldMessage.content : 'None', newmessage: newMessage.content }, currentTime));

        if (embedData.Footer.Text) {
            embed.setFooter({ text: globalReplacePlaceholders(embedData.Footer.Text), iconURL: embedData.Footer.Icon || undefined });
        }

        if (embedData.Author.Text) {
            embed.setAuthor({ name: embedData.Author.Text, iconURL: embedData.Author.Icon || undefined });
        }

        if (embedData.Thumbnail) {
            embed.setThumbnail(newMessage.author.displayAvatarURL({ format: 'png', dynamic: true }));
        }

        if (embedData.Image) {
            embed.setImage(embedData.Image);
        }

        editLogChannel.send({ embeds: [embed] });
    }
};