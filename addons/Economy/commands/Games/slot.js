const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../../models/UserData');
const { getConfig, getLang } = require('../../../../utils/core/configLoader.js');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../../utils/core/componentsV2Builder.js');
const parseDuration = require('../Utility/parseDuration');
const { getTotalEarningsMultiplier } = require('../Utility/helpers');

const config = getConfig();
const lang = getLang();

const SYMBOLS = [
    { symbol: 'A', name: 'Apple', weight: 25, multiplier: 2, color: '#ef4444' },
    { symbol: 'O', name: 'Orange', weight: 22, multiplier: 2.5, color: '#f97316' },
    { symbol: 'G', name: 'Grapes', weight: 18, multiplier: 3, color: '#a855f7' },
    { symbol: 'C', name: 'Cherry', weight: 15, multiplier: 4, color: '#ec4899' },
    { symbol: 'D', name: 'Diamond', weight: 12, multiplier: 6, color: '#3b82f6' },
    { symbol: 'S', name: 'Star', weight: 5, multiplier: 8, color: '#eab308' },
    { symbol: '7', name: 'Seven', weight: 3, multiplier: 15, color: '#22c55e' }
];

function weightedRandom() {
    const total = SYMBOLS.reduce((a, b) => a + b.weight, 0);
    let random = Math.random() * total;
    for (const symbol of SYMBOLS) {
        random -= symbol.weight;
        if (random <= 0) return symbol;
    }
    return SYMBOLS[0];
}

function formatSlotDisplay(reels, spinning = false) {
    if (spinning) return `\`[ ${reels[0]?.symbol || '?'} | ? | ? ]\``;
    return `\`[ ${reels[0]?.symbol || '?'} | ${reels[1]?.symbol || '?'} | ${reels[2]?.symbol || '?'} ]\``;
}

function updateGameStats(user, bet, winnings, resultType) {
    if (!user.gameStats) user.gameStats = {};
    if (!user.gameStats.slots) {
        user.gameStats.slots = { played: 0, won: 0, jackpots: 0, streak: 0, bestStreak: 0, totalWagered: 0, totalWon: 0, biggestWin: 0 };
    }
    const stats = user.gameStats.slots;
    stats.played++;
    stats.totalWagered += bet;
    if (winnings > 0) {
        stats.won++;
        stats.totalWon += winnings;
        stats.streak++;
        if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
        if (winnings > stats.biggestWin) stats.biggestWin = winnings;
        if (resultType === 'jackpot') stats.jackpots++;
    } else {
        stats.streak = 0;
    }
}

function getStreakBonus(streak) {
    if (streak >= 10) return 1.5;
    if (streak >= 5) return 1.25;
    if (streak >= 3) return 1.1;
    return 1;
}

function createSlotComponentsV2(reels, resultText, netGain, balance, streak, bestStreak, streakBonus, win) {
    const color = win ? '#57F287' : '#ED4245';
    const bonusText = streakBonus > 1 ? ` · +${((streakBonus - 1) * 100).toFixed(0)}% bonus` : '';
    return {
        Components: [
            {
                Type: 'container',
                AccentColor: color,
                Components: [
                    { Type: 'text_display', Content: formatSlotDisplay(reels) },
                    { Type: 'text_display', Content: `**${resultText}**\n\n> **${win ? 'Won' : 'Lost'}:** ${Math.abs(netGain).toLocaleString()}\n> **Balance:** ${balance.toLocaleString()}` },
                    { Type: 'text_display', Content: `-# Streak: ${streak} · Best: ${bestStreak}${bonusText}` }
                ]
            }
        ]
    };
}

