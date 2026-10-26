/*
  _____            _           ____        _   
 |  __ \          | |         |  _ \      | |  
 | |  | |_ __ __ _| | _____   | |_) | ___ | |_ 
 | |  | | '__/ _` | |/ / _ \  |  _ < / _ \| __|
 | |__| | | | (_| |   < (_) | | |_) | (_) | |_ 
 |_____/|_|  \__,_|_|\_\___/  |____/ \___/ \__|
                                             
                                        
 Thank you for choosing DragonHosting!

 Should you encounter any issues, require assistance, or have suggestions for improving the bot,
 we invite you to connect with us on our Discord server and create a support ticket: 

 https://discord.gg/DragonsHosting
 
*/

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const fs = require('fs');
const yaml = require("js-yaml");
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Retrieve the last deleted or edited message')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('message')
                .setDescription('Get the last deleted message'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edited')
                .setDescription('Get the last edited message'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the last sniped message')),
    category: 'General',
    async execute(interaction, client) {
        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'clear') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: lang.NoPermsMessage || "You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
            }

            if (!client.snipes.has(interaction.guildId) || !client.snipes.get(interaction.guildId).has(interaction.channelId)) {
                return interaction.reply({ content: "There are no sniped messages to clear.", flags: MessageFlags.Ephemeral });
            }

            client.snipes.get(interaction.guildId).delete(interaction.channelId);
            return interaction.reply({ content: "Successfully cleared the sniped message for this channel.", flags: MessageFlags.Ephemeral });
        }

        const snipeMsg = client.snipes.get(interaction.guildId)?.get(interaction.channelId);

        if (!snipeMsg) {
            return interaction.reply({ content: lang.SnipeNoMsg || "No message to snipe!", flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${snipeMsg.author}`, iconURL: `${snipeMsg.member.user.displayAvatarURL()}` })
            .setColor(config.EmbedColors)
            .setTimestamp(snipeMsg.timestamp);

        if (subCommand === 'edited' && snipeMsg.edited) {
            embed.addFields([
                { name: "Original Message", value: snipeMsg.oldContent || "No content" },
                { name: "Edited Message", value: snipeMsg.newContent || "No content" }
            ]);
        } else if (subCommand === 'message' && !snipeMsg.edited) {
            embed.setDescription(snipeMsg.content);
        } else {
            return interaction.reply({ content: 'No relevant sniped message found.', flags: MessageFlags.Ephemeral });
        }

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};