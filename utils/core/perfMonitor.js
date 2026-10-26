const fs = require('fs');

const perfBuffer = [];
const MAX_BUFFER = 200;
const SLOW_THRESHOLD_MS = 200;
const lastLogByName = new Map();
const MAX_LOG_ENTRIES = 100;
const LOG_ENTRY_TTL = 300000;

function record(name, durationMs, meta = '') {
  const now = Date.now();
  const entry = { t: now, name, ms: durationMs, meta };
  perfBuffer.push(entry);
  while (perfBuffer.length > MAX_BUFFER) perfBuffer.shift();
  
  const last = lastLogByName.get(name) || 0;
  if (durationMs >= SLOW_THRESHOLD_MS && now - last > 30000) {
    lastLogByName.set(name, now);
  }
  
  if (lastLogByName.size > MAX_LOG_ENTRIES) {
    for (const [key, timestamp] of lastLogByName.entries()) {
      if (now - timestamp > LOG_ENTRY_TTL) {
        lastLogByName.delete(key);
      }
    }
  }
}

async function observeAsync(name, fn) {
  const start = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    record(name, ms);
  }
}

function startLoopLagMonitor(lagThresholdMs = 250, intervalMs = 1000) {
  let last = process.hrtime.bigint();
  setInterval(() => {
    const now = process.hrtime.bigint();
    const diffMs = Number(now - last) / 1e6 - intervalMs;
    if (diffMs > lagThresholdMs) {
      record('eventLoop.lag', diffMs);
    }
    last = now;
  }, intervalMs).unref();
}

module.exports = { observeAsync, record, startLoopLagMonitor };