const { ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('./channelStatsStore');

const STAT_KEYS = ['date', 'members', 'bots'];
const ALL_STAT_KEYS = ['date', 'members', 'bots', 'staff', 'bans'];
const DEFAULT_CONFIG = {
  enabled: true,
  categoryId: process.env.CHANNEL_STATS_CATEGORY_ID || process.env.DRAGONSHOSTING_CHANNEL_STATS_CATEGORY_ID || null,
  memberRoleId: process.env.CHANNEL_STATS_MEMBER_ROLE_ID || process.env.DRAGONSHOSTING_CHANNEL_STATS_MEMBER_ROLE_ID || null,
  staffRoleId: process.env.CHANNEL_STATS_STAFF_ROLE_ID || process.env.DRAGONSHOSTING_CHANNEL_STATS_STAFF_ROLE_ID || '1506340973029101679',
  categoryName: '📊 Server Statistics',
  timeZone: process.env.CHANNEL_STATS_TIMEZONE || 'Europe/Amsterdam',
  updateEveryMs: 15 * 60 * 1000,
  minRenameMs: 10 * 60 * 1000,
  statKeys: STAT_KEYS,
  templates: {
    date: '📅 {date}',
    members: 'Members: {count}',
    bots: 'Bots: {count}',
    staff: 'Staff: {count}',
    bans: 'Bans: {count}'
  },
  channelIds: {}
};

const activeUpdates = new Set();
const scheduledUpdates = new Map();
const lastRenameAt = new Map();

function mergeConfig(existing = {}, override = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...existing,
    ...override,
    templates: {
      ...DEFAULT_CONFIG.templates,
      ...(existing.templates || {}),
      ...(override.templates || {})
    },
    statKeys: Array.isArray(override.statKeys)
      ? override.statKeys.filter(key => ALL_STAT_KEYS.includes(key))
      : Array.isArray(existing.statKeys)
        ? existing.statKeys.filter(key => ALL_STAT_KEYS.includes(key))
        : DEFAULT_CONFIG.statKeys,
    channelIds: {
      ...(existing.channelIds || {}),
      ...(override.channelIds || {})
    }
  };
}

function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function formatDate(timeZone) {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: timeZone || DEFAULT_CONFIG.timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());
}

function buildChannelName(template, statKey, values, config = DEFAULT_CONFIG) {
  return String(template || '{count}')
    .replace(/\{count\}/g, formatCount(values[statKey]))
    .replace(/\{date\}/g, values.date || formatDate(config.timeZone))
    .trim()
    .slice(0, 100);
}

function getConfiguredChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || null;
}

async function fetchConfiguredChannel(guild, channelId) {
  if (!channelId) return null;
  return getConfiguredChannel(guild, channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

async function fetchRoleMemberCount(guild, roleId) {
  if (!roleId) return 0;

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return 0;

  const members = await guild.members.fetch().catch(() => null);
  if (!members) {
    return role.members.filter(member => !member.user.bot).size;
  }

  return members.filter(member => !member.user.bot && member.roles.cache.has(role.id)).size;
}

async function fetchGuildMemberCounts(guild, config) {
  const members = await guild.members.fetch().catch(() => null);
  const collection = members || guild.members.cache;
  const nonBotMembers = collection.filter(member => !member.user.bot);
  const bots = collection.filter(member => member.user.bot).size;

  let memberCount = nonBotMembers.size;
  if (config.memberRoleId) {
    const role = guild.roles.cache.get(config.memberRoleId) || await guild.roles.fetch(config.memberRoleId).catch(() => null);
    if (role) {
      memberCount = nonBotMembers.filter(member => member.roles.cache.has(role.id)).size;
    }
  }

  let staffCount = 0;
  if (config.staffRoleId) {
    staffCount = await fetchRoleMemberCount(guild, config.staffRoleId);
  }

  return {
    members: memberCount,
    bots,
    staff: staffCount
  };
}

async function fetchBanCount(guild) {
  const bans = await guild.bans.fetch().catch(err => {
    console.log(`[ChannelStats] Cannot fetch bans for ${guild.name}: ${err.message}`);
    return null;
  });

  return bans ? bans.size : 0;
}

async function getCounts(guild, config) {
  const [memberCounts, bans] = await Promise.all([
    fetchGuildMemberCounts(guild, config),
    fetchBanCount(guild)
  ]);

  return {
    members: memberCounts.members,
    bots: memberCounts.bots,
    staff: memberCounts.staff,
    bans,
    date: formatDate(config.timeZone)
  };
}

async function createCategory(guild, config) {
  if (config.categoryId) {
    const existingCategory = await fetchConfiguredChannel(guild, config.categoryId);
    if (existingCategory && existingCategory.type === ChannelType.GuildCategory) {
      return existingCategory;
    }
  }

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory && channel.name === config.categoryName
  );
  if (existingByName) return existingByName;

  return guild.channels.create({
    name: config.categoryName,
    type: ChannelType.GuildCategory,
    reason: 'Channel stats setup'
  });
}

async function ensureStatChannel(guild, config, statKey, initialName, category) {
  const current = await fetchConfiguredChannel(guild, config.channelIds[statKey]);
  if (current && current.type === ChannelType.GuildVoice) {
    return current;
  }

  return guild.channels.create({
    name: initialName,
    type: ChannelType.GuildVoice,
    parent: category?.id || null,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.Connect]
      }
    ],
    reason: 'Channel stats setup'
  });
}

