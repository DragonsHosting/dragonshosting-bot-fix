const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const dataDir = path.join(__dirname, 'data');
const configFile = path.join(dataDir, 'security-config.json');

const defaultConfig = {
  enabled: true,
  lockdown: false,
  guilds: {},
  blockAllInvites: false,
  blockAllLinks: false,
  kickNewJoinsDuringLockdown: true,
  maxMentions: 6,
  spamWindowSeconds: 8,
  spamMaxMessages: 7,
  blockedAttachmentExtensions: ['exe', 'scr', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'jar', 'com', 'msi', 'dll', 'sh'],
  whitelistedDomains: [
    'dragonshosting.nl',
    'feather.dragonshosting.nl',
    'discord.com/channels',
  ],
  whitelistedInvites: [],
  scamTerms: [
    'free nitro',
    'discord nitro',
    'steam gift',
    'onlyfans',
    'robux',
    'vbucks',
    'airdrop',
    'connect wallet',
    'crypto giveaway',
    'account verification',
    'qr code login',
    'verify wallet',
    'token grabber',
  ],
};

const spamCache = new Map();
const joinCache = new Map();

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
  }
}

function readConfig() {
  ensureStore();
  try {
    const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return {
      ...defaultConfig,
      ...stored,
      guilds: {
        ...defaultConfig.guilds,
        ...(stored.guilds || {}),
      },
    };
  } catch {
    return { ...defaultConfig };
  }
}

function writeConfig(config) {
  ensureStore();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function getGuildConfig(guildId) {
  return readConfig().guilds[guildId] || {};
}

function setGuildConfig(guildId, patch) {
  const config = readConfig();
  config.guilds[guildId] = {
    ...(config.guilds[guildId] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeConfig(config);
  return config.guilds[guildId];
}

function updateSecurityState(patch) {
  const config = readConfig();
  Object.assign(config, patch);
  writeConfig(config);
  return config;
}

function envStaffRoleIds() {
  return String(process.env.DRAGONSHOSTING_STAFF_ROLE_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean).map(String))];
}

function getStaffRoleIds(guild, extraRoleId = null) {
  const stored = getGuildConfig(guild.id).staffRoleIds || [];
  return uniqueIds([extraRoleId, ...stored, ...envStaffRoleIds()])
    .filter(roleId => guild.roles.cache.has(roleId));
}

function hasSecurityPermission(member) {
  if (!member) return false;
  const guildConfig = getGuildConfig(member.guild.id);
  const allowedRoles = uniqueIds([...(guildConfig.staffRoleIds || []), ...envStaffRoleIds()]);

  return member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    member.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    member.permissions?.has?.(PermissionFlagsBits.ModerateMembers) ||
    allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

function buildChannelOverwrites(guild, staffRoleIds) {
  return [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...staffRoleIds.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];
}

function findCategory(guild, name) {
  const wanted = name.toLowerCase();
  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory &&
    String(channel.name || '').toLowerCase() === wanted
  ) || null;
}

function findTextChannel(guild, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    wanted.has(String(channel.name || '').toLowerCase())
  ) || null;
}

async function ensureCategory(guild, name, overwrites) {
  const existing = findCategory(guild, name);
  if (existing) {
    await existing.permissionOverwrites.set(overwrites, 'SecuritySystem setup').catch(() => null);
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: 'SecuritySystem setup',
  });
}

async function prepareTextChannel(channel, category, topic, overwrites) {
  if (channel.parentId !== category.id) {
    await channel.setParent(category.id, { reason: 'SecuritySystem setup' }).catch(() => null);
  }
  await channel.setTopic(topic).catch(() => null);
  await channel.permissionOverwrites.set(overwrites, 'SecuritySystem setup').catch(() => null);
  return channel;
}

async function ensureTextChannel(guild, category, name, aliases, topic, overwrites) {
  const existing = findTextChannel(guild, [name, ...aliases]);
  if (existing) return prepareTextChannel(existing, category, topic, overwrites);

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: overwrites,
    reason: 'SecuritySystem setup',
  });
}

