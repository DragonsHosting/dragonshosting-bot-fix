const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const service = require('../voiceTTSService');
const workers = require('../voiceTTSWorkers');

function formatStatus(status) {
  const workerLines = status.workers.workers.map(worker => (
    `Worker ${worker.id}: token ${worker.tokenConfigured ? 'set' : 'missing'}, online ${worker.online ? 'yes' : 'no'}, active voice ${worker.activeGuildConnections}`
  ));

  return [
    `Configured: ${status.configured ? 'yes' : 'no'}`,
    `Role: ${status.config?.roleId ? `<@&${status.config.roleId}>` : 'not set'}`,
    `Category: ${status.config?.categoryId ? `<#${status.config.categoryId}>` : 'not set'}`,
    `Panel: ${status.config?.panelChannelId ? `<#${status.config.panelChannelId}>` : 'not set'}`,
    `Logs: ${status.config?.logChannelId ? `<#${status.config.logChannelId}>` : 'not set'}`,
    `Sessions: ${status.sessions.length}`,
    `Worker tokens: ${status.workers.configuredTokens}/${status.workers.slots}`,
    `Online workers: ${status.workers.onlineWorkers}/${status.workers.slots}`,
    `Main bot fallback: ${status.workers.mainBotFallback ? 'active' : 'inactive'}`,
    `Voice package: ${status.workers.voicePackageReady ? 'ready' : `missing (${status.workers.missingVoicePackage || 'unknown'})`}`,
    `TTS package: ${status.workers.ttsPackageReady ? 'ready' : `missing (${status.workers.missingTtsPackage || 'unknown'})`}`,
    '',
    ...workerLines
  ].join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicetts')
    .setDescription('Set up and manage Voice TTS.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Create or update the Voice TTS role, category, panel, and log channel.')
        .addRoleOption(option =>
          option
            .setName('staff_role')
            .setDescription('Optional staff role that can view temporary TTS channels.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('role_name')
            .setDescription('Access role name.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('category_name')
            .setDescription('Category name.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('panel_channel_name')
            .setDescription('Panel text channel name.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('log_channel_name')
            .setDescription('Log text channel name.')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('slowmode_seconds')
            .setDescription('Slowmode for temporary TTS text channels.')
            .setMinValue(0)
            .setMaxValue(21600)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('max_message_length')
            .setDescription('Maximum characters per TTS message.')
            .setMinValue(20)
            .setMaxValue(500)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('language')
            .setDescription('Google TTS language code, for example en or nl.')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show Voice TTS config and worker status.')
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      const staffRole = interaction.options.getRole('staff_role');
      const config = await service.setupGuild(interaction.guild, {
        staffRoleId: staffRole?.id,
        roleName: interaction.options.getString('role_name') || undefined,
        categoryName: interaction.options.getString('category_name') || undefined,
        panelChannelName: interaction.options.getString('panel_channel_name') || undefined,
        logChannelName: interaction.options.getString('log_channel_name') || undefined,
        slowmodeSeconds: interaction.options.getInteger('slowmode_seconds') ?? undefined,
        maxMessageLength: interaction.options.getInteger('max_message_length') ?? undefined,
        ttsLanguage: interaction.options.getString('language') || undefined
      });
      workers.startWorkerClients();

      return interaction.editReply({
        content: [
          'Voice TTS is set up.',
          `Role: <@&${config.roleId}>`,
          `Category: <#${config.categoryId}>`,
          `Panel channel: <#${config.panelChannelId}>`,
          `Log channel: <#${config.logChannelId}>`,
          'Voice playback works through the main bot fallback now.',
          'Worker bots are optional for multiple voice channels at the same time. Add their tokens after Discord allows the new bot accounts to join.'
        ].join('\n')
      });
    }

    if (subcommand === 'status') {
      workers.startWorkerClients();
      const status = service.getStatus(interaction.guild.id);
      return interaction.reply({ content: formatStatus(status), ephemeral: true });
    }
  }
};
