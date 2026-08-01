#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const API_BASE = 'https://discord.com/api/v10';
const INVITE_PATTERNS = [
  'discord.gg',
  'discord.com/invite',
  'discordapp.com/invite',
  'discord\\.gg',
  'discord(?:app)?\\.com\\/invite'
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\*/g, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
}

function looksLikeInvitePattern(value) {
  const text = normalize(value);
  return INVITE_PATTERNS.some(pattern => text.includes(normalize(pattern)));
}

function hasBlockAction(rule) {
  return (rule.actions || []).some(action => action.type === 1 || action.type === 'BLOCK_MESSAGE');
}

function ruleBlocksInviteLinks(rule) {
  const metadata = rule.trigger_metadata || {};
  const filters = [
    ...(metadata.keyword_filter || []),
    ...(metadata.regex_patterns || [])
  ];

  if (filters.some(looksLikeInvitePattern)) return true;

  const ruleNameLooksRelevant = /\binvite\b|anti[-_\s]?invite|discord[-_\s]?invite/i.test(rule.name || '');
  return ruleNameLooksRelevant && hasBlockAction(rule);
}

function discordRequest(token, method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(`${API_BASE}${route}`);
    const authorization = token.startsWith('Bot ') ? token : `Bot ${token}`;
    const request = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'User-Agent': 'DragonsHostingInviteAutoModFix/1.0',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = null;
        }

        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(parsed);
        } else {
          const message = parsed && parsed.message ? parsed.message : data;
          reject(new Error(`Discord API ${response.statusCode}: ${message}`));
        }
      });
    });

    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function main() {
  const envPath = getArgValue('--env');
  if (envPath) {
    loadEnvFile(path.resolve(process.cwd(), envPath));
  } else {
    loadEnvFile(path.resolve(__dirname, '..', '.env'));
    loadEnvFile(path.resolve(process.cwd(), '.env'));
  }

  const token = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN;
  const guildId = getArgValue('--guild') || process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
  const apply = process.argv.includes('--apply');

  if (!token) {
    throw new Error('Missing BOT_TOKEN or DISCORD_BOT_TOKEN. Put it in .env or pass --env <file>.');
  }

  if (!guildId) {
    throw new Error('Missing guild id. Set DISCORD_GUILD_ID in .env or pass --guild <serverId>.');
  }

  const rules = await discordRequest(token, 'GET', `/guilds/${guildId}/auto-moderation/rules`);
  const inviteRules = rules.filter(rule => rule.enabled !== false && ruleBlocksInviteLinks(rule));

  if (!inviteRules.length) {
    console.log('No enabled AutoMod rules found that block Discord invite links.');
    return;
  }

  for (const rule of inviteRules) {
    if (!apply) {
      console.log(`[DRY RUN] Would disable AutoMod rule: ${rule.name} (${rule.id})`);
      continue;
    }

    await discordRequest(token, 'PATCH', `/guilds/${guildId}/auto-moderation/rules/${rule.id}`, {
      enabled: false
    });
    console.log(`Disabled AutoMod rule: ${rule.name} (${rule.id})`);
  }

  if (!apply) {
    console.log('Run again with --apply to disable these rules.');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
