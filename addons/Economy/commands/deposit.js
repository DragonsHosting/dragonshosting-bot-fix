const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposit coins into the bank')
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to deposit').setRequired(true)),
    category: 'Economy',
    async execute(interaction) {
        try {
            const amount = interaction.options.getInteger('amount');

            const user = await User.findOne(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { balance: 1, bank: 1, transactionLogs: 1 }
            );

            if (amount <= 0) {
                const errorConfig = config.Messages?.Error?.NoMoney;
                if (errorConfig?.Components) {
                    return replyComponentsV2(interaction, errorConfig.Components, createSimplePlaceholderReplacer({}), { ephemeral: true });
                }
                return interaction.reply({ content: lang.Economy?.Error?.BetAmountError || "The deposit amount must be greater than 0.", flags: MessageFlags.Ephemeral });
            }

            if (!user || user.balance < amount) {
                const errorConfig = config.Messages?.Error?.NoMoney;
                if (errorConfig?.Components) {
                    return replyComponentsV2(interaction, errorConfig.Components, createSimplePlaceholderReplacer({}), { ephemeral: true });
                }
                return interaction.reply({ content: lang.Economy?.Error?.NoMoney || "You don't have enough money to deposit.", flags: MessageFlags.Ephemeral });
            }

            user.balance -= amount;
            user.bank += amount;

            user.transactionLogs.push({
                type: 'deposit',
                amount: amount,
                timestamp: new Date()
            });

            await user.save();

            const depositConfig = config.Messages?.Deposit?.Success;
            if (depositConfig?.Components) {
                return replyComponentsV2(interaction, depositConfig.Components, createSimplePlaceholderReplacer({
                    amount: amount.toLocaleString(),
                    bankBalance: user.bank.toLocaleString(),
                    balance: user.balance.toLocaleString()
                }));
            }

            return interaction.reply({ content: `Deposited **${amount.toLocaleString()}** coins. Bank: ${user.bank.toLocaleString()}` });
        } catch (error) {
            console.error("Error in deposit command: ", error);
            interaction.reply({ content: lang.Economy?.Error?.Generic || "An error occurred.", flags: MessageFlags.Ephemeral });
        }
    },
};
