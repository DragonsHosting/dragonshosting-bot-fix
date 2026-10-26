const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../../models/UserData');
const { getConfig, getLang } = require('../../../../utils/core/configLoader.js');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../../utils/core/componentsV2Builder.js');
const parseDuration = require('../Utility/parseDuration');
const { checkActiveBooster } = require('../Utility/helpers');

const config = getConfig();
const lang = getLang();

function formatCard(card) {
    const suits = { '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️' };
    return `${card.value}${suits[card.suit] || card.suit}`;
}

function formatHand(hand, hideSecond = false) {
    if (hideSecond && hand.length >= 2) {
        return `# ${formatCard(hand[0])}   ❓`;
    }
    return `# ${hand.map(formatCard).join('   ')}`;
}

function getGameColor(result) {
    if (!result) return '#2b2d31';
    if (result.type === 'WIN') return '#57F287';
    if (result.type === 'PUSH') return '#FEE75C';
    return '#ED4245';
}

function createGameComponentsV2(playerHand, dealerHand, hideDealer, betAmount, balance, result = null) {
    const playerValue = calculateHand(playerHand);
    const dealerValue = hideDealer ? '?' : calculateHand(dealerHand);
    
    let resultLine = '';
    if (result) {
        if (result.type === 'WIN') {
            resultLine = `\n\n## ✅ +${result.amount.toLocaleString()}`;
        } else if (result.type === 'PUSH') {
            resultLine = `\n\n## 🤝 Push`;
        } else {
            resultLine = `\n\n## ❌ -${Math.abs(result.amount).toLocaleString()}`;
        }
    }

    const color = getGameColor(result);
    
    return {
        Components: [
            {
                Type: 'container',
                AccentColor: color,
                Components: [
                    {
                        Type: 'text_display',
                        Content: `-# DEALER · ${dealerValue}\n${formatHand(dealerHand, hideDealer)}\n\n-# YOU · ${playerValue}\n${formatHand(playerHand)}${resultLine}`
                    },
                    {
                        Type: 'text_display',
                        Content: `-# Bet ${betAmount.toLocaleString()}  ·  Balance ${balance.toLocaleString()}`
                    }
                ]
            }
        ]
    };
}

module.exports = {
    name: 'blackjack',
    description: 'Play a game of blackjack',
    options: (subcommand) => subcommand
        .setName('blackjack')
        .setDescription('Play a game of blackjack')
        .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true)),

    async execute(interaction) {
        const betAmount = interaction.options.getInteger('bet');

        if (betAmount <= 0) {
            return interaction.reply({ content: lang.Economy?.Error?.BetAmountError || "Invalid bet amount.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, 'commandData.lastBlackjack': 1, transactionLogs: 1, boosters: 1 }
        );

        if (!user) {
            user = await initializeUser(interaction.user.id, interaction.guild.id);
        } else {
            ensureUserSchema(user);
            await user.save();
        }

        if (isOnCooldown(user, 'Blackjack', config.Economy.Blackjack.cooldown)) {
            const nextBlackjack = new Date(user.commandData.lastBlackjack.getTime() + parseDuration(config.Economy.Blackjack.cooldown));
            const componentsV2 = createGameComponentsV2([], [], true, 0, user.balance, { type: 'COOLDOWN', amount: 0 });
            componentsV2.Components[0].Components[0].Content = `**On Cooldown**\n\n> Next game <t:${Math.floor(nextBlackjack.getTime() / 1000)}:R>`;
            componentsV2.Components[0].AccentColor = '#ED4245';
            return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
        }

        if (user.balance < betAmount) {
            const componentsV2 = { Components: [{ Type: 'container', AccentColor: '#ED4245', Components: [{ Type: 'text_display', Content: '**Insufficient Funds**\n\n> You don\'t have enough coins for this bet.' }] }] };
            return editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}));
        }

        const deck = createDeck();
        const playerHand = [drawCard(deck), drawCard(deck)];
        const dealerHand = [drawCard(deck), drawCard(deck)];

        user.balance -= betAmount;
        user.commandData.lastBlackjack = new Date();
        await user.save();

        if (calculateHand(playerHand) === 21) {
            const dealerHandValue = calculateHand(dealerHand);
            const playerWins = dealerHandValue !== 21;
            await endBlackjackGame(interaction, user, betAmount, playerHand, dealerHand, playerWins, dealerHandValue === 21);
            return;
        }

        const componentsV2 = createGameComponentsV2(playerHand, dealerHand, true, betAmount, user.balance);
        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), createBlackjackButtons(user.balance >= betAmount));

        const message = await interaction.fetchReply();
        setupCollector(interaction, message, deck, playerHand, dealerHand, user, betAmount);
    },

    async executeQuickPlay(interaction, user, betAmount) {
        const deck = createDeck();
        const playerHand = [drawCard(deck), drawCard(deck)];
        const dealerHand = [drawCard(deck), drawCard(deck)];

        user.balance -= betAmount;
        user.commandData.lastBlackjack = new Date();
        await user.save();

        if (calculateHand(playerHand) === 21) {
            const dealerHandValue = calculateHand(dealerHand);
            const playerWins = dealerHandValue !== 21;
            await endBlackjackGame(interaction, user, betAmount, playerHand, dealerHand, playerWins, dealerHandValue === 21);
            return;
        }

        const componentsV2 = createGameComponentsV2(playerHand, dealerHand, true, betAmount, user.balance);
        await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), createBlackjackButtons(user.balance >= betAmount));

        const message = await interaction.fetchReply();
        setupCollector(interaction, message, deck, playerHand, dealerHand, user, betAmount);
    }
};

