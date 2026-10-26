const { EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const moment = require('moment-timezone');
const { getConfig, getLang } = require('../utils/core/configLoader.js');
const { getLogChannel } = require('../utils/handlers/messageUtils.js');
const config = getConfig();
const lang = getLang();

module.exports = async (client, role) => {
    if (!role.guild) return;
    if (!config.RoleDeletedLogs?.Enabled) return;

    if (!role.guild.members.me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return;

    try {
        const fetchedLogs = await role.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.RoleDelete,
        });

        const deletionLog = fetchedLogs.entries.first();
        if (!deletionLog) return;
        const { executor } = deletionLog;

        if (executor.bot) return;

        const antiNuke = global.addonLoader?.getService('security.antiNuke');
        await antiNuke?.handleRoleDeleteEvent(client, role, deletionLog);

        if (config.RoleDeletedLogs?.LogsChannelID) {
            let embedData = lang.RoleDeletedLogs?.Embed || {};
            const currentTime = moment().tz(config.Timezone).format("HH:mm");
            const longTime = moment().tz(config.Timezone).format("MMMM Do YYYY");

            let embed = new EmbedBuilder()
                .setColor(embedData.Color || "#FF0000");

            if (embedData.Title) {
                embed.setTitle(replacePlaceholders(embedData.Title, role, executor, currentTime, longTime));
            }

            if (embedData.Description && embedData.Description.length > 0) {
                embed.setDescription(
                    embedData.Description.map(line =>
                        replacePlaceholders(line, role, executor, currentTime, longTime)
                    ).join('\n')
                );
            }

            if (embedData.Footer && embedData.Footer.Text) {
                embed.setFooter({ text: replacePlaceholders(embedData.Footer.Text, role, executor, currentTime, longTime), iconURL: embedData.Footer.Icon || undefined });
            }

            if (embedData.Author && embedData.Author.Text) {
                embed.setAuthor({ name: replacePlaceholders(embedData.Author.Text, role, executor, currentTime, longTime), iconURL: embedData.Author.Icon || undefined });
            }

            if (embedData.Thumbnail) {
                embed.setThumbnail(executor.displayAvatarURL({ format: 'png', dynamic: true }));
            }

            if (embedData.Image) {
                embed.setImage(embedData.Image);
            }

            let deleteLogChannel = getLogChannel(role.guild, config.RoleDeletedLogs.LogsChannelID);
            if (deleteLogChannel) deleteLogChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error("Error in role delete event handler:", error);
    }
};

function replacePlaceholders(text, role, executor, currentTime, longTime) {
    return text
        .replace(/{executor}/g, `<@${executor.id}>`)
        .replace(/{roleName}/g, role.name)
        .replace(/{roleId}/g, role.id)
        .replace(/{shorttime}/g, currentTime)
        .replace(/{longtime}/g, longTime);
}
