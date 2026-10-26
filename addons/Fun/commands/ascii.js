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

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');

let figlet;
try {
    figlet = require('figlet');
} catch (error) {
    figlet = null;
}

const config = getConfig();
const lang = getLang();

const fontMappings = {
    small: 'Small',
    medium: 'Standard', 
    large: 'Big'
};

function createAsciiArt(text, size = 'medium') {
    return new Promise((resolve, reject) => {
        if (!figlet) {
            reject(new Error('Figlet module is not available'));
            return;
        }
        
        const font = fontMappings[size] || fontMappings.medium;
        
        figlet.text(text, {
            font: font,
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 80,
            whitespaceBreak: true
        }, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

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
        .setName('ascii')
        .setDescription('Create ASCII text')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text you want converted')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('size')
                .setDescription('Font size')
                .setRequired(false)
                .addChoices(
                    { name: 'Small', value: 'small' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Large', value: 'large' }
            )),
    category: 'Fun',
    async execute(interaction) {
        if (!figlet) {
            return interaction.reply({ 
                content: 'ASCII art functionality is currently unavailable. Please contact an administrator.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        let text = interaction.options.getString('text');
        const sizeChoice = interaction.options.getString('size') || 'medium';

        if (await checkBlacklistWords(text)) {
            const blacklistMessage = lang.BlacklistWords && lang.BlacklistWords.Message
                ? lang.BlacklistWords.Message.replace(/{user}/g, `${interaction.user}`)
                : 'Your text contains blacklisted words.';
            return interaction.reply({ content: blacklistMessage, flags: MessageFlags.Ephemeral });
        }

        const maxTextLengths = { small: 100, medium: 50, large: 20 };
        const maxTextLength = maxTextLengths[sizeChoice] || maxTextLengths.medium;
        
        if (text.length > maxTextLength) {
            return interaction.reply({ 
                content: `Text is too long! Maximum length for **${sizeChoice}** size is **${maxTextLength}** characters. Your text has ${text.length} characters.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        try {
            const asciiArt = await createAsciiArt(text, sizeChoice);

            if (asciiArt.length > 1950) {
                return interaction.reply({ 
                    content: `The generated ASCII art is too long for Discord!\n\n**Try:**\n• Shorter text\n• Smaller font size\n• Remove some words\n\n**Current:** ${text.length} characters\n**Limit:** ${maxTextLength} characters`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
            
            await interaction.reply(`\`\`\`\n${asciiArt}\n\`\`\``);
        } catch (error) {
            console.error('Error creating ASCII art:', error);
            const errorMessage = error.message.includes('Figlet module is not available')
                ? 'ASCII art functionality is currently unavailable due to a module loading error. Please contact an administrator.'
                : 'Failed to convert text into ASCII art. Please try again with different text.';
            await interaction.reply({ 
                content: errorMessage, 
                flags: MessageFlags.Ephemeral 
            });
        }
    },
};