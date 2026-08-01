const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const store = require('./voiceTTSStore');
const workers = require('./voiceTTSWorkers');

const DEFAULT_CONFIG = {
  enabled: true,
  roleName: 'VC TTS',
  categoryName: 'Voice TTS',
  panelChannelName: 'vc-tts-info',
  logChannelName: 'vc-tts-logs',
  tempChannelPrefix: 'tts',
  slowmodeSeconds: 8,
  userCooldownMs: 5000,
  maxMessageLength: 180,
  maxMentions: 2,
  ttsLanguage: 'en',
  workerSlots: 4,
  staffRoleId: null,
  roleId: null,
  categoryId: null,
  panelChannelId: null,
  panelMessageId: null,
  logChannelId: null
};

function mergeConfig(existing = {}, override = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...existing,
    ...override,
    workerSlots: 4
  };
}

function cleanChannelPart(value, fallback = 'user') {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return cleaned || fallback;
}

async function fetchChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

async function ensureRole(guild, config) {
  const configuredRole = config.roleId
    ? guild.roles.cache.get(config.roleId) || await guild.roles.fetch(config.roleId).catch(() => null)
    : null;
  if (configuredRole) return configuredRole;

  const existingByName = guild.roles.cache.find(role => role.name.toLowerCase() === config.roleName.toLowerCase());
  if (existingByName) return existingByName;

  return guild.roles.create({
    name: config.roleName,
    color: 0x58c7ff,
    hoist: false,
    mentionable: false,
    permissions: [],
    reason: 'Voice TTS access role setup'
  });
}

async function ensureCategory(guild, config) {
  const configuredCategory = await fetchChannel(guild, config.categoryId);
  if (configuredCategory?.type === ChannelType.GuildCategory) return configuredCategory;

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory &&
    channel.name.toLowerCase() === config.categoryName.toLowerCase()
  );
  if (existingByName) return existingByName;

  return guild.channels.create({
    name: config.categoryName,
    type: ChannelType.GuildCategory,
    reason: 'Voice TTS category setup'
  });
}

function botOverwrite(guild) {
  return {
    id: guild.members.me?.id || guild.client.user.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages
    ]
  };
}

function staffOverwrite(config) {
  if (!config.staffRoleId) return null;
  return {
    id: config.staffRoleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages
    ]
  };
}

async function ensurePanelChannel(guild, config, category) {
  const configured = await fetchChannel(guild, config.panelChannelId);
  if (configured?.type === ChannelType.GuildText) return configured;

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.name.toLowerCase() === config.panelChannelName.toLowerCase()
  );
  if (existingByName) return existingByName;

  return guild.channels.create({
    name: config.panelChannelName,
    type: ChannelType.GuildText,
    parent: category?.id || null,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      },
      botOverwrite(guild)
    ].filter(Boolean),
    reason: 'Voice TTS panel channel setup'
  });
}

async function ensureLogChannel(guild, config, category) {
  const configured = await fetchChannel(guild, config.logChannelId);
  if (configured?.type === ChannelType.GuildText) return configured;

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.name.toLowerCase() === config.logChannelName.toLowerCase()
  );
  if (existingByName) return existingByName;

  return guild.channels.create({
    name: config.logChannelName,
    type: ChannelType.GuildText,
    parent: category?.id || null,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      staffOverwrite(config),
      botOverwrite(guild)
    ].filter(Boolean),
    reason: 'Voice TTS log channel setup'
  });
}

