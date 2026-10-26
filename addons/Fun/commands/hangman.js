const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const words = ['discord', 'minecraft', 'server', 'hosting', 'dragon', 'ticket', 'command', 'moderation', 'community', 'network'];
const activeGames = new Set();

function renderWord(word, guessed) {
    return word.split('').map(letter => guessed.has(letter) ? letter.toUpperCase() : '_').join(' ');
}

function buildEmbed(word, guessed, misses, maxMisses, finished = false) {
    return new EmbedBuilder()
        .setColor(finished ? '#FEE75C' : '#5865F2')
        .setTitle('Hangman')
        .setDescription('Word: **' + renderWord(word, guessed) + '**\nMisses: **' + misses + '/' + maxMisses + '**\nGuessed: ' + ([...guessed].join(', ').toUpperCase() || 'none'))
        .setFooter({ text: finished ? 'Answer: ' + word.toUpperCase() + ' · DragonHosting' : 'Type one letter in chat · DragonHosting' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hangman')
        .setDescription('Play Hangman')
        .setDMPermission(false),
    category: 'Fun',
    async execute(interaction) {
        if (activeGames.has(interaction.user.id)) {
            await interaction.reply({ content: 'You already have an active Hangman game.', flags: MessageFlags.Ephemeral });
            return;
        }

        activeGames.add(interaction.user.id);
        const word = words[Math.floor(Math.random() * words.length)];
        const guessed = new Set();
        let misses = 0;
        const maxMisses = 6;

        await interaction.reply({ embeds: [buildEmbed(word, guessed, misses, maxMisses)] });
        const collector = interaction.channel.createMessageCollector({
            filter: message => message.author.id === interaction.user.id && !message.author.bot,
            time: 300000,
        });

        collector.on('collect', async message => {
            const guess = message.content.trim().toLowerCase();
            if (!/^[a-z]$/.test(guess)) return;
            if (guessed.has(guess)) {
                await message.reply('You already guessed **' + guess.toUpperCase() + '**.').catch(() => {});
                return;
            }
            guessed.add(guess);
            if (!word.includes(guess)) misses++;

            const won = word.split('').every(letter => guessed.has(letter));
            const lost = misses >= maxMisses;
            await interaction.editReply({ embeds: [buildEmbed(word, guessed, misses, maxMisses, won || lost)] });

            if (won) {
                await message.reply('Correct. You found **' + word.toUpperCase() + '**.').catch(() => {});
                collector.stop('win');
            } else if (lost) {
                await message.reply('Game over. The word was **' + word.toUpperCase() + '**.').catch(() => {});
                collector.stop('lose');
            }
        });

        collector.on('end', async (_collected, reason) => {
            activeGames.delete(interaction.user.id);
            if (reason === 'time') {
                await interaction.editReply({ embeds: [buildEmbed(word, guessed, misses, maxMisses, true)] }).catch(() => {});
            }
        });
    }
};
