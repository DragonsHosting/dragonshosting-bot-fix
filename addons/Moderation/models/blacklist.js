const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    addedBy: {
        type: String,
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    reason: {
        type: String,
        default: 'No reason provided'
    },
    type: {
        type: String,
        enum: ['permanent', 'temporary'],
        default: 'permanent'
    },
    expiresAt: {
        type: Date,
        default: null
    }
});

const Blacklist = mongoose.model('Blacklist', blacklistSchema);
module.exports = Blacklist;