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

const killScenarios = [
    {
        text: "smothers you with a fluffy pillow.",
        image: "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMHlxdDhwYWZxZmdkNWN4dWFxbng5Zm94bHl1M2czOGU0ZndxMmx2OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xUPGcdlIDdjwxbjrO0/giphy.gif"
    },
    {
        text: "stabs you with a pointy thing.",
        image: "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExczNxd3A3djViMzJpemJ1OWV5dnhvYmljOHlldnVmaHZrYnhzamJrYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/CiZB6WIjaoXYc/giphy.gif"
    },
    {
        text: "defeats you in a friendly duel with a sharp object.",
        image: "https://media1.tenor.com/m/Fedmj9KCbH8AAAAd/axe-five.gif"
    },
    {
        text: "kills you with kindness.",
        image: "https://media1.tenor.com/m/UpsNRrB6iKUAAAAd/violent-cat-cat.gif"
    },
    {
        text: "runs you down to show you cuteness.",
        image: "https://media1.tenor.com/m/n51pqoBDBp4AAAAd/kill-you-chuckie.gif"
    },
    { 
        text: "threatens to murder you.",
        image: "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdnczdGFsemY0MTUxeWpqaHF3ZHlyeHcwZmRienhrNWFya2FqY3hxNCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QHYHhShm1sjVS/giphy.gif"
    },
    { 
        text: "throws you off a cliff.",
        image: "https://media1.tenor.com/m/lzeoLQIX-Q8AAAAd/bette-midler-danny-devito.gif"
    },
    { 
        text: "uses a laser to zap you.",
        image: "https://media1.tenor.com/m/z5is3s2v4RcAAAAC/zap-shotgun.gif"
    },
    {
        text: "blasts you with a cannon.",
        image: "https://media1.tenor.com/m/w5wm0GtfI9EAAAAd/cannon-fish.gif"
    },
    {
        text: "sends a swarm of bees to attack you.",
        image: "https://media1.tenor.com/m/mkdkr8EEyUEAAAAd/bees-bee.gif"
    },
    {
        text: "traps you in quicksand.",
        image: "https://media1.tenor.com/m/diq_HcNUsY0AAAAC/trouble-sink.gif"
    },
    {
        text: "casts a spell to turn you into a toad.",
        image: "https://media1.tenor.com/m/u6oVic5CvAUAAAAC/casting-spells-magical.gif"
    },
    {
        text: "drops an anvil on you.",
        image: "https://media1.tenor.com/m/ItHSQ8Liaz4AAAAC/fallon-tonightshow.gif"
    },
    {
        text: "blows you away with a powerful wind.",
        image: "https://media1.tenor.com/m/WIScDzVZVwsAAAAC/blowing-away-ewan-mcgregor.gif"
    },
    {
        text: "tricks you into falling into a pit.",
        image: "https://media1.tenor.com/m/CVFsAmHi1JQAAAAC/jump-cannonball.gif"
    }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kill')
        .setDescription('Pretend to eliminate another user in a fun and harmless way!')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to eliminate')
                .setRequired(true)),
    category: 'Fun',
    async execute(interaction, client) {
        const target = interaction.options.getUser('target');
        const scenario = killScenarios[Math.floor(Math.random() * killScenarios.length)];

        const embed = new EmbedBuilder()
            .setDescription(`<@${interaction.user.id}> ${scenario.text} <@${target.id}>.`)
            .setImage(scenario.image)
            .setColor(config.EmbedColors)

        await interaction.reply({ embeds: [embed] });
    }
};