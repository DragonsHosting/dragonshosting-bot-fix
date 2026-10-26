const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const ROWS = 6;
const COLS = 7;

function makeBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function drop(board, column, token) {
    for (let row = ROWS - 1; row >= 0; row--) {
        if (!board[row][column]) {
            board[row][column] = token;
            return row;
        }
    }
    return -1;
}

function validColumns(board) {
    return Array.from({ length: COLS }, (_unused, index) => index).filter(col => !board[0][col]);
}

function checkWin(board, token) {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (board[row][col] !== token) continue;
            for (const [dc, dr] of directions) {
                let count = 1;
                for (let step = 1; step < 4; step++) {
                    const nextRow = row + dr * step;
                    const nextCol = col + dc * step;
                    if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS || board[nextRow][nextCol] !== token) break;
                    count++;
                }
                if (count >= 4) return true;
            }
        }
    }
    return false;
}

function botColumn(board) {
    const available = validColumns(board);
    for (const token of ['Y', 'R']) {
        for (const col of available) {
            const copy = board.map(row => row.slice());
            drop(copy, col, token);
            if (checkWin(copy, token)) return col;
        }
    }
    const centerPreference = [3, 2, 4, 1, 5, 0, 6].filter(col => available.includes(col));
    return centerPreference[0];
}

function render(board) {
    return board.map(row => row.map(cell => cell === 'R' ? '🔴' : cell === 'Y' ? '🟡' : '⚫').join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
}

function controls(id, board, disabled = false) {
    const available = validColumns(board);
    const makeButton = col => new ButtonBuilder()
        .setCustomId('dragon_c4_' + id + '_' + col)
        .setLabel(String(col + 1))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || !available.includes(col));
    return [
        new ActionRowBuilder().addComponents([0, 1, 2, 3].map(makeButton)),
        new ActionRowBuilder().addComponents([4, 5, 6].map(makeButton)),
    ];
}

function embedFor(board, text, done = false) {
    return new EmbedBuilder()
        .setColor(done ? '#FEE75C' : '#5865F2')
        .setTitle('Connect Four')
        .setDescription(render(board) + '\n\n' + text)
        .setFooter({ text: 'DragonHosting' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('connectfour')
        .setDescription('Play Connect Four against a bot or another player')
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

        const board = makeBoard();
        const players = { R: interaction.user.id, Y: type === 'player' ? opponent.id : 'bot' };
        let turn = 'R';
        const turnText = () => 'Turn: ' + (turn === 'R' ? '<@' + players.R + '> 🔴' : (type === 'player' ? '<@' + players.Y + '> 🟡' : 'DragonHosting 🟡'));

        await interaction.reply({ embeds: [embedFor(board, turnText())], components: controls(interaction.id, board) });
        const message = await interaction.fetchReply();
        const prefix = 'dragon_c4_' + interaction.id + '_';
        const collector = message.createMessageComponentCollector({ filter: i => i.customId.startsWith(prefix), time: 600000 });

        collector.on('collect', async i => {
            if (i.user.id !== players[turn]) {
                await i.reply({ content: 'It is not your turn.', flags: MessageFlags.Ephemeral });
                return;
            }
            const col = Number(i.customId.slice(prefix.length));
            if (drop(board, col, turn) === -1) {
                await i.reply({ content: 'That column is full.', flags: MessageFlags.Ephemeral });
                return;
            }

            let done = false;
            let text = '';
            if (checkWin(board, turn)) {
                done = true;
                text = (turn === 'R' ? '<@' + players.R + '>' : (type === 'player' ? '<@' + players.Y + '>' : 'DragonHosting')) + ' wins.';
            } else if (validColumns(board).length === 0) {
                done = true;
                text = 'Draw.';
            } else {
                turn = turn === 'R' ? 'Y' : 'R';
                if (type === 'bot') {
                    const botMove = botColumn(board);
                    drop(board, botMove, 'Y');
                    if (checkWin(board, 'Y')) {
                        done = true;
                        text = 'DragonHosting wins.';
                    } else if (validColumns(board).length === 0) {
                        done = true;
                        text = 'Draw.';
                    } else {
                        turn = 'R';
                        text = turnText();
                    }
                } else {
                    text = turnText();
                }
            }

            await i.update({ embeds: [embedFor(board, text, done)], components: controls(interaction.id, board, done) });
            if (done) collector.stop('done');
        });

        collector.on('end', async (_collected, reason) => {
            if (reason !== 'done') {
                await interaction.editReply({ embeds: [embedFor(board, 'Game timed out.', true)], components: controls(interaction.id, board, true) }).catch(() => {});
            }
        });
    }
};
