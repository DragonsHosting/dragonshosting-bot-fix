const mongoose = require('mongoose');

const StorePurchaseSchema = new mongoose.Schema({
    oderId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    itemId: { type: String, required: true },
    itemName: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    rewardType: { type: String, required: true },
    rewardData: { type: mongoose.Schema.Types.Mixed },
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'completed'
    },
    purchasedAt: { type: Date, default: Date.now }
});

StorePurchaseSchema.index({ guildId: 1, userId: 1 });

module.exports = mongoose.model('StorePurchase', StorePurchaseSchema);

