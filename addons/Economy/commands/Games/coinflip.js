const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../../models/UserData');
const { getConfig, getLang } = require('../../../../utils/core/configLoader.js');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../../utils/core/componentsV2Builder.js');
const parseDuration = require('../Utility/parseDuration');
const { getTotalEarningsMultiplier } = require('../Utility/helpers');

const config = getConfig();
const lang = getLang();

function updateGameStats(user, bet, winnings, won) {
    if (!user.gameStats) user.gameStats = {};
    if (!user.gameStats.coinflip) {
        user.gameStats.coinflip = { played: 0, won: 0, streak: 0, bestStreak: 0, totalWagered: 0, totalWon: 0 };
    }
    const stats = user.gameStats.coinflip;
    stats.played++;
    stats.totalWagered += bet;
    if (won) {
        stats.won++;
        stats.totalWon += winnings;
        stats.streak++;
        if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
    } else {
        stats.streak = 0;
    }
}

function getStreakBonus(streak) {
    if (streak >= 7) return 1.5;
    if (streak >= 5) return 1.3;
    if (streak >= 3) return 1.15;
    return 1;
}

function createCoinflipComponentsV2(result, guess, win, netGain, balance, streak, bestStreak, winRate) {
    const color = win ? '#57F287' : '#ED4245';
    return {
        Components: [
            {
                Type: 'container',
                AccentColor: color,
                Components: [
                    { Type: 'text_display', Content: `The coin landed on **${result === 'heads' ? 'Heads' : 'Tails'}**` },
                    { Type: 'text_display', Content: `> **Your Guess:** ${guess === 'heads' ? 'Heads' : 'Tails'}\n> **${win ? 'Won' : 'Lost'}:** ${Math.abs(netGain).toLocaleString()}\n> **Balance:** ${balance.toLocaleString()}` },
                    { Type: 'text_display', Content: `-# Streak: ${streak} · Best: ${bestStreak} · Win Rate: ${winRate}%` }
                ]
            }
        ]
    };
}