async function initializeUser(userId, guildId) {
    const newUser = new User({
        userId, guildId, balance: 0,
        commandData: { lastBlackjack: null, lastDaily: null, lastBeg: null, lastWork: null, lastCrime: null, lastSlot: null, lastRob: null },
        boosters: [], transactionLogs: [], inventory: []
    });
    await newUser.save();
    return newUser;
}

function ensureUserSchema(user) {
    if (!user.commandData) user.commandData = {};
    if (!user.commandData.lastBlackjack) user.commandData.lastBlackjack = null;
    if (!Array.isArray(user.transactionLogs)) user.transactionLogs = [];
    if (!Array.isArray(user.boosters)) user.boosters = [];
    if (!Array.isArray(user.inventory)) user.inventory = [];
    if (typeof user.balance !== 'number') user.balance = 0;
}

function isOnCooldown(user, command, cooldownDuration) {
    const lastCommandTime = user.commandData[`last${command}`];
    if (!lastCommandTime) return false;
    const cooldown = parseDuration(cooldownDuration);
    return (new Date() - new Date(lastCommandTime)) < cooldown;
}

function setupCollector(interaction, message, deck, playerHand, dealerHand, user, betAmount) {
    const collector = message.createMessageComponentCollector({ time: 600000, filter: i => i.user.id === interaction.user.id });

    collector.on('collect', async i => {
        if (i.customId === 'hit') {
            playerHand.push(drawCard(deck));
            const playerHandValue = calculateHand(playerHand);
            
            if (playerHandValue >= 21) {
                await endBlackjackGame(interaction, user, betAmount, playerHand, dealerHand, playerHandValue === 21, false, i);
                collector.stop();
                return;
            }
            
            const componentsV2 = createGameComponentsV2(playerHand, dealerHand, true, betAmount, user.balance);
            await i.deferUpdate();
            await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), createBlackjackButtons(user.balance >= betAmount));
        } else if (i.customId === 'stand') {
            await handleStand(interaction, i, user, betAmount, playerHand, dealerHand, deck);
            collector.stop();
        } else if (i.customId === 'double') {
            await handleDouble(interaction, i, user, betAmount, playerHand, dealerHand, deck);
            collector.stop();
        }
    });
}

async function handleStand(interaction, collectorInteraction, user, betAmount, playerHand, dealerHand, deck) {
    while (calculateHand(dealerHand) < 17) dealerHand.push(drawCard(deck));
    const playerHandValue = calculateHand(playerHand);
    const dealerHandValue = calculateHand(dealerHand);
    const playerWins = playerHandValue <= 21 && (dealerHandValue > 21 || playerHandValue > dealerHandValue);
    const isDraw = playerHandValue === dealerHandValue;
    await endBlackjackGame(interaction, user, betAmount, playerHand, dealerHand, playerWins, isDraw, collectorInteraction);
}

