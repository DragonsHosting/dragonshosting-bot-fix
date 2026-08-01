const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.resolve(__dirname, '../config.yml');
const DATA_DIR = path.resolve(__dirname, '../data');
const STATE_PATH = path.join(DATA_DIR, 'anti-alt-state.json');
const PLACEHOLDER_VALUES = new Set(['', '0', 'CHANNEL_ID', 'ROLE_ID', 'PUT_CHANNEL_ID', 'PUT_ROLE_ID']);
const lockdownAppliedAt = new Map();

function readRootConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { AntiAltDiscordAccounts: {} };
  }

  return yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8')) || { AntiAltDiscordAccounts: {} };
}

function loadConfig() {
  return readRootConfig().AntiAltDiscordAccounts || {};
}

function writeConfig(config) {
  const root = readRootConfig();
  root.AntiAltDiscordAccounts = {
    ...(root.AntiAltDiscordAccounts || {}),
    ...config
  };

  fs.writeFileSync(CONFIG_PATH, yaml.dump(root, { lineWidth: 120 }), 'utf8');
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return { guilds: {} };
  }

  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return state && typeof state.guilds === 'object' ? state : { guilds: {} };
  } catch {
    return { guilds: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parseDuration(value) {
  if (typeof value !== 'string') return 0;

  const match = value.trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return amount * 1000;
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    case 'w': return amount * 7 * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isConfiguredId(value) {
  return typeof value === 'string' && !PLACEHOLDER_VALUES.has(value.trim());
}

function isBypassed(member, config) {
  const bypassUsers = Array.isArray(config.BypassUserIDs) ? config.BypassUserIDs.map(String) : [];
  if (bypassUsers.includes(member.id)) {
    return true;
  }

  const bypassRoles = Array.isArray(config.BypassRoleIDs) ? config.BypassRoleIDs.map(String) : [];
  return bypassRoles.some(roleId => member.roles.cache.has(roleId));
}

function getStrictGate(config) {
  const gate = config.StrictJoinGate || {};
  const rules = gate.Rules || {};
  const joinBurst = rules.JoinBurst || {};

  return {
    enabled: gate.Enabled !== false,
    mode: ['all', 'suspicious'].includes(String(gate.Mode || '').toLowerCase())
      ? String(gate.Mode).toLowerCase()
      : 'suspicious',
    riskScoreThreshold: Number(gate.RiskScoreThreshold || 60),
    autoCreateQuarantineRole: gate.AutoCreateQuarantineRole !== false,
    quarantineRoleName: String(gate.QuarantineRoleName || 'Quarantine'),
    lockdownChannels: gate.LockdownChannels !== false,
    lockdownRefresh: parseDuration(gate.LockdownRefresh || '30m') || (30 * 60 * 1000),
    rules: {
      noAvatar: rules.NoAvatar !== false,
      duplicateName: rules.DuplicateName !== false,
      joinBurst: {
        enabled: joinBurst.Enabled !== false,
        windowMs: parseDuration(joinBurst.Window || '10m') || (10 * 60 * 1000),
        maxJoins: Number(joinBurst.MaxJoins || 3),
        accountMaxAgeMs: parseDuration(joinBurst.AccountMaxAge || '30d') || (30 * 24 * 60 * 60 * 1000)
      }
    }
  };
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function getMemberNames(member) {
  return [
    member.user.username,
    member.user.globalName,
    member.displayName
  ]
    .map(normalizeName)
    .filter(name => name.length >= 3);
}

function findDuplicateNames(member) {
  const names = new Set(getMemberNames(member));
  if (names.size === 0) return [];

  const matches = [];
  for (const other of member.guild.members.cache.values()) {
    if (other.id === member.id || other.user.bot) continue;

    const otherNames = getMemberNames(other);
    if (otherNames.some(name => names.has(name))) {
      matches.push(`${other.user.tag} (${other.id})`);
    }

    if (matches.length >= 5) break;
  }

  return matches;
}

function recordJoin(member, accountAgeMs, gate) {
  const state = readState();
  const guildId = member.guild.id;
  const now = Date.now();
  const keepAfter = now - Math.max(gate.rules.joinBurst.windowMs, 24 * 60 * 60 * 1000);

  state.guilds[guildId] = state.guilds[guildId] || { recentJoins: [] };
  state.guilds[guildId].recentJoins = (state.guilds[guildId].recentJoins || [])
    .filter(join => Number(join.timestamp) >= keepAfter);

  state.guilds[guildId].recentJoins.push({
    userId: member.id,
    timestamp: now,
    accountAgeMs
  });

  writeState(state);
  return state.guilds[guildId].recentJoins;
}

function assessMember(member, config) {
  const gate = getStrictGate(config);
  const minimumAgeMs = parseDuration(config.MinimumAccountAge || '30d');
  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const findings = [];
  let score = 0;

  const recentJoins = recordJoin(member, accountAgeMs, gate);

  if (minimumAgeMs > 0 && accountAgeMs < minimumAgeMs) {
    score += 100;
    findings.push(`Account age ${formatDuration(accountAgeMs)} is below required ${formatDuration(minimumAgeMs)}`);
  }

  if (gate.enabled && gate.mode === 'all') {
    score += 100;
    findings.push('Strict gate is set to review every new join');
  }

  if (gate.enabled && gate.rules.noAvatar && !member.user.avatar) {
    score += 25;
    findings.push('No custom avatar');
  }

  let duplicateMatches = [];
  if (gate.enabled && gate.rules.duplicateName) {
    duplicateMatches = findDuplicateNames(member);
    if (duplicateMatches.length > 0) {
      score += 45;
      findings.push(`Name/display name matches ${duplicateMatches.length} existing member(s)`);
    }
  }

  let burstCount = 0;
  if (gate.enabled && gate.rules.joinBurst.enabled) {
    const windowStart = Date.now() - gate.rules.joinBurst.windowMs;
    burstCount = recentJoins.filter(join =>
      Number(join.timestamp) >= windowStart &&
      Number(join.accountAgeMs) <= gate.rules.joinBurst.accountMaxAgeMs
    ).length;

    if (burstCount >= gate.rules.joinBurst.maxJoins) {
      score += 50;
      findings.push(`${burstCount} new/young accounts joined within ${formatDuration(gate.rules.joinBurst.windowMs)}`);
    }
  }

  const flagged = findings.length > 0 && (
    !gate.enabled ||
    gate.mode === 'all' ||
    accountAgeMs < minimumAgeMs ||
    score >= gate.riskScoreThreshold
  );

  return {
    flagged,
    score,
    findings,
    duplicateMatches,
    burstCount,
    gate,
    accountAgeMs,
    minimumAgeMs
  };
}

async function notifyMember(member, config, assessment) {
  if (!config?.DM?.Enabled || !config.DM.Message) return;

  const reasons = assessment.findings.length > 0
    ? `\n\nReason(s):\n- ${assessment.findings.join('\n- ')}`
    : '';

  await member.send({ content: `${String(config.DM.Message)}${reasons}` }).catch(() => {});
}

function limitField(value, max = 1000) {
  const text = String(value || 'None');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function sendLog(member, config, action, assessment, result) {
  if (!isConfiguredId(config.LogChannelID)) return;

  const channel = member.guild.channels.cache.get(config.LogChannelID);
  if (!channel || !channel.isTextBased()) return;

  const createdTimestamp = Math.floor(member.user.createdTimestamp / 1000);
  const joinedTimestamp = Math.floor(Date.now() / 1000);
  const embedConfig = config.LogEmbed || {};

  const embed = new EmbedBuilder()
    .setColor(embedConfig.Color || '#ED4245')
    .setTitle(embedConfig.Title || 'Anti-alt account flagged')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User', value: `${member.user.tag} (${member.id})`, inline: false },
      { name: 'Account created', value: `<t:${createdTimestamp}:F>\n<t:${createdTimestamp}:R>`, inline: true },
      { name: 'Joined', value: `<t:${joinedTimestamp}:F>`, inline: true },
      { name: 'Account age', value: formatDuration(assessment.accountAgeMs), inline: true },
      { name: 'Required age', value: formatDuration(assessment.minimumAgeMs), inline: true },
      { name: 'Risk score', value: String(assessment.score), inline: true },
      { name: 'Gate mode', value: assessment.gate.mode, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Result', value: result, inline: true },
      { name: 'Triggers', value: limitField(assessment.findings.map(item => `- ${item}`).join('\n')), inline: false }
    )
    .setTimestamp();

  if (assessment.duplicateMatches.length > 0) {
    embed.addFields({
      name: 'Name matches',
      value: limitField(assessment.duplicateMatches.map(item => `- ${item}`).join('\n')),
      inline: false
    });
  }

  if (embedConfig.Footer) {
    embed.setFooter({ text: String(embedConfig.Footer) });
  }

  await channel.send({ embeds: [embed] }).catch(err => {
    console.error('[AntiAltDiscordAccounts] Failed to send log:', err.message);
  });
}

async function ensureQuarantineRole(guild, config) {
  if (isConfiguredId(config.QuarantineRoleID)) {
    const configuredRole = guild.roles.cache.get(config.QuarantineRoleID)
      || await guild.roles.fetch(config.QuarantineRoleID).catch(() => null);
    if (configuredRole) return configuredRole;
  }

  const gate = getStrictGate(config);
  if (!gate.autoCreateQuarantineRole) return null;

  const existingRole = guild.roles.cache.find(role => role.name === gate.quarantineRoleName);
  if (existingRole) {
    config.QuarantineRoleID = existingRole.id;
    writeConfig({ QuarantineRoleID: existingRole.id });
    return existingRole;
  }

  const role = await guild.roles.create({
    name: gate.quarantineRoleName,
    permissions: [],
    reason: 'Anti-alt quarantine role setup'
  });

  config.QuarantineRoleID = role.id;
  writeConfig({ QuarantineRoleID: role.id });
  return role;
}

async function applyQuarantineLockdown(guild, role, config) {
  const gate = getStrictGate(config);
  if (!gate.lockdownChannels || !role) return;

  const now = Date.now();
  const lastApplied = lockdownAppliedAt.get(guild.id) || 0;
  if (now - lastApplied < gate.lockdownRefresh) return;

  const deny = {
    ViewChannel: false,
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    AddReactions: false,
    Connect: false,
    Speak: false
  };

  let updated = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel.permissionOverwrites?.edit) continue;

    await channel.permissionOverwrites.edit(role, deny, {
      reason: 'Anti-alt quarantine lockdown'
    }).then(() => {
      updated++;
    }).catch(err => {
      console.error(`[AntiAltDiscordAccounts] Failed to lock ${channel.name}: ${err.message}`);
    });
  }

  lockdownAppliedAt.set(guild.id, now);
  console.log(`[AntiAltDiscordAccounts] Quarantine lockdown checked for ${updated} channel(s).`);
}

async function performAction(member, config, reason) {
  const action = String(config.Action || 'quarantine').toLowerCase();

  if (action === 'quarantine') {
    const role = await ensureQuarantineRole(member.guild, config);
    if (!role) {
      return 'No quarantine role configured; logged only';
    }

    await applyQuarantineLockdown(member.guild, role, config);
    await member.roles.add(role, reason);
    return `Added quarantine role: ${role.name}`;
  }

  if (action === 'kick') {
    await member.kick(reason);
    return 'Member kicked';
  }

  if (action === 'ban') {
    await member.ban({ reason, deleteMessageSeconds: 0 });
    return 'Member banned';
  }

  return 'Logged only';
}

module.exports.run = async (client) => {
  console.log('[AntiAltDiscordAccounts] Strict anti-alt gate loaded');

  client.on('guildMemberAdd', async member => {
    const config = loadConfig();

    if (!config.Enabled) return;
    if (member.user.bot && config.IgnoreBots !== false) return;
    if (isBypassed(member, config)) return;

    const assessment = assessMember(member, config);
    if (!assessment.flagged) return;

    const reason = `Anti-alt: ${assessment.findings.join('; ')}`;
    const action = String(config.Action || 'quarantine').toLowerCase();

    let result = 'Logged only';
    try {
      await notifyMember(member, config, assessment);
      result = await performAction(member, config, reason);
    } catch (err) {
      result = `Action failed: ${err.message}`;
      console.error(`[AntiAltDiscordAccounts] ${result}`);
    }

    await sendLog(member, config, action, assessment, result);
    console.log(`[AntiAltDiscordAccounts] Flagged ${member.user.tag}: ${result}`);
  });
};
