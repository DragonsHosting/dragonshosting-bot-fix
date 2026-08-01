const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, 'data');
const dataFile = path.join(dataDir, 'channel-stats.json');

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readAll() {
  if (!fs.existsSync(dataFile)) {
    return { guilds: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      guilds: parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null
        ? parsed.guilds
        : {}
    };
  } catch (err) {
    console.log(`[ChannelStats] Failed to read config: ${err.message}`);
    return { guilds: {} };
  }
}

function writeAll(data) {
  ensureDataDir();
  fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function getGuildConfig(guildId) {
  return readAll().guilds[guildId] || null;
}

function getAllGuildConfigs() {
  return Object.values(readAll().guilds);
}

function saveGuildConfig(guildId, config) {
  const data = readAll();
  data.guilds[guildId] = {
    ...(data.guilds[guildId] || {}),
    ...config,
    guildId,
    updatedAt: new Date().toISOString()
  };
  writeAll(data);
  return data.guilds[guildId];
}

function deleteGuildConfig(guildId) {
  const data = readAll();
  const existing = data.guilds[guildId] || null;
  delete data.guilds[guildId];
  writeAll(data);
  return existing;
}

module.exports = {
  dataFile,
  getAllGuildConfigs,
  getGuildConfig,
  saveGuildConfig,
  deleteGuildConfig
};