function buildPanel(role) {
  const embed = new EmbedBuilder()
    .setTitle('Voice TTS Access')
    .setDescription([
      'Use this if you are muted, cannot speak, or need messages read aloud in voice chat.',
      '',
      `Click the button to toggle ${role}. When you join a voice channel, the bot creates a private TTS text channel for you.`,
      'Messages are rate-limited and cleaned up automatically when you leave voice.'
    ].join('\n'))
    .setColor(0x58c7ff)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('voice_tts_toggle_access')
      .setLabel('Toggle VC TTS')
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

async function upsertPanelMessage(config, panelChannel, role) {
  const payload = buildPanel(role);

  if (config.panelMessageId) {
    const message = await panelChannel.messages.fetch(config.panelMessageId).catch(() => null);
    if (message) {
      await message.edit(payload);
      return message;
    }
  }

  const message = await panelChannel.send(payload);
  return message;
}

async function setupGuild(guild, options = {}) {
  const existing = store.getGuildConfig(guild.id) || {};
  const config = mergeConfig(existing, {
    roleName: options.roleName || existing.roleName || DEFAULT_CONFIG.roleName,
    categoryName: options.categoryName || existing.categoryName || DEFAULT_CONFIG.categoryName,
    panelChannelName: options.panelChannelName || existing.panelChannelName || DEFAULT_CONFIG.panelChannelName,
    logChannelName: options.logChannelName || existing.logChannelName || DEFAULT_CONFIG.logChannelName,
    staffRoleId: options.staffRoleId || existing.staffRoleId || null,
    slowmodeSeconds: Number.isInteger(options.slowmodeSeconds) ? options.slowmodeSeconds : existing.slowmodeSeconds,
    maxMessageLength: Number.isInteger(options.maxMessageLength) ? options.maxMessageLength : existing.maxMessageLength,
    ttsLanguage: options.ttsLanguage || existing.ttsLanguage || DEFAULT_CONFIG.ttsLanguage,
    enabled: true
  });

  const role = await ensureRole(guild, config);
  config.roleId = role.id;

  const category = await ensureCategory(guild, config);
  config.categoryId = category.id;

  const panelChannel = await ensurePanelChannel(guild, config, category);
  config.panelChannelId = panelChannel.id;

  const logChannel = await ensureLogChannel(guild, config, category);
  config.logChannelId = logChannel.id;

  const panelMessage = await upsertPanelMessage(config, panelChannel, role);
  config.panelMessageId = panelMessage.id;

  return store.saveGuildConfig(guild.id, config, 'setup');
}

async function log(guild, config, content) {
  const channel = await fetchChannel(guild, config?.logChannelId);
  if (!channel?.isTextBased?.()) return;
  await channel.send({ content }).catch(() => null);
}

async function ensureUserSession(guild, member, voiceChannel) {
  const config = mergeConfig(store.getGuildConfig(guild.id) || {});
  if (!config.enabled || !config.roleId) return null;
  if (!member.roles.cache.has(config.roleId) && !member.permissions.has(PermissionFlagsBits.Administrator)) return null;

  const category = await fetchChannel(guild, config.categoryId);
  const existing = store.getSession(guild.id, member.id);
  let textChannel = existing?.textChannelId ? await fetchChannel(guild, existing.textChannelId) : null;
  const channelName = `${config.tempChannelPrefix}-${cleanChannelPart(member.user.username, member.id)}`;

  if (!textChannel || textChannel.type !== ChannelType.GuildText) {
    textChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id || null,
      topic: `Voice TTS session for ${member.user.tag} (${member.id})`,
      rateLimitPerUser: config.slowmodeSeconds,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        staffOverwrite(config),
        botOverwrite(guild)
      ].filter(Boolean),
      reason: 'Voice TTS temporary user channel'
    });

    const intro = new EmbedBuilder()
      .setTitle('Private VC TTS channel')
      .setDescription([
        `Type here and the TTS worker will read your message in ${voiceChannel}.`,
        `Slowmode: ${config.slowmodeSeconds}s. Max length: ${config.maxMessageLength} characters.`,
        'This channel is deleted automatically when you leave voice.'
      ].join('\n'))
      .setColor(0x58c7ff);
    await textChannel.send({ content: `${member}`, embeds: [intro] }).catch(() => null);
  } else if (textChannel.name !== channelName) {
    await textChannel.setName(channelName, 'Voice TTS user renamed').catch(() => null);
  }

  const session = store.saveSession(guild.id, member.id, {
    textChannelId: textChannel.id,
    voiceChannelId: voiceChannel.id,
    username: member.user.tag,
    startedAt: existing?.startedAt || new Date().toISOString()
  }, 'session');

  await workers.assignSession(guild, voiceChannel.id, session).catch(err => {
    console.log(`[VoiceTTS] Worker assignment failed: ${err.message}`);
  });

  await log(guild, config, `Started VC TTS session for ${member.user.tag}: ${textChannel} -> ${voiceChannel}.`);
  return { config, session, textChannel };
}

async function cleanupUserSession(guild, userId, reason = 'left voice') {
  const config = mergeConfig(store.getGuildConfig(guild.id) || {});
  const session = store.deleteSession(guild.id, userId, 'session-delete');
  if (!session) return null;

  workers.releaseSession(guild.id, session.voiceChannelId, userId);

  const textChannel = await fetchChannel(guild, session.textChannelId);
  if (textChannel) {
    await textChannel.delete(`Voice TTS cleanup: ${reason}`).catch(err => {
      console.log(`[VoiceTTS] Cannot delete temporary channel ${session.textChannelId}: ${err.message}`);
    });
  }

  await log(guild, config, `Closed VC TTS session for <@${userId}> (${reason}).`);
  return session;
}

function getStatus(guildId) {
  const config = store.getGuildConfig(guildId);
  const sessions = Object.values(store.getGuildSessions(guildId));
  const workerStatus = workers.getStatus();

  return {
    configured: Boolean(config),
    config,
    sessions,
    backups: store.listBackups().slice(0, 10),
    workers: workerStatus
  };
}

module.exports = {
  DEFAULT_CONFIG,
  cleanupUserSession,
  ensureUserSession,
  getStatus,
  mergeConfig,
  setupGuild
};
