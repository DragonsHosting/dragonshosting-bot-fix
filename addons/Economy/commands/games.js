const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const slotSymbols = ['🍒', '🍋', '🍇', '⭐', '💎', '7️⃣'];
const rouletteColors = ['red', 'black'];

function baseEmbed(title) {
    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(title)
        .setFooter({ text: 'DragonHosting' })
        .setTimestamp();
}

function drawCard() {
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    return values[Math.floor(Math.random() * values.length)] + suits[Math.floor(Math.random() * suits.length)];
}

function cardValue(card) {
    const raw = card.replace(/[♠️♥️♦️♣️]/g, '');
    if (raw === 'A') return 11;
    if (['J', 'Q', 'K'].includes(raw)) return 10;
    return Number(raw);
}

function handValue(hand) {
    let total = hand.reduce((sum, card) => sum + cardValue(card), 0);
    let aces = hand.filter(card => card.startsWith('A')).length;
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('games')
        .setDescription('Play quick DragonHosting minigames')
        .addSubcommand(subcommand => subcommand
            .setName('coinflip')
            .setDescription('Flip a coin')
            .addStringOption(option => option
                .setName('choice')
                .setDescription('Your choice')
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' },
                )))
        .addSubcommand(subcommand => subcommand
            .setName('dice')
            .setDescription('Roll a dice')
            .addIntegerOption(option => option
                .setName('sides')
                .setDescription('Number of sides')
                .setMinValue(2)
                .setMaxValue(100))
            .addIntegerOption(option => option
                .setName('guess')
                .setDescription('Optional exact guess')
                .setMinValue(1)
                .setMaxValue(100)))
        .addSubcommand(subcommand => subcommand
            .setName('slots')
            .setDescription('Spin a slot machine'))
        .addSubcommand(subcommand => subcommand
            .setName('blackjack')
            .setDescription('Play a quick blackjack round'))
        .addSubcommand(subcommand => subcommand
            .setName('roulette')
            .setDescription('Spin roulette')
            .addStringOption(option => option
                .setName('color')
                .setDescription('Your color')
                .setRequired(true)
                .addChoices(
                    { name: 'Red', value: 'red' },
                    { name: 'Black', value: 'black' },
                    { name: 'Green', value: 'green' },
                ))),
    category: 'Fun',
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'coinflip') {
            const choice = interaction.options.getString('choice');
            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            const embed = baseEmbed('Coinflip')
                .setDescription(
                    'Result: **' + result.toUpperCase() + '**' +
                    (choice ? '\nYour pick: **' + choice.toUpperCase() + '**\n' + (choice === result ? 'You guessed right.' : 'You guessed wrong.') : '')
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'dice') {
            const sides = interaction.options.getInteger('sides') || 6;
            const guess = interaction.options.getInteger('guess');
            if (guess && guess > sides) {
                return interaction.reply({ content: 'Your guess cannot be higher than the dice sides.', flags: MessageFlags.Ephemeral });
            }
            const roll = Math.floor(Math.random() * sides) + 1;
            const embed = baseEmbed('Dice')
                .setDescription(
                    'Rolled **' + roll + '** on a d' + sides +
                    (guess ? '\nYour guess: **' + guess + '**\n' + (guess === roll ? 'Exact hit.' : 'Miss.') : '')
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'slots') {
            const result = Array.from({ length: 3 }, () => slotSymbols[Math.floor(Math.random() * slotSymbols.length)]);
            const unique = new Set(result).size;
            const text = unique === 1 ? 'Jackpot.' : unique === 2 ? 'Two matched.' : 'No match.';
            const embed = baseEmbed('Slots').setDescription('# ' + result.join('  ') + '\n' + text);
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'blackjack') {
            const player = [drawCard(), drawCard()];
            const dealer = [drawCard(), drawCard()];
            while (handValue(dealer) < 17) dealer.push(drawCard());
            const playerValue = handValue(player);
            const dealerValue = handValue(dealer);
            let outcome = 'Draw.';
            if (playerValue > 21) outcome = 'Bust. You lose.';
            else if (dealerValue > 21 || playerValue > dealerValue) outcome = 'You win.';
            else if (playerValue < dealerValue) outcome = 'DragonHosting wins.';
            const embed = baseEmbed('Blackjack')
                .addFields(
                    { name: 'You', value: player.join(' ') + ' = **' + playerValue + '**', inline: false },
                    { name: 'Dealer', value: dealer.join(' ') + ' = **' + dealerValue + '**', inline: false },
                    { name: 'Result', value: outcome, inline: false },
                );
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'roulette') {
            const choice = interaction.options.getString('color', true);
            const roll = Math.floor(Math.random() * 37);
            const color = roll === 0 ? 'green' : rouletteColors[roll % 2];
            const embed = baseEmbed('Roulette')
                .setDescription(
                    'Ball landed on **' + roll + ' ' + color.toUpperCase() + '**.\n' +
                    'Your pick: **' + choice.toUpperCase() + '**.\n' +
                    (choice === color ? 'You guessed right.' : 'You guessed wrong.')
                );
            return interaction.reply({ embeds: [embed] });
        }
    },
};
