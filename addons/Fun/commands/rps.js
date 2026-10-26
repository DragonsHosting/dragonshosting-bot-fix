const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const choices = ['rock', 'paper', 'scissors'];
const emoji = { rock: '🪨', paper: '📄', scissors: '✂️' };
const label = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

function resultFor(player, bot) {
    if (player === bot) return 'draw';
    if (
        (player === 'rock' && bot === 'scissors') ||
        (player === 'paper' && bot === 'rock') ||
        (player === 'scissors' && bot === 'paper')
    ) return 'win';
    return 'lose';
}

function buttons(id, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        choices.map(choice => new ButtonBuilder()
            .setCustomId('dragon_rps_' + id + '_' + choice)
            .setLabel(label[choice])
            .setEmoji(emoji[choice])
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled))
    )];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors'),
    category: 'Fun',
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('Rock Paper Scissors')
            .setDescription('Choose rock, paper, or scissors.')
            .setFooter({ text: 'DragonHosting' });

        await interaction.reply({ embeds: [embed], components: buttons(interaction.id) });
        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            filter: i => i.customId.startsWith('dragon_rps_' + interaction.id + '_'),
            time: 60000,
            max: 1,
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'This is not your game. Start your own with /rps.', flags: MessageFlags.Ephemeral });
                return;
            }
            const player = i.customId.split('_').pop();
            const bot = choices[Math.floor(Math.random() * choices.length)];
            const outcome = resultFor(player, bot);
            const description = [
                'You picked ' + emoji[player] + ' **' + label[player] + '**.',
                'DragonHosting picked ' + emoji[bot] + ' **' + label[bot] + '**.',
                '',
                outcome === 'win' ? 'You win.' : outcome === 'lose' ? 'You lose.' : 'It is a draw.'
            ].join('\n');
            const done = EmbedBuilder.from(embed)
                .setColor(outcome === 'win' ? '#57F287' : outcome === 'lose' ? '#ED4245' : '#FEE75C')
                .setDescription(description);
            await i.update({ embeds: [done], components: buttons(interaction.id, true) });
        });

        collector.on('end', async collected => {
            if (collected.size === 0) {
                const timedOut = EmbedBuilder.from(embed).setColor('#ED4245').setDescription('Game timed out.');
                await interaction.editReply({ embeds: [timedOut], components: buttons(interaction.id, true) }).catch(() => {});
            }
        });
    }
};
