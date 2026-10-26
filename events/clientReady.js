const { ActivityType, ChannelType } = require('discord.js');
const fs = require('fs');
const moment = require('moment-timezone');
const colors = require('ansi-colors');
const packageFile = require('../package.json');
const GuildData = require('../models/guildDataSchema');
const botStartTime = Date.now();

const { getConfig } = require('../utils/core/configLoader.js');
const config = getConfig();


module.exports = async client => {

    let guild = client.guilds.cache.get(client.guilds.cache.first().id);
    if (!guild) {
        console.log('\x1b[31m%s\x1b[0m', `[ERROR] The bot is not in the configured server!`);
        process.exit();
    }

    let guildData = await GuildData.findOne({ guildID: guild.id });
    if (!guildData) {
        guildData = new GuildData({
            guildID: guild.id,
            cases: 0,
            totalMessages: 0,
            stars: {},
            timesBotStarted: 1
        });
        await guildData.save();
    } else {
        guildData.timesBotStarted++;
        await guildData.save();
    }

    async function updateBotActivity(client, index) {
        try {
            const BotActivity = global.addonLoader?.getModel('BotActivity');
            if (!BotActivity) return;
            const guildId = client.guilds.cache.first().id;
            const botActivityData = await BotActivity.findOne({ guildId });

            if (!botActivityData || botActivityData.activities.length === 0) {
                return;
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                console.log(`Guild not found for ID: ${guildId}`);
                return;
            }


            const totalChannels = guild.channels.cache.filter(channel =>
                channel.type === ChannelType.GuildText ||
                channel.type === ChannelType.GuildVoice ||
                channel.type === ChannelType.GuildCategory ||
                channel.type === ChannelType.GuildForum ||
                channel.type === ChannelType.GuildStageVoice
            ).size;

            const onlineMembers = guild.members.cache.size > 0
                ? guild.members.cache.filter(member => ['online', 'idle', 'dnd'].includes(member.presence?.status)).size
                : 0;

            const uptime = getUptime();
            const runtimeStatistics = await getRuntimeStatistics(guildId);

            const formatter = new Intl.NumberFormat('en-US');

            const currentActivity = botActivityData.activities[index];

            if (!currentActivity) {
                return;
            }

            if (!currentActivity.status) {
                return;
            }

            let activityString = currentActivity.status
                .replace(/{total-users}/g, formatter.format(guild.memberCount))
                .replace(/{total-channels}/g, formatter.format(totalChannels))
                .replace(/{total-messages}/g, formatter.format(guildData.totalMessages))
                .replace(/{online-members}/g, formatter.format(onlineMembers))
                .replace(/{uptime}/g, uptime)
                .replace(/{total-boosts}/g, formatter.format(guild.premiumSubscriptionCount))
                .replace(/{total-cases}/g, formatter.format(guildData.cases))
                .replace(/{times-bot-started}/g, formatter.format(guildData.timesBotStarted));

            for (const [key, value] of Object.entries(runtimeStatistics)) {
                const placeholder = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
                activityString = activityString.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), formatter.format(value));
            }

            let activityType;
            switch (currentActivity.activityType.toUpperCase()) {
                case "WATCHING":
                    activityType = ActivityType.Watching;
                    break;
                case "PLAYING":
                    activityType = ActivityType.Playing;
                    break;
                case "COMPETING":
                    activityType = ActivityType.Competing;
                    break;
                case "STREAMING":
                    activityType = ActivityType.Streaming;
                    break;
                case "CUSTOM":
                    activityType = ActivityType.Custom;
                    break;
                default:
                    console.log(`Invalid Activity Type: ${currentActivity.activityType}`);
                    activityType = ActivityType.Playing;
            }

            const presenceOptions = {
                activities: [{ name: activityString, type: activityType }],
                status: currentActivity.statusType.toLowerCase(),
            };

            if (activityType === ActivityType.Streaming && currentActivity.streamingURL) {
                presenceOptions.activities[0].url = currentActivity.streamingURL;
            }

            await client.user.setPresence(presenceOptions);

            await client.user.setStatus(currentActivity.statusType.toLowerCase());

        } catch (error) {
            console.error('Error updating bot activity:', error);
        }
    }

    async function startActivityUpdateLoop(client) {
        let index = 0;
        let lastUpdate = Date.now();
        const MIN_UPDATE_INTERVAL = 120000;

        setInterval(async () => {
            try {
                const now = Date.now();
                if (now - lastUpdate < MIN_UPDATE_INTERVAL) {
                    return;
                }

                const guildId = client.guilds.cache.first().id;
                const { observeAsync } = require('../utils/core/perfMonitor');
                const BotActivity = global.addonLoader?.getModel('BotActivity');
                if (!BotActivity) return;
                const botActivityData = await observeAsync('activity.fetch', async () => await BotActivity.findOne({ guildId }).select('activities').lean());

                if (botActivityData && botActivityData.activities.length > 0) {
                    if (index >= botActivityData.activities.length) {
                        index = 0;
                    }
                    await updateBotActivity(client, index);
                    index = (index + 1) % botActivityData.activities.length;
                    lastUpdate = now;
                }
            } catch (error) {
                console.error('Error in activity update loop:', error);
            }
        }, 30000);
    }

    await startActivityUpdateLoop(client);


    if (guild && !guild.members.me.permissions.has("Administrator")) {
        console.log('\x1b[31m%s\x1b[0m', `[ERROR] The bot doesn't have enough permissions! Please give the bot ADMINISTRATOR permissions in your server or it won't function properly!`);
    }

    try {
        await displayStartupMessage(client);
    } catch (error) {
        console.error('An error occurred:', error);
    }
};

