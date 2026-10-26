const { getConfig } = require('../../../../utils/core/configLoader.js');

let StoreItem = null;
const getStoreItem = () => {
    if (!StoreItem) {
        StoreItem = require('../../models/StoreItem');
    }
    return StoreItem;
};

const checkActiveBooster = (user, boosterType) => {
    if (!user || !Array.isArray(user.boosters)) {
        return 1.0;
    }
    const now = Date.now();
    const activeBooster = user.boosters.find(booster => booster.type === boosterType && booster.endTime > now);
    return activeBooster ? activeBooster.multiplier : 1.0;
};

const replacePlaceholders = (text, placeholders) => {
    return text.replace(/{(\w+)}/g, (_, key) => {
        return placeholders[key] !== undefined ? placeholders[key] : `{${key}}`;
    });
};

const calculatePetStats = (pet) => {
    if (!pet || !pet.lastFed) return { happiness: 0, hunger: 0 };
    const hoursSinceLastFed = (Date.now() - new Date(pet.lastFed).getTime()) / (1000 * 60 * 60);
    const hungerDecayRate = 4;
    const happinessDecayRate = 2;
    return {
        hunger: Math.max(0, Math.min(100, 100 - (hoursSinceLastFed * hungerDecayRate))),
        happiness: Math.max(0, Math.min(100, (pet.happiness || 100) - (hoursSinceLastFed * happinessDecayRate)))
    };
};

const getActivePet = (user) => {
    if (!user?.pets || user.pets.length === 0) return null;
    return user.pets.find(p => p.petId === user.activePetId) || user.pets[0];
};

const getLevelBonus = (level) => 1 + ((level - 1) * 0.02);

let petDataCache = new Map();

const getPetEarningsBonus = async (user, guildId) => {
    const pet = getActivePet(user);
    if (!pet) return 1.0;
    
    const cacheKey = `${guildId}_${pet.petId}`;
    let petItem = petDataCache.get(cacheKey);
    
    if (!petItem) {
        const SI = getStoreItem();
        petItem = await SI.findOne({ itemId: pet.petId });
        if (petItem) petDataCache.set(cacheKey, petItem);
    }
    
    if (!petItem?.rewardData?.petMultiplier) return 1.0;
    
    const stats = calculatePetStats(pet);
    const happinessMultiplier = stats.happiness / 100;
    const levelBonus = getLevelBonus(pet.level || 1);
    return 1 + ((petItem.rewardData.petMultiplier - 1) * happinessMultiplier * levelBonus);
};

const getPetPassiveIncome = async (user, guildId) => {
    const pet = getActivePet(user);
    if (!pet) return 0;
    
    const cacheKey = `${guildId}_${pet.petId}`;
    let petItem = petDataCache.get(cacheKey);
    
    if (!petItem) {
        const SI = getStoreItem();
        petItem = await SI.findOne({ itemId: pet.petId });
        if (petItem) petDataCache.set(cacheKey, petItem);
    }
    
    if (!petItem?.rewardData?.petPassiveIncome) return 0;
    
    const stats = calculatePetStats(pet);
    const hungerMultiplier = stats.hunger / 100;
    const levelBonus = getLevelBonus(pet.level || 1);
    return Math.floor(petItem.rewardData.petPassiveIncome * hungerMultiplier * levelBonus);
};

const getPrestigeBonus = (user) => {
    if (!user?.prestigeLevel) return 1.0;
    const config = getConfig();
    const bonusPerLevel = config.Prestige?.bonusPerLevel || 0.05;
    return 1 + (user.prestigeLevel * bonusPerLevel);
};

const getTotalEarningsMultiplier = async (user, guildId) => {
    const boosterMultiplier = checkActiveBooster(user, 'Money');
    const petMultiplier = await getPetEarningsBonus(user, guildId);
    const prestigeMultiplier = getPrestigeBonus(user);
    return boosterMultiplier * petMultiplier * prestigeMultiplier;
};

const getTotalEarningsMultiplierSync = (user) => {
    const boosterMultiplier = checkActiveBooster(user, 'Money');
    const prestigeMultiplier = getPrestigeBonus(user);
    return boosterMultiplier * prestigeMultiplier;
};

module.exports = {
    checkActiveBooster,
    replacePlaceholders,
    calculatePetStats,
    getActivePet,
    getPetEarningsBonus,
    getPetPassiveIncome,
    getPrestigeBonus,
    getTotalEarningsMultiplier,
    getTotalEarningsMultiplierSync,
};