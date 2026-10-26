const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, ApplicationCommandOptionType, MessageFlags } = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader');

let commandCache = {
    data: null,
    timestamp: 0,
    maxAge: 5 * 60 * 1000,
    isBuilding: false
};

const PLACEHOLDER_REGEX = {
    botName: /{botName}/g,
    category: /{category}/g,
    user: /{user}/g,
    guild: /{guild}/g,
    userAvatar: /{user-avatar}/g,
    guildAvatar: /{guild-avatar}/g,
    command: /{command}/g,
    description: /{description}/g
};

function replacePlaceholders(text, placeholders) {
    if (!text) return '';
    
    let result = text;
    for (const [key, regex] of Object.entries(PLACEHOLDER_REGEX)) {
        const value = placeholders[key === 'userAvatar' ? 'userAvatar' : 
                                 key === 'guildAvatar' ? 'guildAvatar' : key];
        if (value) {
            result = result.replace(regex, value);
        }
    }
    return result;
}

function getAllCommands(client, useCache = true) {
    const now = Date.now();
    
    if (useCache && commandCache.data && (now - commandCache.timestamp) < commandCache.maxAge) {
        return commandCache.data;
    }

    if (commandCache.isBuilding) {
        return commandCache.data || { categories: {}, details: {} };
    }

    commandCache.isBuilding = true;

    try {
        const commands = new Map();
        const commandDetails = new Map();
        const commandArray = Array.from(client.slashCommands.values());

        for (const command of commandArray) {
            if (!command.data || typeof command.data.toJSON !== 'function') continue;
            
            const commandJSON = command.data.toJSON();
            const categoryName = command.category || 'Addon';
            const commandDesc = commandJSON.description || 'No description';

            if (!commands.has(categoryName)) {
                commands.set(categoryName, []);
            }

            const baseCommandDetail = {
                name: commandJSON.name,
                description: commandDesc,
                category: categoryName,
                usage: command.usage || `/${commandJSON.name}`,
                examples: command.examples || [],
                cooldown: command.cooldown || 0
            };

            commandDetails.set(commandJSON.name, baseCommandDetail);

            const displayParts = [`\`/${commandJSON.name}\` • ${commandDesc}`];
            
            if (commandJSON.options) {
                const subcommands = commandJSON.options.filter(option => option.type === 1);
                if (subcommands.length > 0) {
                    const subcommandDisplays = subcommands.map((subcommand, index) => {
                        const fullName = `${commandJSON.name} ${subcommand.name}`;
                        commandDetails.set(fullName, {
                            name: fullName,
                            description: subcommand.description || 'No description provided',
                            category: categoryName,
                            usage: `/${fullName}`,
                            parent: commandJSON.name
                        });
                        
                        return `  ┗ \`/${fullName}\` • ${subcommand.description || 'No description'}`;
                    });
                    
                    displayParts.push(...subcommandDisplays);
                }
            }

            commands.get(categoryName).push(displayParts.join('\n'));
        }

        const result = {
            categories: Object.fromEntries(commands),
            details: Object.fromEntries(commandDetails)
        };

        commandCache.data = result;
        commandCache.timestamp = now;
        
        return result;
    } finally {
        commandCache.isBuilding = false;
    }
}

function validateURL(url) {
    return url && url.trim().length > 0 && url !== 'null';
}

function addEmbedFields(embed, fields, placeholders = {}) {
    const cleanPlaceholders = Object.fromEntries(
        Object.entries(placeholders).filter(([_, value]) => value != null && value !== 'null')
    );

    if (fields.Title && fields.Title.trim()) {
        embed.setTitle(replacePlaceholders(fields.Title, cleanPlaceholders));
    }
    if (fields.Description && fields.Description.length > 0) {
        embed.setDescription(fields.Description.map(line => replacePlaceholders(line, cleanPlaceholders)).join('\n'));
    }
    if (fields.Color && fields.Color.trim()) {
        embed.setColor(fields.Color);
    }
    if (fields.Thumbnail) {
        const thumbnailUrl = replacePlaceholders(fields.Thumbnail, cleanPlaceholders);
        if (validateURL(thumbnailUrl)) {
            embed.setThumbnail(thumbnailUrl);
        }
    }
    if (fields.Image) {
        const imageUrl = replacePlaceholders(fields.Image, cleanPlaceholders);
        if (validateURL(imageUrl)) {
            embed.setImage(imageUrl);
        }
    }
    if (fields.Footer && fields.Footer.Text && fields.Footer.Text.trim()) {
        embed.setFooter({
            text: replacePlaceholders(fields.Footer.Text, cleanPlaceholders),
            iconURL: validateURL(fields.Footer.Icon) ? replacePlaceholders(fields.Footer.Icon, cleanPlaceholders) : undefined
        });
    }
    if (fields.Author && fields.Author.Text && fields.Author.Text.trim()) {
        const authorName = replacePlaceholders(fields.Author.Text, cleanPlaceholders);
        if (authorName.trim()) {
            embed.setAuthor({
                name: authorName,
                iconURL: validateURL(fields.Author.Icon) ? replacePlaceholders(fields.Author.Icon, cleanPlaceholders) : undefined
            });
        }
    }
    embed.setTimestamp();
}

