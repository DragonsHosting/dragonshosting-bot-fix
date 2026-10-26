const { SlashCommandBuilder, MessageFlags, EmbedBuilder, version: discordVersion } = require('discord.js');
const os = require('os');
const process = require('process');
const { version } = require('../../../package.json');
const { getConfig, getLang, replacePlaceholders } = require('../../../utils/core/configLoader.js');

const config = getConfig();
const lang = getLang();

const botStartsCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Get detailed information about the bot')
,
    category: 'General',
    async execute(interaction) {
        try {
            const startTime = Date.now();
            await interaction.deferReply();
            
            const bot = interaction.client;
            const uptimeTimestamp = Math.floor((Date.now() - bot.uptime) / 1000);
            
            const memoryAfter = process.memoryUsage();
            const { heapTotal, heapUsed, external, arrayBuffers } = memoryAfter;
            const totalMemory = (heapTotal / 1024 / 1024).toFixed(2);
            const usedMemory = (heapUsed / 1024 / 1024).toFixed(2);

            const totalSystemMemory = os.totalmem() / 1024 / 1024 / 1024;
            const freeSystemMemory = os.freemem() / 1024 / 1024 / 1024;
            const usedSystemMemory = (totalSystemMemory - freeSystemMemory).toFixed(2);

            const formatMemory = (total, used) => {
                return total > 6144 
                    ? `${(used / 1024).toFixed(2)} GB / ${(total / 1024).toFixed(2)} GB`
                    : `${used} MB / ${total} MB`;
            };

            const cpus = os.cpus();
            const cpuModel = cpus[0].model.replace(/\s\d+-Core Processor/, '');
            const coreCount = cpus.length;

            const createdAt = `<t:${Math.floor(bot.user.createdAt / 1000)}:R>`;
            const joinedAt = interaction.guild.members.cache.get(bot.user.id)?.joinedAt
                ? `<t:${Math.floor(interaction.guild.members.cache.get(bot.user.id).joinedAt / 1000)}:R>`
                : 'Unknown';

            const pingLatency = Date.now() - startTime;

            const botStarts = await getCachedBotStarts(interaction.guild.id);

            const performanceValue = lang.BotInfo.Embed.Fields.Performance.Value
                .replace('{botMemory}', `${usedMemory} MB / ${totalMemory} MB`)
                .replace('{systemMemory}', `${usedSystemMemory} GB / ${totalSystemMemory.toFixed(2)} GB`)
                .replace('{ping}', pingLatency);

            const botInfo = new EmbedBuilder()
                .setTitle(replacePlaceholders(lang.BotInfo.Embed.Title))
                .setColor(lang.BotInfo.Embed.Color)
                .setThumbnail(bot.user.displayAvatarURL({ size: 256 }))
                .addFields(
                    { 
                        name: replacePlaceholders(lang.BotInfo.Embed.Fields.BotDetails.Name),
                        value: `> ${replacePlaceholders(lang.BotInfo.Embed.Fields.BotDetails.Value)
                            .replace('{name}', bot.user.username)
                            .replace('{id}', `\`${bot.user.id}\``)
                            .replace('{version}', `\`${version}\``)
                            .replace('{createdAt}', createdAt)
                            .replace('{joinedAt}', joinedAt)
                            .replace('{starts}', botStarts)
                            .replace(/\n/g, '\n> ')
                            .replace(/\*\*/g, '**')}`,
                        inline: false
                    },
                    {
                        name: replacePlaceholders(lang.BotInfo.Embed.Fields.Statistics.Name),
                        value: `> ${replacePlaceholders(lang.BotInfo.Embed.Fields.Statistics.Value)
                            .replace('{users}', interaction.guild.memberCount.toLocaleString())
                            .replace('{channels}', bot.channels.cache.size.toLocaleString())
                            .replace('{commands}', bot.slashCommands.size.toLocaleString())
                            .replace('{uptime}', `<t:${uptimeTimestamp}:R>`)
                            .replace(/\n/g, '\n> ')
                            .replace(/\*\*/g, '**')}`,
                        inline: true
                    },
                    {
                        name: replacePlaceholders(lang.BotInfo.Embed.Fields.Technical.Name),
                        value: `> ${replacePlaceholders(lang.BotInfo.Embed.Fields.Technical.Value)
                            .replace('{discordVersion}', discordVersion)
                            .replace('{cpuModel}', cpuModel)
                            .replace('{cpuCores}', coreCount)
                            .replace(/\n/g, '\n> ')
                            .replace(/\*\*/g, '**')}`,
                        inline: true
                    },
                    {
                        name: replacePlaceholders(lang.BotInfo.Embed.Fields.Performance.Name),
                        value: `> ${replacePlaceholders(performanceValue).replace(/\n/g, '\n> ')}`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: replacePlaceholders(lang.BotInfo.Embed.Footer.Text).replace('{user}', interaction.user.tag), 
                    iconURL: interaction.user.displayAvatarURL({ size: 32 }) 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [botInfo] });
            
        } catch (error) {
            console.error('Error in botinfo command: ', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: lang.BotInfo.ErrorMessage, 
                        flags: MessageFlags.Ephemeral 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: lang.BotInfo.ErrorMessage 
                    });
                }
            } catch (replyError) {
                console.error('Failed to reply with error message:', replyError);
            }
        }
    }
};

async function getCachedBotStarts(guildId) {
    const now = Date.now();
    const cached = botStartsCache.get(guildId);
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        return cached.value;
    }
    
    try {
        const GuildData = require('../../../models/guildDataSchema');
        const guildData = await GuildData.findOne({ guildID: guildId });
        const botStarts = guildData ? guildData.timesBotStarted.toString() : '0';
        
        botStartsCache.set(guildId, {
            value: botStarts,
            timestamp: now
        });
        
        return botStarts;
    } catch (error) {
        console.error('Error fetching bot starts:', error);
        return '0';
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [guildId, data] of botStartsCache.entries()) {
        if (now - data.timestamp > CACHE_DURATION) {
            botStartsCache.delete(guildId);
        }
    }
}, CACHE_DURATION);