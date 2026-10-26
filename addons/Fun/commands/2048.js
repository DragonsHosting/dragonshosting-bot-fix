const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

class Game2048 {
    constructor() {
        this.grid = Array.from({ length: 4 }, () => Array(4).fill(0));
        this.score = 0;
        this.addTile();
        this.addTile();
    }

    cloneGrid() {
        return this.grid.map(row => row.slice());
    }

    addTile() {
        const empty = [];
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                if (this.grid[y][x] === 0) empty.push([y, x]);
            }
        }
        if (empty.length === 0) return;
        const [y, x] = empty[Math.floor(Math.random() * empty.length)];
        this.grid[y][x] = Math.random() < 0.9 ? 2 : 4;
    }

    slide(line) {
        const values = line.filter(Boolean);
        for (let i = 0; i < values.length - 1; i++) {
            if (values[i] === values[i + 1]) {
                values[i] *= 2;
                this.score += values[i];
                values.splice(i + 1, 1);
            }
        }
        while (values.length < 4) values.push(0);
        return values;
    }

    move(direction) {
        const before = JSON.stringify(this.grid);
        if (direction === 'left' || direction === 'right') {
            for (let y = 0; y < 4; y++) {
                const line = direction === 'left' ? this.grid[y] : this.grid[y].slice().reverse();
                const next = this.slide(line);
                this.grid[y] = direction === 'left' ? next : next.reverse();
            }
        } else {
            for (let x = 0; x < 4; x++) {
                const line = [];
                for (let y = 0; y < 4; y++) line.push(this.grid[y][x]);
                const ordered = direction === 'up' ? line : line.reverse();
                const next = this.slide(ordered);
                const finalLine = direction === 'up' ? next : next.reverse();
                for (let y = 0; y < 4; y++) this.grid[y][x] = finalLine[y];
            }
        }
        const changed = before !== JSON.stringify(this.grid);
        if (changed) this.addTile();
        return changed;
    }

    hasMoves() {
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                if (this.grid[y][x] === 0) return true;
                if (x < 3 && this.grid[y][x] === this.grid[y][x + 1]) return true;
                if (y < 3 && this.grid[y][x] === this.grid[y + 1][x]) return true;
            }
        }
        return false;
    }

    highestTile() {
        return Math.max(...this.grid.flat());
    }
}

function render(game) {
    return game.grid.map(row => row.map(value => value ? String(value).padStart(4, ' ') : '   ·').join(' ')).join('\n');
}

function controls(id, disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dragon_2048_' + id + '_up').setLabel('Up').setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(disabled)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dragon_2048_' + id + '_left').setLabel('Left').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('dragon_2048_' + id + '_down').setLabel('Down').setEmoji('⬇️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('dragon_2048_' + id + '_right').setLabel('Right').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        )
    ];
}

function payload(interaction, game, done = false) {
    const embed = new EmbedBuilder()
        .setColor(done ? '#ED4245' : '#5865F2')
        .setTitle('2048')
        .setDescription('```\n' + render(game) + '\n```')
        .addFields(
            { name: 'Score', value: String(game.score), inline: true },
            { name: 'Highest tile', value: String(game.highestTile()), inline: true }
        )
        .setFooter({ text: done ? 'Game over · DragonHosting' : 'DragonHosting' });
    return { embeds: [embed], components: controls(interaction.id, done) };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('2048')
        .setDescription('Play 2048'),
    category: 'Fun',
    async execute(interaction) {
        const game = new Game2048();
        await interaction.reply(payload(interaction, game));
        const message = await interaction.fetchReply();
        const prefix = 'dragon_2048_' + interaction.id + '_';
        const collector = message.createMessageComponentCollector({
            filter: i => i.customId.startsWith(prefix),
            time: 900000,
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'This is not your 2048 game. Start your own with /2048.', flags: MessageFlags.Ephemeral });
                return;
            }
            const direction = i.customId.slice(prefix.length);
            const moved = game.move(direction);
            const done = !game.hasMoves();
            await i.update(payload(interaction, game, done));
            if (done) collector.stop('gameover');
            if (!moved && !done) {
                await i.followUp({ content: 'That move does not change the board.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        });

        collector.on('end', async (_collected, reason) => {
            if (reason !== 'gameover') {
                await interaction.editReply(payload(interaction, game, true)).catch(() => {});
            }
        });
    }
};