function createCommandDetailsEmbed(commandInfo, placeholders, lang) {
    const embed = new EmbedBuilder()
        .setTitle(`\`/${commandInfo.name}\``)
        .setDescription(`**Description**\n${commandInfo.description}`)
        .setColor(lang.HelpCommand.CategoryEmbed.Color || '#5865F2')
        .setFooter({
            text: replacePlaceholders(lang.HelpCommand.CommandDetailsEmbed?.Footer?.Text || 'Use the back button to return', placeholders),
            iconURL: validateURL(lang.HelpCommand.CommandDetailsEmbed?.Footer?.Icon) 
                ? replacePlaceholders(lang.HelpCommand.CommandDetailsEmbed?.Footer?.Icon, placeholders) 
                : undefined
        })
        .setTimestamp();

    const fields = [];
    
    fields.push({ name: '📁 Category', value: commandInfo.category, inline: true });
    
    if (commandInfo.cooldown) {
        fields.push({ name: '⏱️ Cooldown', value: `${commandInfo.cooldown}s`, inline: true });
    }
    
    if (commandInfo.parent) {
        fields.push({ name: '🔗 Parent Command', value: `\`/${commandInfo.parent}\``, inline: true });
    }

    fields.push({ name: '💡 Usage', value: `\`\`\`${commandInfo.usage}\`\`\``, inline: false });

    if (commandInfo.examples && commandInfo.examples.length > 0) {
        fields.push({ 
            name: '📝 Examples', 
            value: commandInfo.examples.map(ex => `\`${ex}\``).join('\n'),
            inline: false
        });
    }

    embed.addFields(fields);

    return embed;
}

function formatCommandOption(cmdName, description) {
    const truncatedDesc = description.length > 50 
        ? `${description.substring(0, 50)}...`
        : description;
    return {
        name: `/${cmdName} - ${truncatedDesc}`,
        value: cmdName
    };
}

function getCommandSuggestions(input, commandDetails) {
    const entries = Object.entries(commandDetails);
    
    if (!input || input.trim() === '') {
        return entries
            .filter(([_, info]) => !info.parent)
            .slice(0, 25)
            .map(([cmdName, cmdInfo]) => formatCommandOption(cmdName, cmdInfo.description));
    }
    
    const lowercaseInput = input.toLowerCase();
    const matchCategories = [[], [], []];
    
    for (const [cmdName, cmdInfo] of entries) {
        const lowerCmdName = cmdName.toLowerCase();
        const option = formatCommandOption(cmdName, cmdInfo.description);
        
        if (lowerCmdName === lowercaseInput) {
            matchCategories[0].push(option);
        } else if (lowerCmdName.startsWith(lowercaseInput)) {
            matchCategories[1].push(option);
        } else if (lowerCmdName.includes(lowercaseInput)) {
            matchCategories[2].push(option);
        }
        
        if (matchCategories[0].length + matchCategories[1].length + matchCategories[2].length >= 25) {
            break;
        }
    }
    
    return matchCategories.flat().slice(0, 25);
}

