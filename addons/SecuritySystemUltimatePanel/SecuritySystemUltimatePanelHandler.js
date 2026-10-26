const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require('discord.js');

const dataDir = path.join(__dirname, 'data');
const configFile = path.join(dataDir, 'security-config.json');
const GUILD_ID = '0';
const SECURITY_PANEL_CHANNEL_ID = '0';
const SECURITY_LOG_CHANNEL_ID = '0';
let panelEnsured = false;

const defaultConfig = {
  enabled: true,
  lockdown: false,
  guilds: {
    [GUILD_ID]: {
      panelChannelId: SECURITY_PANEL_CHANNEL_ID,
      logChannelId: SECURITY_LOG_CHANNEL_ID
    }
  },
  maxMentions: 6,
  spamWindowSeconds: 8,
  spamMaxMessages: 7,
  blockedAttachmentExtensions: ['exe', 'scr', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'jar'],
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
    'account verification'
  ]
};

const spamCache = new Map();

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
        ...(stored.guilds || {})
      }
    };
  } catch {
    return { ...defaultConfig };
  }
}

function writeConfig(config) {
  ensureStore();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function setGuildChannels(guildId, channels) {
  const config = readConfig();
  config.guilds[guildId] = {
    ...(config.guilds[guildId] || {}),
    ...channels
  };
  writeConfig(config);
}

function hasSecurityPermission(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ModerateMembers);
}

