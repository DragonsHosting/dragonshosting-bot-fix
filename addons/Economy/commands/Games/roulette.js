const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../../models/UserData');
const { getConfig, getLang } = require('../../../../utils/core/configLoader.js');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../../utils/core/componentsV2Builder.js');
const parseDuration = require('../Utility/parseDuration');
const { getTotalEarningsMultiplier } = require('../Utility/helpers');

const config = getConfig();
const lang = getLang();

const ROULETTE_NUMBERS = [
    { num: 0, color: 'green' },
    { num: 32, color: 'red' }, { num: 15, color: 'black' }, { num: 19, color: 'red' }, { num: 4, color: 'black' },
    { num: 21, color: 'red' }, { num: 2, color: 'black' }, { num: 25, color: 'red' }, { num: 17, color: 'black' },
    { num: 34, color: 'red' }, { num: 6, color: 'black' }, { num: 27, color: 'red' }, { num: 13, color: 'black' },
    { num: 36, color: 'red' }, { num: 11, color: 'black' }, { num: 30, color: 'red' }, { num: 8, color: 'black' },
    { num: 23, color: 'red' }, { num: 10, color: 'black' }, { num: 5, color: 'red' }, { num: 24, color: 'black' },
    { num: 16, color: 'red' }, { num: 33, color: 'black' }, { num: 1, color: 'red' }, { num: 20, color: 'black' },
    { num: 14, color: 'red' }, { num: 31, color: 'black' }, { num: 9, color: 'red' }, { num: 22, color: 'black' },
    { num: 18, color: 'red' }, { num: 29, color: 'black' }, { num: 7, color: 'red' }, { num: 28, color: 'black' },
    { num: 12, color: 'red' }, { num: 35, color: 'black' }, { num: 3, color: 'red' }, { num: 26, color: 'black' }
];

const BET_TYPES = {
    red: { name: 'Red', emoji: '🔴', multiplier: 2 },
    black: { name: 'Black', emoji: '⚫', multiplier: 2 },
    green: { name: 'Green (0)', emoji: '🟢', multiplier: 36 },
    odd: { name: 'Odd', emoji: '1️⃣', multiplier: 2 },
    even: { name: 'Even', emoji: '2️⃣', multiplier: 2 },
    high: { name: 'High (19-36)', emoji: '⬆️', multiplier: 2 },
    low: { name: 'Low (1-18)', emoji: '⬇️', multiplier: 2 },
    first12: { name: '1st 12', emoji: '1️⃣', multiplier: 3 },
    second12: { name: '2nd 12', emoji: '2️⃣', multiplier: 3 },
    third12: { name: '3rd 12', emoji: '3️⃣', multiplier: 3 }
};

function checkWin(betType, result) {
    const { num, color } = result;
    switch (betType) {
        case 'red': return color === 'red';
        case 'black': return color === 'black';
        case 'green': return color === 'green';
        case 'odd': return num !== 0 && num % 2 === 1;
        case 'even': return num !== 0 && num % 2 === 0;
        case 'high': return num >= 19 && num <= 36;
        case 'low': return num >= 1 && num <= 18;
        case 'first12': return num >= 1 && num <= 12;
        case 'second12': return num >= 13 && num <= 24;
        case 'third12': return num >= 25 && num <= 36;
        default: return false;
    }
}

function updateGameStats(user, bet, winnings, won) {
    if (!user.gameStats) user.gameStats = {};
    if (!user.gameStats.roulette) {
        user.gameStats.roulette = { played: 0, won: 0, totalWagered: 0, totalWon: 0, biggestWin: 0 };
    }
    const stats = user.gameStats.roulette;
    stats.played++;
    stats.totalWagered += bet;
    if (won) {
        stats.won++;
        stats.totalWon += winnings;
        if (winnings > stats.biggestWin) stats.biggestWin = winnings;
    }
}

function createRouletteComponentsV2(result, betInfo, win, netGain, balance, winRate, biggestWin) {
    const color = win ? '#57F287' : '#ED4245';
    return {
        Components: [
            {
                Type: 'container',
                AccentColor: color,
                Components: [
                    { Type: 'text_display', Content: `The ball landed on **${result.num} ${result.color.toUpperCase()}**` },
                    { Type: 'text_display', Content: `> **Your Bet:** ${betInfo.name}\n> **${win ? 'Won' : 'Lost'}:** ${Math.abs(netGain).toLocaleString()}\n> **Balance:** ${balance.toLocaleString()}` },
                    { Type: 'text_display', Content: `-# Win Rate: ${winRate}% · Biggest Win: ${biggestWin.toLocaleString()}` }
                ]
            }
        ]
    };
}