function preWarmCache(client) {
    console.log('[HELP] Pre-warming cache...');
    if (client && client.slashCommands && client.commandsReady) {
        console.log(`[HELP] Client has ${client.slashCommands.size} commands`);
        try {
            getAllCommands(client, false);
            console.log('[HELP] Cache warmed successfully');
        } catch (error) {
            console.error('Error pre-warming help command cache:', error);
        }
    } else {
        console.log('[HELP] Cannot warm cache - client not ready or no commands');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View a list of all the commands')
        .addStringOption(option => 
            option.setName('command')
                .setDescription('Get help for a specific command')
                .setRequired(false)
                .setAutocomplete(true)
        ),
    category: 'General',
    preWarmCache,
    
        async autocomplete(interaction, client) {
        const startTime = Date.now();
        
        try {
            if (!client || !client.slashCommands || !client.commandsReady) {
                return await interaction.respond([]);
            }

            const focusedOption = interaction.options.getFocused(true);
            if (focusedOption.name !== 'command') {
                return await interaction.respond([]);
            }

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 2500)
            );

            const autocompletePromise = (async () => {
                const commandData = getAllCommands(client, true);
                if (!commandData || !commandData.details) {
                    return [];
                }
                const choices = getCommandSuggestions(focusedOption.value, commandData.details);
                return choices;
            })();

            const choices = await Promise.race([autocompletePromise, timeoutPromise]);
            
            if (Date.now() - startTime > 2500) {
                return await interaction.respond([]);
            }
            
            await interaction.respond(choices);
        } catch (error) {
            if (error.message === 'Timeout') {
                console.warn('Autocomplete timeout - responding with empty array');
            } else {
                console.error('Error in autocomplete handler:', error);
            }
            
            try {
                if (!interaction.responded && Date.now() - startTime < 2800) {
                    await interaction.respond([]);
                }
            } catch (respondError) {
            }
        }
    },
    
    async execute(interaction, client) {
        try {
            if (!client.commandsReady && (!client.slashCommands || client.slashCommands.size === 0)) {
                return await interaction.reply({
                    content: 'Commands are still registering. Please try again in a few moments.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            const config = getConfig();
            const lang = getLang();
            
            const user = interaction.user.username;
            const userAvatar = interaction.user.displayAvatarURL();
            const guild = interaction.guild.name;
            const guildAvatar = interaction.guild.iconURL();

            const placeholders = {
                botName: config.BotName,
                user,
                guild,
                userAvatar,
                guildAvatar
            };

            const { categories: commandCategories, details: commandDetails } = getAllCommands(client);

            const commandName = interaction.options.getString('command');
            if (commandName) {
                const commandInfo = commandDetails[commandName] || Object.values(commandDetails).find(cmd => 
                    cmd.name.toLowerCase() === commandName.toLowerCase()
                );
                
                if (!commandInfo) {
                    return await interaction.editReply({
                        content: `Command \`/${commandName}\` not found. Use \`/help\` to see all available commands.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const commandEmbed = createCommandDetailsEmbed(commandInfo, placeholders, lang);
                return await interaction.editReply({ embeds: [commandEmbed] });
            }

            const categoryOptions = Object.keys(commandCategories).map(category => ({
                label: lang.HelpCommand.Categories[category]?.Name || category,
                value: category,
                emoji: lang.HelpCommand.Categories[category]?.Emoji || '❓',
                description: lang.HelpCommand.Categories[category]?.Description || 'Various commands'
            }));

            const helpEmbed = new EmbedBuilder();
            addEmbedFields(helpEmbed, lang.HelpCommand.MainEmbed, placeholders);

            if (helpEmbed.data.description) {
                helpEmbed.setDescription(helpEmbed.data.description + '\n\n*Tip: Use `/help command:name` to view details about a specific command.*');
            }

            const baseRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('category_select')
                        .setPlaceholder(lang.HelpCommand.CategorySelectPlaceholder)
                        .addOptions(categoryOptions)
                );

            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_button')
                        .setLabel(lang.HelpCommand.BackButtonLabel)
                        .setStyle(ButtonStyle.Primary)
                );

            const response = await interaction.editReply({ 
                embeds: [helpEmbed], 
                components: [baseRow] 
            });

            const filter = i => i.user.id === interaction.user.id;
            
            const collector = response.createMessageComponentCollector({ 
                filter, 
                time: 300000
            });
            
            collector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === 'category_select') {
                        const selectedCategory = componentInteraction.values[0];
                        const commands = commandCategories[selectedCategory].join('\n');
                        
                        const categoryEmbed = new EmbedBuilder();
                        addEmbedFields(categoryEmbed, {
                            ...lang.HelpCommand.CategoryEmbed,
                            Title: replacePlaceholders(lang.HelpCommand.CategoryEmbed.Title, {
                                ...placeholders,
                                category: lang.HelpCommand.Categories[selectedCategory]?.Name || selectedCategory
                            }),
                            Description: [commands]
                        }, placeholders);

                        await componentInteraction.update({ 
                            embeds: [categoryEmbed], 
                            components: [backButton] 
                        });
                    }
                    
                    if (componentInteraction.isButton() && componentInteraction.customId === 'back_button') {
                        await componentInteraction.update({ 
                            embeds: [helpEmbed], 
                            components: [baseRow] 
                        });
                    }
                } catch (error) {
                    console.error('Error handling component interaction:', error);
                    try {
                        if (componentInteraction.deferred || componentInteraction.replied) {
                            await componentInteraction.editReply({ 
                                content: 'There was an error processing your selection. Please try again.', 
                                components: [] 
                            });
                        } else {
                            await componentInteraction.reply({ 
                                content: 'There was an error processing your selection. Please try again.', 
                                flags: MessageFlags.Ephemeral 
                            });
                        }
                    } catch (replyError) {
                        console.error('Failed to send error message:', replyError);
                    }
                }
            });
            
            collector.on('end', async () => {
                try {
                    await interaction.editReply({ components: [] });
                } catch (error) {
                    if (error.code !== 10008 && error.code !== 10062) {
                        console.error('Failed to remove components after timeout:', error);
                    }
                }
            });

        } catch (error) {
            console.error(`An error occurred while executing the help command: ${error.message}`);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: 'There was an error trying to execute that command! Please try again later.', components: [] });
                } else {
                    await interaction.reply({ content: 'There was an error trying to execute that command! Please try again later.', flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }
};