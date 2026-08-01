require('dotenv').config();
const { setDiscordClient } = require('./transcriptServer');

const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, Events } = require('discord.js');
const { loadCommands } = require('./utils/loadCommands');
const { loadEvents } = require('./utils/loadEvents');
const { ensureVoiceTTSPackages } = require('./utils/ensureVoiceTTSPackages');
const { startupBanner } = require('./utils/startup');
const { ensureCoreTables } = require('./utils/mysql');
const {
  applyDeveloperPermissionBypass,
  commandToPublicRegistrationJSON,
  getDefaultMemberPermissions,
  memberHasRequiredDefaultPermission
} = require('./utils/core/developerAccess');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User
  ]
});
client.setMaxListeners(50);
setDiscordClient(client);

client.commands = new Collection();
ensureVoiceTTSPackages();

async function registerSlashCommands() {
  const commands = [...client.commands.values()].map(commandToPublicRegistrationJSON);

  if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
    console.log('[ERROR] Missing BOT_TOKEN or CLIENT_ID in .env');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log(`[SlashCommands] Registered ${commands.length} command(s).`);
  } catch (err) {
    console.log('[SlashCommands] Registration failed:', err.message);
  }
}

client.once(Events.ClientReady, async () => {
  await ensureCoreTables().then(() => console.log('[MySQL] Core tables ready')).catch(err => console.log('[MySQL] Setup failed:', err.message));
  await registerSlashCommands();
  startupBanner(client, client.commands.size, client._addonEventCount || 0);
});

client.on('interactionCreate', interaction => {
  // Patch permission checks before command/component handlers run.
  applyDeveloperPermissionBypass(interaction);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({
      content: 'This command is currently not loaded. Please try again after the bot restarts.',
      ephemeral: true
    }).catch(() => {});
  }

  const requiredDefaultPermissions = getDefaultMemberPermissions(command);
  if (!memberHasRequiredDefaultPermission(interaction, requiredDefaultPermissions)) {
    return interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    }).catch(() => {});
  }

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.log(`[Command Error] ${interaction.commandName}:`, err);

    const reply = {
      content: 'Ã¢ÂÂ An error occurred while executing this command.',
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

loadCommands(client);
client._addonEventCount = loadEvents(client);

client.login(process.env.BOT_TOKEN);
