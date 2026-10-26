const mongoose = require('mongoose');

const BackupSchema = new mongoose.Schema({
    backupId: String,
    guildId: String,
    data: mongoose.Schema.Types.Mixed,
    createdAt: Date,
    automatic: { type: Boolean, default: false },
    isChunk: { type: Boolean, default: false },
    chunkIndex: { type: Number, default: 0 },
    totalChunks: { type: Number, default: 1 }
});

BackupSchema.index({ guildId: 1, backupId: 1, chunkIndex: 1 }, { unique: true });

module.exports = mongoose.model('Backup', BackupSchema);
