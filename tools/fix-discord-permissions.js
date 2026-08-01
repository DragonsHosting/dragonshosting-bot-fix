#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require('discord.js');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeRoles = args.has('--roles');
const includeChannels = !args.has('--roles-only');
const configArg = process.argv.find(arg => arg.startsWith('--config='));
const configPath = path.resolve(process.cwd(), configArg ? configArg.slice('--config='.length) : 'tools/permission-fixer.config.json');
const coreConfigPath = path.resolve(process.cwd(), 'config/core.yml');

function fail(message) {
  console.error(`[permissions-fixer] ${message}`);
  process.exit(1);
}

function readConfig() {
  if (!fs.existsSync(configPath)) {
    fail(`Config not found: ${configPath}\nCopy tools/permission-fixer.config.example.json to tools/permission-fixer.config.json and edit it first.`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function readYamlScalar(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*${escaped}\\s*:\\s*["']?([^"'#]+)["']?`, 'mi');
  const match = fs.readFileSync(filePath, 'utf8').match(pattern);
  return match ? match[1].trim() : null;
}

function permissionBits(names) {
  const flags = [];
  for (const name of names || []) {
    const bit = PermissionsBitField.Flags[name];
    if (bit === undefined) fail(`Unknown Discord permission flag: ${name}`);
    flags.push(bit);
  }
  return flags;
}

function matchesName(entity, needle) {
  return String(entity.name || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function ruleMatchesName(entity, rule) {
  if (rule.id) return String(entity.id) === String(rule.id);
  if (rule.name) return String(entity.name || '').toLowerCase() === String(rule.name).toLowerCase();
  return matchesName(entity, rule.match);
}

async function ensureRole(guild, roleConfig, changes) {
  if (roleConfig.skip) {
    changes.push(`SKIP role ${roleConfig.name || roleConfig.id}`);
    return null;
  }

  let role = roleConfig.id
    ? guild.roles.cache.get(String(roleConfig.id))
    : guild.roles.cache.find(r => r.name.toLowerCase() === roleConfig.name.toLowerCase());

  if (roleConfig.id && !role) {
    changes.push(`MISSING role id ${roleConfig.id} (${roleConfig.name || 'unnamed'})`);
    return null;
  }

  if (role && !role.editable) {
    changes.push(`SKIP non-editable role ${role.name}`);
    return role;
  }

  const payload = {
    name: roleConfig.name || role?.name,
    color: roleConfig.color,
    hoist: Boolean(roleConfig.hoist),
    mentionable: Boolean(roleConfig.mentionable),
    permissions: new PermissionsBitField(permissionBits(roleConfig.permissions)).bitfield
  };

  if (!role) {
    changes.push(`CREATE role ${roleConfig.name}`);
    if (apply) role = await guild.roles.create({ ...payload, reason: 'DragonsHosting permission fix' });
    return role;
  }

  const currentPerms = role.permissions.bitfield;
  const wantedPerms = payload.permissions;
  const wantedColor = String(roleConfig.color || '').toLowerCase();
  const currentColor = String(role.hexColor || '').toLowerCase();
  const needsEdit =
    (wantedColor && currentColor !== wantedColor) ||
    role.hoist !== payload.hoist ||
    role.mentionable !== payload.mentionable ||
    currentPerms !== wantedPerms;

  if (needsEdit) {
    changes.push(`UPDATE role ${role.name}`);
    if (apply) {
      await role.edit(payload, 'DragonsHosting permission fix').catch(err => {
        changes.push(`FAILED role ${role.name}: ${err.message}`);
      });
    }
  }
  return role;
}

function resolveTarget(guild, rolesByName, target) {
  if (target === '@everyone') return guild.roles.everyone.id;
  if (/^\d{15,25}$/.test(String(target))) return String(target);
  const role = rolesByName.get(String(target).toLowerCase()) || guild.roles.cache.find(r => r.name.toLowerCase() === String(target).toLowerCase());
  if (!role) fail(`Overwrite target role not found: ${target}`);
  return role.id;
}

async function applyOverwrites(guild, channel, rules, rolesByName, changes, reason) {
  const overwrites = rules.map(rule => ({
    id: resolveTarget(guild, rolesByName, rule.target),
    allow: permissionBits(rule.allow),
    deny: permissionBits(rule.deny)
  }));

  changes.push(`SET overwrites on #${channel.name} (${reason})`);
  if (apply) await channel.permissionOverwrites.set(overwrites, `DragonsHosting permission fix: ${reason}`);
}

async function main() {
  const config = readConfig();
  const token = process.env.BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || readYamlScalar(coreConfigPath, 'BotToken');
  const guildId = config.guildId || process.env.DISCORD_GUILD_ID || readYamlScalar(coreConfigPath, 'GuildID');
  if (!token) fail('Missing BOT_TOKEN or DISCORD_BOT_TOKEN in environment/.env');
  if (!guildId) fail('Missing guildId in config or DISCORD_GUILD_ID in environment/.env');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  await guild.roles.fetch();
  await guild.channels.fetch();

  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.Administrator)) {
    fail('Bot does not have Administrator permission in this guild.');
  }

  const changes = [];
  const rolesByName = new Map([...guild.roles.cache.values()].map(role => [role.name.toLowerCase(), role]));
  if (includeRoles) {
    for (const roleConfig of config.roles || []) {
      const role = await ensureRole(guild, roleConfig, changes);
      if (role) rolesByName.set(role.name.toLowerCase(), role);
    }
  }

  if (includeChannels) {
    for (const categoryRule of config.categoryRules || []) {
      const categories = guild.channels.cache.filter(channel =>
        channel.type === ChannelType.GuildCategory && ruleMatchesName(channel, categoryRule)
      );
      for (const category of categories.values()) {
        await applyOverwrites(guild, category, categoryRule.overwrites || [], rolesByName, changes, categoryRule.id ? `category id "${categoryRule.id}"` : categoryRule.name ? `category "${categoryRule.name}"` : `category match "${categoryRule.match}"`);
        if (categoryRule.syncChildren) {
          const children = guild.channels.cache.filter(channel => channel.parentId === category.id);
          for (const child of children.values()) {
            await applyOverwrites(guild, child, categoryRule.overwrites || [], rolesByName, changes, `child of ${category.name}`);
          }
        }
      }
    }

    for (const channelRule of config.channelRules || []) {
      const channels = guild.channels.cache.filter(channel =>
        channel.type !== ChannelType.GuildCategory && ruleMatchesName(channel, channelRule)
      );
      for (const channel of channels.values()) {
        await applyOverwrites(guild, channel, channelRule.overwrites || [], rolesByName, changes, channelRule.id ? `channel id "${channelRule.id}"` : channelRule.name ? `channel "${channelRule.name}"` : `channel match "${channelRule.match}"`);
      }
    }
  }

  console.log(apply ? '[permissions-fixer] Applied changes:' : '[permissions-fixer] Dry-run changes:');
  if (!changes.length) console.log('No matching changes.');
  for (const change of changes) console.log(`- ${change}`);

  await client.destroy();
}

main().catch(async err => {
  console.error('[permissions-fixer] Failed:', err.message);
  process.exit(1);
});
