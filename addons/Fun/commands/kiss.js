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

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');

const config = getConfig();

const kissGifs = [
    "https://media1.tenor.com/m/VchKuu12CBUAAAAd/ted2012-blow-a-kiss.gif",
    "https://media1.tenor.com/m/GqRRX_s5XLgAAAAd/miss-you-kiss.gif",
    "https://media1.tenor.com/m/dCAFwEwjDAcAAAAC/kisses.gif",
    "https://media1.tenor.com/m/ZXBks2QSfdgAAAAd/cats-kittens.gif",
    "https://media1.tenor.com/m/o_5RQarGvJ0AAAAC/kiss.gif",
    "https://media1.tenor.com/m/dnkXvJVb5cAAAAAC/bear-blow-a-kiss.gif",
    "https://media1.tenor.com/m/QQTLF-JE2VcAAAAC/kiss.gif",
    "https://media1.tenor.com/m/QPtL6q_2VjkAAAAC/funny-lol.gif",
    "https://media1.tenor.com/m/o9wzbXEAlr8AAAAd/seal-seal-kiss.gif",
    "https://media1.tenor.com/m/Cc8vDOXSEzQAAAAC/kisses-kiss.gif",
    "https://media1.tenor.com/m/nAxkMLHuHrMAAAAC/kiss-kissing.gif",
    "https://media1.tenor.com/m/FwbvGXvGE5oAAAAC/goth-girl-goth-kiss.gif"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kiss')
        .setDescription('Send a kiss to someone to brighten their day!')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to kiss')
                .setRequired(true)),
    category: 'Fun',
    async execute(interaction, client) {
        const target = interaction.options.getUser('target');
        const selectedGif = kissGifs[Math.floor(Math.random() * kissGifs.length)];

        const embed = new EmbedBuilder()
            .setDescription(`<@${interaction.user.id}> sends kisses your way <@${target.id}>.`)
            .setImage(selectedGif)
            .setColor(config.EmbedColors)

        await interaction.reply({ embeds: [embed] });
    }
};