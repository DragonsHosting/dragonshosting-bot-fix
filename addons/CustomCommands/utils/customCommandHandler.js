const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, REST, Routes } = require("discord.js");
const moment = require('moment-timezone');
const { getConfig } = require('../../../utils/core/configLoader');
const CustomCommand = require('../models/CustomCommand');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const config = getConfig();

function removeTags(text) {
    text = text.replace(/@everyone/gi, "everyone").replace(/@here/gi, "here");
    text = text.replace(/<@&\d+>/g, "(role mention removed)");
    text = text.replace(/@(?!everyone|here)(\w+)/gi, "$1");
    return text;
}

function replaceCustomCommandPlaceholders(template, message, placeholders = {}) {
    if (!template) {
        return '\u200b';
    }

    const defaultPlaceholders = {
        guildName: message.guild.name,
        guildId: message.guild.id,
        userName: message.author.username,
        userId: message.author.id,
        userMention: message.author.toString(),
        channelName: message.channel.name,
        channelId: message.channel.id,
        channelMention: message.channel.toString(),
        commandName: placeholders.commandName || '',
        longTime: moment().tz(config.Timezone).format('MMMM Do YYYY'),
        shortTime: moment().tz(config.Timezone).format("HH:mm"),
        memberCount: message.guild.memberCount
    };

    const allPlaceholders = { ...defaultPlaceholders, ...placeholders };

    return Object.keys(allPlaceholders).reduce((acc, key) => {
        const regex = new RegExp(`{${key}}`, 'gi');
        return acc.replace(regex, allPlaceholders[key] || '');
    }, template);
}

function createButtons(buttonsConfig, commandContext) {
    const buttons = [];

    buttonsConfig.forEach((buttonConfig, index) => {
        const button = new ButtonBuilder()
            .setLabel(buttonConfig.Name);

        if (buttonConfig.Emoji) {
            button.setEmoji(buttonConfig.Emoji);
        }

        if (buttonConfig.Type === "REPLY") {
            button.setCustomId(`reply_${commandContext}_${index}`);
            button.setStyle(ButtonStyle[buttonConfig.Style] || ButtonStyle.Primary);
        } else if (buttonConfig.Type === "LINK") {
            button.setStyle(ButtonStyle.Link)
                  .setURL(buttonConfig.Link);
        } else {
            console.error(`Unknown button type: ${buttonConfig.Type}`);
        }

        buttons.push(button);
    });

    return buttons.length > 0 ? new ActionRowBuilder().addComponents(buttons) : null;
}

function normalizeDbCommand(dbCommand) {
    return {
        type: dbCommand.type,
        text: dbCommand.text,
        Embed: {
            Title: dbCommand.embed?.title,
            Description: dbCommand.embed?.description || [],
            Color: dbCommand.embed?.color,
            Footer: {
                Text: dbCommand.embed?.footer?.text,
                Icon: dbCommand.embed?.footer?.icon
            },
            Author: {
                Text: dbCommand.embed?.author?.text,
                Icon: dbCommand.embed?.author?.icon
            },
            Thumbnail: dbCommand.embed?.thumbnail,
            Image: dbCommand.embed?.image,
            Fields: (dbCommand.embed?.fields || []).map(f => ({
                Name: f.name,
                Value: f.value,
                Inline: f.inline
            }))
        },
        Roles: {
            Whitelist: dbCommand.roles?.whitelist || []
        },
        Options: {
            DeleteTriggerMessage: dbCommand.options?.deleteTriggerMessage,
            ReplyToUser: dbCommand.options?.replyToUser
        },
        Buttons: (dbCommand.buttons || []).map(b => ({
            Type: b.type,
            Name: b.name,
            Emoji: b.emoji,
            Style: b.style,
            Link: b.link,
            Reply: b.reply ? {
                Ephemeral: b.reply.ephemeral,
                Text: b.reply.text,
                Embed: b.reply.embed ? {
                    Title: b.reply.embed.title,
                    Description: b.reply.embed.description || [],
                    Color: b.reply.embed.color,
                    Footer: { Text: b.reply.embed.footer?.text, Icon: b.reply.embed.footer?.icon },
                    Author: { Text: b.reply.embed.author?.text, Icon: b.reply.embed.author?.icon },
                    Thumbnail: b.reply.embed.thumbnail,
                    Image: b.reply.embed.image,
                    Fields: (b.reply.embed.fields || []).map(f => ({ Name: f.name, Value: f.value, Inline: f.inline }))
                } : null
            } : null
        })),
        _isFromDb: true,
        _id: dbCommand._id
    };
}