module.exports = {
    name: 'roulette',
    description: 'Play a game of roulette',
    options: (subcommand) => subcommand
        .setName('roulette')
        .setDescription('Play a game of roulette')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true))
        .addStringOption(option =>
            option.setName('type').setDescription('Choose bet type').setRequired(true)
                .addChoices(
                    { name: '🔴 Red (2x)', value: 'red' },
                    { name: '⚫ Black (2x)', value: 'black' },
                    { name: '🟢 Green 0 (36x)', value: 'green' },
                    { name: '1️⃣ Odd (2x)', value: 'odd' },
                    { name: '2️⃣ Even (2x)', value: 'even' },
                    { name: '⬆️ High 19-36 (2x)', value: 'high' },
                    { name: '⬇️ Low 1-18 (2x)', value: 'low' },
                    { name: '1st Dozen 1-12 (3x)', value: 'first12' },
                    { name: '2nd Dozen 13-24 (3x)', value: 'second12' },
                    { name: '3rd Dozen 25-36 (3x)', value: 'third12' }
                )
        ),

    async execute(interaction) {
        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, 'commandData.lastRoulette': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1, gameStats: 1 }
        );

        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0, commandData: {}, boosters: [], transactionLogs: [], gameStats: {} });
        }

        const now = new Date();
        const cooldown = parseDuration(config.Economy.Roulette.cooldown);

        if (cooldown > 0 && user.commandData.lastRoulette) {
            const nextRoulette = new Date(user.commandData.lastRoulette.getTime() + cooldown);
            if (now < nextRoulette) {
                const componentsV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                    { Type: 'text_display', Content: `**Roulette · Cooldown**\n\n> Next spin <t:${Math.floor(nextRoulette.getTime() / 1000)}:R>` },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]}]};
                await interaction.deferReply();
                return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
            }
        }

        const bet = interaction.options.getInteger('bet');
        const betType = interaction.options.getString('type');
        const betInfo = BET_TYPES[betType];

        if (bet <= 0) return interaction.reply({ content: lang.Economy?.Error?.BetAmountError || "Invalid bet amount.", flags: MessageFlags.Ephemeral });

        if (user.balance < bet) {
            const componentsV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                { Type: 'text_display', Content: `**Insufficient Funds**\n\n> You need **${(bet - user.balance).toLocaleString()}** more coins!` }
            ]}]};
            await interaction.deferReply();
            return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
        }

        await interaction.deferReply();

        const spinV2 = { Components: [{ Type: 'container', AccentColor: '#2b2d31', Components: [
            { Type: 'text_display', Content: `Spinning... Bet: ${betInfo.name} (${betInfo.multiplier}x)` }
        ]}]};
        await editReplyComponentsV2(interaction, spinV2.Components, createSimplePlaceholderReplacer({}));

        await new Promise(resolve => setTimeout(resolve, 2000));

        const resultIndex = Math.floor(Math.random() * 37);
        const result = ROULETTE_NUMBERS[resultIndex];
        const win = checkWin(betType, result);

        const earningsMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        let winnings = 0;
        let netGain = -bet;

        if (win) {
            winnings = Math.floor(bet * betInfo.multiplier * earningsMultiplier);
            netGain = winnings - bet;
        }

        user.balance += netGain;
        user.commandData.lastRoulette = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'roulette', amount: netGain, timestamp: now });

        updateGameStats(user, bet, winnings, win);
        await user.save();

        const stats = user.gameStats?.roulette || {};
        const winRate = stats.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0;

        const componentsV2 = createRouletteComponentsV2(result, betInfo, win, netGain, user.balance, winRate, stats.biggestWin || 0);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rl_red_${bet}`).setLabel('Red').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_black_${bet}`).setLabel('Black').setEmoji('⚫').setStyle(ButtonStyle.Secondary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_green_${bet}`).setLabel('Green').setEmoji('🟢').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rl_odd_${bet}`).setLabel('Odd').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_even_${bet}`).setLabel('Even').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_double_${bet * 2}`).setLabel(`2x (${(bet * 2).toLocaleString()})`).setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row1, row2]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            let newBetType = parts[1];
            let newBet = parseInt(parts[2]);

            if (newBetType === 'double') newBetType = betType;

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeQuickSpin(interaction, freshUser, newBet, newBetType);
        });

        collector.on('end', async () => {
            try {
                const disabledRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('d1').setLabel('Red').setEmoji('🔴').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d2').setLabel('Black').setEmoji('⚫').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d3').setLabel('Green').setEmoji('🟢').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow1]);
            } catch {}
        });
    },

    async executeQuickSpin(interaction, user, bet, betType) {
        const now = new Date();
        const betInfo = BET_TYPES[betType];

        const resultIndex = Math.floor(Math.random() * 37);
        const result = ROULETTE_NUMBERS[resultIndex];
        const win = checkWin(betType, result);

        const earningsMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        let winnings = 0;
        let netGain = -bet;

        if (win) {
            winnings = Math.floor(bet * betInfo.multiplier * earningsMultiplier);
            netGain = winnings - bet;
        }

        user.balance += netGain;
        user.commandData.lastRoulette = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'roulette', amount: netGain, timestamp: now });

        updateGameStats(user, bet, winnings, win);
        await user.save();

        const stats = user.gameStats?.roulette || {};
        const winRate = stats.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0;

        const componentsV2 = createRouletteComponentsV2(result, betInfo, win, netGain, user.balance, winRate, stats.biggestWin || 0);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rl_red_${bet}`).setLabel('Red').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_black_${bet}`).setLabel('Black').setEmoji('⚫').setStyle(ButtonStyle.Secondary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_green_${bet}`).setLabel('Green').setEmoji('🟢').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rl_odd_${bet}`).setLabel('Odd').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_even_${bet}`).setLabel('Even').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`rl_double_${bet * 2}`).setLabel(`2x (${(bet * 2).toLocaleString()})`).setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row1, row2]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            let newBetType = parts[1];
            let newBet = parseInt(parts[2]);

            if (newBetType === 'double') newBetType = betType;

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeQuickSpin(interaction, freshUser, newBet, newBetType);
        });

        collector.on('end', async () => {
            try {
                const disabledRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('d1').setLabel('Red').setEmoji('🔴').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d2').setLabel('Black').setEmoji('⚫').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d3').setLabel('Green').setEmoji('🟢').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow1]);
            } catch {}
        });
    }
};