module.exports = {
    name: 'slot',
    description: 'Play a slot machine',
    options: (subcommand) => subcommand
        .setName('slot')
        .setDescription('Play a slot machine')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true)),

    async execute(interaction) {
        const cooldown = parseDuration(config.Economy.Slot.cooldown);

        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, 'commandData.lastSlot': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1, gameStats: 1 }
        );

        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0, commandData: {}, boosters: [], gameStats: {} });
        }

        const now = new Date();

        if (cooldown > 0 && user.commandData.lastSlot) {
            const nextSlot = new Date(user.commandData.lastSlot.getTime() + cooldown);
            if (now < nextSlot) {
                const componentsV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                    { Type: 'text_display', Content: `**Slots · Cooldown**\n\n> Next spin <t:${Math.floor(nextSlot.getTime() / 1000)}:R>` },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]}]};
                await interaction.deferReply();
                return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
            }
        }

        const bet = interaction.options.getInteger('bet');

        if (bet <= 0) return interaction.reply({ content: lang.Economy?.Error?.BetAmountError || "Invalid bet amount.", flags: MessageFlags.Ephemeral });

        if (user.balance < bet) {
            const componentsV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `**Insufficient Funds**\n\n> You need **${(bet - user.balance).toLocaleString()}** more coins!` }
            ]}]};
            await interaction.deferReply();
            return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
        }

        await interaction.deferReply();

        const spinningV2 = { Components: [{ Type: 'container', AccentColor: '#2b2d31', Components: [
            { Type: 'text_display', Content: `${formatSlotDisplay([weightedRandom()], true)}\n\nSpinning...` }
        ]}]};
        await editReplyComponentsV2(interaction, spinningV2.Components, createSimplePlaceholderReplacer({}));

        await new Promise(resolve => setTimeout(resolve, 1500));

        const result = [weightedRandom(), weightedRandom(), weightedRandom()];
        const allMatch = result[0].symbol === result[1].symbol && result[1].symbol === result[2].symbol;
        const twoMatch = result[0].symbol === result[1].symbol || result[1].symbol === result[2].symbol || result[0].symbol === result[2].symbol;
        const jackpot = allMatch && result[0].symbol === '7';
        const bonusTriggered = Math.random() < 0.05 && allMatch;

        const baseMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        const currentStreak = user.gameStats?.slots?.streak || 0;
        const streakBonus = getStreakBonus(currentStreak);
        const totalMultiplier = baseMultiplier * streakBonus;

        let winnings = 0;
        let resultType = 'lose';

        if (jackpot) { winnings = Math.floor(bet * result[0].multiplier * totalMultiplier); resultType = 'jackpot'; }
        else if (allMatch) { winnings = Math.floor(bet * result[0].multiplier * totalMultiplier); resultType = 'win'; }
        else if (twoMatch) { winnings = Math.floor(bet * 0.5); resultType = 'partial'; }

        if (bonusTriggered && winnings > 0) { winnings = Math.floor(winnings * 2); resultType = 'bonus'; }

        const netGain = winnings > 0 ? winnings : -bet;
        user.balance += netGain;
        user.commandData.lastSlot = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'slot', amount: netGain, timestamp: now });
        updateGameStats(user, bet, winnings, resultType);
        await user.save();

        const stats = user.gameStats?.slots || {};
        const newStreak = stats.streak || 0;

        let resultText;
        switch (resultType) {
            case 'jackpot': resultText = 'JACKPOT'; break;
            case 'bonus': resultText = 'BONUS 2x'; break;
            case 'win': resultText = `Three ${result[0].name}s`; break;
            case 'partial': resultText = 'Two matching'; break;
            default: resultText = 'No match';
        }

        const componentsV2 = createSlotComponentsV2(result, resultText, netGain, user.balance, newStreak, stats.bestStreak || 0, streakBonus, winnings > 0);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`slot_again_${bet}`).setLabel(`Spin Again (${bet.toLocaleString()})`).setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`slot_double_${bet * 2}`).setLabel(`Double (${(bet * 2).toLocaleString()})`).setStyle(ButtonStyle.Success).setDisabled(user.balance < bet * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const [, action, betStr] = i.customId.split('_');
            const newBet = parseInt(betStr);

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            interaction.options = { getInteger: () => newBet };
            await i.deferUpdate();
            await this.executeWithExistingInteraction(interaction, freshUser, newBet);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('disabled1').setLabel('Spin Again').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('disabled2').setLabel('Double').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch {}
        });
    },

    async executeWithExistingInteraction(interaction, user, bet) {
        const now = new Date();
        const result = [weightedRandom(), weightedRandom(), weightedRandom()];
        const allMatch = result[0].symbol === result[1].symbol && result[1].symbol === result[2].symbol;
        const twoMatch = result[0].symbol === result[1].symbol || result[1].symbol === result[2].symbol || result[0].symbol === result[2].symbol;
        const jackpot = allMatch && result[0].symbol === '7';
        const bonusTriggered = Math.random() < 0.05 && allMatch;

        const baseMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        const currentStreak = user.gameStats?.slots?.streak || 0;
        const streakBonus = getStreakBonus(currentStreak);
        const totalMultiplier = baseMultiplier * streakBonus;

        let winnings = 0;
        let resultType = 'lose';

        if (jackpot) { winnings = Math.floor(bet * result[0].multiplier * totalMultiplier); resultType = 'jackpot'; }
        else if (allMatch) { winnings = Math.floor(bet * result[0].multiplier * totalMultiplier); resultType = 'win'; }
        else if (twoMatch) { winnings = Math.floor(bet * 0.5); resultType = 'partial'; }

        if (bonusTriggered && winnings > 0) { winnings = Math.floor(winnings * 2); resultType = 'bonus'; }

        const netGain = winnings > 0 ? winnings : -bet;
        user.balance += netGain;
        user.commandData.lastSlot = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'slot', amount: netGain, timestamp: now });
        updateGameStats(user, bet, winnings, resultType);
        await user.save();

        const stats = user.gameStats?.slots || {};
        const newStreak = stats.streak || 0;

        let resultText;
        switch (resultType) {
            case 'jackpot': resultText = 'JACKPOT'; break;
            case 'bonus': resultText = 'BONUS 2x'; break;
            case 'win': resultText = `Three ${result[0].name}s`; break;
            case 'partial': resultText = 'Two matching'; break;
            default: resultText = 'No match';
        }

        const componentsV2 = createSlotComponentsV2(result, resultText, netGain, user.balance, newStreak, stats.bestStreak || 0, streakBonus, winnings > 0);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`slot_again_${bet}`).setLabel(`Spin Again (${bet.toLocaleString()})`).setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`slot_double_${bet * 2}`).setLabel(`Double (${(bet * 2).toLocaleString()})`).setStyle(ButtonStyle.Success).setDisabled(user.balance < bet * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const [, action, betStr] = i.customId.split('_');
            const newBet = parseInt(betStr);

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeWithExistingInteraction(interaction, freshUser, newBet);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('disabled1').setLabel('Spin Again').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('disabled2').setLabel('Double').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch {}
        });
    }
};
