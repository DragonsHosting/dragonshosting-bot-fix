const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setticketlogchannel")
        .setDescription("Sets the channel where ticket logs and transcripts will be sent.")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("The channel to set as the ticket log channel")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Only users with Manage Guild permission can use this
    async execute(interaction) {
        console.log("[Ticket System] setticketlogchannel.js command loaded!");
        const newLogChannel = interaction.options.getChannel("channel");
        const configPath = path.resolve(__dirname, "../config.json");

        try {
            let config = {};
            if (fs.existsSync(configPath)) {
                const configFile = fs.readFileSync(configPath, "utf8");
                config = JSON.parse(configFile);
            }

            config.ticketLogChannelId = newLogChannel.id;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

            await interaction.reply({
                content: `Ticket log channel has been set to ${newLogChannel}.`, 
                ephemeral: true
            });
        } catch (error) {
            console.error("[Ticket System] Error setting ticket log channel:", error);
            await interaction.reply({
                content: "There was an error trying to set the ticket log channel. Please try again later.",
                ephemeral: true
            });
        }
    },
};
