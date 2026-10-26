const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const replies = [
    'Yes.',
    'No.',
    'Maybe.',
    'Definitely.',
    'Ask again later.',
    'I would not count on it.',
    'The odds look good.',
    'The odds look bad.',
    'Without a doubt.',
    'Not right now.'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask DragonHosting a question')
        .addStringOption(option => option.setName('question').setDescription('The question to ask').setRequired(true)),
    category: 'Fun',
    async execute(interaction) {
        const question = interaction.options.getString('question', true);
        const answer = replies[Math.floor(Math.random() * replies.length)];
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎱 Magic 8 Ball')
            .addFields(
                { name: 'Question', value: question },
                { name: 'Answer', value: answer }
            )
            .setFooter({ text: 'DragonHosting' })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] }).catch(async () => {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: answer, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        });
    }
};
