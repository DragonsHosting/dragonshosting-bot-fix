const UserData = require('../../../models/UserData.js');
const getInviteModel = () => global.addonLoader?.getModel('Invite');
const { observeAsync } = require('../../../utils/core/perfMonitor');

class LeaderboardCache {
    constructor() {
        this.cache = new Map();
        this.CACHE_DURATION = 2 * 60 * 1000;
        this.BACKGROUND_UPDATE_INTERVAL = 15 * 60 * 1000;
        this.backgroundUpdateTimer = null;
        this.isUpdating = new Set();
        this.MAX_CACHE_SIZE = 100;
    }

    getCacheKey(guildId, type, page = 0, pageSize = 10) {
        return `${guildId}-${type}-${page}-${pageSize}`;
    }

    getCountCacheKey(guildId, type) {
        return `count-${guildId}-${type}`;
    }

    get(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.data;
        }
        return null;
    }

    set(key, data) {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
            this.cache.delete(oldestKey);
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    async getOrFetch(key, fetchFunction) {
        const cached = this.get(key);
        if (cached) {
            return cached;
        }

        if (this.isUpdating.has(key)) {
            await new Promise(resolve => {
                const checkUpdate = () => {
                    if (!this.isUpdating.has(key)) {
                        resolve();
                    } else {
                        setTimeout(checkUpdate, 100);
                    }
                };
                checkUpdate();
            });
            return this.get(key);
        }

        this.isUpdating.add(key);
        try {
            const data = await fetchFunction();
            this.set(key, data);
            return data;
        } finally {
            this.isUpdating.delete(key);
        }
    }

    async preloadLeaderboards(guildId, types = ['balance', 'levels', 'messages', 'invites']) {
        const preloadPromises = [];
        
        for (const type of types) {
            for (let page = 0; page < 3; page++) {
                const cacheKey = this.getCacheKey(guildId, type, page, 5);
                if (!this.get(cacheKey)) {
                    preloadPromises.push(
                        this.fetchLeaderboardData(guildId, type, page, 5)
                            .then(data => this.set(cacheKey, data))
                            .catch(err => console.error(`Failed to preload ${type} page ${page}:`, err))
                    );
                }
            }
            
            const countKey = this.getCountCacheKey(guildId, type);
            if (!this.get(countKey)) {
                preloadPromises.push(
                    this.fetchTotalCount(guildId, type)
                        .then(count => this.set(countKey, count))
                        .catch(err => console.error(`Failed to preload ${type} count:`, err))
                );
            }
        }

        await Promise.allSettled(preloadPromises);
    }

    async fetchLeaderboardData(guildId, type, page, pageSize) {
        const skip = page * pageSize;
        
        const queries = {
            balance: () => observeAsync('lb.balance', async () => await UserData.aggregate([
                {
                    $match: {
                        guildId,
                        $or: [{ balance: { $gt: 0 } }, { bank: { $gt: 0 } }]
                    }
                },
                {
                    $addFields: {
                        totalBalance: {
                            $add: [
                                { $ifNull: ['$balance', 0] },
                                { $ifNull: ['$bank', 0] }
                            ]
                        }
                    }
                },
                { $sort: { totalBalance: -1 } },
                { $skip: skip },
                { $limit: pageSize },
                {
                    $project: {
                        userId: 1,
                        totalBalance: 1,
                        _id: 0
                    }
                }
            ], { allowDiskUse: true })),

            levels: () => observeAsync('lb.levels', async () => await UserData.aggregate([
                {
                    $match: {
                        guildId,
                        $or: [{ level: { $gt: 0 } }, { xp: { $gt: 0 } }]
                    }
                },
                { $sort: { level: -1, xp: -1 } },
                { $skip: skip },
                { $limit: pageSize },
                {
                    $project: {
                        userId: 1,
                        level: 1,
                        xp: 1,
                        _id: 0
                    }
                }
            ], { allowDiskUse: true })),

            messages: () => observeAsync('lb.messages', async () => await UserData.aggregate([
                {
                    $match: {
                        guildId,
                        totalMessages: { $gt: 0 }
                    }
                },
                { $sort: { totalMessages: -1 } },
                { $skip: skip },
                { $limit: pageSize },
                {
                    $project: {
                        userId: 1,
                        totalMessages: 1,
                        _id: 0
                    }
                }
            ], { allowDiskUse: true })),

            invites: () => observeAsync('lb.invites', async () => await getInviteModel().aggregate([
                { $match: { guildID: guildId } },
                {
                    $group: {
                        _id: "$inviterID",
                        userId: { $first: "$inviterID" },
                        invites: { $sum: "$uses" }
                    }
                },
                { $match: { invites: { $gt: 0 } } },
                { $sort: { invites: -1 } },
                { $skip: skip },
                { $limit: pageSize },
                {
                    $project: {
                        userId: 1,
                        invites: 1,
                        _id: 0
                    }
                }
            ], { allowDiskUse: true }))
        };

        return await queries[type]();
    }

    async fetchTotalCount(guildId, type) {
        const countQueries = {
            balance: () => observeAsync('lb.count.balance', async () => await UserData.countDocuments({
                guildId,
                $or: [{ balance: { $gt: 0 } }, { bank: { $gt: 0 } }]
            })),

            levels: () => observeAsync('lb.count.levels', async () => await UserData.countDocuments({
                guildId,
                $or: [{ level: { $gt: 0 } }, { xp: { $gt: 0 } }]
            })),

            messages: () => observeAsync('lb.count.messages', async () => await UserData.countDocuments({
                guildId,
                totalMessages: { $gt: 0 }
            })),

            invites: async () => await observeAsync('lb.count.invites', async () => {
                const result = await getInviteModel().aggregate([
                    { $match: { guildID: guildId } },
                    {
                        $group: {
                            _id: "$inviterID",
                            invites: { $sum: "$uses" }
                        }
                    },
                    { $match: { invites: { $gt: 0 } } },
                    { $count: "total" }
                ], { allowDiskUse: true });
                return result[0]?.total || 0;
            })
        };

        return await countQueries[type]();
    }

    startBackgroundUpdates(guildIds = []) {
        if (this.backgroundUpdateTimer) {
            clearInterval(this.backgroundUpdateTimer);
        }

        this.backgroundUpdateTimer = setInterval(async () => {
            for (const guildId of guildIds) {
                this.preloadLeaderboards(guildId).catch(err => 
                    console.error(`Background leaderboard update failed for guild ${guildId}:`, err)
                );
            }
        }, this.BACKGROUND_UPDATE_INTERVAL);
    }

    stopBackgroundUpdates() {
        if (this.backgroundUpdateTimer) {
            clearInterval(this.backgroundUpdateTimer);
            this.backgroundUpdateTimer = null;
        }
    }

    cleanup() {
        const now = Date.now();
        let deleted = 0;
        
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.CACHE_DURATION * 2) {
                this.cache.delete(key);
                deleted++;
            }
        }
        
        if (deleted > 0) {
        }
    }

    getStats() {
        return {
            totalEntries: this.cache.size,
            updating: this.isUpdating.size,
            oldestEntry: Math.min(...Array.from(this.cache.values()).map(v => v.timestamp)),
            newestEntry: Math.max(...Array.from(this.cache.values()).map(v => v.timestamp))
        };
    }
}

const leaderboardCache = new LeaderboardCache();

setInterval(() => {
    leaderboardCache.cleanup();
}, 2 * 60 * 1000);

module.exports = leaderboardCache;
