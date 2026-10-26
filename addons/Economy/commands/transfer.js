const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer coins to another user')
        .addUserOption(option => option.setName('target').setDescription('User to transfer to').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to transfer').setRequired(true)),
    category: 'Economy',
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        if (target.id === interaction.user.id) {
            return interaction.reply({ content: lang.Economy?.Error?.CannotTransferSelf || "You cannot transfer coins to yourself.", flags: MessageFlags.Ephemeral });
        }

        if (amount <= 0) {
            return interaction.reply({ content: lang.Economy?.Error?.InvalidTransferAmount || "The transfer amount must be greater than 0.", flags: MessageFlags.Ephemeral });
        }

        const user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, transactionLogs: 1 }
        );

        const targetUser = await User.findOne(
            { userId: target.id, guildId: interaction.guild.id },
            { balance: 1, transactionLogs: 1 }
        );

        if (!user || user.balance < amount) {
            const errorConfig = config.Messages?.Error?.NoMoney;
            if (errorConfig?.Components) {
                return replyComponentsV2(interaction, errorConfig.Components, createSimplePlaceholderReplacer({}));
            }
            return interaction.reply({ content: lang.Economy?.Error?.NoMoney || "You don't have enough coins." });
        }

        user.balance -= amount;
        user.transactionLogs.push({ type: 'transfer_out', amount: -amount, timestamp: new Date() });

        if (!targetUser) {
            await new User({
                userId: target.id,
                guildId: interaction.guild.id,
                balance: amount,
                transactionLogs: [{ type: 'transfer_in', amount: amount, timestamp: new Date() }]
            }).save();
        } else {
            targetUser.balance += amount;
            targetUser.transactionLogs.push({ type: 'transfer_in', amount: amount, timestamp: new Date() });
            await targetUser.save();
        }

        await user.save();

        const transferConfig = config.Messages?.Transfer?.Success;
        if (transferConfig?.Components) {
            return replyComponentsV2(interaction, transferConfig.Components, createSimplePlaceholderReplacer({
                amount: amount.toLocaleString(),
                target: `<@${target.id}>`,
                balance: user.balance.toLocaleString()
            }));
        }

        return interaction.reply({ content: `Transferred **${amount.toLocaleString()}** coins to ${target}.` });
    },
};
