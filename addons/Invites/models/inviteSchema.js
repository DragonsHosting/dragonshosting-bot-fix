const mongoose = require('mongoose');

const joinedUserSchema = new mongoose.Schema({
    userID: { type: String, required: true },
    joinedAt: { type: Date, required: true }
}, { _id: false });

const inviteSchema = new mongoose.Schema({
    inviteCode: { type: String, required: true },
    guildID: { type: String, required: true, index: true },
    inviterID: { type: String, required: true, index: true },
    joinedUsers: { type: [joinedUserSchema], default: [] },
    uses: { type: Number, default: 0, index: true }
});

inviteSchema.index({ guildID: 1, inviterID: 1 });
inviteSchema.index({ guildID: 1, uses: -1 });

module.exports = mongoose.model('Invite', inviteSchema);