function buildSecurityPanelPayload() {
  const config = readConfig();
  const embed = new EmbedBuilder()
    .setTitle('Dragonshosting Ultimate Security')
    .setDescription([
      'Security bewaakt scam invites, token/webhook leaks, spam, mass mentions en gevaarlijke bijlagen.',
      '',
      `Status: \`${config.enabled ? 'Enabled' : 'Disabled'}\``,
      `Lockdown: \`${config.lockdown ? 'Enabled' : 'Disabled'}\``,
      `Logkanaal: <#${SECURITY_LOG_CHANNEL_ID}>`,
    ].join('\n'))
    .setColor(config.lockdown ? 0xed4245 : 0x57f287)
    .setFooter({ text: 'Dragonshosting | Ultimate Security' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('security_status').setLabel('Status').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('security_lockdown_on').setLabel('Lockdown Aan').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('security_lockdown_off').setLabel('Lockdown Uit').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('security_help').setLabel('Help').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

function hasSecurityPanelButton(message) {
  return message.components?.some(row => row.components?.some(component => {
    const id = component.customId || component.data?.custom_id;
    return typeof id === 'string' && id.startsWith('security_');
  }));
}

async function ensureSecurityPanel(client) {
  if (panelEnsured) return;
  panelEnsured = true;

  const channel = await client.channels.fetch(SECURITY_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    return;
  }

  const payload = buildSecurityPanelPayload();
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const existing = recent?.find(message => message.author?.id === client.user.id && hasSecurityPanelButton(message));

  if (existing) {
    await existing.edit(payload).catch(error => console.error('[SecuritySystemUltimatePanel] Could not edit panel:', error.message));
  } else {
    await channel.send(payload).catch(error => console.error('[SecuritySystemUltimatePanel] Could not send panel:', error.message));
  }
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

function hasTokenLeak(content) {
  return /(mfa\.[a-z0-9_-]{20,}|[a-z0-9_-]{20,}\.[a-z0-9_-]{6,}\.[a-z0-9_-]{20,})/i.test(content) ||
    /discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-z0-9_-]+/i.test(content);
}

function hasScamInvite(content, config) {
  const normalized = normalize(content);
  const hasInvite = /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(content);
  return hasInvite && config.scamTerms.some(term => normalized.includes(normalize(term)));
}

function hasBlockedAttachment(message, config) {
  for (const attachment of message.attachments.values()) {
    const name = String(attachment.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (config.blockedAttachmentExtensions.includes(ext)) return true;
  }
  return false;
}

async function logSecurity(guild, details) {
  const config = readConfig();
  const guildConfig = config.guilds[guild.id] || {};
  const channel = guild.channels.cache.get(guildConfig.logChannelId || guildConfig.panelChannelId);
  if (!channel) return;

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

async function punishMessage(message, reason, action = 'delete') {
  await message.delete().catch(() => null);
  await logSecurity(message.guild, {
    user: `${message.author.tag} (${message.author.id})`,
    reason,
    action,
    channel: `${message.channel}`,
    content: message.content
  });
}

async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;

  const config = readConfig();
  if (!config.enabled) return;
  if (hasSecurityPermission(message.member)) return;

  if (config.lockdown) {
    return punishMessage(message, 'Server lockdown is active');
  }

  const content = message.content || '';

  if (hasTokenLeak(content)) {
    await message.member?.timeout?.(60 * 60 * 1000, 'Security: token or webhook leak').catch(() => null);
    return punishMessage(message, 'Possible token or webhook leak', 'delete + timeout');
  }

  if (hasScamInvite(content, config)) {
    return punishMessage(message, 'Possible scam Discord invite');
  }

  if (message.mentions.users.size + message.mentions.roles.size >= config.maxMentions || message.mentions.everyone) {
    return punishMessage(message, 'Mass mention blocked');
  }

  if (hasBlockedAttachment(message, config)) {
    return punishMessage(message, 'Blocked attachment type');
  }

  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const history = (spamCache.get(key) || []).filter(ts => now - ts < config.spamWindowSeconds * 1000);
  history.push(now);
  spamCache.set(key, history);

  if (history.length >= config.spamMaxMessages) {
    spamCache.set(key, []);
    return punishMessage(message, 'Spam detected');
  }
}

async function handleButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('security_')) return;

  if (!hasSecurityPermission(interaction.member)) {
    return interaction.reply({ content: 'Je hebt geen security permissies.', flags: MessageFlags.Ephemeral });
  }

  const config = readConfig();

  if (interaction.customId === 'security_status') {
    const guildConfig = config.guilds[interaction.guild.id] || {};
    return interaction.reply({
      content: [
        `Security: ${config.enabled ? 'enabled' : 'disabled'}`,
        `Lockdown: ${config.lockdown ? 'enabled' : 'disabled'}`,
        `Log channel: ${guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'not set'}`
      ].join('\n'),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'security_help') {
    return interaction.reply({
      content: 'Security blokkeert scam invites, token/webhook leaks, spam, mass mentions en gevaarlijke bijlagen.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'security_lockdown_on') {
    config.lockdown = true;
    writeConfig(config);
    await logSecurity(interaction.guild, {
      title: 'Lockdown Enabled',
      user: `${interaction.user.tag} (${interaction.user.id})`,
      reason: 'Manual panel action',
      action: 'Lockdown enabled',
      channel: `${interaction.channel}`
    });
    panelEnsured = false;
    await ensureSecurityPanel(interaction.client).catch(() => null);
    return interaction.reply({ content: 'Lockdown staat aan.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.customId === 'security_lockdown_off') {
    config.lockdown = false;
    writeConfig(config);
    await logSecurity(interaction.guild, {
      title: 'Lockdown Disabled',
      user: `${interaction.user.tag} (${interaction.user.id})`,
      reason: 'Manual panel action',
      action: 'Lockdown disabled',
      channel: `${interaction.channel}`
    });
    panelEnsured = false;
    await ensureSecurityPanel(interaction.client).catch(() => null);
    return interaction.reply({ content: 'Lockdown staat uit.', flags: MessageFlags.Ephemeral });
  }
}

async function handleSecurityInteraction(interaction) {
  try {
    return handleButton(interaction);
  } catch (error) {
    console.error('[SecuritySystem] interaction failed:', {
      customId: interaction?.customId,
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    });
    if (interaction?.isRepliable?.() && !interaction.replied && !interaction.deferred) {
      return interaction.reply({ content: 'Security actie is mislukt.', flags: MessageFlags.Ephemeral }).catch(() => null);
    }
  }
}

async function handleSecurityMessage(message) {
  return handleMessage(message).catch(error => {
    console.error('[SecuritySystem] messageCreate failed:', {
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    });
  });
}

module.exports = {
  name: 'SecuritySystemUltimatePanel',
  version: '1.0.0',
  description: 'Security panel and lightweight moderation protection.',
  setGuildChannels,
  handleButton,
  handleMessage,

  async run(client) {
    ensureStore();
    setTimeout(() => ensureSecurityPanel(client).catch(error => {
      console.error('[SecuritySystemUltimatePanel] Panel setup failed:', error.message);
    }), 5000);
    if (process.env.DRAGONSHOSTING_VERBOSE_STARTUP === 'true') {
        console.log('[SecuritySystemUltimatePanel] Addon loaded');
    }
  },

  events: {
    'discord:ready': async ({ client }) => ensureSecurityPanel(client),
    'discord:messageCreate': async ({ message }) => handleSecurityMessage(message),
    'discord:interactionCreate': async ({ interaction }) => handleSecurityInteraction(interaction),
  },
};