async function displayStartupMessage(client) {
    try {
        const guild = client.guilds.cache.first();
        const updatedGuildData = await GuildData.findOne({ guildID: guild.id });
        const startupStatistics = await getRuntimeStatistics(guild.id);
        const used = process.memoryUsage();
        const startTime = new Date();
        const serverCount = client.guilds.cache.size;
        const channelCount = client.channels.cache.size;

        // FeatherPanel installations do not all decode Unicode console output
        // the same way. Keep the startup dashboard ASCII-only so its layout is
        // stable in the web console and in forwarded logs.
        const width = 70;
        const border = `+${'-'.repeat(width - 2)}+`;
        const row = (value = '') => `| ${String(value).slice(0, width - 4).padEnd(width - 4)} |`;
        const section = (title) => {
            console.log(colors.bold.blue(border));
            console.log(colors.bold.white(row(title)));
            console.log(colors.bold.blue(border));
        };

        console.log('');
        console.log(colors.bold.cyan(border));
        console.log(colors.bold.white(row('DRAGONSHOSTING BOT | POWERED BY DRAGONSHOSTING')));
        console.log(colors.bold.cyan(border));

        section('SYSTEM INFORMATION');
        console.log(colors.blue(row(`Version    : v${packageFile.version}`)));
        console.log(colors.blue(row(`Node       : ${process.version}`)));
        console.log(colors.blue(row(`Start Time : ${startTime.toLocaleString()}`)));
        console.log(colors.blue(row(`Memory     : ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`)));
        console.log(colors.blue(border));

        section('RESOURCES');
        console.log(colors.magenta(row('Support    : https://discord.gg/DragonsHosting')));
        console.log(colors.magenta(row('Docs       : https://feather.dragonshosting.nl')));
        console.log(colors.magenta(border));

        if (config.Statistics !== false) {
            section('BOT STATISTICS');
            console.log(colors.yellow(row(`Users      : ${client.users.cache.size}`)));
            console.log(colors.yellow(row(`Servers    : ${serverCount}`)));
            console.log(colors.yellow(row(`Channels   : ${channelCount}`)));
            console.log(colors.yellow(row(`Commands   : ${client.slashCommands.size}`)));
            console.log(colors.yellow(row(`Messages   : ${updatedGuildData.totalMessages}`)));
            console.log(colors.yellow(row(`Addons     : ${global.addonLoader?.loadedAddons?.size || 0}`)));
            console.log(colors.yellow(row(`Bot Starts : ${updatedGuildData.timesBotStarted}`)));
            console.log(colors.bold.green(row('BOT IS NOW ONLINE AND READY!')));
            console.log(colors.yellow(border));
        }

        if (updatedGuildData.timesBotStarted === 1) {
            section('FIRST-TIME SETUP');
            console.log(colors.yellow(row('Need help? Visit our Discord support server for assistance.')));
            console.log(colors.red(row('Leaking or redistributing our products is prohibited.')));
            console.log(colors.yellow(border));
        }

        console.log('');
        return;

        let uptimeInfo = '';
        if (updatedGuildData.timesBotStarted > 1) {
            uptimeInfo = ` | ${colors.green('â±ï¸')} Uptime tracking active`;
        }

        const headerText = 'DRAGONSHOSTING BOT â€¢ POWERED BY DRAGONSHOSTING';
        const boxWidth = 70;
        const contentWidth = boxWidth - 2;
        const leftPadding = Math.floor((contentWidth - headerText.length) / 2);
        const rightPadding = contentWidth - headerText.length - leftPadding;
        
        console.log('\n' + colors.bold.cyan('â•­â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•®'));
        console.log(colors.bold.cyan('â”‚') + colors.bold.white(' '.repeat(leftPadding) + headerText + ' '.repeat(rightPadding)));
        console.log(colors.bold.cyan('â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯\n'));

        console.log(colors.bold.blue('â•­â”€') + colors.bold.white(' SYSTEM INFORMATION ') + colors.bold.blue('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•®'));
        console.log(colors.blue('â”‚'));
        console.log(colors.blue('â”‚  ') + colors.blue('ðŸ“¦') + colors.white('  Version    : ') + colors.bold.white(`v${packageFile.version}`));
        console.log(colors.blue('â”‚  ') + colors.blue('âš™ï¸') + colors.white('  Node       : ') + colors.bold.white(process.version));
        console.log(colors.blue('â”‚  ') + colors.blue('ðŸ•') + colors.white('  Start Time : ') + colors.bold.white(startTime.toLocaleString()));
        console.log(colors.blue('â”‚  ') + colors.blue('ðŸ’¾') + colors.white('  Memory     : ') + colors.bold.white(`${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`));
        console.log(colors.blue('â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯'));

        console.log(colors.bold.magenta('â•­â”€') + colors.bold.white(' RESOURCES ') + colors.bold.magenta('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•®'));
        console.log(colors.magenta('â”‚'));
        console.log(colors.magenta('â”‚  ') + colors.magenta('ðŸ†˜') + colors.white('  Support    : ') + colors.bold.white('https://discord.gg/DragonsHosting'));
        console.log(colors.magenta('â”‚  ') + colors.magenta('ðŸ“š') + colors.white('  Docs       : ') + colors.bold.white('https://feather.dragonshosting.nl'));
        console.log(colors.magenta('â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯'));

        if (config.Statistics !== false) {
            console.log(colors.bold.yellow('â•­â”€') + colors.bold.white(' BOT STATISTICS ') + colors.bold.yellow('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•®'));
            console.log(colors.yellow('â”‚'));
            console.log(colors.yellow('â”‚  ') + colors.yellow('ðŸ‘¥') + colors.white('  Users      : ') + colors.bold.white(client.users.cache.size));
            console.log(colors.yellow('â”‚  ') + colors.yellow('ðŸ“º') + colors.white('  Channels   : ') + colors.bold.white(channelCount));
            console.log(colors.yellow('â”‚  ') + colors.yellow('âš¡') + colors.white('  Commands   : ') + colors.bold.white(client.slashCommands.size));
            console.log(colors.yellow('â”‚  ') + colors.yellow('ðŸ’¬') + colors.white('  Messages   : ') + colors.bold.white(updatedGuildData.totalMessages));
            console.log(colors.yellow('â”‚  ') + colors.yellow('ðŸ§©') + colors.white('  Addon data : ') + colors.bold.white(Object.keys(startupStatistics).length));
            console.log(colors.yellow('â”‚  ') + colors.yellow('ðŸš€') + colors.white('  Bot Starts : ') + colors.bold.white(updatedGuildData.timesBotStarted));
            console.log(colors.yellow('â”‚'));
            console.log(colors.yellow('â”‚  ') + colors.bold.green('âœ…  BOT IS NOW ONLINE AND READY!'));
            console.log(colors.yellow('â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯'));
        }

        if (updatedGuildData.timesBotStarted === 1) {
            console.log(colors.bold.yellow('â•­â”€') + colors.bold.yellow(' FIRST-TIME SETUP ') + colors.bold.yellow('â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•®'));
            console.log(colors.yellow('â”‚'));
            console.log(colors.yellow('â”‚  ') + colors.yellow('Need help? Visit our Discord support server for assistance.'));
            console.log(colors.yellow('â”‚  ') + colors.red('Important: Leaking or redistributing our products is prohibited.'));
            console.log(colors.yellow('â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯'));
        }

        console.log('');



    } catch (error) {
        console.error('Error in startup logging:', error);
    }
}

function getUptime() {
    const duration = moment.duration(Date.now() - botStartTime);
    let uptimeString = '';

    const years = duration.years();
    const months = duration.months();
    const weeks = duration.weeks();
    const days = duration.days();
    const hours = duration.hours();
    const minutes = duration.minutes();
    const seconds = duration.seconds();

    if (years > 0) {
        uptimeString += `${years}y `;
    }

    if (years > 0 || months > 0) {
        uptimeString += `${months}mo `;
    }

    if ((years > 0 || months > 0 || weeks > 0) && !days) {
        uptimeString += `${weeks}w `;
    }

    if (years > 0 || months > 0 || weeks > 0 || days > 0) {
        uptimeString += `${days}d `;
    }
    uptimeString += `${hours}h ${minutes}m ${seconds}s`;

    return uptimeString.trim();
}

async function getRuntimeStatistics(guildId) {
    if (!global.addonLoader?.getStatistics) return {};
    return global.addonLoader.getStatistics(guildId);
}


