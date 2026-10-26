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

const { EmbedBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();

const templates = [
    { name: 'Ancient Aliens Guy', value: 'aag' },
    { name: 'It\'s A Trap!', value: 'ackbar' },
    { name: 'Afraid to Ask Andy', value: 'afraid' },
    { name: 'Agnes Harkness Winking', value: 'agnes' },
    { name: 'Sweet Brown', value: 'aint-got-time' },
    { name: 'Awkward Moment Seal', value: 'ams' },
    { name: 'Do You Want Ants?', value: 'ants' },
    { name: 'Almost Politically Correct Redneck', value: 'apcr' },
    { name: 'Always Has Been', value: 'astronaut' },
    { name: 'And Then I Said', value: 'atis' },
    { name: 'Life... Finds a Way', value: 'away' },
    { name: 'Socially Awesome Penguin', value: 'awesome' },
    { name: 'Socially Awesome Awkward Penguin', value: 'awesome-awkward' },
    { name: 'Socially Awkward Penguin', value: 'awkward' },
    { name: 'Socially Awkward Awesome Penguin', value: 'awkward-awesome' },
    { name: 'You Should Feel Bad', value: 'bad' },
    { name: 'Milk Was a Bad Choice', value: 'badchoice' },
    { name: 'Butthurt Dweller', value: 'bd' },
    { name: 'Men in Black', value: 'because' },
    { name: 'I\'m Going to Build My Own Theme Park', value: 'bender' },
    { name: 'But It\'s Honest Work', value: 'bihw' },
    { name: 'Why Shouldn\'t I Keep It', value: 'bilbo' },
    { name: 'Baby Insanity Wolf', value: 'biw' },
    { name: 'Bad Luck Brian', value: 'blb' },
    { name: 'I Should Buy a Boat Cat', value: 'boat' },
];

function convertSimplePatternToRegex(simplePattern) {
    let regexPattern = simplePattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i');
}

async function checkBlacklistWords(content) {
    const blacklistRegex = config.BlacklistWords.Patterns.map(pattern => convertSimplePatternToRegex(pattern));
    return blacklistRegex.some(regex => regex.test(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Generate and get memes.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('random')
                .setDescription('Get a random meme from meme-api.com'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('text')
                .setDescription('Generate a meme with text')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Choose a meme template')
                        .setRequired(true)
                        .addChoices(...templates))
                .addStringOption(option =>
                    option.setName('top_text')
                        .setDescription('The top text for the meme')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('bottom_text')
                        .setDescription('The bottom text for the meme')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sadcat')
                .setDescription('Generate a sad cat image with your text')
                .addStringOption(option =>
                    option.setName('text')
                        .setDescription('The text to display on the sad cat image')
                        .setRequired(true))),
    category: 'Fun',
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'random') {
            await interaction.deferReply();

            try {
                const res = await fetch('https://meme-api.com/gimme');
                if (!res.ok) {
                    throw new Error('Failed to fetch meme, meme-api might be down or busy.');
                }
                const json = await res.json();

                const memeUrl = json.postLink;
                const memeImage = json.url;
                const memeTitle = json.title;
                const memeUpvotes = json.ups;
                const memeAuthor = json.author;
                const memeSubreddit = json.subreddit;

                const embed = new EmbedBuilder()
                    .setTitle(`🤣 ${memeTitle}`)
                    .setURL(memeUrl)
                    .setImage(memeImage)
                    .setColor(config.EmbedColors)
                    .addFields(
                        { name: '👍 Upvotes', value: `${memeUpvotes}`, inline: true },
                        { name: '👤 Author', value: `${memeAuthor}`, inline: true },
                        { name: '📂 Subreddit', value: `${memeSubreddit}`, inline: true }
                    )
                    .setFooter({ text: 'Enjoy your meme!' });

                interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('Error fetching meme:', error);
                interaction.editReply({
                    content: 'Sorry, I couldn\'t fetch a meme at the moment. Please try again later.',
                });
            }
        } else if (subcommand === 'text') {
            await interaction.deferReply();

            const template = interaction.options.getString('template');
            const topText = interaction.options.getString('top_text');
            const bottomText = interaction.options.getString('bottom_text') || '';

            if (await checkBlacklistWords(topText) || await checkBlacklistWords(bottomText)) {
                const blacklistMessage = lang.BlacklistWords && lang.BlacklistWords.Message
                    ? lang.BlacklistWords.Message.replace(/{user}/g, `${interaction.user}`)
                    : 'Your text contains blacklisted words.';
                return interaction.editReply({ content: blacklistMessage, flags: MessageFlags.Ephemeral });
            }

            const memeApiUrl = `https://api.memegen.link/images/${template}/${encodeURIComponent(topText)}/${encodeURIComponent(bottomText)}.png`;

            try {
                const res = await fetch(memeApiUrl);
                if (!res.ok) {
                    throw new Error('Failed to generate meme, memegen API might be down or busy.');
                }
                const memeUrl = res.url;

                const embed = new EmbedBuilder()
                    .setTitle('😂 Meme')
                    .setImage(memeUrl)
                    .setColor(config.EmbedColors)
                    .setFooter({ text: 'Enjoy your meme!' });

                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('Error generating meme:', error);
                await interaction.editReply({
                    content: 'Sorry, I couldn\'t generate a meme at the moment. Please try again later.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } else if (subcommand === 'sadcat') {
            await interaction.deferReply();

            const text = interaction.options.getString('text');

            const getRandomColor = () => {
                const letters = '0123456789ABCDEF';
                let color = '#';
                for (let i = 0; i < 6; i++) {
                    color += letters[Math.floor(Math.random() * 16)];
                }
                return color;
            };

            try {
                const res = await fetch(`https://api.popcat.xyz/sadcat?text=${encodeURIComponent(text)}`);
                if (!res.ok) {
                    throw new Error('Failed to generate sad cat image, API might be down or busy.');
                }
                const buffer = await res.arrayBuffer();

                const embed = new EmbedBuilder()
                    .setTitle(`😿 Sad Cat`)
                    .setImage('attachment://sadcat.png')
                    .setColor(getRandomColor())
                    .setFooter({ text: 'Cheer up!' });

                await interaction.editReply({
                    embeds: [embed],
                    files: [{ attachment: Buffer.from(buffer), name: 'sadcat.png' }]
                });
            } catch (error) {
                console.error('Error generating sad cat image:', error);
                await interaction.editReply({
                    content: 'Sorry, I couldn\'t generate a sad cat image at the moment. Please try again later.',
                });
            }
        }
    },
};