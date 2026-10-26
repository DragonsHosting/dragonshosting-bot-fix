const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Withdraw coins from the bank')
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to withdraw').setRequired(true)),
    category: 'Economy',
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
            return interaction.reply({ content: lang.Economy?.Error?.InvalidAmount || "You entered an incorrect amount.", flags: MessageFlags.Ephemeral });
        }

        const user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { bank: 1, balance: 1 }
        );

        if (!user || user.bank < amount) {
            const errorConfig = config.Messages?.Error?.NoMoney;
            if (errorConfig?.Components) {
                return replyComponentsV2(interaction, errorConfig.Components, createSimplePlaceholderReplacer({}));
            }
            return interaction.reply({ content: lang.Economy?.Error?.NoMoney || "You don't have enough coins." });
        }

        user.bank -= amount;
        user.balance += amount;
        await user.save();

        const withdrawConfig = config.Messages?.Withdraw?.Success;
        if (withdrawConfig?.Components) {
            return replyComponentsV2(interaction, withdrawConfig.Components, createSimplePlaceholderReplacer({
                amount: amount.toLocaleString(),
                balance: user.balance.toLocaleString()
            }));
        }

        return interaction.reply({ content: `Withdrew **${amount.toLocaleString()}** coins. Wallet: ${user.balance.toLocaleString()}` });
    },
};
