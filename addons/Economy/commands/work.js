const { SlashCommandBuilder } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const parseDuration = require('./Utility/parseDuration');
const { getTotalEarningsMultiplier, replacePlaceholders } = require('./Utility/helpers');

const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work to earn coins'),
    category: 'Economy',
    async execute(interaction) {
        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, 'commandData.lastWork': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1 }
        );
        const now = new Date();

        const cooldown = parseDuration(config.Economy.Work.cooldown);
        if (user && user.commandData.lastWork) {
            const nextWork = new Date(user.commandData.lastWork.getTime() + cooldown);
            if (now < nextWork) {
                const cooldownConfig = config.Messages?.Cooldown?.Work;
                if (cooldownConfig?.Components) {
                    return replyComponentsV2(interaction, cooldownConfig.Components, createSimplePlaceholderReplacer({
                        nextUse: Math.floor(nextWork.getTime() / 1000),
                        balance: user.balance?.toLocaleString() || '0'
                    }));
                }
                return interaction.reply({ content: `On cooldown! Available <t:${Math.floor(nextWork.getTime() / 1000)}:R>` });
            }
        }

        let earnings = Math.floor(Math.random() * (config.Economy.Work.max - config.Economy.Work.min + 1)) + config.Economy.Work.min;
        const multiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        earnings = Math.floor(earnings * multiplier);

        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: earnings, commandData: { lastWork: now } });
        } else {
            user.balance += earnings;
            user.commandData.lastWork = now;
            user.transactionLogs.push({
                type: 'work',
                amount: earnings,
                timestamp: now
            });
        }

        await user.save();

        const msgPlaceholders = { user: `<@${interaction.user.id}>`, balance: earnings };
        const workMessages = lang.Economy?.Work?.Messages || ["{user}, you earned **{balance}** coins from work!"];
        const message = replacePlaceholders(workMessages[Math.floor(Math.random() * workMessages.length)], msgPlaceholders);

        const workConfig = config.Messages?.Work?.Success;
        if (workConfig?.Components) {
            return replyComponentsV2(interaction, workConfig.Components, createSimplePlaceholderReplacer({
                message: message,
                balance: user.balance.toLocaleString()
            }));
        }

        return interaction.reply({ content: message });
    },
};
