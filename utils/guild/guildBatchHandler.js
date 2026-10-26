const { EmbedBuilder } = require("discord.js");
const GuildData = require('../../models/guildDataSchema');
const { getConfig } = require('../core/configLoader');
const { getLogChannel } = require('../handlers/messageUtils');

const config = getConfig();

const guildMessageBatch = new Map();
const GUILD_BATCH_SIZE = 100;
const GUILD_BATCH_TIMEOUT = 10000;
let guildBatchTimeout = null;

async function processGuildMessageBatch() {
    if (guildMessageBatch.size === 0) return;
    
    try {
        const operations = Array.from(guildMessageBatch.entries()).map(([guildId, count]) => ({
            updateOne: {
                filter: { guildID: guildId },
                update: { $inc: { totalMessages: count } },
                upsert: true
            }
        }));
        
        if (operations.length > 0) {
            await GuildData.bulkWrite(operations, { ordered: false });
        }
        
        guildMessageBatch.clear();
        guildBatchTimeout = null;
    } catch (error) {
        console.error('Error processing guild message batch:', error);
        guildMessageBatch.clear();
        guildBatchTimeout = null;
    }
}

function scheduleGuildBatchProcess() {
    if (!guildBatchTimeout) {
        guildBatchTimeout = setTimeout(processGuildMessageBatch, GUILD_BATCH_TIMEOUT);
    }
}

async function addMessageToGuildBatch(guildId) {
    const existingCount = guildMessageBatch.get(guildId) || 0;
    guildMessageBatch.set(guildId, existingCount + 1);
    
    if (guildMessageBatch.size >= GUILD_BATCH_SIZE) {
        if (guildBatchTimeout) {
            clearTimeout(guildBatchTimeout);
            guildBatchTimeout = null;
        }
        await processGuildMessageBatch();
    } else {
        scheduleGuildBatchProcess();
    }
}

process.on('SIGTERM', async () => {
    if (guildBatchTimeout) {
        clearTimeout(guildBatchTimeout);
    }
    await processGuildMessageBatch();
});

process.on('SIGINT', async () => {
    if (guildBatchTimeout) {
        clearTimeout(guildBatchTimeout);
    }
    await processGuildMessageBatch();
});

module.exports = {
    addMessageToGuildBatch,
    processGuildMessageBatch
};
