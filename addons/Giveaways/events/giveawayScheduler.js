const Giveaway = require('../models/Giveaway.js');
const giveawayActions = require("./giveawayActions.js");

const { getConfig } = require('../../../utils/core/configLoader.js');
const config = getConfig();

let giveawayCheckRunning = false;

async function checkGiveaways() {
    if (giveawayCheckRunning) return;
    giveawayCheckRunning = true;
    try {
        const giveaways = await require('../../../utils/core/perfMonitor').observeAsync(
            'giveaways.scan',
            async () => await Giveaway.find({ ended: false }).select('giveawayId guildId endAt').lean()
        );
        const now = Date.now();

        for (const giveaway of giveaways) {
            try {
                if (now > giveaway.endAt) {
                    await giveawayActions.endGiveaway(giveaway.giveawayId);
                }
            } catch (error) {
                console.error(`Error processing giveaway ${giveaway.giveawayId}:`, error);
            }
        }
    } catch (findError) {
        console.error('Error fetching giveaways:', findError);
    } finally {
        giveawayCheckRunning = false;
    }
}

function startGiveawayScheduler() {
    const raw = config.Giveaways.GiveawayStatusCheck || 30000;
    const checkIntervalInMilliseconds = Math.max(raw, 30000);
    setInterval(checkGiveaways, checkIntervalInMilliseconds);
}

module.exports = startGiveawayScheduler;