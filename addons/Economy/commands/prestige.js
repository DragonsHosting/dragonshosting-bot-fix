const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../models/UserData');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { replyComponentsV2, editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const { replacePlaceholders } = require('./Utility/helpers');

function getPrestigeBonus(level) {
    const config = getConfig();
    const bonusPerLevel = config.Prestige?.bonusPerLevel || 0.05;
    return level * bonusPerLevel;
}

function getNextPrestigeRequirement(currentLevel) {
    const config = getConfig();
    const requirements = config.Prestige?.Requirements || {};
    const nextLevel = currentLevel + 1;
    return requirements[nextLevel] || null;
}

function getPrestigeReward(level) {
    const config = getConfig();
    return config.Prestige?.Rewards?.[level] || { title: `Level ${level}`, emoji: '⭐', color: '#FFD700' };
}

async function handlePrestigeRoles(member, oldLevel, newLevel) {
    const config = getConfig();
    if (!config.Prestige?.grantRoles) return;

    try {
        const oldReward = config.Prestige?.Rewards?.[oldLevel];
        if (oldReward?.roleId) {
            await member.roles.remove(oldReward.roleId).catch(() => {});
        }

        const newReward = config.Prestige?.Rewards?.[newLevel];
        if (newReward?.roleId) {
            await member.roles.add(newReward.roleId).catch(() => {});
        }
    } catch (e) {}
}

function createProgressBar(value, max, length = 10) {
    const filled = Math.min(length, Math.max(0, Math.round((value / max) * length)));
    return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prestige')
        .setDescription('View or confirm your prestige status')
        .addSubcommand(sub => sub.setName('info').setDescription('View your current prestige status and requirements'))
        .addSubcommand(sub => sub.setName('confirm').setDescription('Prestige to the next level (resets all progress)')),
    category: 'Economy',
    getPrestigeBonus,
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            let user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });

            if (!user) {
                user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0, bank: 0, prestigeLevel: 0, transactionLogs: [] });
            }

            const currentLevel = user.prestigeLevel || 0;
            const currentBonus = getPrestigeBonus(currentLevel);
            const nextRequirement = getNextPrestigeRequirement(currentLevel);
            const totalBalance = (user.balance || 0) + (user.bank || 0);
            const currentReward = currentLevel > 0 ? getPrestigeReward(currentLevel) : null;
            const maxLevel = config.Prestige?.maxLevel || 10;

            if (subcommand === 'info') {
                let description = `# ⭐ PRESTIGE SYSTEM\n\n`;
                
                if (currentLevel > 0) {
                    description += `**Current Prestige:** ${currentReward?.emoji || '⭐'} ${currentReward?.title || `Level ${currentLevel}`}\n`;
                    description += `**Current Bonus:** +${(currentBonus * 100).toFixed(0)}% earnings\n\n`;
                } else {
                    description += `**Current Prestige:** None\n`;
                    description += `**Current Bonus:** +0% earnings\n\n`;
                }

                description += `**Total Balance:** ${totalBalance.toLocaleString()} coins\n`;

                if (currentLevel >= maxLevel) {
                    description += `\n🏆 You've reached the maximum prestige level!`;
                } else if (nextRequirement) {
                    const nextReward = getPrestigeReward(currentLevel + 1);
                    description += `\n**Next Level:** ${nextReward.emoji} ${nextReward.title}\n`;
                    description += `**Requirement:** ${nextRequirement.toLocaleString()} coins\n`;
                    
                    const progress = Math.min(100, (totalBalance / nextRequirement) * 100);
                    description += `\n**Progress:** ${createProgressBar(totalBalance, nextRequirement)} ${progress.toFixed(0)}%`;
                }

                const infoV2 = { Components: [{ Type: 'container', AccentColor: currentReward?.color || '#FFD700', Components: [
                    { Type: 'text_display', Content: description },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]}]};

                return replyComponentsV2(interaction, infoV2.Components, createSimplePlaceholderReplacer({}));
            }

            if (subcommand === 'confirm') {
                if (currentLevel >= maxLevel) {
                    return interaction.reply({ content: '🏆 You\'ve reached the maximum prestige level!', flags: MessageFlags.Ephemeral });
                }

                if (!nextRequirement || totalBalance < nextRequirement) {
                    return interaction.reply({
                        content: `❌ You need at least **${nextRequirement?.toLocaleString() || '0'}** total coins to prestige!`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const nextLevel = currentLevel + 1;
                const nextReward = getPrestigeReward(nextLevel);
                const nextBonus = getPrestigeBonus(nextLevel);

                const confirmV2 = { Components: [{ Type: 'container', AccentColor: '#FFA500', Components: [
                    { Type: 'text_display', Content: `# ⚠️ CONFIRM PRESTIGE\n\nAre you sure you want to prestige?\n\n> **New Level:** ${nextReward.emoji} ${nextReward.title}\n> **New Bonus:** +${(nextBonus * 100).toFixed(0)}% earnings\n\n**Warning:** This will reset your balance, bank, inventory, pets, and boosters!` }
                ]}]};

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prestige_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success).setEmoji('✅'),
                    new ButtonBuilder().setCustomId('prestige_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌')
                );

                await interaction.deferReply();
                await editReplyComponentsV2(interaction, confirmV2.Components, createSimplePlaceholderReplacer({}), [row]);

                const response = await interaction.fetchReply();
                const filter = i => i.user.id === interaction.user.id;
                
                try {
                    const confirmation = await response.awaitMessageComponent({ filter, time: 30000 });

                    if (confirmation.customId === 'prestige_confirm') {
                        user.balance = 0;
                        user.bank = 0;
                        user.inventory = [];
                        user.pet = null;
                        user.boosters = [];
                        user.purchasedItems = [];
                        user.totalPrestigeEarnings = (user.totalPrestigeEarnings || 0) + totalBalance;
                        user.prestigeLevel = nextLevel;

                        user.transactionLogs.push({ type: 'prestige', amount: -totalBalance, timestamp: new Date() });

                        await user.save();
                        await handlePrestigeRoles(interaction.member, currentLevel, nextLevel);

                        const successV2 = { Components: [{ Type: 'container', AccentColor: nextReward.color || '#FFD700', Components: [
                            { Type: 'text_display', Content: `# 🌟 PRESTIGE COMPLETE\n\nYou are now **${nextReward.emoji} ${nextReward.title}**!\n\n> **Bonus:** +${(nextBonus * 100).toFixed(0)}% earnings` }
                        ]}]};

                        await confirmation.deferUpdate();
                        await editReplyComponentsV2(interaction, successV2.Components, createSimplePlaceholderReplacer({}));
                    } else {
                        await confirmation.update({ content: 'Prestige cancelled.', embeds: [], components: [] });
                    }
                } catch (e) {
                    await interaction.editReply({ content: 'Prestige cancelled.', embeds: [], components: [] });
                }
            }

        } catch (error) {
            console.error("Error in prestige command:", error);
            return interaction.reply({ content: "An error occurred.", flags: MessageFlags.Ephemeral });
        }
    }
};
