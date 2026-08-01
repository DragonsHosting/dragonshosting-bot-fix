const fs = require('fs');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

function readYamlScalar(key) {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*["']?([^"'#]+)["']?`, 'mi');
  const match = fs.readFileSync('config/core.yml', 'utf8').match(pattern);
  return match ? match[1].trim() : null;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(readYamlScalar('GuildID'));
  await guild.roles.fetch();
  await guild.channels.fetch();

  console.log(`GUILD\t${guild.name}\t${guild.id}`);
  console.log('ROLES');
  [...guild.roles.cache.values()]
    .sort((a, b) => b.position - a.position)
    .filter(role => role.name !== '@everyone')
    .forEach(role => console.log(`${role.position}\t${role.name}\t${role.id}\t${role.permissions.toArray().join(',')}`));

  console.log('CATEGORIES');
  [...guild.channels.cache.values()]
    .filter(channel => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .forEach(channel => console.log(`${channel.name}\t${channel.id}`));

  console.log('CHANNELS');
  [...guild.channels.cache.values()]
    .filter(channel => channel.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .forEach(channel => console.log(`${channel.name}\t${channel.id}\tparent=${channel.parent?.name || ''}`));

  await client.destroy();
});

client.login(readYamlScalar('BotToken'));
