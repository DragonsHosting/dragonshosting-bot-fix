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

const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('compliment')
        .setDescription('Send a random compliment to someone!')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to compliment')
                .setRequired(true)),
    category: 'Fun',
    async execute(interaction, client) {
        const user = interaction.options.getUser('user');

        const compliments = lang.compliments.messages;
        const compliment = compliments[Math.floor(Math.random() * compliments.length)];

        await interaction.reply(`<@${user.id}>, ${compliment}`);
    }
};