async function processCustomCommands(client, message) {
    try {        
        if (!config) {
            return;
        }
        
        if (message.author.bot || !message.content.startsWith(config.CommandsPrefix)) {
            return;
        }

        const args = message.content.slice(config.CommandsPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        let command = null;
        
        if (config.CommandsEnabled) {
            command = config.CustomCommands?.[commandName];
        }
        
        if (!command) {
            try {
                const dbCommand = await CustomCommand.findOne({ 
                    guildId: message.guild.id, 
                    name: commandName.toLowerCase(),
                    enabled: true 
                }).lean();
                
                if (dbCommand) {
                    command = normalizeDbCommand(dbCommand);
                }
            } catch (err) {
                console.error('Error fetching custom command from database:', err);
            }
        }
        
        if (!command) return;
        
        const memberRoles = message.member.roles.cache.map(role => role.id);

        let isWhitelisted = true;
        
        if (command.Roles && Array.isArray(command.Roles.Whitelist) && command.Roles.Whitelist.length > 0) {
            const validRoles = command.Roles.Whitelist.filter(roleId => roleId && roleId !== "ROLE_ID");
            
            if (validRoles.length > 0) {
                isWhitelisted = validRoles.some(roleId => memberRoles.includes(roleId));
            }
        }

        if (!isWhitelisted) {
            return;
        }

        const useComponentsV2 = command.type === "COMPONENTS_V2" && command.ComponentsV2?.Components;

        if (useComponentsV2) {
            try {
                const placeholders = {
                    guildName: message.guild.name,
                    guildId: message.guild.id,
                    guildIcon: message.guild.iconURL({ format: 'png', dynamic: true, size: 4096 }) || '',
                    userName: message.author.username,
                    userId: message.author.id,
                    userMention: message.author.toString(),
                    userIcon: message.author.displayAvatarURL({ format: 'png', dynamic: true, size: 4096 }),
                    channelName: message.channel.name,
                    channelId: message.channel.id,
                    channelMention: message.channel.toString(),
                    commandName: commandName,
                    longTime: moment().tz(config.Timezone).format('MMMM Do YYYY'),
                    shortTime: moment().tz(config.Timezone).format("HH:mm"),
                    memberCount: message.guild.memberCount
                };

                const replacer = createSimplePlaceholderReplacer(placeholders);
                const componentsPayload = buildComponentsV2Payload(command.ComponentsV2, replacer);

                if (componentsPayload) {
                    const rest = new REST({ version: '10' }).setToken(message.client.token);
                    await rest.post(
                        Routes.channelMessages(message.channel.id),
                        { body: { components: componentsPayload, flags: 32768 } }
                    );

                    if (command.Options?.DeleteTriggerMessage) {
                        try {
                            await message.delete();
                        } catch (error) {
                            console.error(`Error deleting message: ${error}`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error sending ComponentsV2 message:', error);
            }
            return;
        }

        let responseOptions = {};
        if (command.type === "EMBED" || command.type === "BOTH") {
            const embed = new EmbedBuilder()
                .setColor(command.Embed?.Color || null);

            if (command.Embed?.Title) {
                embed.setTitle(replaceCustomCommandPlaceholders(command.Embed.Title, message, { commandName }));
            }

            if (command.Embed?.Description && command.Embed.Description.length > 0) {
                const description = command.Embed.Description.map(line => 
                    replaceCustomCommandPlaceholders(line, message, { commandName })
                ).join("\n");
                embed.setDescription(description);
            }

            if (command.Embed?.Footer && command.Embed.Footer.Text) {
                const footerText = replaceCustomCommandPlaceholders(command.Embed.Footer.Text, message, { commandName });
                const footerIcon = command.Embed.Footer.Icon ? 
                    replaceCustomCommandPlaceholders(command.Embed.Footer.Icon, message, { commandName }) : 
                    undefined;
                embed.setFooter({ text: footerText, iconURL: footerIcon });
            }

            if (command.Embed?.Author && command.Embed.Author.Text) {
                const authorName = replaceCustomCommandPlaceholders(command.Embed.Author.Text, message, { commandName });
                const authorIcon = command.Embed.Author.Icon ? 
                    replaceCustomCommandPlaceholders(command.Embed.Author.Icon, message, { commandName }) : 
                    undefined;
                embed.setAuthor({ name: authorName, iconURL: authorIcon });
            }

            if (command.Embed?.Thumbnail) {
                embed.setThumbnail(replaceCustomCommandPlaceholders(command.Embed.Thumbnail, message, { commandName }));
            }

            if (command.Embed?.Image) {
                embed.setImage(replaceCustomCommandPlaceholders(command.Embed.Image, message, { commandName }));
            }

            if (command.Embed?.Fields) {
                command.Embed.Fields.forEach(field => {
                    if (field.Name && field.Value) {
                        const fieldName = replaceCustomCommandPlaceholders(field.Name, message, { commandName });
                        const fieldValue = replaceCustomCommandPlaceholders(field.Value, message, { commandName });
                        embed.addFields({ name: fieldName, value: fieldValue, inline: field.Inline ?? false });
                    }
                });
            }

            responseOptions.embeds = [embed];

            if (command.Buttons && Array.isArray(command.Buttons)) {
                const buttonContext = command._isFromDb ? `db_${command._id}_${commandName}` : commandName;
                const buttons = createButtons(command.Buttons, buttonContext);
                if (buttons) {
                    responseOptions.components = [buttons];
                }
            }
        }

        if (command.type === "TEXT" || command.type === "BOTH") {
            if (command.text) {
                responseOptions.content = replaceCustomCommandPlaceholders(command.text, message, { commandName });
            }
        }

        if (!responseOptions.content && (!responseOptions.embeds || responseOptions.embeds.length === 0)) {
            return;
        }

        try {
            if (command.Options?.ReplyToUser) {
                await message.reply(responseOptions);
            } else {
                await message.channel.send(responseOptions);
            }

            if (command.Options?.DeleteTriggerMessage) {
                try {
                    await message.delete();
                } catch (error) {
                    console.error(`Error deleting message: ${error}`);
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    } catch (error) {
        console.error('Error processing custom commands:', error);
    }
}

async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;
    
    const [action, ...contextParts] = interaction.customId.split('_');

    if (action === 'reply') {
        try {
            const buttonIndex = parseInt(contextParts.pop());
            const commandPath = contextParts;

            if (!commandPath.length) {
                console.error('Invalid command path');
                await interaction.reply({ content: 'Invalid command configuration', flags: MessageFlags.Ephemeral });
                return;
            }

            let currentConfig;
            let isDbCommand = commandPath[0] === 'db';
            
            if (isDbCommand) {
                const commandId = commandPath[1];
                try {
                    const dbCommand = await CustomCommand.findById(commandId).lean();
                    if (!dbCommand) {
                        await interaction.reply({ content: 'Command configuration not found', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    currentConfig = normalizeDbCommand(dbCommand);
                    commandPath.splice(0, 3);
                } catch (err) {
                    console.error('Error fetching db command for button:', err);
                    await interaction.reply({ content: 'Error loading command', flags: MessageFlags.Ephemeral });
                    return;
                }
            } else {
                currentConfig = config.CustomCommands[commandPath[0]];
                
                if (!currentConfig) {
                    console.error('Command not found:', commandPath[0]);
                    await interaction.reply({ content: 'Command configuration not found', flags: MessageFlags.Ephemeral });
                    return;
                }
            }

            const startIndex = isDbCommand ? 0 : 1;
            for (let i = startIndex; i < commandPath.length; i += 2) {
                if (commandPath[i] === 'reply') {
                    const prevButtonIndex = parseInt(commandPath[i + 1]);
                    if (!currentConfig.Buttons?.[prevButtonIndex]?.Reply) {
                        console.error('Invalid button configuration at depth:', i);
                        await interaction.reply({ content: 'Invalid button configuration', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    currentConfig = currentConfig.Buttons[prevButtonIndex].Reply;
                }
            }

            const buttonConfig = currentConfig.Buttons?.[buttonIndex];
            
            if (!buttonConfig || buttonConfig.Type !== "REPLY" || !buttonConfig.Reply) {
                console.error('Invalid button configuration:', { buttonIndex, config: buttonConfig });
                await interaction.reply({ content: 'Button configuration not found', flags: MessageFlags.Ephemeral });
                return;
            }

            const replyConfig = buttonConfig.Reply;

            let responseOptions = {
                ephemeral: replyConfig.Ephemeral ?? false
            };

            if (replyConfig.Embed) {
                const embed = new EmbedBuilder();

                if (replyConfig.Embed.Color) {
                    embed.setColor(replyConfig.Embed.Color);
                }

                if (replyConfig.Embed.Title) {
                    embed.setTitle(replyConfig.Embed.Title);
                }

                if (replyConfig.Embed.Description) {
                    const description = Array.isArray(replyConfig.Embed.Description) 
                        ? replyConfig.Embed.Description.join('\n')
                        : replyConfig.Embed.Description;
                    embed.setDescription(description);
                }

                if (replyConfig.Embed.Footer?.Text) {
                    embed.setFooter({
                        text: replyConfig.Embed.Footer.Text,
                        iconURL: replyConfig.Embed.Footer.Icon
                    });
                }

                if (replyConfig.Embed.Author?.Text) {
                    embed.setAuthor({
                        name: replyConfig.Embed.Author.Text,
                        iconURL: replyConfig.Embed.Author.Icon,
                        url: replyConfig.Embed.Author.URL
                    });
                }

                if (replyConfig.Embed.Image) {
                    embed.setImage(replyConfig.Embed.Image);
                }

                if (replyConfig.Embed.Thumbnail) {
                    embed.setThumbnail(replyConfig.Embed.Thumbnail);
                }

                if (replyConfig.Embed.Timestamp) {
                    embed.setTimestamp();
                }

                if (replyConfig.Embed.Fields?.length > 0) {
                    replyConfig.Embed.Fields.forEach(field => {
                        if (field.Name && field.Value) {
                            embed.addFields({
                                name: field.Name,
                                value: field.Value,
                                inline: field.Inline ?? false
                            });
                        }
                    });
                }

                responseOptions.embeds = [embed];
            }

            if (replyConfig.Text) {
                responseOptions.content = replyConfig.Text;
            }

            if (replyConfig.Buttons?.length > 0) {
                const fullPath = [...contextParts, 'reply', buttonIndex].join('_');
                const buttons = createButtons(replyConfig.Buttons, fullPath);
                if (buttons) {
                    responseOptions.components = [buttons];
                }
            }

            if (!responseOptions.content && (!responseOptions.embeds || responseOptions.embeds.length === 0)) {
                responseOptions.content = "No content available for this option.";
            }

            if (interaction.replied) {
                await interaction.followUp(responseOptions);
            } else {
                await interaction.reply(responseOptions);
            }

        } catch (error) {
            console.error('Error handling button interaction:', error);
            if (!interaction.replied) {
                await interaction.reply({ 
                    content: 'An error occurred while processing your request.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    }
}

module.exports = { 
    processCustomCommands, 
    handleButtonInteraction, 
    createButtons,
    removeTags,
    replaceCustomCommandPlaceholders
};