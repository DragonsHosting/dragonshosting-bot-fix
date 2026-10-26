const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const words = ['DRAGON', 'PANEL', 'TICKET', 'SERVER', 'CRAFT', 'CLOUD', 'HOSTS', 'BLOCK', 'WORLD', 'SPAWN', 'MINES', 'QUEUE'];
const activeGames = new Set();

function scoreGuess(guess, answer) {
    const result = Array(5).fill('⬛');
    const remaining = answer.split('');
    for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) {
            result[i] = '🟩';
            remaining[i] = null;
        }
    }
    for (let i = 0; i < 5; i++) {
        if (result[i] === '🟩') continue;
        const index = remaining.indexOf(guess[i]);
        if (index !== -1) {
            result[i] = '🟨';
            remaining[index] = null;
        }
    }
    return result.join('');
}

function buildEmbed(answer, guesses, finished = false) {
    const lines = guesses.length
        ? guesses.map(item => item.score + '  ' + item.guess).join('\n')
        : 'No guesses yet. Type a 5-letter word in this channel.';
    return new EmbedBuilder()
        .setColor(finished ? '#57F287' : '#5865F2')
        .setTitle('Wordle')
        .setDescription(lines)
        .setFooter({ text: finished ? 'Answer: ' + answer + ' · DragonHosting' : 'DragonHosting' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordle')
        .setDescription('Play a text-based Wordle game')
        .setDMPermission(false),
    category: 'Fun',
    async execute(interaction) {
        if (activeGames.has(interaction.user.id)) {
            await interaction.reply({ content: 'You already have an active Wordle game.', flags: MessageFlags.Ephemeral });
            return;
        }

        activeGames.add(interaction.user.id);
        const answer = words[Math.floor(Math.random() * words.length)];
        const guesses = [];
        await interaction.reply({ embeds: [buildEmbed(answer, guesses)] });

        const collector = interaction.channel.createMessageCollector({
            filter: message => message.author.id === interaction.user.id && !message.author.bot,
            time: 300000,
        });

        collector.on('collect', async message => {
            const guess = message.content.trim().toUpperCase();
            if (!/^[A-Z]{5}$/.test(guess)) return;
            guesses.push({ guess, score: scoreGuess(guess, answer) });

            if (guess === answer) {
                await interaction.editReply({ embeds: [buildEmbed(answer, guesses, true)] });
                await message.reply('Correct. You solved it in ' + guesses.length + ' guess' + (guesses.length === 1 ? '' : 'es') + '.').catch(() => {});
                collector.stop('win');
                return;
            }

            if (guesses.length >= 6) {
                await interaction.editReply({ embeds: [buildEmbed(answer, guesses, true)] });
                await message.reply('Game over. The word was **' + answer + '**.').catch(() => {});
                collector.stop('lose');
                return;
            }

            await interaction.editReply({ embeds: [buildEmbed(answer, guesses)] });
        });

        collector.on('end', async (_collected, reason) => {
            activeGames.delete(interaction.user.id);
            if (reason === 'time') {
                await interaction.editReply({ embeds: [buildEmbed(answer, guesses, true)] }).catch(() => {});
            }
        });
    }
};
