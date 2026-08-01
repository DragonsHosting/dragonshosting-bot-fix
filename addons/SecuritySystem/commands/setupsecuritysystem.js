const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { setupSecuritySystem } = require('../securitySystemService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupsecuritysystem')
    .setDescription('Maak of herstel de DragonsHosting SecuritySystem kanalen en panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option
        .setName('staff_role')
        .setDescription('Staff role die security controls mag gebruiken.')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName('panel_channel')
        .setDescription('Bestaand kanaal voor security panel. Leeg = automatisch aanmaken/hergebruiken.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName('log_channel')
        .setDescription('Bestaand kanaal voor security logs. Leeg = automatisch aanmaken/hergebruiken.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const result = await setupSecuritySystem(interaction, {
      staffRole: interaction.options.getRole('staff_role'),
      panelChannel: interaction.options.getChannel('panel_channel'),
      logChannel: interaction.options.getChannel('log_channel'),
    });

    await interaction.editReply([
      '✅ SecuritySystem is klaar.',
      `Panel: ${result.panelChannel}`,
      `Logs: ${result.logChannel}`,
      result.staffRoleIds.length ? `Staff roles: ${result.staffRoleIds.map(id => `<@&${id}>`).join(', ')}` : 'Staff roles: alleen Administrator/Moderation permissies',
    ].join('\n'));
  },
};
