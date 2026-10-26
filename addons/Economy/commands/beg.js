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
        .setName('beg')
        .setDescription('Beg for coins'),
    category: 'Economy',
    async execute(interaction) {
        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, commandData: 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1 }
        );

        const now = new Date();

        const cooldown = parseDuration(config.Economy.Beg.cooldown);
        if (user && user.commandData.lastBeg) {
            const nextBeg = new Date(user.commandData.lastBeg.getTime() + cooldown);
            if (now < nextBeg) {
                const cooldownConfig = config.Messages?.Cooldown?.Beg;
                if (cooldownConfig?.Components) {
                    return replyComponentsV2(interaction, cooldownConfig.Components, createSimplePlaceholderReplacer({
                        nextUse: Math.floor(nextBeg.getTime() / 1000),
                        balance: user.balance?.toLocaleString() || '0'
                    }));
                }
                return interaction.reply({ content: `On cooldown! Available <t:${Math.floor(nextBeg.getTime() / 1000)}:R>` });
            }
        }

        let coins = Math.floor(Math.random() * (config.Economy.Beg.max - config.Economy.Beg.min + 1)) + config.Economy.Beg.min;
        const multiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        coins = Math.floor(coins * multiplier);

        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: coins, commandData: { lastBeg: now } });
        } else {
            user.balance += coins;
            user.commandData.lastBeg = now;
        }

        user.transactionLogs.push({
            type: 'beg',
            amount: coins,
            timestamp: new Date()
        });

        await user.save();

        const messageTemplates = lang.Economy?.Beg?.Messages || ["You begged and received **{balance}** coins!"];
        const msgPlaceholders = { balance: coins, user: `<@${interaction.user.id}>` };
        const message = replacePlaceholders(messageTemplates[Math.floor(Math.random() * messageTemplates.length)], msgPlaceholders);

        const begConfig = config.Messages?.Beg?.Success;
        if (begConfig?.Components) {
            return replyComponentsV2(interaction, begConfig.Components, createSimplePlaceholderReplacer({
                message: message,
                balance: user.balance.toLocaleString()
            }));
        }

        return interaction.reply({ content: message });
    },
};
