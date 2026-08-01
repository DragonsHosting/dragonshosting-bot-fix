const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { setupModPanel } = require('../addons/ModPanel/modPanelService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupmodpanel')
    .setDescription('Maak of herstel de DragonsHosting ModPanel kanalen en knoppen.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option
        .setName('staff_role')
        .setDescription('Staff role die toegang krijgt tot het ModPanel.')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName('panel_channel')
        .setDescription('Bestaand kanaal voor het panel. Leeg = automatisch aanmaken/hergebruiken.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(option =>
      option
        .setName('log_channel')
        .setDescription('Bestaand kanaal voor mod logs. Leeg = automatisch aanmaken/hergebruiken.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const result = await setupModPanel(interaction, {
      staffRole: interaction.options.getRole('staff_role'),
      panelChannel: interaction.options.getChannel('panel_channel'),
      logChannel: interaction.options.getChannel('log_channel'),
    });

    await interaction.editReply([
      '✅ ModPanel is klaar.',
      `Panel: ${result.panelChannel}`,
      `Logs: ${result.logChannel}`,
      result.staffRoleIds.length ? `Staff roles: ${result.staffRoleIds.map(id => `<@&${id}>`).join(', ')}` : 'Staff roles: alleen Administrator/Moderation permissies',
    ].join('\n'));
  },
};
