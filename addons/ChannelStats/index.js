'use strict';

module.exports = {
    name: 'ChannelStats',
    version: '1.1.0',
    description: 'Live voice channel counters for server and addon statistics',
    async run(client, eventManager, api) {
        const ChannelStat = api.registerModel('ChannelStat', require('./models/ChannelStat'));
        const GuildData = require('../../models/guildDataSchema');
        const formatCurrentDate = require('./date');
        const botCounts = new Map();
        const botCountLoads = new Map();
        let running = false;
        let rerunRequested = false;
        let debounceTimer;

        const online = member => ['online', 'idle', 'dnd'].includes(member.presence?.status);

        const loadBotCount = async guild => {
            if (botCounts.has(guild.id)) return botCounts.get(guild.id);
            if (!botCountLoads.has(guild.id)) {
                const loading = guild.members.fetch()
                    .then(members => {
                        const count = members.filter(member => member.user.bot).size;
                        botCounts.set(guild.id, count);
                        return count;
                    })
                    .catch(error => {
                        console.warn(`[ChannelStats] Could not fetch all members for ${guild.id}; bot count is based on the current cache: ${error.message}`);
                        const count = guild.members.cache.filter(member => member.user.bot).size;
                        botCounts.set(guild.id, count);
                        return count;
                    })
                    .finally(() => botCountLoads.delete(guild.id));
                botCountLoads.set(guild.id, loading);
            }
            return botCountLoads.get(guild.id);
        };

        const valueFor = async (guild, stat, addonStats) => {
            const values = {
                MemberCount: () => guild.memberCount,
                HumanMemberCount: async () => Math.max(guild.memberCount - await loadBotCount(guild), 0),
                BotCount: () => loadBotCount(guild),
                CurrentDate: () => formatCurrentDate(api.config?.Timezone),
                NitroBoosterCount: () => guild.premiumSubscriptionCount || 0,
                ServerCreationDate: () => guild.createdAt.toDateString(),
                TotalRolesCount: () => guild.roles.cache.size,
                TotalEmojisCount: () => guild.emojis.cache.size,
                TotalChannelsCount: () => guild.channels.cache.size,
                OnlineMembersCount: () => guild.members.cache.filter(member => !member.user.bot && online(member)).size,
                ServerRegion: () => guild.preferredLocale || 'en-US',
                TotalMembersWithRole: () => guild.roles.cache.get(stat.roleId)?.members.size || 0,
                OnlineMembersWithRole: () => guild.roles.cache.get(stat.roleId)?.members.filter(online).size || 0,
                BotUptime: () => {
                    const minutes = Math.floor(client.uptime / 60000);
                    const days = Math.floor(minutes / 1440);
                    const hours = Math.floor((minutes % 1440) / 60);
                    return days ? `${days}d ${hours}h` : `${hours}h ${minutes % 60}m`;
                }
            };
            if (values[stat.type]) return values[stat.type]();
            if (stat.type === 'TotalBannedMembers') return (await guild.bans.fetch().catch(() => new Map())).size;
            if (stat.type === 'TotalMessages' || stat.type === 'TotalCases') {
                const data = await GuildData.findOne({ guildID: guild.id }).lean();
                return stat.type === 'TotalMessages' ? data?.totalMessages || 0 : data?.cases || 0;
            }
            const statisticsKey = stat.type.charAt(0).toLowerCase() + stat.type.slice(1);
            return addonStats[statisticsKey] ?? 0;
        };

        const update = async () => {
            if (!client.isReady()) return;
            if (running) {
                rerunRequested = true;
                return;
            }

            running = true;
            try {
                do {
                    rerunRequested = false;
                    const stats = await ChannelStat.find({}).lean();
                    const addonStatsByGuild = new Map();
                    for (const stat of stats) {
                        const guild = client.guilds.cache.get(stat.guildId);
                        const channel = guild?.channels.cache.get(stat.channelId);
                        if (!guild || !channel) continue;

                        if (!addonStatsByGuild.has(guild.id)) {
                            addonStatsByGuild.set(guild.id, await global.addonLoader?.getStatistics(guild.id) || {});
                        }
                        const value = await valueFor(guild, stat, addonStatsByGuild.get(guild.id));
                        const formatted = typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : String(value);
                        const name = stat.channelName.replace('{stats}', formatted).slice(0, 100);
                        if (channel.name !== name) {
                            try {
                                await channel.setName(name, 'Refresh live channel statistics');
                            } catch (error) {
                                console.error(`[ChannelStats] Could not update channel ${channel.id}: ${error.message}`);
                            }
                        }
                    }
                } while (rerunRequested);
            } finally {
                running = false;
            }
        };

        const scheduleUpdate = () => {
            if (debounceTimer) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                update().catch(error => console.error('[ChannelStats] Live update failed:', error.message));
            }, 2500);
            debounceTimer.unref?.();
        };

        const onMemberAdd = ({ member }) => {
            if (!member) return;
            if (botCounts.has(member.guild.id) && member.user.bot) botCounts.set(member.guild.id, botCounts.get(member.guild.id) + 1);
            scheduleUpdate();
        };
        const onMemberRemove = ({ member }) => {
            if (!member) return;
            if (botCounts.has(member.guild.id) && member.user.bot) botCounts.set(member.guild.id, Math.max(botCounts.get(member.guild.id) - 1, 0));
            scheduleUpdate();
        };

        const discordEvents = [
            ['guildMemberAdd', onMemberAdd],
            ['guildMemberRemove', onMemberRemove],
            ['guildMemberUpdate', scheduleUpdate],
            ['presenceUpdate', scheduleUpdate],
            ['voiceStateUpdate', scheduleUpdate],
            ['guildUpdate', scheduleUpdate],
            ['guildBanAdd', scheduleUpdate],
            ['guildBanRemove', scheduleUpdate],
            ['roleCreate', scheduleUpdate],
            ['roleUpdate', scheduleUpdate],
            ['roleDelete', scheduleUpdate],
            ['channelCreate', scheduleUpdate],
            ['channelDelete', scheduleUpdate],
            ['channelUpdate', scheduleUpdate],
            ['emojiCreate', scheduleUpdate],
            ['emojiDelete', scheduleUpdate],
            ['emojiUpdate', scheduleUpdate],
            ['stickerCreate', scheduleUpdate],
            ['stickerDelete', scheduleUpdate],
            ['stickerUpdate', scheduleUpdate]
        ];
        const cleanups = discordEvents.map(([eventName, handler]) => api.onDiscord(eventName, handler));
        const dataEvents = [
            'ticket:created', 'ticket:closed', 'ticket:deleted', 'ticket:reopened',
            'suggestion:created', 'suggestion:accepted', 'suggestion:denied',
            'invite:memberJoined', 'level:up', 'giveaway:created', 'giveaway:ended'
        ];
        dataEvents.forEach(eventName => cleanups.push(api.on(eventName, scheduleUpdate)));

        const timer = setInterval(() => update().catch(error => console.error('[ChannelStats] Periodic update failed:', error.message)), 300000);
        timer.unref?.();
        if (client.isReady()) update().catch(error => console.error('[ChannelStats] Initial update failed:', error.message));
        else client.once('clientReady', () => update().catch(error => console.error('[ChannelStats] Initial update failed:', error.message)));

        api.registerService('channelStats.update', update);
        return () => {
            clearInterval(timer);
            clearTimeout(debounceTimer);
            cleanups.forEach(cleanup => cleanup());
        };
    }
};
