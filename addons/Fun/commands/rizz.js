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

const rizzLines = [
    "Are you a magician? Because whenever I look at you, everyone else disappears.",
    "Do you have a map? Because I keep getting lost in your eyes.",
    "Do you have a Band-Aid? Because I just scraped my knee falling for you.",
    "If you were a vegetable, you'd be a cute-cumber.",
    "Do you have a name, or can I call you mine?",
    "Are you French? Because Eiffel for you.",
    "Do you have a sunburn, or are you always this hot?",
    "Is your name Google? Because you have everything I've been searching for.",
    "Can I follow you home? Because my parents always told me to follow my dreams.",
    "Do you have a pencil? Because I want to erase your past and write our future.",
    "If you were a fruit, you'd be a fineapple.",
    "Is your dad an artist? Because you're a masterpiece.",
    "Are you a time traveler? Because I see you in my future.",
    "Can you lend me a kiss? I promise I'll give it back.",
    "Do you have a quarter? Because I want to call my mom and tell her I met 'the one'.",
    "Are you a parking ticket? Because you've got FINE written all over you.",
    "If you were a burger at McDonald's, you'd be the McGorgeous.",
    "Are you a campfire? Because you're hot and I want s'more.",
    "Are you Wi-Fi? Because I'm feeling a connection.",
    "Do you have a name? Or can I call you mine?",
    "Is your dad a boxer? Because you're a knockout!",
    "Are you a bank loan? Because you have my interest.",
    "Are you an angel? Because heaven is missing one.",
    "Is your name Chapstick? Because you're da balm.",
    "Are you an alien? Because you just abducted my heart.",
    "Are you a light bulb? Because you brighten up my day.",
    "Is your dad a thief? Because he stole all the stars and put them in your eyes.",
    "Are you a snowstorm? Because you're making my heart race.",
    "Is there a sparkle in your eye, or are you just happy to see me?",
    "Are you a volcano? Because I lava you.",
    "Are you a cat? Because you purrfectly fit into my heart.",
    "Are you a star? Because your beauty lights up the night.",
    "Is your name Ariel? Because we Mermaid for each other.",
    "Are you a lion? Because I can't stop lion about how perfect you are.",
    "Do you like raisins? How about a date?",
    "Are you a gardener? Because I'm digging you.",
    "Are you a camera? Every time I look at you, I smile.",
    "Are you a book? Because you're my favorite story.",
    "Is your name Waldo? Because someone like you is hard to find.",
    "Are you an elevator? Because I want to go up and down with you."
];

const rizzGifs = [
    "https://c.tenor.com/ryPE1xzKn70AAAAd/tenor.gif",
    "https://c.tenor.com/a4zf3SEgzbIAAAAC/tenor.gif",
    "https://c.tenor.com/6aejTZnDDxQAAAAC/tenor.gif",
    "https://c.tenor.com/yEG23sxXIVQAAAAC/tenor.gif",
    "https://c.tenor.com/rC_mbGxsqu8AAAAd/tenor.gif",
    "https://i.imgur.com/JxQZLHj.gif",
    "https://i.imgur.com/JbBHbdR.gif",
    "https://media1.tenor.com/m/8EBYtwaGjmwAAAAC/rizz-hey-girl.gif",
    "https://media1.tenor.com/m/Kslo79KC8BwAAAAd/silly-cat.gif",
    "https://media1.tenor.com/m/AgZTJ_JqM3QAAAAC/mewing-jawline.gif",
    "https://media1.tenor.com/m/d0dFrbFOlroAAAAC/swag-face.gif",
    "https://media1.tenor.com/m/uuV5rGCztBcAAAAd/bee-rizz-bee-eyebrow.gif",
    "https://media1.tenor.com/m/__PTQj3QDXoAAAAC/rizz-dziadyga.gif",
    "https://media1.tenor.com/m/nfNPRXNtRTMAAAAd/roblox.gif"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rizz')
        .setDescription('Send a random rizz line to someone!')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to rizz up')
                .setRequired(true)),
    category: 'Fun',
    async execute(interaction, client) {
        const user = interaction.options.getUser('user');
        const rizzLine = rizzLines[Math.floor(Math.random() * rizzLines.length)];
        const rizzGif = rizzGifs[Math.floor(Math.random() * rizzGifs.length)];

        const embed = new EmbedBuilder()
            .setTitle(`${user.username} I wanna rizz you up`)
            .setDescription(rizzLine)
            .setImage(rizzGif)
            .setColor(config.EmbedColors)

        await interaction.reply({ embeds: [embed] });
    }
};