module.exports = {
    name: 'coinflip',
    description: 'Flip a coin and test your luck',
    options: (subcommand) => subcommand
        .setName('coinflip')
        .setDescription('Flip a coin and test your luck!')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true))
        .addStringOption(option => option.setName('guess').setDescription('Guess the outcome: heads or tails').setRequired(true).addChoices(
            { name: 'Heads', value: 'heads' },
            { name: 'Tails', value: 'tails' }
        )),

    async execute(interaction) {
        const cooldown = parseDuration(config.Economy.Coinflip.cooldown);

        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, 'commandData.lastCoinflip': 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1, gameStats: 1 }
        );

        if (!user) {
            user = new User({ userId: interaction.user.id, guildId: interaction.guild.id, balance: 0, commandData: {}, boosters: [], gameStats: {} });
        }

        const now = new Date();

        if (cooldown > 0 && user.commandData.lastCoinflip) {
            const nextCoinflip = new Date(user.commandData.lastCoinflip.getTime() + cooldown);
            if (now < nextCoinflip) {
                const componentsV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [
                    { Type: 'text_display', Content: `**On Cooldown**\n\n> Next flip <t:${Math.floor(nextCoinflip.getTime() / 1000)}:R>` },
                    { Type: 'text_display', Content: `-# Balance: ${user.balance.toLocaleString()} coins` }
                ]}]};
                await interaction.deferReply();
                return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
            }
        }

        const bet = interaction.options.getInteger('bet');
        const guess = interaction.options.getString('guess').toLowerCase();

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
            { Type: 'text_display', Content: `Flipping... You chose **${guess === 'heads' ? 'Heads' : 'Tails'}**` }
        ]}]};
        await editReplyComponentsV2(interaction, spinningV2.Components, createSimplePlaceholderReplacer({}));

        await new Promise(resolve => setTimeout(resolve, 1500));

        const result = Math.random() > 0.5 ? 'heads' : 'tails';
        const win = guess === result;

        const baseMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        const currentStreak = user.gameStats?.coinflip?.streak || 0;
        const streakBonus = win ? getStreakBonus(currentStreak) : 1;
        const totalMultiplier = baseMultiplier * streakBonus;

        const winnings = win ? Math.floor(bet * totalMultiplier) : 0;
        const netGain = win ? winnings : -bet;

        user.balance += netGain;
        user.commandData.lastCoinflip = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'coinflip', amount: netGain, timestamp: now });

        updateGameStats(user, bet, winnings, win);
        await user.save();

        const stats = user.gameStats?.coinflip || {};
        const newStreak = stats.streak || 0;
        const winRate = stats.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0;

        const componentsV2 = createCoinflipComponentsV2(result, guess, win, netGain, user.balance, newStreak, stats.bestStreak || 0, winRate);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cf_heads_${bet}`).setLabel(`Heads (${bet.toLocaleString()})`).setEmoji('👑').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`cf_tails_${bet}`).setLabel(`Tails (${bet.toLocaleString()})`).setEmoji('🦅').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`cf_double_${bet * 2}`).setLabel(`2x (${(bet * 2).toLocaleString()})`).setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            let newGuess, newBet;
            if (parts[1] === 'double') { newBet = parseInt(parts[2]); newGuess = guess; }
            else { newGuess = parts[1]; newBet = parseInt(parts[2]); }

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeQuickFlip(interaction, freshUser, newBet, newGuess);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('d1').setLabel('Heads').setEmoji('👑').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d2').setLabel('Tails').setEmoji('🦅').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d3').setLabel('2x').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch {}
        });
    },

    async executeQuickFlip(interaction, user, bet, guess) {
        const now = new Date();
        const result = Math.random() > 0.5 ? 'heads' : 'tails';
        const win = guess === result;

        const baseMultiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
        const currentStreak = user.gameStats?.coinflip?.streak || 0;
        const streakBonus = win ? getStreakBonus(currentStreak) : 1;
        const totalMultiplier = baseMultiplier * streakBonus;

        const winnings = win ? Math.floor(bet * totalMultiplier) : 0;
        const netGain = win ? winnings : -bet;

        user.balance += netGain;
        user.commandData.lastCoinflip = now;
        if (!user.transactionLogs) user.transactionLogs = [];
        user.transactionLogs.push({ type: 'coinflip', amount: netGain, timestamp: now });

        updateGameStats(user, bet, winnings, win);
        await user.save();

        const stats = user.gameStats?.coinflip || {};
        const newStreak = stats.streak || 0;
        const winRate = stats.played > 0 ? ((stats.won / stats.played) * 100).toFixed(1) : 0;

        const componentsV2 = createCoinflipComponentsV2(result, guess, win, netGain, user.balance, newStreak, stats.bestStreak || 0, winRate);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cf_heads_${bet}`).setLabel(`Heads (${bet.toLocaleString()})`).setEmoji('👑').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`cf_tails_${bet}`).setLabel(`Tails (${bet.toLocaleString()})`).setEmoji('🦅').setStyle(ButtonStyle.Primary).setDisabled(user.balance < bet),
            new ButtonBuilder().setCustomId(`cf_double_${bet * 2}`).setLabel(`2x (${(bet * 2).toLocaleString()})`).setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(user.balance < bet * 2)
        );

        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row]);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 30000, filter: i => i.user.id === interaction.user.id });

        collector.on('collect', async i => {
            const parts = i.customId.split('_');
            let newGuess, newBet;
            if (parts[1] === 'double') { newBet = parseInt(parts[2]); newGuess = guess; }
            else { newGuess = parts[1]; newBet = parseInt(parts[2]); }

            let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
            if (!freshUser || freshUser.balance < newBet) {
                return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
            }

            collector.stop();
            await i.deferUpdate();
            await this.executeQuickFlip(interaction, freshUser, newBet, newGuess);
        });

        collector.on('end', async () => {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('d1').setLabel('Heads').setEmoji('👑').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d2').setLabel('Tails').setEmoji('🦅').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('d3').setLabel('2x').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch {}
        });
    }
};
