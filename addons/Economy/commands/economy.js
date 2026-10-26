const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const fs = require('fs');
const yaml = require('js-yaml');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');

const config = getConfig();
const lang = getLang();
const { replacePlaceholders } = require('./Utility/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Economy administration commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Give money to a user')
                .addUserOption(option => option.setName('user').setDescription('The user to give money to').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('The amount of money to give').setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Specify whether to give to balance, bank, or both')
                        .setRequired(true)
                        .addChoices(
                            { name: 'balance', value: 'balance' },
                            { name: 'bank', value: 'bank' },
                            { name: 'both', value: 'both' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('take')
                .setDescription('Take money from a user')
                .addUserOption(option => option.setName('user').setDescription('The user to take money from').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('The amount of money to take').setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Specify whether to take from balance, bank, or both')
                        .setRequired(true)
                        .addChoices(
                            { name: 'balance', value: 'balance' },
                            { name: 'bank', value: 'bank' },
                            { name: 'both', value: 'both' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a user\'s balance or bank')
                .addUserOption(option => option.setName('user').setDescription('The user to set the balance/bank for').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('The new balance/bank amount').setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Specify whether to set balance, bank, or both')
                        .setRequired(true)
                        .addChoices(
                            { name: 'balance', value: 'balance' },
                            { name: 'bank', value: 'bank' },
                            { name: 'both', value: 'both' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset all users\' economy data in the server')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Specify whether to reset balance, bank, or both')
                        .setRequired(true)
                        .addChoices(
                            { name: 'balance', value: 'balance' },
                            { name: 'bank', value: 'bank' },
                            { name: 'both', value: 'both' }
                        )
                )
        ),
    category: 'Economy',

    async performBatchReset(interaction, type, totalUsers) {
        const BATCH_SIZE = 100;
        const updateQuery = {};
        
        if (type === 'balance' || type === 'both') {
            updateQuery.balance = 0;
        }
        if (type === 'bank' || type === 'both') {
            updateQuery.bank = 0;
        }

        let processedCount = 0;
        let batchCount = 0;
        const startTime = Date.now();

        try {
            while (processedCount < totalUsers) {
                const users = await User.find(
                    { guildId: interaction.guild.id },
                    { _id: 1 }
                ).skip(processedCount).limit(BATCH_SIZE);

                if (users.length === 0) break;

                const userIds = users.map(user => user._id);
                
                const result = await User.updateMany(
                    { _id: { $in: userIds } },
                    { 
                        $set: updateQuery,
                        $push: {
                            transactionLogs: {
                                $each: [{
                                    type: 'admin-reset',
                                    amount: 0,
                                    resetType: type,
                                    adminId: interaction.user.id,
                                    timestamp: new Date()
                                }],
                                $slice: -50
                            }
                        }
                    },
                    { writeConcern: { w: 'majority', j: true } }
                );

                processedCount += result.modifiedCount;
                batchCount++;

                if (batchCount % 5 === 0 || processedCount >= totalUsers) {
                    const progress = Math.min(100, Math.round((processedCount / totalUsers) * 100));
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    
                    await interaction.editReply({
                        content: `🔄 Processing reset... ${progress}% complete (${processedCount}/${totalUsers} users) - ${elapsed}s elapsed`,
                        embeds: [],
                        components: []
                    }).catch(console.error);
                }

                if (users.length < BATCH_SIZE) break;
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Economy Reset Complete')
                .setDescription(`Successfully reset **${type}** for **${processedCount}** users in this server.`)
                .addFields([
                    { name: 'Reset Type', value: type.charAt(0).toUpperCase() + type.slice(1), inline: true },
                    { name: 'Users Affected', value: processedCount.toString(), inline: true },
                    { name: 'Time Taken', value: `${elapsed}s`, inline: true },
                    { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Batches Processed', value: batchCount.toString(), inline: true },
                    { name: 'Average Speed', value: `${Math.round(processedCount / elapsed)} users/s`, inline: true }
                ])
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({
                content: '',
                embeds: [resultEmbed],
                components: []
            });

        } catch (error) {
            console.error('Batch reset error:', error);
            throw new Error(`Database operation failed after processing ${processedCount}/${totalUsers} users: ${error.message}`);
        }
    },
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const type = interaction.options.getString('type');
        const adminRoles = config.Economy.administrator;
        const memberRoles = interaction.member.roles.cache.map(role => role.id);

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
            !memberRoles.some(role => adminRoles.includes(role))) {
            return interaction.reply({ content: lang.Economy?.Error?.NoPermission || "You don't have permission to use this command.", flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'reset') {
            await interaction.deferReply({ ephemeral: true });

            const userCount = await User.countDocuments({ guildId: interaction.guild.id });
            
            if (userCount === 0) {
                const noUsersEmbed = new EmbedBuilder()
                    .setDescription('No users found with economy data in this server.')
                    .setColor('#FFA500');

                return await interaction.editReply({
                    embeds: [noUsersEmbed]
                });
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Economy Reset Confirmation')
                .setDescription(`Are you sure you want to reset ${type === 'both' ? 'all balances and bank' : type} for **${userCount}** users in this server?\n\nThis action cannot be undone!`)
                .setColor('#FFA500');

            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirm_reset_${interaction.user.id}_${Date.now()}`)
                .setLabel('Confirm Reset')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId(`cancel_reset_${interaction.user.id}_${Date.now()}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && (i.customId.includes('confirm_reset') || i.customId.includes('cancel_reset')),
                time: 60000,
                max: 1
            });

            collector.on('collect', async (confirmation) => {
                try {
                    await confirmation.deferUpdate();

                    if (confirmation.customId.startsWith('cancel_reset')) {
                        await interaction.editReply({
                            content: 'Reset cancelled.',
                            embeds: [],
                            components: []
                        });
                        return;
                    }

                    if (confirmation.customId.startsWith('confirm_reset')) {
                        await interaction.editReply({
                            content: '🔄 Processing reset... This may take a moment.',
                            embeds: [],
                            components: []
                        });

                        try {
                            await this.performBatchReset(interaction, type, userCount);
                        } catch (error) {
                            console.error('Error in batch reset:', error);
                            const errorEmbed = new EmbedBuilder()
                                .setTitle('❌ Reset Failed')
                                .setDescription(`An error occurred while resetting the economy: ${error.message}`)
                                .setColor('#FF0000');

                            await interaction.editReply({
                                content: '',
                                embeds: [errorEmbed],
                                components: []
                            }).catch(console.error);
                        }
                    }
                } catch (error) {
                    console.error('Error in confirmation handler:', error);
                    try {
                        await interaction.editReply({
                            content: 'An error occurred while processing your confirmation.',
                            embeds: [],
                            components: []
                        });
                    } catch (editError) {
                        console.error('Error editing reply:', editError);
                    }
                }
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    try {
                        const timeoutEmbed = new EmbedBuilder()
                            .setDescription('⏰ Confirmation timed out. Please run the command again.')
                            .setColor('#FFA500');

                        await interaction.editReply({
                            content: '',
                            embeds: [timeoutEmbed],
                            components: []
                        });
                    } catch (error) {
                        console.error('Error handling timeout:', error);
                    }
                }
            });

            return;
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        let fields = {};
        if (type === 'balance' || type === 'both') {
            fields.balance = 1;
        }
        if (type === 'bank' || type === 'both') {
            fields.bank = 1;
        }
        fields.transactionLogs = 1;

        let user = await User.findOne({ userId: targetUser.id, guildId: interaction.guild.id }, fields);

        if (!user) {
            user = new User({ userId: targetUser.id, guildId: interaction.guild.id, balance: 0, bank: 0, commandData: {}, transactionLogs: [] });
        } else if (!Array.isArray(user.transactionLogs)) {
            user.transactionLogs = [];
        }

        let placeholders = {
            user: `<@${targetUser.id}>`,
            amount: amount,
            balance: user.balance || 0,
            bank: user.bank || 0,
            type: type
        };

        if (subcommand === 'give') {
            if (type === 'balance' || type === 'both') {
                user.balance += amount;
                user.transactionLogs.push({
                    type: 'admin-give-balance',
                    amount: amount,
                    timestamp: new Date()
                });
                placeholders.balance = user.balance;
            }
            if (type === 'bank' || type === 'both') {
                user.bank += amount;
                user.transactionLogs.push({
                    type: 'admin-give-bank',
                    amount: amount,
                    timestamp: new Date()
                });
                placeholders.bank = user.bank;
            }

            const embed = new EmbedBuilder()
                .setDescription(replacePlaceholders(lang.Economy?.Admin?.Give || "Successfully gave **{amount}** coins to **{user}**'s balance.\n\n**Balance:** {balance}\n**Bank:** {bank}", placeholders))
                .setColor('#00FF00');

            await user.save();
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'take') {
            if (type === 'balance' || type === 'both') {
                if (user.balance < amount) {
                    return interaction.reply({ content: lang.Economy?.Error?.InsufficientFunds || "Insufficient funds for this action.", flags: MessageFlags.Ephemeral });
                }
                user.balance -= amount;
                user.transactionLogs.push({
                    type: 'admin-take-balance',
                    amount: -amount,
                    timestamp: new Date()
                });
                placeholders.balance = user.balance;
            }
            if (type === 'bank' || type === 'both') {
                if (user.bank < amount) {
                    return interaction.reply({ content: lang.Economy?.Error?.InsufficientFunds || "Insufficient funds for this action.", flags: MessageFlags.Ephemeral });
                }
                user.bank -= amount;
                user.transactionLogs.push({
                    type: 'admin-take-bank',
                    amount: -amount,
                    timestamp: new Date()
                });
                placeholders.bank = user.bank;
            }

            const embed = new EmbedBuilder()
                .setDescription(replacePlaceholders(lang.Economy?.Admin?.Take || "Successfully took **{amount}** coins from **{user}**'s balance.\n\n**Balance:** {balance}\n**Bank:** {bank}", placeholders))
                .setColor('#FF0000');

            await user.save();
            return interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'set') {
            if (type === 'balance' || type === 'both') {
                user.balance = amount;
                user.transactionLogs.push({
                    type: 'admin-set-balance',
                    amount: amount,
                    timestamp: new Date()
                });
                placeholders.balance = user.balance;
            }
            if (type === 'bank' || type === 'both') {
                user.bank = amount;
                user.transactionLogs.push({
                    type: 'admin-set-bank',
                    amount: amount,
                    timestamp: new Date()
                });
                placeholders.bank = user.bank;
            }

            const embed = new EmbedBuilder()
                .setDescription(replacePlaceholders(lang.Economy?.Admin?.Set || "Successfully set **{user}**'s balance. Added **{amount}** coins.\n\n**Balance:** {balance}\n**Bank:** {bank}", placeholders))
                .setColor('#0000FF');

            await user.save();
            return interaction.reply({ embeds: [embed] });
        }
    }
};