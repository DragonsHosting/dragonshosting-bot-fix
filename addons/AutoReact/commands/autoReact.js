const AutoReact = require('../models/autoReact');
const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoreact')
        .setDescription('Manage AutoReact settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new AutoReact')
                .addStringOption(option =>
                    option.setName('keyword')
                        .setDescription('The keyword to react to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('The emoji to react with')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an existing AutoReact')
                .addStringOption(option =>
                    option.setName('identifier')
                        .setDescription('The keyword or ID of the AutoReact to remove')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all current AutoReacts')
    ),
    category: 'Utility',
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guild.id;
        let autoReactData = await AutoReact.findOne({ guildId });

        if (!autoReactData) {
            autoReactData = new AutoReact({ guildId, reactions: [] });
        }

        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'add') {
            const keyword = interaction.options.getString('keyword');
            const emoji = interaction.options.getString('emoji');

            const validEmoji = validateEmoji(interaction, emoji);
            if (!validEmoji) {
                return interaction.reply({ content: `? The emoji "${emoji}" is not valid or not accessible by the bot. Please try another emoji.`, flags: MessageFlags.Ephemeral });
            }

            const reactionCount = autoReactData.reactions.length;
            const newId = reactionCount + 1;

            autoReactData.reactions.push({
                id: newId,
                keyword,
                emoji,
                whitelistRoles: [],
                whitelistChannels: []
            });

            await autoReactData.save();

            const embed = new EmbedBuilder()
                .setTitle('AutoReact Added')
                .setDescription('A new AutoReact has been successfully added.')
                .addFields(
                    { name: 'ID', value: `${newId}`, inline: true },
                    { name: 'Keyword', value: keyword, inline: true },
                    { name: 'Emoji', value: emoji, inline: true }
                )
                .setColor('#57F287');

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (subCommand === 'remove') {
            const identifier = interaction.options.getString('identifier');
            let found = false;

            if (isNaN(identifier)) {
                autoReactData.reactions = autoReactData.reactions.filter(reaction => reaction.keyword.toLowerCase() !== identifier.toLowerCase());
                found = true;
            } else {
                const id = parseInt(identifier);
                const beforeLength = autoReactData.reactions.length;
                autoReactData.reactions = autoReactData.reactions.filter(reaction => reaction.id !== id);
                found = beforeLength !== autoReactData.reactions.length;
            }

            if (found) {
                await autoReactData.save();
                const embed = new EmbedBuilder()
                    .setTitle('AutoReact Removed')
                    .setDescription(`The AutoReact with identifier "${identifier}" has been successfully removed.`)
                    .setColor('#ED4245');

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                return interaction.reply({ content: `? No AutoReact found with the identifier "${identifier}". Please check and try again.`, flags: MessageFlags.Ephemeral });
            }

        } else if (subCommand === 'list') {
            if (autoReactData.reactions.length === 0) {
                return interaction.reply({ content: 'No AutoReacts are set.', flags: MessageFlags.Ephemeral });
            }

            const allReactions = await Promise.all(
                autoReactData.reactions.map(async (reaction) => {
                    const isValid = validateEmoji(interaction, reaction.emoji);
                    return {
                        id: reaction.id,
                        keyword: reaction.keyword,
                        emoji: reaction.emoji,
                        isValid
                    };
                })
            );

            const itemsPerPage = 8;
            const totalPages = Math.ceil(allReactions.length / itemsPerPage);

            const generateEmbed = (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageReactions = allReactions.slice(start, end);

                const fields = pageReactions.flatMap(reaction => [
                    { name: `ID: ${reaction.id}`, value: '\u200b', inline: true },
                    { name: `Keyword: "${reaction.keyword}"`, value: `Emoji: "${reaction.emoji}"`, inline: true },
                    { name: `Status`, value: reaction.isValid ? '✅ Valid' : '❌ Invalid/Inaccessible', inline: true }
                ]);

                return new EmbedBuilder()
                    .setTitle('Auto Reacts List')
                    .setDescription('Here are the currently configured AutoReacts for this server:')
                    .addFields(fields)
                    .setColor('#5865F2')
                    .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /autoreact add to add more reactions.` });
            };

            const generateButtons = (page) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('autoreact_first')
                        .setEmoji('⏮️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('autoreact_prev')
                        .setEmoji('◀️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('autoreact_next')
                        .setEmoji('▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('autoreact_last')
                        .setEmoji('⏭️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
            };

            let currentPage = 0;

            if (totalPages === 1) {
                return interaction.reply({ embeds: [generateEmbed(0)], flags: MessageFlags.Ephemeral });
            }

            const message = await interaction.reply({ 
                embeds: [generateEmbed(0)], 
                components: [generateButtons(0)], 
                flags: MessageFlags.Ephemeral,
                fetchReply: true 
            });

            const collector = message.createMessageComponentCollector({ time: 120000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'You cannot use these buttons.', flags: MessageFlags.Ephemeral });
                }

                switch (i.customId) {
                    case 'autoreact_first':
                        currentPage = 0;
                        break;
                    case 'autoreact_prev':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'autoreact_next':
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                        break;
                    case 'autoreact_last':
                        currentPage = totalPages - 1;
                        break;
                }

                await i.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
            });

            collector.on('end', async () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('autoreact_first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('autoreact_prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('autoreact_next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('autoreact_last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        }
    },
};

function validateEmoji(interaction, emoji) {
    const customEmoji = emoji.match(/<:\w+:(\d+)>/);
    if (customEmoji) {
        const emojiId = customEmoji[1];
        const guildEmoji = interaction.client.emojis.cache.get(emojiId);
        if (guildEmoji && guildEmoji.available) {
            return true;
        } else {
            return false;
        }
    }

    const unicodeEmojiRegex = /\p{Emoji}/u;
    if (unicodeEmojiRegex.test(emoji)) {
        return true;
    }

    return false;
}