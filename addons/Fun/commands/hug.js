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

const hugGifs = [
    "https://media.tenor.com/oRk6wv13vTAAAAAi/hug.gif",
    "https://media1.tenor.com/m/BvoOcnjAz1AAAAAC/boo-hug.gif",
    "https://media1.tenor.com/m/r8J976-gzRYAAAAd/iluvcashew.gif",
    "https://media1.tenor.com/m/DRgXad_JuuQAAAAC/bobitos-mimis.gif",
    "https://media1.tenor.com/m/AKcvM9yQRrQAAAAC/hug.gif",
    "https://media1.tenor.com/m/3OMzo-QSVqEAAAAd/baby-hug.gif",
    "https://media1.tenor.com/m/9RnLYWZRyDwAAAAd/snuggles-hugs.gif",
    "https://media1.tenor.com/m/yMjbC5MEv5UAAAAC/hug-squeeze.gif",
    "https://media1.tenor.com/m/m0DnmklkzAEAAAAd/allex-ano.gif",
    "https://media1.tenor.com/m/EqG5FatLJpUAAAAC/hug-dogs.gif",
    "https://media1.tenor.com/m/wlkjEsa1X_wAAAAC/monkeys-monkey.gif"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hug')
        .setDescription('Send a hug to someone to brighten their day!')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to hug')
                .setRequired(true)),
    category: 'Fun',
    async execute(interaction, client) {
        const target = interaction.options.getUser('target');
        const selectedGif = hugGifs[Math.floor(Math.random() * hugGifs.length)];

        const embed = new EmbedBuilder()
            .setDescription(`<@${interaction.user.id}> sends hugs your way <@${target.id}>.`)
            .setImage(selectedGif)
            .setColor(config.EmbedColors)

        await interaction.reply({ embeds: [embed] });
    }
};