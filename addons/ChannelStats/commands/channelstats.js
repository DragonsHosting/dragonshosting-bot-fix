const { ChannelType, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../channelStatsStore');
const {
  DEFAULT_CONFIG,
  disableGuildStats,
  setupGuildStats,
  updateGuildStats
} = require('../channelStatsService');

function getTemplate(interaction, optionName, fallback) {
  return interaction.options.getString(optionName) || fallback;
}

function validateTemplates(templates) {
  for (const [name, template] of Object.entries(templates)) {
    if (name === 'date' && !template.includes('{date}')) {
      return `${name}_name must contain {date}.`;
    }

    if (name !== 'date' && !template.includes('{count}')) {
      return `${name}_name must contain {count}.`;
    }
  }

  return null;
}

function formatStatus(config) {
  const counts = config.lastCounts || {};
  const statKeys = config.statKeys || Object.keys(config.channelIds || {});
  const lines = [
    `Enabled: ${config.enabled ? 'yes' : 'no'}`,
    `Category: ${config.categoryId ? `<#${config.categoryId}>` : 'not set'}`,
    `Members role: ${config.memberRoleId ? `<@&${config.memberRoleId}>` : 'not set'}`,
    `Staff role: ${config.staffRoleId ? `<@&${config.staffRoleId}>` : 'not set'}`,
    ...statKeys.map(key => `${key} channel: ${config.channelIds?.[key] ? `<#${config.channelIds[key]}>` : 'not set'}`),
    `Last counts: members ${counts.members ?? 0}, bots ${counts.bots ?? 0}, staff ${counts.staff ?? 0}, bans ${counts.bans ?? 0}, date ${counts.date || 'unknown'}`,
    `Last refresh: ${config.lastRefreshAt || 'never'}`
  ];

  return lines.join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelstats')
    .setDescription('Set up and manage server channel stats.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Create/update member, staff, ban, and date stat channels.')
        .addRoleOption(option =>
          option
            .setName('staff_role')
            .setDescription('Role used to count staff members. Defaults to General Staff.')
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('members_role')
            .setDescription('Role used to count members. Defaults to members.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('category_name')
            .setDescription('Category name for the stat channels.')
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('category')
            .setDescription('Category where stat channels should be created.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('members_name')
            .setDescription('Name template, for example Members: {count}.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('staff_name')
            .setDescription('Name template, for example Staff: {count}.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('bans_name')
            .setDescription('Name template, for example Bans: {count}.')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('date_name')
            .setDescription('Name template, for example Date: {date}.')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Refresh all channel stat names now.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show the current channel stats setup.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable channel stats for this server.')
        .addBooleanOption(option =>
          option
            .setName('delete_channels')
            .setDescription('Also delete the stat channels created by this addon.')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const templates = {
        members: getTemplate(interaction, 'members_name', DEFAULT_CONFIG.templates.members),
        staff: getTemplate(interaction, 'staff_name', DEFAULT_CONFIG.templates.staff),
        bans: getTemplate(interaction, 'bans_name', DEFAULT_CONFIG.templates.bans),
        date: getTemplate(interaction, 'date_name', DEFAULT_CONFIG.templates.date)
      };
      const templateError = validateTemplates(templates);
      if (templateError) {
        return interaction.reply({ content: templateError, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const staffRole = interaction.options.getRole('staff_role');
      const membersRole = interaction.options.getRole('members_role');
      const category = interaction.options.getChannel('category');
      const config = await setupGuildStats(interaction.guild, {
        memberRoleId: membersRole?.id,
        staffRoleId: staffRole?.id,
        categoryId: category?.id,
        categoryName: interaction.options.getString('category_name') || undefined,
        templates
      });

      return interaction.editReply({
        content: [
          'Channel stats are set up.',
          `Category: <#${config.categoryId}>`,
          `Members role: ${config.memberRoleId ? `<@&${config.memberRoleId}>` : 'all non-bot members'}`,
          `Staff role: ${config.staffRoleId ? `<@&${config.staffRoleId}>` : 'not set'}`,
          ...(config.statKeys || Object.keys(config.channelIds || {})).map(key => `${key}: <#${config.channelIds[key]}>`),
          'They refresh automatically about every 15 minutes and after member/ban/staff-role changes.'
        ].join('\n')
      });
    }

    if (subcommand === 'refresh') {
      await interaction.deferReply({ ephemeral: true });
      const result = await updateGuildStats(interaction.guild, { force: true });
      if (result.skipped && result.reason === 'not_configured') {
        return interaction.editReply({ content: 'Channel stats are not set up yet. Use /channelstats setup first.' });
      }

      return interaction.editReply({
        content: `Channel stats refreshed. Members: ${result.counts.members}, bots: ${result.counts.bots}, staff: ${result.counts.staff}, bans: ${result.counts.bans}, date: ${result.counts.date}.`
      });
    }

    if (subcommand === 'status') {
      const config = store.getGuildConfig(interaction.guild.id);
      if (!config) {
        return interaction.reply({ content: 'Channel stats are not set up yet.', ephemeral: true });
      }

      return interaction.reply({ content: formatStatus(config), ephemeral: true });
    }

    if (subcommand === 'disable') {
      await interaction.deferReply({ ephemeral: true });
      const result = await disableGuildStats(interaction.guild, {
        deleteChannels: Boolean(interaction.options.getBoolean('delete_channels'))
      });

      if (!result.existed) {
        return interaction.editReply({ content: 'Channel stats were not set up.' });
      }

      return interaction.editReply({
        content: result.deletedChannels.length > 0
          ? `Channel stats disabled and ${result.deletedChannels.length} stat channel(s) deleted.`
          : 'Channel stats disabled. Existing channels were left in place.'
      });
    }
  }
};
