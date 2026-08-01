const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const {
  getGuildConfig,
  getTicketTypes,
  saveGuildConfig
} = require('../ticketConfig');
const { buildTicketPanelPayload } = require('../ticketPanel');
const { setupGuildStats } = require('../../ChannelStats/channelStatsService');

function sameName(channel, name) {
  return channel.name?.toLowerCase() === name.toLowerCase();
}

async function fetchChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

async function findOrCreateCategory(guild, name, existingId) {
  const existingById = await fetchChannel(guild, existingId);
  if (existingById && existingById.type === ChannelType.GuildCategory) return existingById;

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory && sameName(channel, name)
  );
  if (existingByName) return existingByName;

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    reason: 'DragonsHosting ticket system setup'
  });
}

async function findOrCreateTextChannel(guild, name, parentId, existingId, options = {}) {
  const existingById = await fetchChannel(guild, existingId);
  if (existingById && existingById.type === ChannelType.GuildText) return existingById;

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText && sameName(channel, name)
  );
  if (existingByName) {
    if (parentId && existingByName.parentId !== parentId) {
      await existingByName.setParent(parentId, { lockPermissions: false, reason: 'DragonsHosting ticket system setup' }).catch(() => null);
    }
    return existingByName;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId || null,
    permissionOverwrites: options.permissionOverwrites || undefined,
    topic: options.topic || undefined,
    reason: 'DragonsHosting ticket system setup'
  });
}

async function ensurePanelMessage(channel, guild) {
  const payload = buildTicketPanelPayload(guild);
  const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  const existing = recent?.find(message =>
    message.author?.id === guild.client.user.id &&
    (
      message.embeds?.some(embed => String(embed.title || '').toLowerCase().includes('dragonshosting tickets')) ||
      message.components?.some(row => row.components?.some(component => String(component.customId || '').startsWith('ticket_')))
    )
  );

  if (existing) {
    await existing.edit(payload);
    return { action: 'updated', message: existing };
  }

  const sent = await channel.send(payload);
  return { action: 'created', message: sent };
}

function staffOnlyOverwrites(guild, staffRoleIds) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    ...staffRoleIds.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    }))
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fixticketsystem')
    .setDescription('Fix/hergebruik DragonsHosting ticket channels, panel en stats zonder bestaande tickets te verwijderen.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option
        .setName('support_role')
        .setDescription('Optioneel: hoofdrol die tickets mag bekijken/claimen.')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Dit command kan alleen in een server worden gebruikt.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    await guild.channels.fetch().catch(() => null);
    await guild.roles.fetch().catch(() => null);

    const existingConfig = getGuildConfig(guild.id);
    const selectedSupportRole = interaction.options.getRole('support_role');
    const staffRoleIds = [
      ...(selectedSupportRole ? [selectedSupportRole.id] : []),
      ...(existingConfig.staffRoleIds || []),
      '1506340973029101679',
      '1505816343406968903'
    ].filter((value, index, array) => value && array.indexOf(value) === index && guild.roles.cache.has(value));

    const supportCategory = await findOrCreateCategory(guild, 'Support', existingConfig.supportCategoryId);
    const panelChannel = await findOrCreateTextChannel(
      guild,
      '🎫・dragonshosting-tickets',
      supportCategory.id,
      existingConfig.panelChannelId,
      { topic: 'Open hier een support, betaling of credits ticket.' }
    );
    const logChannel = await findOrCreateTextChannel(
      guild,
      'ticket-logs',
      supportCategory.id,
      existingConfig.logChannelId,
      {
        topic: 'Staff-only ticket logs.',
        permissionOverwrites: staffOnlyOverwrites(guild, staffRoleIds)
      }
    );
    const transcriptChannel = await findOrCreateTextChannel(
      guild,
      'ticket-transcripts',
      supportCategory.id,
      existingConfig.transcriptChannelId,
      {
        topic: 'Staff-only ticket transcripts.',
        permissionOverwrites: staffOnlyOverwrites(guild, staffRoleIds)
      }
    );

    const categoryIds = {};
    const ticketTypes = getTicketTypes(guild);
    for (const [id, ticketType] of Object.entries(ticketTypes)) {
      const category = await findOrCreateCategory(guild, ticketType.categoryName, ticketType.categoryId);
      categoryIds[id] = category.id;
    }

    const saved = saveGuildConfig(guild.id, {
      supportCategoryId: supportCategory.id,
      panelChannelId: panelChannel.id,
      logChannelId: logChannel.id,
      transcriptChannelId: transcriptChannel.id,
      staffRoleIds,
      categoryIds
    });

    const panelResult = await ensurePanelMessage(panelChannel, guild);

    let statsLine = 'Stats: niet aangepast.';
    try {
      const statsConfig = await setupGuildStats(guild, {
        categoryName: '📊 Server Statistics',
        templates: {
          date: '📅 {date}',
          members: 'Members: {count}',
          bots: 'Bots: {count}'
        },
        statKeys: ['date', 'members', 'bots']
      });
      statsLine = `Stats: <#${statsConfig.categoryId}> met ${Object.values(statsConfig.channelIds || {}).map(id => `<#${id}>`).join(', ')}`;
    } catch (error) {
      statsLine = `Stats konden niet worden ingesteld: ${error.message}`;
    }

    return interaction.editReply({
      content: [
        '✅ Bestaand ticket-systeem bijgewerkt. Er zijn geen bestaande ticketkanalen verwijderd.',
        `Ticket panel: <#${panelChannel.id}> (${panelResult.action})`,
        `Logs: <#${logChannel.id}>`,
        `Transcripts: <#${transcriptChannel.id}>`,
        `Support roles: ${staffRoleIds.length ? staffRoleIds.map(id => `<@&${id}>`).join(', ') : 'alleen admins via Discord-permissies'}`,
        `Ticket categories: ${Object.values(saved.categoryIds || {}).map(id => `<#${id}>`).join(', ')}`,
        statsLine,
        '',
        'Herstart de bot als slash commands nog niet zichtbaar zijn.'
      ].join('\n')
    });
  }
};
