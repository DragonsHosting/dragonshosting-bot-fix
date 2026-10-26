const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../../models/UserData');
const { getConfig, getLang } = require('../../../../utils/core/configLoader.js');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../../utils/core/componentsV2Builder.js');
const parseDuration = require('../Utility/parseDuration');
const { getTotalEarningsMultiplier } = require('../Utility/helpers');

const config = getConfig();
const lang = getLang();

const ROLL_MODES = {
    low: { name: 'Low (1-50)', range: [1, 50], multiplier: 2, emoji: '⬇️' },
    high: { name: 'High (51-100)', range: [51, 100], multiplier: 2, emoji: '⬆️' },
    exact10: { name: 'Exact 10s', multiplier: 10, emoji: '🎯' },
    extreme_low: { name: 'Very Low (1-25)', range: [1, 25], multiplier: 4, emoji: '📉' },
    extreme_high: { name: 'Very High (76-100)', range: [76, 100], multiplier: 4, emoji: '📈' }
};

function createProgressBar(value, max = 100, length = 10) {
    const filled = Math.round((value / max) * length);
    return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

function checkWin(choice, rollResult) {
    const mode = ROLL_MODES[choice];
    if (!mode) return false;
    if (choice === 'exact10') return rollResult % 10 === 0;
    return rollResult >= mode.range[0] && rollResult <= mode.range[1];
}

function updateGameStats(user, bet, winnings, won) {
    if (!user.gameStats) user.gameStats = {};
    if (!user.gameStats.roll) user.gameStats.roll = { played: 0, won: 0, totalWagered: 0, totalWon: 0 };
    const stats = user.gameStats.roll;
    stats.played++;
    stats.totalWagered += bet;
    if (won) { stats.won++; stats.totalWon += winnings; }
}

function createRollComponentsV2(rollResult, mode, isWin, netGain, balance, winRate, gamesPlayed) {
    const color = isWin ? '#57F287' : '#ED4245';
    const resultRange = rollResult <= 25 ? 'Very Low' : rollResult <= 50 ? 'Low' : rollResult <= 75 ? 'High' : 'Very High';
    return {
        Components: [
            {
                Type: 'container',
                AccentColor: color,
                Components: [
                    { Type: 'text_display', Content: `Rolled **${rollResult}** (${resultRange})\n${createProgressBar(rollResult)}` },
                    { Type: 'text_display', Content: `> **Your Bet:** ${mode.name}\n> **${isWin ? 'Won' : 'Lost'}:** ${Math.abs(netGain).toLocaleString()}\n> **Balance:** ${balance.toLocaleString()}` },
                    { Type: 'text_display', Content: `-# Win Rate: ${winRate}% · Games: ${gamesPlayed}` }
                ]
            }
        ]
    };
}

module.exports = {
    name: 'roll',
    description: 'Bet on where the dice will land',
    options: (subcommand) => subcommand
        .setName('roll')
        .setDescription('Bet on where the dice will land (1-100)')
        .addIntegerOption(option => option.setName('bet').setDescription('Amount to bet').setRequired(true))
        .addStringOption(option =>
            option.setName('choice').setDescription('Choose your bet type').setRequired(true)
                .addChoices(
                    { name: '⬇️ Low 1-50 (2x)', value: 'low' },
                    { name: '⬆️ High 51-100 (2x)', value: 'high' },
                    { name: '📉 Very Low 1-25 (4x)', value: 'extreme_low' },
                    { name: '📈 Very High 76-100 (4x)', value: 'extreme_high' },
                    { name: '🎯 Exact 10s (10x)', value: 'exact10' }
                )),

    async execute(interaction) {
        const betAmount = interaction.options.getInteger('bet');
        const betChoice = interaction.options.getString('choice');
        const mode = ROLL_MODES[betChoice];

        if (betAmount <= 0) return interaction.reply({ content: lang.Economy?.Error?.BetAmountError || "Invalid bet amount.", flags: MessageFlags.Ephemeral });

        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, 'commandData.lastRoll': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1, gameStats: 1 }
        );

        if (!user) user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0, commandData: {}, transactionLogs: [], gameStats: {} });

        if (user.balance < betAmount) {
            const insuffV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `**Insufficient Funds**\n\n> You need **${(betAmount - user.balance).toLocaleString()}** more coins!` }
            ]}]};
            await interaction.deferReply();
            return editReplyComponentsV2(interaction, insuffV2.Components, createSimplePlaceholderReplacer({}));
        }

        const now = new Date();
        const cooldown = parseDuration(config.Economy.Roll.cooldown);

        if (cooldown > 0 && user.commandData.lastRoll) {
            const nextRoll = new Date(user.commandData.lastRoll.getTime() + cooldown);
            if (now < nextRoll) {
                const coolV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                    { Type: 'text_display', Content: `**Roll · Cooldown**\n\n> Next roll <t:${Math.floor(nextRoll.getTime() / 1000)}:R>` },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]}]};
                await interaction.deferReply();
                return editReplyComponentsV2(interaction, coolV2.Components, createSimplePlaceholderReplacer({}));
            }
        }

        await interaction.deferReply();

        const spinV2 = { Components: [{ Type: 'container', AccentColor: '#2b2d31', Components: [
            { Type: 'text_display', Content: `Rolling... Bet: ${mode.name} (${mode.multiplier}x)` }
        ]}]};
        await editReplyComponentsV2(interaction, spinV2.Components, createSimplePlaceholderReplacer({}));

        await new Promise(resolve => setTimeout(resolve, 1500));

        const rollResult = Math.floor(Math.random() * 100) + 1;
        const isWin = checkWin(betChoice, rollResult);

        const earningsMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        let winnings = 0;
        let netGain = -betAmount;

        if (isWin) {
            winnings = Math.floor(betAmount * mode.multiplier * earningsMultiplier);
            netGain = winnings - betAmount;
        }

        user.balance += netGain;
        user.commandData.lastRoll = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'roll', amount: netGain, timestamp: now });

        updateGameStats(user, betAmount, winnings, isWin);
        await user.save();

        const stats = user.gameStats?.roll || {};
        const winRate = stats.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0;

        const componentsV2 = createRollComponentsV2(rollResult, mode, isWin, netGain, user.balance, winRate, stats.played || 0);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`roll_low_${betAmount}`).setLabel('Low').setEmoji('⬇️').setStyle(ButtonStyle.Primary).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_high_${betAmount}`).setLabel('High').setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_extreme_low_${betAmount}`).setLabel('V.Low').setEmoji('📉').setStyle(ButtonStyle.Danger).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_extreme_high_${betAmount}`).setLabel('V.High').setEmoji('📈').setStyle(ButtonStyle.Success).setDisabled(user.balance < betAmount)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`roll_exact10_${betAmount}`).setLabel('Exact 10s').setEmoji('🎯').setStyle(ButtonStyle.Secondary).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_double_${betAmount * 2}`).setLabel(`2x (${(betAmount * 2).toLocaleString()})`).setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(user.balance < betAmount * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row, row2]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            let newChoice, newBet;

            if (parts[1] === 'double') { newBet = parseInt(parts[2]); newChoice = betChoice; }
            else if (parts[1] === 'extreme') { newChoice = `extreme_${parts[2]}`; newBet = parseInt(parts[3]); }
            else { newChoice = parts[1]; newBet = parseInt(parts[2]); }

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeQuickRoll(interaction, freshUser, newBet, newChoice);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('d1').setLabel('Low').setEmoji('⬇️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d2').setLabel('High').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d3').setLabel('V.Low').setEmoji('📉').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d4').setLabel('V.High').setEmoji('📈').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch {}
        });
    },

    async executeQuickRoll(interaction, user, betAmount, betChoice) {
        const mode = ROLL_MODES[betChoice];
        const now = new Date();

        const rollResult = Math.floor(Math.random() * 100) + 1;
        const isWin = checkWin(betChoice, rollResult);

        const earningsMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        let winnings = 0;
        let netGain = -betAmount;

        if (isWin) {
            winnings = Math.floor(betAmount * mode.multiplier * earningsMultiplier);
            netGain = winnings - betAmount;
        }

        user.balance += netGain;
        user.commandData.lastRoll = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'roll', amount: netGain, timestamp: now });

        updateGameStats(user, betAmount, winnings, isWin);
        await user.save();

        const stats = user.gameStats?.roll || {};
        const winRate = stats.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0;

        const componentsV2 = createRollComponentsV2(rollResult, mode, isWin, netGain, user.balance, winRate, stats.played || 0);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`roll_low_${betAmount}`).setLabel('Low').setStyle(ButtonStyle.Primary).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_high_${betAmount}`).setLabel('High').setStyle(ButtonStyle.Primary).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_extreme_low_${betAmount}`).setLabel('V.Low').setStyle(ButtonStyle.Danger).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_extreme_high_${betAmount}`).setLabel('V.High').setStyle(ButtonStyle.Success).setDisabled(user.balance < betAmount)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`roll_exact10_${betAmount}`).setLabel('Exact 10s').setStyle(ButtonStyle.Secondary).setDisabled(user.balance < betAmount),
            new ButtonBuilder().setCustomId(`roll_double_${betAmount * 2}`).setLabel(`2x (${(betAmount * 2).toLocaleString()})`).setStyle(ButtonStyle.Success).setDisabled(user.balance < betAmount * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row, row2]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            let newChoice, newBet;

            if (parts[1] === 'double') { newBet = parseInt(parts[2]); newChoice = betChoice; }
            else if (parts[1] === 'extreme') { newChoice = `extreme_${parts[2]}`; newBet = parseInt(parts[3]); }
            else { newChoice = parts[1]; newBet = parseInt(parts[2]); }

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeQuickRoll(interaction, freshUser, newBet, newChoice);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('d1').setLabel('Low').setEmoji('⬇️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d2').setLabel('High').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d3').setLabel('V.Low').setEmoji('📉').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d4').setLabel('V.High').setEmoji('📈').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch {}
        });
    }
};
