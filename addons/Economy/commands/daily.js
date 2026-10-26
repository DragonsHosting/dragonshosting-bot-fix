const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const config = getConfig();
const lang = getLang();
const { getTotalEarningsMultiplier } = require('./Utility/helpers');

function createStreakProgressBar(bonusPercent, maxBonusPercent) {
    const progress = Math.min(bonusPercent / maxBonusPercent, 1);
    const filledCount = Math.floor(progress * 10);
    return '▓'.repeat(filledCount) + '░'.repeat(10 - filledCount);
}

function getNextMilestone(streak) {
    const milestones = [7, 14, 30, 60, 100, 365];
    for (const m of milestones) {
        if (streak < m) return m;
    }
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward'),
    category: 'Economy',
    async execute(interaction) {
        try {
            let user = await User.findOne(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { balance: 1, 'commandData.lastDaily': 1, 'commandData.dailyStreak': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1 }
            );
            const now = new Date();
            let reward = config.Economy.Daily.baseAmount;
            let streak = 1;
            let streakBroken = false;

            if (user && user.commandData.lastDaily) {
                const lastDaily = new Date(user.commandData.lastDaily);
                const lastDailyDate = new Date(lastDaily.getUTCFullYear(), lastDaily.getUTCMonth(), lastDaily.getUTCDate());
                const todayDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
                const diffDays = Math.floor((todayDate - lastDailyDate) / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    const nextDaily = new Date(lastDaily.getTime() + 24 * 60 * 60 * 1000);
                    const currentStreak = user.commandData.dailyStreak || 1;
                    const currentBonus = Math.min(currentStreak * config.Economy.Daily.streakBonusPercent, config.Economy.Daily.maxBonusPercent);

                    const placeholders = {
                        nextUse: Math.floor(nextDaily.getTime() / 1000),
                        streak: currentStreak,
                        bonusPercent: currentBonus.toFixed(1)
                    };

                    const cooldownConfig = config.Messages?.Daily?.Cooldown;
                    if (cooldownConfig?.Components) {
                        return replyComponentsV2(interaction, cooldownConfig.Components, createSimplePlaceholderReplacer(placeholders));
                    }
                }
                
                if (diffDays === 1 || diffDays === 2) {
                    streak = (user.commandData.dailyStreak || 0) + 1;
                } else {
                    streak = 1;
                    streakBroken = true;
                }
            }

            const streakBonus = Math.min(streak * config.Economy.Daily.streakBonusPercent, config.Economy.Daily.maxBonusPercent);
            reward = Math.floor(config.Economy.Daily.baseAmount * (1 + streakBonus / 100));

            const multiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
            reward = Math.floor(reward * multiplier);

            if (!user) {
                user = new User({
                    userId: interaction.user.id,
                    guildId: interaction.guild.id,
                    balance: reward,
                    commandData: { lastDaily: now, dailyStreak: streak },
                    transactionLogs: []
                });
            } else {
                user.balance += reward;
                user.commandData.lastDaily = now;
                user.commandData.dailyStreak = streak;
            }

            user.transactionLogs.push({
                type: 'daily',
                amount: reward,
                timestamp: now
            });

            await user.save();

            const progressBar = createStreakProgressBar(streakBonus, config.Economy.Daily.maxBonusPercent);
            const nextMilestone = getNextMilestone(streak);

            let streakEmoji = '🔥';
            if (streak >= 30) streakEmoji = '💎';
            else if (streak >= 14) streakEmoji = '⭐';
            else if (streak >= 7) streakEmoji = '🌟';

            let footerText = nextMilestone ? `Next milestone: ${nextMilestone} days` : 'Max bonus reached!';
            
            let extraContent = '';
            if (streakBroken) {
                extraContent += '\n\n> ⚠️ Your streak was reset because you missed a day!';
            }
            if (streak === 7 || streak === 14 || streak === 30 || streak === 60 || streak === 100) {
                extraContent += `\n\n> 🎉 Congratulations on reaching a **${streak} day** streak!`;
            }

            const placeholders = {
                amount: reward.toLocaleString(),
                streak: streak,
                bonusPercent: streakBonus.toFixed(1),
                progressBar: `${streakEmoji} ${progressBar}`,
                footer: footerText,
                extraContent: extraContent,
                userAvatar: interaction.user.displayAvatarURL({ dynamic: true })
            };

            const claimedConfig = config.Messages?.Daily?.Claimed;
            if (claimedConfig?.Components) {
                const components = JSON.parse(JSON.stringify(claimedConfig.Components));
                if (extraContent && components[0]?.Components) {
                    const lastIdx = components[0].Components.length - 1;
                    if (components[0].Components[lastIdx]) {
                        components[0].Components[lastIdx].Content += extraContent;
                    }
                }
                return replyComponentsV2(interaction, components, createSimplePlaceholderReplacer(placeholders));
            }

            return interaction.reply({ content: `You received **${reward.toLocaleString()}** coins! Streak: ${streak} days (+${streakBonus.toFixed(1)}% bonus)` });
        } catch (error) {
            console.error("Error in daily command: ", error);
            interaction.reply({ content: lang.Economy?.Error?.Generic || "An error occurred.", flags: MessageFlags.Ephemeral });
        }
    },
};