async function setupGuildStats(guild, options) {
  const existing = store.getGuildConfig(guild.id) || {};
  const config = mergeConfig(existing, {
    enabled: true,
    memberRoleId: options.memberRoleId || DEFAULT_CONFIG.memberRoleId || existing.memberRoleId,
    staffRoleId: options.staffRoleId || DEFAULT_CONFIG.staffRoleId || existing.staffRoleId,
    categoryId: options.categoryId || DEFAULT_CONFIG.categoryId || existing.categoryId,
    categoryName: options.categoryName || existing.categoryName || DEFAULT_CONFIG.categoryName,
    statKeys: options.statKeys || existing.statKeys || DEFAULT_CONFIG.statKeys,
    templates: options.templates || {}
  });

  const counts = await getCounts(guild, config);
  const category = await createCategory(guild, config);
  config.categoryId = category.id;

  for (const statKey of config.statKeys) {
    const channel = await ensureStatChannel(
      guild,
      config,
      statKey,
      buildChannelName(config.templates[statKey], statKey, counts, config),
      category
    );
    config.channelIds[statKey] = channel.id;
  }

  const saved = store.saveGuildConfig(guild.id, {
    ...config,
    lastCounts: counts,
    lastRefreshAt: new Date().toISOString()
  });

  await updateGuildStats(guild, { force: true, config: saved });
  return saved;
}

async function updateGuildStats(guild, options = {}) {
  const config = mergeConfig(options.config || store.getGuildConfig(guild.id) || {});
  if (!config.enabled) {
    return { skipped: true, reason: 'not_configured' };
  }

  const now = Date.now();
  const last = lastRenameAt.get(guild.id) || 0;
  if (!options.force && now - last < config.minRenameMs) {
    return { skipped: true, reason: 'rate_limited' };
  }

  if (activeUpdates.has(guild.id)) {
    return { skipped: true, reason: 'already_running' };
  }

  activeUpdates.add(guild.id);
  try {
    const counts = await getCounts(guild, config);
    const renamed = [];

    for (const statKey of config.statKeys) {
      const channelId = config.channelIds[statKey];
      const channel = await fetchConfiguredChannel(guild, channelId);

      if (!channel || channel.type !== ChannelType.GuildVoice) continue;

      const nextName = buildChannelName(config.templates[statKey], statKey, counts, config);
      if (channel.name !== nextName) {
        await channel.setName(nextName, 'Updating channel stats').catch(err => {
          console.log(`[ChannelStats] Cannot rename ${statKey} channel: ${err.message}`);
        });
        renamed.push(statKey);
      }
    }

    lastRenameAt.set(guild.id, now);
    store.saveGuildConfig(guild.id, {
      ...config,
      lastCounts: counts,
      lastRefreshAt: new Date().toISOString()
    });

    return { skipped: false, counts, renamed };
  } finally {
    activeUpdates.delete(guild.id);
  }
}

async function disableGuildStats(guild, options = {}) {
  const existing = store.getGuildConfig(guild.id);
  if (!existing) return { existed: false, deletedChannels: [] };

  const deletedChannels = [];

  if (options.deleteChannels) {
    for (const channelId of Object.values(existing.channelIds || {})) {
      const channel = await fetchConfiguredChannel(guild, channelId);
      if (!channel) continue;

      await channel.delete('Channel stats disabled').then(() => {
        deletedChannels.push(channelId);
      }).catch(err => {
        console.log(`[ChannelStats] Cannot delete stat channel ${channelId}: ${err.message}`);
      });
    }

    const category = await fetchConfiguredChannel(guild, existing.categoryId);
    if (category && category.type === ChannelType.GuildCategory && category.children.cache.size === 0) {
      await category.delete('Channel stats disabled').catch(() => null);
    }
  }

  store.deleteGuildConfig(guild.id);
  return { existed: true, deletedChannels };
}

function queueGuildUpdate(client, guildId, delayMs = 30 * 1000) {
  if (scheduledUpdates.has(guildId)) {
    clearTimeout(scheduledUpdates.get(guildId));
  }

  const timeout = setTimeout(async () => {
    scheduledUpdates.delete(guildId);
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) await updateGuildStats(guild).catch(err => console.log(`[ChannelStats] Update failed: ${err.message}`));
  }, delayMs);

  if (typeof timeout.unref === 'function') timeout.unref();
  scheduledUpdates.set(guildId, timeout);
}

function startChannelStatsScheduler(client) {
  if (client._channelStatsScheduler) return;

  const runAll = async () => {
    for (const config of store.getAllGuildConfigs()) {
      if (!config.enabled) continue;
      const guild = client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId).catch(() => null);
      if (!guild) continue;
      await updateGuildStats(guild, { config }).catch(err => console.log(`[ChannelStats] Scheduled update failed: ${err.message}`));
    }
  };

  runAll().catch(err => console.log(`[ChannelStats] Startup update failed: ${err.message}`));

  const interval = setInterval(runAll, DEFAULT_CONFIG.updateEveryMs);
  if (typeof interval.unref === 'function') interval.unref();
  client._channelStatsScheduler = interval;
}

module.exports = {
  DEFAULT_CONFIG,
  STAT_KEYS,
  disableGuildStats,
  queueGuildUpdate,
  setupGuildStats,
  startChannelStatsScheduler,
  updateGuildStats
};
