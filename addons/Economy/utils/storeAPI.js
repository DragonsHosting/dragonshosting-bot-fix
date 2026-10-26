const StoreItem = require('../models/StoreItem');
const StorePurchase = require('../models/StorePurchase');
const User = require('../../../models/UserData');
const { getConfig } = require('../../../utils/core/configLoader');
const crypto = require('crypto');

const generateId = () => crypto.randomUUID();

class StoreAPI {
    constructor() {
        this.client = null;
        this.config = null;
        this.lang = null;
    }

    setContext(client, config, lang) {
        this.client = client;
        this.config = config;
        this.lang = lang;
    }

    async addItem(guildId, itemData) {
        const itemId = itemData.itemId || generateId();
        
        const item = new StoreItem({
            itemId,
            guildId,
            name: itemData.name,
            description: itemData.description || '',
            category: itemData.category,
            price: itemData.price,
            stock: itemData.stock ?? -1,
            maxPerUser: itemData.maxPerUser ?? -1,
            enabled: itemData.enabled ?? true,
            rewardType: itemData.rewardType,
            rewardData: itemData.rewardData || {},
            requirements: itemData.requirements || {},
            metadata: {
                emoji: itemData.emoji || '🛒',
                color: itemData.color || '#5865F2',
                image: itemData.image,
                featured: itemData.featured || false,
                sortOrder: itemData.sortOrder || 0
            }
        });

        await item.save();
        return item;
    }

    async removeItem(guildId, itemId) {
        const result = await StoreItem.deleteOne({ guildId, itemId });
        return result.deletedCount > 0;
    }

    async updateItem(guildId, itemId, updates) {
        updates.updatedAt = new Date();
        const item = await StoreItem.findOneAndUpdate(
            { guildId, itemId },
            { $set: updates },
            { new: true }
        );
        return item;
    }

    async getItem(guildId, itemId) {
        return await StoreItem.findOne({ guildId, itemId, enabled: true });
    }

    async getItems(guildId, category = null) {
        const query = { guildId, enabled: true };
        if (category) query.category = category;
        return await StoreItem.find(query).sort({ 'metadata.sortOrder': 1, createdAt: -1 });
    }

    async getCategories(guildId) {
        const items = await StoreItem.find({ guildId, enabled: true });
        const categories = [...new Set(items.map(i => i.category))];
        return categories;
    }

    async getFeaturedItems(guildId) {
        return await StoreItem.find({ 
            guildId, 
            enabled: true, 
            'metadata.featured': true 
        }).sort({ 'metadata.sortOrder': 1 });
    }

    async purchaseItem(guildId, userId, itemId, client = null) {
        const useClient = client || this.client;
        const item = await this.getItem(guildId, itemId);
        if (!item) {
            return { success: false, error: 'Item not found' };
        }

        if (item.stock === 0) {
            return { success: false, error: 'Item out of stock' };
        }

        const user = await User.findOne({ guildId, userId });
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        if (user.balance < item.price) {
            return { success: false, error: 'Insufficient funds' };
        }

        if (item.requirements.level && (user.level || 0) < item.requirements.level) {
            return { success: false, error: `Requires level ${item.requirements.level}` };
        }

        if (item.requirements.prestige && (user.prestigeLevel || 0) < item.requirements.prestige) {
            return { success: false, error: `Requires prestige ${item.requirements.prestige}` };
        }

        if (item.maxPerUser > 0) {
            const purchaseCount = await StorePurchase.countDocuments({
                guildId, userId, itemId, status: 'completed'
            });
            if (purchaseCount >= item.maxPerUser) {
                return { success: false, error: 'Purchase limit reached' };
            }
        }

        user.balance -= item.price;

        const rewardResult = await this.applyReward(user, item, useClient, guildId);
        if (!rewardResult.success) {
            return rewardResult;
        }

        if (item.stock > 0) {
            await StoreItem.updateOne({ _id: item._id }, { $inc: { stock: -1 } });
        }

        const purchase = new StorePurchase({
            oderId: generateId(),
            guildId,
            userId,
            itemId: item.itemId,
            itemName: item.name,
            category: item.category,
            price: item.price,
            rewardType: item.rewardType,
            rewardData: item.rewardData,
            status: 'completed'
        });

        user.transactionLogs.push({
            type: 'store_purchase',
            amount: -item.price,
            timestamp: new Date(),
            details: { itemId: item.itemId, itemName: item.name }
        });

        await Promise.all([user.save(), purchase.save()]);

        return { 
            success: true, 
            item, 
            purchase,
            reward: rewardResult.reward 
        };
    }

