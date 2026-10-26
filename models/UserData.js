const mongoose = require('mongoose');

const CommandDataSchema = new mongoose.Schema({
    lastDaily: { type: Date, default: null },
    dailyStreak: { type: Number, default: 0 },
    lastBeg: { type: Date, default: null },
    lastWork: { type: Date, default: null },
    lastCrime: { type: Date, default: null },
    lastBlackjack: { type: Date, default: null },
    lastSlot: { type: Date, default: null },
    lastRob: { type: Date, default: null },
    lastPetFeed: { type: Date, default: null },
    lastPetCollect: { type: Date, default: null }
}, { _id: false });

const PetAdventureSchema = new mongoose.Schema({
    type: { type: String, enum: ['quick', 'standard', 'epic', 'legendary'], required: true },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    rewards: {
        coins: { type: Number, default: 0 },
        xp: { type: Number, default: 0 },
        items: [{ type: String }]
    }
}, { _id: false });

const PetSchema = new mongoose.Schema({
    petId: { type: String, required: true },
    name: { type: String, default: '' },
    level: { type: Number, default: 1, min: 1, max: 100 },
    xp: { type: Number, default: 0 },
    happiness: { type: Number, default: 100, min: 0, max: 100 },
    hunger: { type: Number, default: 100, min: 0, max: 100 },
    lastFed: { type: Date, default: Date.now },
    lastCollect: { type: Date, default: null },
    totalEarnings: { type: Number, default: 0 },
    timesFed: { type: Number, default: 0 },
    isActive: { type: Boolean, default: false },
    acquiredAt: { type: Date, default: Date.now },
    stats: {
        agility: { type: Number, default: 0 },
        intelligence: { type: Number, default: 0 },
        strength: { type: Number, default: 0 }
    },
    training: {
        lastFetch: { type: Date, default: null },
        lastPuzzle: { type: Date, default: null },
        lastAgility: { type: Date, default: null },
        totalSessions: { type: Number, default: 0 }
    },
    activeAdventure: { type: PetAdventureSchema, default: null },
    adventureHistory: {
        completed: { type: Number, default: 0 },
        successful: { type: Number, default: 0 },
        totalCoinsEarned: { type: Number, default: 0 },
        totalXpEarned: { type: Number, default: 0 }
    }
}, { _id: false });

const HeistDataSchema = new mongoose.Schema({
    location: { type: String, default: null },
    scoutedAt: { type: Date, default: null },
    difficulty: { type: Number, default: 0 },
    potentialReward: { type: Number, default: 0 },
    plan: { type: String, default: null },
    plannedAt: { type: Date, default: null },
    lastExecute: { type: Date, default: null }
}, { _id: false });

const InventoryItemSchema = new mongoose.Schema({
    itemId: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
    isBooster: { type: Boolean, default: false },
    isRank: { type: Boolean, default: false },
    duration: { type: Number, default: 0 },
    multiplier: { type: Number, default: 1.0 },
    roleIds: [{ type: String, default: '' }]
}, { _id: false });

const BoosterSchema = new mongoose.Schema({
    type: { type: String, default: '' },
    endTime: { type: Number, default: 0 },
    multiplier: { type: Number, default: 1.0 }
}, { _id: false });

const TransactionLogSchema = new mongoose.Schema({
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const EquipmentSchema = new mongoose.Schema({
    HuntingWeapon: { type: String, default: null },
    HeistGear: [{ type: String }]
}, { _id: false });

const GameStatsSchema = new mongoose.Schema({
    blackjack: {
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        lost: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        totalWagered: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 },
        biggestWin: { type: Number, default: 0 }
    },
    slots: {
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        jackpots: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        totalWagered: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 },
        biggestWin: { type: Number, default: 0 }
    },
    coinflip: {
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        totalWagered: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 }
    },
    roulette: {
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        totalWagered: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 },
        biggestWin: { type: Number, default: 0 }
    },
    roll: {
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        totalWagered: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 }
    },
    trivia: {
        played: { type: Number, default: 0 },
        correct: { type: Number, default: 0 },
        streak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        totalWon: { type: Number, default: 0 }
    }
}, { _id: false });

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },
    xp: { type: Number, default: 0, index: true },
    level: { type: Number, default: 0, index: true },
    warns: { type: Number, default: 0 },
    bans: { type: Number, default: 0 },
    kicks: { type: Number, default: 0 },
    timeouts: { type: Number, default: 0 },
    note: { type: String, default: '' },
    warnings: [{
        reason: { type: String, default: '' },
        date: { type: Date, default: Date.now },
        moderatorId: { type: String, default: '' }
    }],
    totalMessages: { type: Number, default: 0 },
    messages: [{
        content: { type: String, required: false },
        timeSent: { type: Number, default: Date.now }
    }],
    tempBans: [{
        endTime: { type: Date, required: true },
        reason: { type: String, default: '' },
        moderatorId: { type: String, default: '' },
        lifted: { type: Boolean, default: false }
    }],
    balance: { type: Number, default: 0, index: true },
    bank: { type: Number, default: 0, index: true },
    inventory: [InventoryItemSchema],
    boosters: [BoosterSchema],
    commandData: { type: CommandDataSchema, default: () => ({}) },
    isMuted: { type: Boolean, default: false },
    interestRate: { type: Number, default: null },
    purchasedItems: [{
        itemId: { type: String, required: true },
        quantity: { type: Number, default: 0 }
    }],
    transactionLogs: [TransactionLogSchema],
    roles: [{ type: String }],
    equipment: { type: EquipmentSchema, default: () => ({}) },
    pets: { type: [PetSchema], default: [] },
    activePetId: { type: String, default: null },
    prestigeLevel: { type: Number, default: 0 },
    totalPrestigeEarnings: { type: Number, default: 0 },
    heistData: { type: HeistDataSchema, default: () => ({}) },
    gameStats: { type: GameStatsSchema, default: () => ({}) }
});

UserSchema.index({ userId: 1, guildId: 1 });
UserSchema.index({ level: 1, xp: -1 });
UserSchema.index({ guildId: 1, level: -1, xp: -1 });
UserSchema.index({ guildId: 1, balance: -1 });
UserSchema.index({ guildId: 1, bank: -1 });
UserSchema.index({ guildId: 1, totalMessages: -1 });
UserSchema.index({ 
    guildId: 1, 
    balance: -1, 
    bank: -1 
}, { 
    partialFilterExpression: { 
        $or: [
            { balance: { $gt: 0 } },
            { bank: { $gt: 0 } }
        ]
    }
});

const MAX_TRANSACTION_LOGS = 100;
const MAX_USER_MESSAGES = 50;
const MAX_WARNINGS = 50;

UserSchema.pre('save', function(next) {
    if (this.transactionLogs && this.transactionLogs.length > MAX_TRANSACTION_LOGS) {
        this.transactionLogs = this.transactionLogs.slice(-MAX_TRANSACTION_LOGS);
    }
    
    if (this.messages && this.messages.length > MAX_USER_MESSAGES) {
        this.messages = this.messages.slice(-MAX_USER_MESSAGES);
    }
    
    if (this.warnings && this.warnings.length > MAX_WARNINGS) {
        this.warnings = this.warnings.slice(-MAX_WARNINGS);
    }
    
    if (this.tempBans && this.tempBans.length > 20) {
        this.tempBans = this.tempBans.filter(ban => !ban.lifted).slice(-20);
    }
    
    next();
});

module.exports = mongoose.model('UserData', UserSchema);