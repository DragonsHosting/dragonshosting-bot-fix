const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

function winner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return board.every(Boolean) ? 'draw' : null;
}

function bestBotMove(board) {
    const available = board.map((value, index) => value ? null : index).filter(value => value !== null);
    for (const token of ['O', 'X']) {
        for (const index of available) {
            const copy = board.slice();
            copy[index] = token;
            if (winner(copy) === token) return index;
        }
    }
    if (available.includes(4)) return 4;
    const corners = available.filter(index => [0, 2, 6, 8].includes(index));
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    return available[Math.floor(Math.random() * available.length)];
}

function rows(id, board, disabled = false) {
    const output = [];
    for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
            const index = r * 3 + c;
            const value = board[index];
            row.addComponents(new ButtonBuilder()
                .setCustomId('dragon_ttt_' + id + '_' + index)
                .setLabel(value || '·')
                .setStyle(value === 'X' ? ButtonStyle.Primary : value === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary)
                .setDisabled(disabled || Boolean(value)));
        }
        output.push(row);
    }
    return output;
}

function embedFor(status) {
    return new EmbedBuilder()
        .setColor(status.done ? '#FEE75C' : '#5865F2')
        .setTitle('Tic-Tac-Toe')
        .setDescription(status.text)
        .setFooter({ text: 'DragonHosting' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Play Tic-Tac-Toe against a bot or another player')
        .addStringOption(option => option.setName('type').setDescription('Choose game type').setRequired(true).addChoices(
            { name: 'Bot', value: 'bot' },
            { name: 'Player', value: 'player' }
        ))
        .addStringOption(option => option.setName('difficulty').setDescription('Choose difficulty level (only for bot)').addChoices(
            { name: 'Easy', value: 'easy' },
            { name: 'Medium', value: 'medium' },
            { name: 'Hard', value: 'hard' }
        ))
        .addUserOption(option => option.setName('opponent').setDescription('Choose an opponent (required for player mode)'))
        .setDMPermission(false),
    category: 'Fun',
    async execute(interaction) {
        const type = interaction.options.getString('type', true);
        const opponent = interaction.options.getUser('opponent');
        if (type === 'player' && (!opponent || opponent.bot || opponent.id === interaction.user.id)) {
            await interaction.reply({ content: 'Choose a valid opponent for player mode.', flags: MessageFlags.Ephemeral });
            return;
        }

        const board = Array(9).fill(null);
        const players = { X: interaction.user.id, O: type === 'player' ? opponent.id : 'bot' };
        let turn = 'X';

        function statusText(done = false) {
            const state = winner(board);
            if (state === 'X') return { done: true, text: '<@' + players.X + '> wins.' };
            if (state === 'O') return { done: true, text: type === 'player' ? '<@' + players.O + '> wins.' : 'DragonHosting wins.' };
            if (state === 'draw') return { done: true, text: 'Draw.' };
            return { done, text: 'Turn: ' + (turn === 'X' ? '<@' + players.X + '>' : (type === 'player' ? '<@' + players.O + '>' : 'DragonHosting')) };
        }

        await interaction.reply({ embeds: [embedFor(statusText())], components: rows(interaction.id, board) });
        const message = await interaction.fetchReply();
        const prefix = 'dragon_ttt_' + interaction.id + '_';
        const collector = message.createMessageComponentCollector({ filter: i => i.customId.startsWith(prefix), time: 600000 });

        collector.on('collect', async i => {
            if (i.user.id !== players[turn]) {
                await i.reply({ content: 'It is not your turn.', flags: MessageFlags.Ephemeral });
                return;
            }
            const index = Number(i.customId.slice(prefix.length));
            if (board[index]) {
                await i.reply({ content: 'That field is already taken.', flags: MessageFlags.Ephemeral });
                return;
            }
            board[index] = turn;
            turn = turn === 'X' ? 'O' : 'X';

            if (type === 'bot' && !winner(board)) {
                const botMove = bestBotMove(board);
                if (botMove !== undefined) board[botMove] = 'O';
                turn = 'X';
            }

            const status = statusText();
            await i.update({ embeds: [embedFor(status)], components: rows(interaction.id, board, status.done) });
            if (status.done) collector.stop('done');
        });

        collector.on('end', async (_collected, reason) => {
            if (reason !== 'done') {
                await interaction.editReply({ embeds: [embedFor({ done: true, text: 'Game timed out.' })], components: rows(interaction.id, board, true) }).catch(() => {});
            }
        });
    }
};
