'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Collection, REST, Routes, MessageFlags } = require('discord.js');
const { connectToMongoDB } = require('./models/manager');
const { getConfig, getLang, getCommands } = require('./utils/core/configLoader');
const AddonLoader = require('./utils/core/AddonLoader');

const client = require('./index');
const config = getConfig();
const lang = getLang();
const commandConfig = getCommands();

client.commands = new Collection();
client.slashCommands = new Collection();
client.commandsReady = false;
global.slashCommands = [];

function walkJavaScript(directory) {
    if (!fs.existsSync(directory)) return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkJavaScript(fullPath));
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
    }
    return files;
}

function setupDiscordEventBridge(eventManager) {
    const eventNames = [
        'messageCreate', 'messageUpdate', 'messageDelete',
        'guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate',
        'voiceStateUpdate', 'channelCreate', 'channelDelete',
        'roleCreate', 'roleDelete', 'guildBanAdd', 'guildBanRemove',
        'channelUpdate', 'roleUpdate', 'presenceUpdate', 'guildUpdate',
        'emojiCreate', 'emojiDelete', 'emojiUpdate',
        'stickerCreate', 'stickerDelete', 'stickerUpdate',
        'inviteCreate', 'inviteDelete', 'ready', 'clientReady'
    ];

    for (const eventName of eventNames) {
        client.on(eventName, (...args) => {
            const data = {};
            if (eventName === 'messageUpdate') {
                data.oldMessage = args[0];
                data.message = args[1];
            } else if (['messageCreate', 'messageDelete'].includes(eventName)) data.message = args[0];
            else if (eventName === 'guildMemberUpdate') [data.oldMember, data.newMember] = args;
            else if (['guildMemberAdd', 'guildMemberRemove'].includes(eventName)) data.member = args[0];
            else if (eventName === 'voiceStateUpdate') [data.oldState, data.newState] = args;
            else if (['channelCreate', 'channelDelete'].includes(eventName)) data.channel = args[0];
            else if (['roleCreate', 'roleDelete'].includes(eventName)) data.role = args[0];
            else if (['guildBanAdd', 'guildBanRemove'].includes(eventName)) data.ban = args[0];
            else if (['inviteCreate', 'inviteDelete'].includes(eventName)) data.invite = args[0];
            else data.client = client;
            eventManager.emitSafe(`discord:${eventName}`, data);
        });
    }
}

function loadCommands() {
    const definitions = new Map();
    const commandFiles = [
        ...walkJavaScript(path.join(__dirname, 'commands')),
        ...walkJavaScript(path.join(__dirname, 'addons')).filter(file => file.includes(`${path.sep}commands${path.sep}`))
    ];

    for (const file of commandFiles) {
        try {
            const command = require(file);
            if (!command?.data || typeof command.execute !== 'function') continue;
            const entries = Array.isArray(command.data) ? command.data : [command.data];
            for (const definition of entries) {
                if (!definition?.name || typeof definition.toJSON !== 'function') continue;
                if (commandConfig && !commandConfig[definition.name]) continue;
                definitions.set(definition.name, definition.toJSON());
                client.slashCommands.set(definition.name, command);
            }
        } catch (error) {
            console.error(`[COMMAND] Could not load ${path.relative(__dirname, file)}:`, error.message);
        }
    }

    global.slashCommands = [...definitions.values()];
}

function loadCoreEvents() {
    const eventsDirectory = path.join(__dirname, 'events');
    for (const file of walkJavaScript(eventsDirectory)) {
        if (path.dirname(file) !== eventsDirectory) continue;
        const handler = require(file);
        if (typeof handler !== 'function') continue;
        client.on(path.basename(file, '.js'), handler.bind(null, client));
    }
}

async function executeCommand(interaction) {
    if (interaction.isAutocomplete()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command?.autocomplete) return interaction.respond([]).catch(() => {});
        return command.autocomplete(interaction, client).catch(() => interaction.respond([]).catch(() => {}));
    }
    if (!interaction.isCommand()) return;
    const command = client.slashCommands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction, client);
    } catch (error) {
        console.error(`[COMMAND] ${interaction.commandName} failed:`, error);
        const reply = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
        if (!interaction.replied && !interaction.deferred) await interaction.reply(reply).catch(() => {});
        else await interaction.editReply({ content: reply.content }).catch(() => {});
    }
}

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(config.BotToken);
    const registered = await rest.put(Routes.applicationCommands(client.user.id), { body: global.slashCommands });
    for (const item of registered) {
        const command = client.slashCommands.get(item.name);
        if (command) command.id = item.id;
    }
    client.commandsReady = true;
    console.log(`[COMMAND] Registered ${registered.length} application commands.`);
}

async function shutdown(signal) {
    console.log(`[CORE] ${signal} received, shutting down.`);
    await global.addonLoader?.unloadAll().catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close().catch(() => {});
    client.destroy();
}

(async () => {
    try {
        await connectToMongoDB();

        global.addonLoader = new AddonLoader();
        global.addonLoader.setContext(client, config, lang, commandConfig);
        setupDiscordEventBridge(global.addonLoader.getEventManager());
        await global.addonLoader.loadAddonsFromDirectory(path.join(__dirname, 'addons'));

        loadCommands();
        client.on('interactionCreate', executeCommand);
        loadCoreEvents();
        client.once('clientReady', () => registerCommands().catch(error => {
            console.error('[COMMAND] Registration failed:', error.message);
        }));

        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
        await client.login(config.BotToken);
    } catch (error) {
        console.error('[CORE] Startup failed:', error);
        process.exitCode = 1;
    }
})();
