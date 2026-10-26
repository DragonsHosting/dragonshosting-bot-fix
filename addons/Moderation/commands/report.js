const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const { getLogChannel } = require('../../../utils/handlers/messageUtils.js');

const config = getConfig();

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Report Message')
        .setType(ApplicationCommandType.Message),
    category: 'Moderation',
    async execute(interaction) {
        try {
            const message = interaction.targetMessage;
            
            const modal = new ModalBuilder()
                .setCustomId('report_modal')
                .setTitle('Report Message');

            const reasonInput = new TextInputBuilder()
                .setCustomId('report_reason')
                .setLabel('Why are you reporting this message?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter your reason here...')
                .setRequired(true)
                .setMaxLength(1000);

            const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);

            const filter = (i) => i.customId === 'report_modal';
            try {
                const submission = await interaction.awaitModalSubmit({ filter, time: 300000 }); // 5 minutes timeout
                
                const reason = submission.fields.getTextInputValue('report_reason');
                const reportedUser = message.author;
                const reportingUser = interaction.user;
                
                if (!config.Report?.LogsChannelID || config.Report.LogsChannelID === "CHANNEL_ID") {
                    await submission.reply({ 
                        content: 'Reports are currently disabled.', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return;
                }

                const channel = getLogChannel(interaction.guild, config.Report.LogsChannelID);
                if (!channel) {
                    await submission.reply({ 
                        content: 'Reports are currently disabled.', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return;
                }

                const description = Array.isArray(config.Report.Embed.Description) 
                    ? config.Report.Embed.Description.join('\n') 
                    : config.Report.Embed.Description;

                const guildIcon = interaction.guild.iconURL();

                const embed = new EmbedBuilder()
                    .setTitle(config.Report.Embed.Title)
                    .setDescription(
                        description
                            .replace(/{user}/g, `<@${reportedUser.id}>`)
                            .replace(/{message}/g, message.content || '*No message content*')
                            .replace(/{timestamp}/g, new Date().toLocaleString())
                            .replace(/{reportingUser}/g, `<@${reportingUser.id}>`)
                            .replace(/{reason}/g, reason)
                            .replace(/{channel}/g, `<#${message.channel.id}>`)
                            .replace(/{messageUrl}/g, message.url)
                    )
                    .setColor(config.Report.Embed.Color)
                    .setTimestamp();

                if (config.Report.Embed.Footer?.Text) {
                    const footerText = config.Report.Embed.Footer.Text.replace(/{guildIcon}/g, guildIcon || '');
                    const footerIcon = config.Report.Embed.Footer.Icon?.replace(/{guildIcon}/g, guildIcon || '');
                    embed.setFooter({ text: footerText, iconURL: footerIcon || undefined });
                }

                if (config.Report.Embed.Thumbnail) {
                    const thumbnail = config.Report.Embed.Thumbnail.replace(/{guildIcon}/g, guildIcon || '');
                    if (thumbnail) embed.setThumbnail(thumbnail);
                }

                await channel.send({ embeds: [embed] });
                await submission.reply({ 
                    content: 'Thank you for your report. The moderators have been notified.', 
                    flags: MessageFlags.Ephemeral 
                });

            } catch (error) {
                if (error.code === 'InteractionCollectorError') {
                    return;
                } else {
                    console.error('Error in report modal submission:', error);
                }
            }

        } catch (error) {
            console.error('Error in report command:', error);
        }
    }
};