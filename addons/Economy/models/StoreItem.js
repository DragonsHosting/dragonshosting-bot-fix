const mongoose = require('mongoose');

const StoreItemSchema = new mongoose.Schema({
    itemId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { 
        type: String, 
        enum: ['pets', 'roles', 'boosters', 'titles', 'items', 'special'],
        required: true 
    },
    price: { type: Number, required: true },
    stock: { type: Number, default: -1 },
    maxPerUser: { type: Number, default: -1 },
    enabled: { type: Boolean, default: true },
    
    rewardType: {
        type: String,
        enum: ['pet', 'role', 'booster', 'title', 'item', 'custom'],
        required: true
    },
    rewardData: {
        petType: { type: String },
        petName: { type: String },
        petMultiplier: { type: Number },
        petPassiveIncome: { type: Number },
        
        roleId: { type: String },
        roleDuration: { type: Number },
        
        boosterType: { type: String },
        boosterMultiplier: { type: Number },
        boosterDuration: { type: Number },
        
        title: { type: String },
        
        itemType: { type: String },
        itemData: { type: mongoose.Schema.Types.Mixed },
        
        customCallback: { type: String }
    },
    
    requirements: {
        level: { type: Number, default: 0 },
        prestige: { type: Number, default: 0 },
        roles: [{ type: String }]
    },
    
    metadata: {
        emoji: { type: String, default: '🛒' },
        color: { type: String, default: '#5865F2' },
        image: { type: String },
        featured: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 }
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

StoreItemSchema.index({ guildId: 1, category: 1 });
StoreItemSchema.index({ guildId: 1, itemId: 1 });

module.exports = mongoose.model('StoreItem', StoreItemSchema);