    async applyReward(user, item, client, guildId) {
        const reward = item.rewardData;
        const useClient = client || this.client;
        
        switch (item.rewardType) {
            case 'pet':
                if (!user.pets) user.pets = [];
                const existingPet = user.pets.find(p => p.petId === item.itemId);
                if (existingPet) {
                    return { success: false, error: 'You already own this pet!' };
                }
                const isFirstPet = user.pets.length === 0;
                const newPet = {
                    petId: item.itemId,
                    name: reward.petName || reward.petType || item.name,
                    level: 1,
                    xp: 0,
                    happiness: 100,
                    hunger: 100,
                    lastFed: new Date(),
                    lastCollect: null,
                    totalEarnings: 0,
                    timesFed: 0,
                    isActive: isFirstPet,
                    acquiredAt: new Date()
                };
                user.pets.push(newPet);
                if (isFirstPet) user.activePetId = item.itemId;
                return { success: true, reward: `You adopted ${newPet.name}!` };

            case 'role':
                if (useClient && reward.roleId) {
                    try {
                        const guild = await useClient.guilds.fetch(guildId);
                        const member = await guild.members.fetch(user.userId);
                        await member.roles.add(reward.roleId);
                        
                        if (reward.roleDuration && reward.roleDuration > 0) {
                            setTimeout(async () => {
                                try {
                                    const m = await guild.members.fetch(user.userId);
                                    await m.roles.remove(reward.roleId);
                                } catch (e) {}
                            }, reward.roleDuration);
                        }
                        return { success: true, reward: `Role granted!` };
                    } catch (e) {
                        return { success: false, error: 'Failed to grant role' };
                    }
                }
                return { success: false, error: 'Role configuration error' };

            case 'booster':
                const booster = {
                    type: reward.boosterType || 'Money',
                    multiplier: reward.boosterMultiplier || 1.5,
                    endTime: Date.now() + (reward.boosterDuration || 86400000)
                };
                if (!user.boosters) user.boosters = [];
                user.boosters.push(booster);
                return { success: true, reward: `${booster.type} booster activated!` };

            case 'title':
                if (!user.titles) user.titles = [];
                if (!user.titles.includes(reward.title)) {
                    user.titles.push(reward.title);
                }
                user.activeTitle = reward.title;
                
                if (reward.roleId && useClient) {
                    try {
                        const guild = await useClient.guilds.fetch(guildId);
                        const member = await guild.members.fetch(user.userId);
                        await member.roles.add(reward.roleId);
                    } catch (e) {}
                }
                return { success: true, reward: `Title "${reward.title}" unlocked!` };

            case 'item':
                if (!user.inventory) user.inventory = [];
                user.inventory.push({
                    itemId: item.itemId,
                    name: item.name,
                    type: reward.itemType,
                    data: reward.itemData,
                    acquiredAt: new Date()
                });
                return { success: true, reward: `${item.name} added to inventory!` };

            case 'custom':
                return { success: true, reward: 'Custom reward applied!' };

            default:
                return { success: false, error: 'Unknown reward type' };
        }
    }

    async getUserPurchases(guildId, userId) {
        return await StorePurchase.find({ guildId, userId }).sort({ purchasedAt: -1 });
    }

    async seedDefaultItems(guildId) {
        const config = getConfig();
        if (!config.Store?.enabled) return;

        const existingItems = await StoreItem.countDocuments({ guildId });
        if (existingItems > 0) return;

        const storeItems = config.Store?.Items || {};
        
        for (const [itemId, item] of Object.entries(storeItems)) {
            const itemData = {
                itemId,
                name: item.name,
                description: item.description || '',
                category: item.category,
                price: item.price,
                stock: item.stock ?? -1,
                maxPerUser: item.maxPerUser ?? -1,
                rewardType: item.rewardType,
                rewardData: item.rewardData || {},
                requirements: item.requirements || {},
                emoji: item.emoji || '🛒',
                color: item.color || '#5865F2',
                image: item.image,
                featured: item.featured || false,
                sortOrder: item.sortOrder || 0
            };
            await this.addItem(guildId, itemData);
        }
    }

    async syncStoreFromConfig(guildId) {
        const config = getConfig();
        if (!config.Store?.enabled) return { added: 0, updated: 0 };

        const storeItems = config.Store?.Items || {};
        let added = 0, updated = 0;

        for (const [itemId, item] of Object.entries(storeItems)) {
            const existing = await StoreItem.findOne({ guildId, itemId });
            
            const itemData = {
                name: item.name,
                description: item.description || '',
                category: item.category,
                price: item.price,
                stock: item.stock ?? -1,
                maxPerUser: item.maxPerUser ?? -1,
                rewardType: item.rewardType,
                rewardData: item.rewardData || {},
                requirements: item.requirements || {},
                metadata: {
                    emoji: item.emoji || '🛒',
                    color: item.color || '#5865F2',
                    image: item.image,
                    featured: item.featured || false,
                    sortOrder: item.sortOrder || 0
                }
            };

            if (existing) {
                await this.updateItem(guildId, itemId, itemData);
                updated++;
            } else {
                await this.addItem(guildId, { itemId, ...itemData });
                added++;
            }
        }

        return { added, updated };
    }
}

module.exports = StoreAPI;
