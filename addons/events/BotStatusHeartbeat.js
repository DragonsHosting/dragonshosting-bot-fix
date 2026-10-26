const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'bot-status-heartbeat.json');
const STATE_FILE = path.join(DATA_DIR, 'bot-status-state.json');
const HEARTBEAT_MS = 10_000;

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')).version || 'onbekend';
  } catch {
    return 'onbekend';
  }
}

function errorSummary(error) {
  if (!error) return null;
  const stack = String(error.stack || '');
  const location = stack.match(/\(([^()]+):(\d+):(\d+)\)/) || stack.match(/at ([^()\s]+):(\d+):(\d+)/);
  return {
    name: error.name || 'Error',
    code: error.code ? String(error.code) : null,
    message: String(error.message || error).slice(0, 300),
    file: location ? path.basename(location[1]) : null,
    line: location ? Number(location[2]) : null,
  };
}

module.exports = {
  name: 'BotStatusHeartbeat',
  version: '1.0.0',
  description: 'Writes bot health, reconnect and crash state for the host status monitor.',

  run: async (client) => {
    if (client.__botStatusHeartbeat) return;
    client.__botStatusHeartbeat = true;

    const previous = readJson(STATE_FILE, {});
    const runtime = {
      status: 'online',
      previousStatus: previous.status || 'unknown',
      reason: 'Bot gestart en aangemeld bij Discord',
      code: null,
      shard: 0,
      reconnectAttempts: 0,
      restartCount: Number(previous.restartCount || 0) + 1,
      startedAt: new Date().toISOString(),
      error: null,
    };

    const snapshot = () => ({
      botId: client.user?.id || null,
      botName: client.user?.username || null,
      status: runtime.status,
      previousStatus: runtime.previousStatus,
      reason: runtime.reason,
      code: runtime.code,
      shard: runtime.shard,
      ping: Number.isFinite(client.ws?.ping) ? Math.max(0, Math.round(client.ws.ping)) : null,
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      restartCount: runtime.restartCount,
      reconnectAttempts: runtime.reconnectAttempts,
      environment: process.env.NODE_ENV || 'production',
      version: packageVersion(),
      containerHost: os.hostname(),
      pid: process.pid,
      startedAt: runtime.startedAt,
      updatedAt: new Date().toISOString(),
      error: runtime.error,
    });

    const persist = () => {
      const data = snapshot();
      writeJson(HEARTBEAT_FILE, data);
      writeJson(STATE_FILE, {
        status: data.status,
        restartCount: data.restartCount,
        updatedAt: data.updatedAt,
      });
    };

    const change = (status, reason, details = {}) => {
      runtime.previousStatus = runtime.status;
      runtime.status = status;
      runtime.reason = reason;
      runtime.code = details.code != null ? String(details.code) : null;
      runtime.shard = Number.isInteger(details.shard) ? details.shard : runtime.shard;
      runtime.error = details.error ? errorSummary(details.error) : null;
      persist();
    };

    client.on('shardDisconnect', (event, shardId) => {
      change('offline', 'Discord WebSocket-verbinding verbroken', { code: event?.code, shard: shardId });
    });
    client.on('shardReconnecting', (shardId) => {
      runtime.reconnectAttempts += 1;
      change('reconnecting', 'Discord WebSocket maakt opnieuw verbinding', { shard: shardId });
    });
    client.on('shardResume', (shardId) => {
      change('online', 'Automatische reconnect geslaagd', { shard: shardId });
    });
    client.on('invalidated', () => {
      change('offline', 'Discord-sessie ongeldig geworden', { code: 'INVALIDATED' });
    });
    client.on('error', (error) => {
      // Add-on/client errors can be non-fatal. Keep a connected bot online and log
      // the problem locally; WebSocket events below remain authoritative for outages.
      if (client.isReady?.()) {
        console.error('[BotStatusHeartbeat] Niet-kritieke Discord-clientfout:', error);
        runtime.status = 'online';
        runtime.reason = 'Bot is verbonden met Discord';
        runtime.code = null;
        runtime.error = null;
        persist();
        return;
      }
      change('reconnecting', 'Discord-clientfout; herstel wordt geprobeerd', { error });
    });

    process.on('uncaughtExceptionMonitor', (error) => {
      change('offline', 'Crash / uncaught exception', { error });
    });
    process.once('SIGTERM', () => change('offline', 'Manual shutdown of container restart', { code: 'SIGTERM' }));
    process.once('SIGINT', () => change('offline', 'Manual shutdown', { code: 'SIGINT' }));

    persist();
    const timer = setInterval(() => persist(), HEARTBEAT_MS);
    timer.unref?.();
    const identity = client.user?.tag || client.user?.username || 'Discord-client (login volgt)';
    console.log(`[BotStatusHeartbeat] Actief voor ${identity}; elke ${HEARTBEAT_MS / 1000}s.`);
  },
};
