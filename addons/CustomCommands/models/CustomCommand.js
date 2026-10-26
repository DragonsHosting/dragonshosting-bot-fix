const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['LINK', 'REPLY'],
        required: true
    },
    name: {
        type: String,
        required: true,
        maxlength: 80
    },
    emoji: {
        type: String,
        default: ''
    },
    style: {
        type: String,
        enum: ['Primary', 'Secondary', 'Success', 'Danger'],
        default: 'Primary'
    },
    link: {
        type: String,
        default: ''
    },
    reply: {
        embed: {
            title: { type: String, default: '' },
            description: [{ type: String }],
            color: { type: String, default: '#5865F2' },
            footer: {
                text: { type: String, default: '' },
                icon: { type: String, default: '' }
            },
            author: {
                text: { type: String, default: '' },
                icon: { type: String, default: '' }
            },
            thumbnail: { type: String, default: '' },
            image: { type: String, default: '' }
        },
        text: { type: String, default: '' },
        ephemeral: { type: Boolean, default: false }
    }
}, { _id: false });

const customCommandSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['EMBED', 'TEXT', 'BOTH'],
        default: 'EMBED'
    },
    text: {
        type: String,
        default: ''
    },
    embed: {
        title: { type: String, default: '' },
        description: [{ type: String }],
        color: { type: String, default: '#5865F2' },
        footer: {
            text: { type: String, default: '' },
            icon: { type: String, default: '' }
        },
        author: {
            text: { type: String, default: '' },
            icon: { type: String, default: '' }
        },
        thumbnail: { type: String, default: '' },
        image: { type: String, default: '' },
        fields: [{
            name: { type: String, default: '' },
            value: { type: String, default: '' },
            inline: { type: Boolean, default: false }
        }]
    },
    roles: {
        whitelist: [{ type: String }]
    },
    options: {
        deleteTriggerMessage: { type: Boolean, default: false },
        replyToUser: { type: Boolean, default: false }
    },
    buttons: [buttonSchema],
    enabled: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

customCommandSchema.index({ guildId: 1, name: 1 }, { unique: true });

customCommandSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('CustomCommand', customCommandSchema);