async function handleDouble(interaction, collectorInteraction, user, betAmount, playerHand, dealerHand, deck) {
    if (user.balance < betAmount) {
        await collectorInteraction.reply({ content: lang.Economy?.Error?.NoMoney || "You don't have enough coins.", flags: MessageFlags.Ephemeral });
        return;
    }
    user.balance -= betAmount;
    playerHand.push(drawCard(deck));
    while (calculateHand(dealerHand) < 17) dealerHand.push(drawCard(deck));
    const playerHandValue = calculateHand(playerHand);
    const dealerHandValue = calculateHand(dealerHand);
    const playerWins = playerHandValue <= 21 && (dealerHandValue > 21 || playerHandValue > dealerHandValue);
    const isDraw = playerHandValue === dealerHandValue;
    await endBlackjackGame(interaction, user, betAmount * 2, playerHand, dealerHand, playerWins, isDraw, collectorInteraction);
    await user.save();
}

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (let i = 0; i < suits.length; i++) {
        for (let j = 0; j < values.length; j++) {
            deck.push({ value: values[j], suit: suits[i] });
        }
    }
    return shuffle(deck);
}

function drawCard(deck) { return deck.pop(); }

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function calculateHand(hand) {
    let sum = 0, aces = 0;
    for (let i = 0; i < hand.length; i++) {
        const value = hand[i].value;
        if (value === 'A') { aces++; sum += 11; }
        else if (value === 'K' || value === 'Q' || value === 'J') sum += 10;
        else sum += parseInt(value);
    }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
}

function createBlackjackButtons(canDouble) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('double').setLabel('Double').setStyle(ButtonStyle.Primary).setDisabled(!canDouble)
        )
    ];
}

async function endBlackjackGame(interaction, user, betAmount, playerHand, dealerHand, playerWins, isDraw = false, collectorInteraction = null) {
    const winMultiplier = config.Economy.Blackjack.winMultiplier;
    const originalBetAmount = betAmount;
    let winnings = betAmount * winMultiplier;

    const multiplier = checkActiveBooster(user, 'Money');
    winnings *= multiplier;

    let totalReturn = 0;
    if (playerWins) {
        totalReturn = betAmount + (betAmount * (winMultiplier - 1));
        user.balance += totalReturn;
    } else if (isDraw) {
        totalReturn = betAmount;
        user.balance += betAmount;
    }

    ensureUserSchema(user);

    const transactionType = playerWins ? 'blackjack_win' : isDraw ? 'blackjack_draw' : 'blackjack_lose';
    const amount = playerWins ? totalReturn - originalBetAmount : isDraw ? 0 : originalBetAmount;

    user.transactionLogs.push({ type: transactionType, amount: Math.abs(amount), timestamp: new Date() });
    await user.save();

    const netChange = playerWins ? totalReturn - originalBetAmount : isDraw ? 0 : -originalBetAmount;
    const resultType = playerWins ? 'WIN' : isDraw ? 'PUSH' : 'BUST';
    
    const componentsV2 = createGameComponentsV2(playerHand, dealerHand, false, betAmount, user.balance, { type: resultType, amount: netChange });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bj_again_${betAmount}`).setLabel(`Again (${betAmount.toLocaleString()})`).setStyle(ButtonStyle.Primary).setDisabled(user.balance < betAmount),
        new ButtonBuilder().setCustomId(`bj_double_${betAmount * 2}`).setLabel(`2x (${(betAmount * 2).toLocaleString()})`).setStyle(ButtonStyle.Secondary).setDisabled(user.balance < betAmount * 2)
    );

    if (collectorInteraction) await collectorInteraction.deferUpdate();
    
    await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [row]);
    
    const message = await interaction.fetchReply();

    const playAgainCollector = message.createMessageComponentCollector({ 
        time: 30000, 
        filter: i => i.user.id === interaction.user.id && (i.customId.startsWith('bj_again') || i.customId.startsWith('bj_double'))
    });

    playAgainCollector.on('collect', async i => {
        const newBet = parseInt(i.customId.split('_')[2]);
        let freshUser = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        if (!freshUser || freshUser.balance < newBet) {
            return i.reply({ content: 'Insufficient balance!', flags: MessageFlags.Ephemeral });
        }
        playAgainCollector.stop();
        await i.deferUpdate();
        await module.exports.executeQuickPlay(interaction, freshUser, newBet);
    });

    playAgainCollector.on('end', async (_, reason) => {
        if (reason === 'time') {
            try {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bj_expired_1').setLabel('Again').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('bj_expired_2').setLabel('2x').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [disabledRow]);
            } catch (e) {}
        }
    });
}
