const UserData = require('../../../models/UserData');

const batchQueue = new Map();
const BATCH_SIZE = 250;
const BATCH_TIMEOUT = 5000;

let batchTimeout = null;

async function processBatch() {
    if (batchQueue.size === 0) return;
    
    try {
        const operations = Array.from(batchQueue.entries()).map(([key, data]) => {
            const [userId, guildId] = key.split(':');
            return {
                updateOne: {
                    filter: { userId, guildId },
                    update: {
                        $inc: { totalMessages: data.count },
                        $setOnInsert: {
                            userId,
                            guildId,
                            xp: 0,
                            level: 0,
                            warns: 0,
                            bans: 0,
                            kicks: 0,
                            timeouts: 0,
                            note: "None",
                            warnings: [],
                            balance: 0
                        }
                    },
                    upsert: true
                }
            };
        });

        if (operations.length > 0) {
            const { observeAsync } = require('../../../utils/core/perfMonitor');
            await observeAsync('messages.bulkWrite', async () => await UserData.bulkWrite(operations, { ordered: false }));
        }
        
        batchQueue.clear();
        batchTimeout = null;
    } catch (error) {
        console.error(`handleMessageCount batch processing error: ${error}`);
        batchQueue.clear();
        batchTimeout = null;
    }
}

function scheduleBatchProcess() {
    if (!batchTimeout) {
        batchTimeout = setTimeout(processBatch, BATCH_TIMEOUT);
    }
}

async function handleMessageCount(message) {
    if (message.author.bot || !message.guild) {
        return;
    }
    
    const key = `${message.author.id}:${message.guild.id}`;
    const existing = batchQueue.get(key) || { count: 0 };
    existing.count += 1;
    batchQueue.set(key, existing);
    
    if (batchQueue.size >= BATCH_SIZE) {
        if (batchTimeout) {
            clearTimeout(batchTimeout);
            batchTimeout = null;
        }
        await processBatch();
    } else {
        scheduleBatchProcess();
    }
}

process.on('SIGTERM', async () => {
    if (batchTimeout) {
        clearTimeout(batchTimeout);
    }
    await processBatch();
});

process.on('SIGINT', async () => {
    if (batchTimeout) {
        clearTimeout(batchTimeout);
    }
    await processBatch();
});

module.exports = handleMessageCount;