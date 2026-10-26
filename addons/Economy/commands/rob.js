const { SlashCommandBuilder } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const parseDuration = require('./Utility/parseDuration');
const { checkActiveBooster, replacePlaceholders } = require('./Utility/helpers');

const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Rob another user')
        .addUserOption(option => option.setName('target').setDescription('User to rob').setRequired(true)),
    category: 'Economy',
    async execute(interaction) {
        const target = interaction.options.getUser('target');

        let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id }, { balance: 1, 'commandData.lastRob': 1, transactionLogs: 1, boosters: 1 });
        const now = new Date();

        const cooldown = parseDuration(config.Economy.Rob.cooldown);
        if (user && user.commandData.lastRob) {
            const nextRob = new Date(user.commandData.lastRob.getTime() + cooldown);
            if (now < nextRob) {
                const cooldownConfig = config.Messages?.Cooldown?.Rob;
                if (cooldownConfig?.Components) {
                    return replyComponentsV2(interaction, cooldownConfig.Components, createSimplePlaceholderReplacer({
                        nextUse: Math.floor(nextRob.getTime() / 1000),
                        balance: user.balance?.toLocaleString() || '0'
                    }));
                }
                return interaction.reply({ content: `On cooldown! Available <t:${Math.floor(nextRob.getTime() / 1000)}:R>` });
            }
        }

        if (target.id === interaction.user.id) {
            const errorConfig = config.Messages?.Error?.NoMoney;
            if (errorConfig?.Components) {
                return replyComponentsV2(interaction, errorConfig.Components, createSimplePlaceholderReplacer({}));
            }
            return interaction.reply({ content: 'You cannot rob yourself.' });
        }

        const targetUser = await User.findOne({ userId: target.id, guildId: interaction.guild.id }, { balance: 1, transactionLogs: 1 });

        if (!targetUser || targetUser.balance < config.Economy.Rob.minBalanceToRob) {
            return interaction.reply({ content: lang.Economy?.Error?.TargetRob || "Your target does not have enough money to rob." });
        }

        const success = Math.random() > 0.5;
        let amount = Math.min(targetUser.balance, Math.floor(targetUser.balance * parseFloat(config.Economy.Rob.percent) / 100), parseInt(config.Economy.Rob.maxAmount, 10));

        const msgPlaceholders = {
            user: `<@${interaction.user.id}>`,
            victim: `<@${target.id}>`,
            balance: amount
        };

        if (success) {
            const multiplier = checkActiveBooster(user, 'Money');
            amount *= multiplier;
            targetUser.balance -= amount;
            user.balance += amount;
            user.commandData.lastRob = now;

            user.transactionLogs.push({ type: 'rob', amount: amount, timestamp: now });
            targetUser.transactionLogs.push({ type: 'robbed', amount: -amount, timestamp: now });

            await targetUser.save();
            await user.save();

            const winMessages = lang.Economy?.Rob?.Win || ["{user}, you robbed {victim} for **{balance}** coins!"];
            const winMessage = replacePlaceholders(winMessages[Math.floor(Math.random() * winMessages.length)], msgPlaceholders);

            const robConfig = config.Messages?.Rob?.Success;
            if (robConfig?.Components) {
                return replyComponentsV2(interaction, robConfig.Components, createSimplePlaceholderReplacer({
                    message: winMessage,
                    balance: user.balance.toLocaleString()
                }));
            }
            return interaction.reply({ content: winMessage });
        } else {
            user.commandData.lastRob = now;
            user.transactionLogs.push({ type: 'rob_fail', amount: 0, timestamp: now });
            await user.save();

            const loseMessages = lang.Economy?.Rob?.Lose || ["{user}, you failed to rob {victim}!"];
            const loseMessage = replacePlaceholders(loseMessages[Math.floor(Math.random() * loseMessages.length)], msgPlaceholders);

            const robConfig = config.Messages?.Rob?.Fail;
            if (robConfig?.Components) {
                return replyComponentsV2(interaction, robConfig.Components, createSimplePlaceholderReplacer({
                    message: loseMessage,
                    balance: user.balance.toLocaleString()
                }));
            }
            return interaction.reply({ content: loseMessage });
        }
    },
};
