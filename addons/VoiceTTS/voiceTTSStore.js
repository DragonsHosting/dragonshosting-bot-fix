const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DATA_FILE = path.join(DATA_DIR, 'voice-tts.json');
const MAX_BACKUPS = 25;

const DEFAULT_DATA = {
  guilds: {},
  sessions: {}
};

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return { ...DEFAULT_DATA, guilds: {}, sessions: {} };

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      guilds: parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null ? parsed.guilds : {},
      sessions: parsed && typeof parsed.sessions === 'object' && parsed.sessions !== null ? parsed.sessions : {}
    };
  } catch (err) {
    console.log(`[VoiceTTS] Failed to read config: ${err.message}`);
    return { ...DEFAULT_DATA, guilds: {}, sessions: {} };
  }
}

function safeReason(reason) {
  return String(reason || 'save').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'save';
}

function backupCurrent(reason) {
  ensureDirs();
  if (!fs.existsSync(DATA_FILE)) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `${stamp}-${safeReason(reason)}.json`);
  fs.copyFileSync(DATA_FILE, backupPath);
  pruneBackups();
  return backupPath;
}

function pruneBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => ({
      file,
      path: path.join(BACKUP_DIR, file),
      mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const oldBackup of backups.slice(MAX_BACKUPS)) {
    fs.unlinkSync(oldBackup.path);
  }
}

function writeAll(data, reason = 'save') {
  ensureDirs();
  backupCurrent(reason);

  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, DATA_FILE);
  return data;
}

function getGuildConfig(guildId) {
  return readAll().guilds[guildId] || null;
}

function saveGuildConfig(guildId, config, reason = 'config') {
  const data = readAll();
  data.guilds[guildId] = {
    ...(data.guilds[guildId] || {}),
    ...config,
    guildId,
    updatedAt: new Date().toISOString()
  };
  writeAll(data, reason);
  return data.guilds[guildId];
}

function getGuildSessions(guildId) {
  const data = readAll();
  return data.sessions[guildId] || {};
}

function getSession(guildId, userId) {
  return getGuildSessions(guildId)[userId] || null;
}

function getSessionByTextChannel(textChannelId) {
  const data = readAll();
  for (const [guildId, sessions] of Object.entries(data.sessions)) {
    for (const [userId, session] of Object.entries(sessions || {})) {
      if (session.textChannelId === textChannelId) {
        return { ...session, guildId, userId };
      }
    }
  }
  return null;
}

function saveSession(guildId, userId, session, reason = 'session') {
  const data = readAll();
  if (!data.sessions[guildId]) data.sessions[guildId] = {};
  data.sessions[guildId][userId] = {
    ...(data.sessions[guildId][userId] || {}),
    ...session,
    guildId,
    userId,
    updatedAt: new Date().toISOString()
  };
  writeAll(data, reason);
  return data.sessions[guildId][userId];
}

function deleteSession(guildId, userId, reason = 'session-delete') {
  const data = readAll();
  const existing = data.sessions[guildId]?.[userId] || null;
  if (data.sessions[guildId]) {
    delete data.sessions[guildId][userId];
    if (Object.keys(data.sessions[guildId]).length === 0) delete data.sessions[guildId];
  }
  writeAll(data, reason);
  return existing;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        file,
        path: filePath,
        createdAt: stats.mtime.toISOString(),
        size: stats.size
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = {
  BACKUP_DIR,
  DATA_FILE,
  backupCurrent,
  deleteSession,
  getGuildConfig,
  getGuildSessions,
  getSession,
  getSessionByTextChannel,
  listBackups,
  readAll,
  saveGuildConfig,
  saveSession
};