function buildSecurityPanelPayload(guildId) {
  const config = readConfig();
  const guildConfig = getGuildConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🛡 DragonsHosting Security System')
    .setDescription([
      'Security bewaakt scam invites, token/webhook leaks, spam, mass mentions en gevaarlijke bijlagen.',
      '',
      `Status: \`${config.enabled ? 'Enabled' : 'Disabled'}\``,
      `Lockdown: \`${config.lockdown ? 'Enabled' : 'Disabled'}\``,
      guildConfig.logChannelId ? `Logs: <#${guildConfig.logChannelId}>` : 'Logs: niet ingesteld',
    ].join('\n'))
    .setColor(config.lockdown ? 0xed4245 : 0x57f287)
    .setFooter({ text: 'DragonsHosting | Security' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('security_status').setLabel('Status').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('security_help').setLabel('Help').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('security_lockdown_on').setLabel('Lockdown ON').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('security_lockdown_off').setLabel('Lockdown OFF').setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row] };
}

function hasSecurityPanelButton(message) {
  return message.components?.some(row => row.components?.some(component => {
    const id = component.customId || component.data?.custom_id;
    return typeof id === 'string' && id.startsWith('security_');
  }));
}

async function sendOrUpdatePanel(channel, payload) {
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = recent?.find(message => message.author?.id === channel.client.user.id && hasSecurityPanelButton(message));

  if (existing) {
    await existing.edit(payload);
    return existing;
  }

  return channel.send(payload);
}

async function setupSecuritySystem(interaction, options = {}) {
  const guild = interaction.guild;
  const staffRoleId = options.staffRole?.id || null;
  const staffRoleIds = getStaffRoleIds(guild, staffRoleId);
  const overwrites = buildChannelOverwrites(guild, staffRoleIds);

  const category = await ensureCategory(guild, '🛡 Security System', overwrites);
  const panelChannel = options.panelChannel
    ? await prepareTextChannel(options.panelChannel, category, 'DragonsHosting Security controls', overwrites)
    : await ensureTextChannel(
      guild,
      category,
      '🛡・security-panel',
      ['security-panel', 'security'],
      'DragonsHosting Security controls',
      overwrites
    );
  const logChannel = options.logChannel
    ? await prepareTextChannel(options.logChannel, category, 'DragonsHosting Security logs', overwrites)
    : await ensureTextChannel(
      guild,
      category,
      '🚨・security-logs',
      ['security-logs', 'security-log'],
      'DragonsHosting Security logs',
      overwrites
    );

  const guildConfig = setGuildConfig(guild.id, {
    categoryId: category.id,
    panelChannelId: panelChannel.id,
    logChannelId: logChannel.id,
    staffRoleIds,
  });

  await sendOrUpdatePanel(panelChannel, buildSecurityPanelPayload(guild.id));
  return { category, panelChannel, logChannel, staffRoleIds, guildConfig };
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[@$]/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
}

function cleanUrl(value) {
  return String(value || '').replace(/[>)\].,!?]+$/g, '');
}

function extractUrls(content) {
  const matches = String(content || '').match(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi) || [];
  return matches.map(cleanUrl).filter(Boolean);
}

function parseUrl(value) {
  try {
    const normalized = /^www\./i.test(value) ? `https://${value}` : value;
    return new URL(normalized);
  } catch {
    return null;
  }
}

