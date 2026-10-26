const path = require('path');
process.env.XDG_CACHE_HOME ||= path.join(__dirname, 'data', 'cache', 'runtime');

require('./utils/database/localMongoose').install({ force: true });
const { MemoryChecker } = require('./utils/core/memoryChecker.js');
const { updateDashboardEnv } = require('./utils/dashboard/dashboardEnv');
const startDashboardServer = require('./dashboard/server/index.js');
const { getConfig, getLang, getCommands } = require('./utils/core/configLoader.js');

const colors = require('ansi-colors');

const fs = require('fs');
const packageFile = require('./package.json');

const config = getConfig();
const lang = getLang();

global.config = config;
global.lang = lang;

const { initAutoUpdater } = require('./utils/core/autoUpdater');
const autoUpdater = initAutoUpdater(config);
global.autoUpdater = autoUpdater;

(async () => {
    if (autoUpdater && autoUpdater.enabled) {
        try {
            const updateInfo = await autoUpdater.checkForUpdates();
            if (updateInfo) {
                await autoUpdater.performUpdate(updateInfo);
                return;
            }
        } catch (err) {
        }
    }
    continueStartup();
})();

function continueStartup() {
console.log(`${colors.yellow(`[Initializing...]`)}`);

const version = Number(process.version.split('.')[0].replace('v', ''));
if (version < 18) {
    console.log(`${colors.red(`[ERROR] You are using Node.js v${process.version}. Please use Node.js v18 or higher.`)}`);
    process.exit();
}

const { Client, GatewayIntentBits, Options, Partials } = require('discord.js');
const { startLoopLagMonitor } = require('./utils/core/perfMonitor');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    sweepers: {
        messages: {
            interval: 60,
            lifetime: 180
        },
        threads: {
            interval: 300,
            lifetime: 300
        },
        users: {
            interval: 300,
            filter: () => user => user.bot && user.id !== user.client.user.id
        },
        guildMembers: {
            interval: 600,
            filter: () => member => !member.voice?.channelId && member.user.id !== member.client.user.id
        },
        reactions: {
            interval: 60,
            filter: () => () => true
        },
        presences: {
            interval: 300,
            filter: () => presence => {
                const status = presence?.status;
                return status === 'offline' || !status;
            }
        }
    }
});

client.setMaxListeners(20);

global.client = client;

startLoopLagMonitor(300, 1000);

(async () => {
    try {
         if (config.Dashboard.Enabled) {
             if (updateDashboardEnv()) {
                setImmediate(async () => {
                    await startDashboardServer();
                });
             } else {
                 console.error(`${colors.red(`[ERROR] Failed to update dashboard environment. Dashboard will not start.`)}`);
                 process.exit(1);
             }
         }
         
     } catch (error) {
         console.error('Error during initialization:', error);
         process.exit(1);
     }
 })();
 
 const memoryChecker = new MemoryChecker('DragonHosting', 30000);
 const fetch = require('node-fetch');
 
 memoryChecker.logMemoryUsage = async function() {
    const memUsage = process.memoryUsage();
    const totalMemory = Math.round(
        (memUsage.heapUsed + memUsage.external + memUsage.arrayBuffers) / 1024 / 1024 * 100
    ) / 100;
    
    if (global.updateBotMemory) {
        global.updateBotMemory(totalMemory);
        return;
    }

    if (config.Dashboard?.Enabled && config.Dashboard?.URL) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const dashboardUrl = `http://${config.Dashboard.URL}:${config.Dashboard.Port}/api/memory/bot`;
            
            const response = await fetch(dashboardUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memory: totalMemory }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("[BOT] Memory update error:", error.message);
            }
        }
    }
}
 
 memoryChecker.start();

client.invites = new Map();

client.once('clientReady', async () => {
    if (autoUpdater) autoUpdater.start();
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);

});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);

});

client.on('raw', async (packet) => {
    if (packet.t === 'INTERACTION_CREATE') {
        const interaction = packet.d;
        
        if (interaction.type === 5) {
            try {
                if (interaction.data.components) {
                    const hasLabelComponents = interaction.data.components.some(comp => comp.type === 18);
                    
                    if (hasLabelComponents) {
                        const transformedComponents = [];
                        
                        interaction.data.components.forEach(labelComponent => {
                            if (labelComponent.type === 18 && labelComponent.component) {
                            const innerComponent = labelComponent.component;
                            
                            if (innerComponent.type === 3) {
                                const selectComponent = {
                                    type: 1, // ActionRow
                                    components: [{
                                        type: 3, // StringSelect
                                        custom_id: innerComponent.custom_id,
                                        values: innerComponent.values || []
                                    }]
                                };
                                transformedComponents.push(selectComponent);
                            } else if (innerComponent.type === 4) {
                                const textComponent = {
                                    type: 1, // ActionRow
                                    components: [{
                                        type: 4, // TextInput
                                        custom_id: innerComponent.custom_id,
                                        value: innerComponent.value || ''
                                    }]
                                };
                                transformedComponents.push(textComponent);
                            }
                        }
                    });
                    
                        global.originalModalData = global.originalModalData || new Map();
                        global.originalModalData.set(interaction.id, {
                            originalComponents: interaction.data.components,
                            transformedComponents: transformedComponents,
                            timestamp: Date.now()
                        });
                        
                        interaction.data.components = transformedComponents;
                    }
                }
            } catch (error) {
                console.error('Error transforming modal interaction:', error);
            }
        }
    }
});

setInterval(() => {
    if (global.originalModalData && global.originalModalData.size > 0) {
        const now = Date.now();
        const thirtySecondsAgo = now - 30000;
        
        for (const [id, data] of global.originalModalData.entries()) {
            if (data.timestamp < thirtySecondsAgo) {
                global.originalModalData.delete(id);
            }
        }
        
        if (global.originalModalData.size > 100) {
            const entries = Array.from(global.originalModalData.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = entries.slice(0, global.originalModalData.size - 50);
            toDelete.forEach(([id]) => global.originalModalData.delete(id));
        }
    }
}, 15000);

module.exports = client;

require("./utils.js");

}
