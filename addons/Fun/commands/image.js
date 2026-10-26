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
const yaml = require('js-yaml');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const config = getConfig();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('Get a random image.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('cat')
                .setDescription('Get a random picture of a cat'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dog')
                .setDescription('Get a random picture of a dog'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('coffee')
                .setDescription('Get a random picture of coffee'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('duck')
                .setDescription('Get a random picture of a duck')),
    category: 'Fun',
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const subcommand = interaction.options.getSubcommand();
            let imageUrl = '';
            let title = '';

            if (subcommand === 'cat') {
                const response = await fetch('http://edgecats.net/random');
                imageUrl = await response.text();
                title = 'Here\'s a random cat for you!';
            } else if (subcommand === 'dog') {
                const response = await fetch('https://random.dog/woof.json');
                const data = await response.json();
                imageUrl = data.url;
                title = 'Here\'s a random dog for you!';
            } else if (subcommand === 'coffee') {
                const response = await fetch('https://coffee.alexflipnote.dev/random.json');
                const data = await response.json();
                imageUrl = data.file;
                title = 'Here\'s a random coffee for you!';
            } else if (subcommand === 'duck') {
                const response = await fetch('https://random-d.uk/api/v2/random');
                const data = await response.json();
                imageUrl = data.url;
                title = 'Here\'s a random duck for you!';
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setImage(imageUrl)
                .setColor(config.EmbedColors);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error fetching ${subcommand} image: `, error);
            await interaction.editReply({ content: `Couldn't fetch a ${subcommand} image at the moment.` });
        }
    }
};