function normalizeAllowedEntry(entry) {
  return String(entry || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function isAllowedUrl(value, allowedEntries) {
  const parsed = parseUrl(value);
  if (!parsed) return false;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const hostAndPath = `${host}${parsed.pathname.toLowerCase()}`.replace(/\/+$/, '');

  return allowedEntries.some(entry => {
    const allowed = normalizeAllowedEntry(entry);
    if (!allowed) return false;
    if (allowed.includes('/')) return hostAndPath === allowed || hostAndPath.startsWith(`${allowed}/`);
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

function extractDiscordInvites(content) {
  const invites = [];
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/gi;
  let match;

  while ((match = regex.exec(String(content || ''))) !== null) {
    invites.push({
      raw: cleanUrl(match[0]),
      code: cleanUrl(match[1]),
    });
  }

  return invites;
}

function containsAllowedInvite(content, config) {
  const normalized = normalize(content);
  return (config.whitelistedInvites || []).some(invite => normalized.includes(normalize(invite)));
}

function hasTokenLeak(content) {
  return /(mfa\.[a-z0-9_-]{20,}|[a-z0-9_-]{20,}\.[a-z0-9_-]{6,}\.[a-z0-9_-]{20,})/i.test(content) ||
    /discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-z0-9_-]+/i.test(content);
}

function hasScamInvite(content, config) {
  const invites = extractDiscordInvites(content);
  if (!invites.length) return false;
  if (containsAllowedInvite(content, config)) return false;
  if (config.blockAllInvites) return true;

  const normalized = normalize(content);
  const rawInviteText = normalize(invites.map(invite => invite.raw).join(' '));
  return (config.scamTerms || []).some(term => {
    const normalizedTerm = normalize(term);
    return normalized.includes(normalizedTerm) || rawInviteText.includes(normalizedTerm);
  });
}

function hasBlockedLink(content, config) {
  if (!config.blockAllLinks) return false;
  const urls = extractUrls(content);
  if (!urls.length) return false;

  return urls.some(url => !isAllowedUrl(url, config.whitelistedDomains || []));
}

function hasBlockedAttachment(message, config) {
  for (const attachment of message.attachments.values()) {
    const name = String(attachment.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if ((config.blockedAttachmentExtensions || []).includes(ext)) return true;
  }
  return false;
}

async function logSecurity(guild, details) {
  const guildConfig = getGuildConfig(guild.id);
  const channel = guild.channels.cache.get(guildConfig.logChannelId || guildConfig.panelChannelId) ||
    await guild.channels.fetch(guildConfig.logChannelId || guildConfig.panelChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setTitle(details.title || 'Security Alert')
    .setColor(details.color || 0xed4245)
    .addFields(
      { name: 'User', value: details.user || 'Unknown', inline: false },
      { name: 'Reason', value: details.reason || 'Unknown', inline: true },
      { name: 'Action', value: details.action || 'Logged', inline: true },
      { name: 'Channel', value: details.channel || 'Unknown', inline: true }
    )
    .setTimestamp();

  if (details.content) {
    embed.addFields({ name: 'Content', value: String(details.content).slice(0, 900), inline: false });
  }

  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function punishMessage(message, reason, action = 'delete', severity = 'normal') {
  await message.delete().catch(() => null);

  if (severity === 'critical') {
    await message.member?.timeout?.(60 * 60 * 1000, `SecuritySystem: ${reason}`).catch(() => null);
    action = `${action} + timeout`;
  }

  await logSecurity(message.guild, {
    user: `${message.author.tag} (${message.author.id})`,
    reason,
    action,
    channel: `${message.channel}`,
    content: message.content,
  });
}

async function handleSecurityMessage(message) {
  if (!message.guild || message.author.bot) return;

  const config = readConfig();
  if (!config.enabled) return;
  if (hasSecurityPermission(message.member)) return;

  if (config.lockdown) {
    return punishMessage(message, 'Server lockdown is active', 'delete', 'high');
  }

  const content = message.content || '';

  if (hasTokenLeak(content)) {
    return punishMessage(message, 'Possible token or webhook leak', 'delete', 'critical');
  }

  if (hasScamInvite(content, config)) {
    return punishMessage(message, 'Possible scam Discord invite', 'delete', 'high');
  }

  if (hasBlockedLink(content, config)) {
    return punishMessage(message, 'Blocked external link', 'delete', 'normal');
  }

  if (message.mentions.users.size + message.mentions.roles.size >= config.maxMentions || message.mentions.everyone) {
    return punishMessage(message, 'Mass mention blocked', 'delete', 'high');
  }

  if (hasBlockedAttachment(message, config)) {
    return punishMessage(message, 'Blocked attachment type', 'delete', 'high');
  }

  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const history = (spamCache.get(key) || []).filter(ts => now - ts < config.spamWindowSeconds * 1000);
  history.push(now);
  spamCache.set(key, history);

  if (history.length >= config.spamMaxMessages) {
    spamCache.set(key, []);
    return punishMessage(message, 'Spam detected', 'delete', 'normal');
  }
}

async function handleGuildMemberAdd(member) {
  if (!member.guild || member.user.bot) return;
  const config = readConfig();
  if (!config.enabled) return;

  const now = Date.now();
  const key = member.guild.id;
  const joins = (joinCache.get(key) || []).filter(ts => now - ts < 20 * 1000);
  joins.push(now);
  joinCache.set(key, joins);

  if (joins.length >= 8 && !config.lockdown) {
    updateSecurityState({ lockdown: true });
    await logSecurity(member.guild, {
      title: 'Emergency Lockdown Enabled',
      user: 'SecuritySystem',
      reason: `${joins.length} joins in 20 seconds`,
      action: 'Lockdown enabled',
      channel: 'Guild Join',
      content: 'Possible raid detected.',
    });
  }

  if (config.lockdown && config.kickNewJoinsDuringLockdown && member.kickable) {
    await logSecurity(member.guild, {
      title: 'Lockdown Join Blocked',
      user: `${member.user.tag} (${member.id})`,
      reason: 'Server lockdown is active',
      action: 'Kicked',
      channel: 'Guild Join',
    });
    await member.kick('SecuritySystem: lockdown active').catch(() => null);
  }
}

async function refreshPanel(guild) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig.panelChannelId) return;
  const channel = guild.channels.cache.get(guildConfig.panelChannelId) ||
    await guild.channels.fetch(guildConfig.panelChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await sendOrUpdatePanel(channel, buildSecurityPanelPayload(guild.id)).catch(() => null);
}

async function handleSecurityInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('security_')) return false;

  if (!hasSecurityPermission(interaction.member)) {
    await interaction.reply({ content: 'Je hebt geen security permissies.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const config = readConfig();
  const guildConfig = getGuildConfig(interaction.guild.id);

  if (interaction.customId === 'security_status') {
    await interaction.reply({
      content: [
        `Security: ${config.enabled ? 'enabled' : 'disabled'}`,
        `Lockdown: ${config.lockdown ? 'enabled' : 'disabled'}`,
        `Log channel: ${guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'not set'}`,
        `Scam invite protection: enabled`,
        `Spam window: ${config.spamMaxMessages} messages / ${config.spamWindowSeconds}s`,
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId === 'security_help') {
    await interaction.reply({
      content: [
        'Security blokkeert token/webhook leaks, scam invites, spam, mass mentions en gevaarlijke bijlagen.',
        'Lockdown verwijdert normale berichten en kan nieuwe joins kicken zolang lockdown actief is.',
        'Staff/admins worden gebypassed via permissies of de ingestelde staff role.',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId === 'security_lockdown_on') {
    updateSecurityState({ lockdown: true });
    await logSecurity(interaction.guild, {
      title: 'Lockdown Enabled',
      user: `${interaction.user.tag} (${interaction.user.id})`,
      reason: 'Manual panel action',
      action: 'Lockdown enabled',
      channel: `${interaction.channel}`,
    });
    await refreshPanel(interaction.guild);
    await interaction.reply({ content: 'Lockdown staat aan.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (interaction.customId === 'security_lockdown_off') {
    updateSecurityState({ lockdown: false });
    await logSecurity(interaction.guild, {
      title: 'Lockdown Disabled',
      user: `${interaction.user.tag} (${interaction.user.id})`,
      reason: 'Manual panel action',
      action: 'Lockdown disabled',
      channel: `${interaction.channel}`,
    });
    await refreshPanel(interaction.guild);
    await interaction.reply({ content: 'Lockdown staat uit.', flags: MessageFlags.Ephemeral });
    return true;
  }

  return false;
}

module.exports = {
  buildSecurityPanelPayload,
  getGuildConfig,
  handleGuildMemberAdd,
  handleSecurityInteraction,
  handleSecurityMessage,
  logSecurity,
  setupSecuritySystem,
};
