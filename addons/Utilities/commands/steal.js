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

const { PermissionsBitField, MessageAttachment, MessageFlags, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');


const sharp = require('sharp');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();


module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Borrows emojis or stickers from other sources')
        .addSubcommand(subcommand =>
            subcommand
                .setName('emoji')
                .setDescription('Steal one or more emojis')
                .addStringOption(option =>
                    option.setName('emojis')
                        .setDescription('The emoji(s) you want to borrow (separate multiple with spaces)')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('addtoserver')
                        .setDescription('Optionally add the emoji(s) to your server')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sticker')
                .setDescription('Steal a sticker from a specific message')
                .addStringOption(option =>
                    option.setName('messageid')
                        .setDescription('The ID of the message containing the sticker')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('addtoserver')
                        .setDescription('Optionally add the sticker to your server'))),
    category: 'Utility',
    async execute(interaction, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'emoji') {
            await handleEmojiSteal(interaction);
        } else if (subcommand === 'sticker') {
            await handleStickerSteal(interaction);
        }
    }
};

async function handleEmojiSteal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const input = interaction.options.getString('emojis');
    const addToServer = interaction.options.getBoolean('addtoserver');

    const emojiRegex = /<(a?):(\w+):(\d+)>/g;
    const emojis = [...input.matchAll(emojiRegex)];

    if (emojis.length === 0) {
        return interaction.editReply({ content: 'Please provide valid custom emojis.' });
    }

    const addedEmojis = [];
    const failedEmojis = [];

    for (const [fullEmoji, animated, name, id] of emojis) {
        const isAnimated = animated === 'a';
        const url = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? 'gif' : 'png'}`;

        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            let buffer = Buffer.from(response.data, 'binary');

            if (addToServer) {
                const originalSize = buffer.length;
                if (originalSize > 256 * 1024) {
                    buffer = await resizeImage(buffer, isAnimated);
                }

                const addedEmoji = await interaction.guild.emojis.create({
                    attachment: buffer,
                    name: name
                });
                addedEmojis.push(`${addedEmoji.toString()} (${name}) - Original: ${(originalSize / 1024).toFixed(2)}KB, Resized: ${(buffer.length / 1024).toFixed(2)}KB`);
            } else {
                addedEmojis.push(`${fullEmoji} - [${url}] (${(buffer.length / 1024).toFixed(2)}KB)`);
            }
        } catch (error) {
            console.error(`Error processing emoji:`, error.message);
            failedEmojis.push(`${fullEmoji} (${error.message})`);
        }
    }

    let replyContent = '';
    if (addedEmojis.length > 0) {
        replyContent += `Successfully ${addToServer ? 'added' : 'fetched'}:\n${addedEmojis.join('\n')}\n\n`;
    }
    if (failedEmojis.length > 0) {
        replyContent += `Failed to process:\n${failedEmojis.join('\n')}`;
    }

    await interaction.editReply({ content: replyContent || 'No emojis were processed successfully.' });
}

async function handleStickerSteal(interaction) {
    const messageId = interaction.options.getString('messageid');
    const addToServer = interaction.options.getBoolean('addtoserver');

    try {
        const message = await interaction.channel.messages.fetch(messageId);

        if (!message) {
            return interaction.reply({
                content: "Couldn't find a message with that ID in this channel.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const sticker = message.stickers.first();

        if (!sticker) {
            return interaction.reply({
                content: "The specified message doesn't contain a sticker.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const stickerUrl = sticker.url;
        const response = await axios.get(stickerUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');

        if (addToServer) {
            const addedSticker = await interaction.guild.stickers.create({
                file: buffer,
                name: sticker.name,
                tags: sticker.tags && sticker.tags.length > 0 ? sticker.tags.join(',') : 'stolen_sticker'
            });
            await interaction.reply({
                content: `Sticker "${sticker.name}" has been added to the server!`,
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: `Here's the sticker "${sticker.name}":`,
                files: [{ attachment: buffer, name: `${sticker.name}.png` }],
                flags: MessageFlags.Ephemeral,
            });
        }
    } catch (error) {
        console.error('Error processing sticker:', error);
        await interaction.reply({
            content: `Failed to process the sticker: ${error.message}`,
            flags: MessageFlags.Ephemeral,
        });
    }
}

async function resizeImage(buffer, isAnimated) {
    const maxSize = 256 * 1024;
    let quality = 100;
    let width = 128;
    let height = 128;
    let resizedBuffer;

    while (true) {
        try {
            if (isAnimated) {
                resizedBuffer = await sharp(buffer, { animated: true })
                    .resize(width, height, { fit: 'inside' })
                    .gif({ quality })
                    .toBuffer();
            } else {
                resizedBuffer = await sharp(buffer)
                    .resize(width, height, { fit: 'inside' })
                    .png({ quality })
                    .toBuffer();
            }

            if (resizedBuffer.length <= maxSize) {
                return resizedBuffer;
            }

            if (width > 32 || height > 32) {
                width = Math.max(32, Math.floor(width * 0.9));
                height = Math.max(32, Math.floor(height * 0.9));
            } else if (quality > 10) {
                quality = Math.max(10, quality - 5);
            } else {
                quality = Math.max(1, quality - 1);
            }

            if (width === 32 && height === 32 && quality === 1) {
                throw new Error(`Couldn't resize to under ${maxSize / 1024}KB`);
            }
        } catch (error) {
            console.error('Error in resizeImage:', error);
            throw new Error(`Failed to resize: ${error.message}`);
        }
    }
}