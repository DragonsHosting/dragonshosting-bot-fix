const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const parseDuration = require('./Utility/parseDuration');
const { getTotalEarningsMultiplier, replacePlaceholders } = require('./Utility/helpers');

const config = getConfig();
const lang = getLang();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Attempt to commit a crime'),
    category: 'Economy',
    async execute(interaction) {
        try {
            let user = await User.findOne(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { balance: 1, 'commandData.lastCrime': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1 }
            );

            const now = new Date();

            const cooldown = parseDuration(config.Economy.Crime.cooldown);
            if (user && user.commandData.lastCrime) {
                const nextCrime = new Date(user.commandData.lastCrime.getTime() + cooldown);
                if (now < nextCrime) {
                    const cooldownConfig = config.Messages?.Cooldown?.Crime;
                    if (cooldownConfig?.Components) {
                        return replyComponentsV2(interaction, cooldownConfig.Components, createSimplePlaceholderReplacer({
                            nextUse: Math.floor(nextCrime.getTime() / 1000),
                            balance: user.balance?.toLocaleString() || '0'
                        }));
                    }
                    return interaction.reply({ content: `On cooldown! Available <t:${Math.floor(nextCrime.getTime() / 1000)}:R>` });
                }
            }

            let amount = Math.floor(Math.random() * (config.Economy.Crime.max - config.Economy.Crime.min + 1)) + config.Economy.Crime.min;
            const multiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
            amount = Math.floor(amount * multiplier);
            const success = amount > 0;

            if (!user) {
                user = new User({
                    userId: interaction.user.id,
                    guildId: interaction.guild.id,
                    balance: success ? amount : 0,
                    commandData: { lastCrime: now },
                    transactionLogs: []
                });
            } else {
                user.balance += amount;
                if (user.balance < 0) user.balance = 0;
                user.commandData.lastCrime = now;
            }

            user.transactionLogs.push({
                type: 'crime',
                amount: amount,
                timestamp: now
            });

            await user.save();

            const msgPlaceholders = { user: `<@${interaction.user.id}>`, balance: Math.abs(amount) };
            const winMessages = lang.Economy?.Crime?.Win || ["{user}, you got away with **{balance}** coins!"];
            const loseMessages = lang.Economy?.Crime?.Lose || ["{user}, you got caught and lost **{balance}** coins!"];
            const description = success
                ? replacePlaceholders(winMessages[Math.floor(Math.random() * winMessages.length)], msgPlaceholders)
                : replacePlaceholders(loseMessages[Math.floor(Math.random() * loseMessages.length)], msgPlaceholders);

            const crimeConfig = success ? config.Messages?.Crime?.Success : config.Messages?.Crime?.Fail;
            if (crimeConfig?.Components) {
                return replyComponentsV2(interaction, crimeConfig.Components, createSimplePlaceholderReplacer({
                    message: description,
                    balance: user.balance.toLocaleString()
                }));
            }

            return interaction.reply({ content: description });
        } catch (error) {
            console.error("Error in crime command: ", error);
            interaction.reply({ content: lang.Economy?.Error?.Generic || "An error occurred.", flags: MessageFlags.Ephemeral });
        }
    },
};
