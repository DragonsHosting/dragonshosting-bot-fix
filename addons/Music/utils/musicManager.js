const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandOptionType, AttachmentBuilder, ActivityType, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, QueueRepeatMode } = require('discord.js');
const { useMainPlayer, useQueue } = require('discord-player');
const { Logger } = require('../../../utils/core/logger');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MusicQueue = require('../models/musicQueue');
const { createCanvas, loadImage } = require('canvas');
const { searchWithFuzzy } = require('./fuzzySearch');
const autoLoopManager = require('./autoLoop');
const { isDeezerTrackUrl, getDeezerTrackInfo } = require('./deezerHelper');

function getMusicLang(key, replacements = {}) {
    const keys = key.split('.');
    let value = global.lang?.Music;
    for (const k of keys) {
        if (value && typeof value === 'object') value = value[k];
        else return key;
    }
    if (typeof value !== 'string') return key;
    return Object.entries(replacements).reduce((str, [k, v]) => str.replace(new RegExp(`{${k}}`, 'g'), v), value);
}

let _instance = null;

function ensureTempDir() {
    try {
        const tempDir = path.join(__dirname, '..', 'data', 'temp');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });

        }
        
        return tempDir;
    } catch (error) {
        Logger.error(`Error creating temp directory: ${error}`);
        const osTempDir = require('os').tmpdir();
        const fallbackDir = path.join(osTempDir, 'dragonhosting');
        
        try {
            if (!fs.existsSync(fallbackDir)) {
                fs.mkdirSync(fallbackDir, { recursive: true });
            }

            return fallbackDir;
        } catch (fallbackError) {
            Logger.error(`Error creating fallback temp directory: ${fallbackError}`);
            return osTempDir;
        }
    }
}

function createTempFile(prefix = 'np', extension = '.png') {
    const tempDir = ensureTempDir();
    return path.join(tempDir, `${prefix}_${Date.now()}${extension}`);
}

function cleanupTempFiles() {
    try {
        const tempDir = ensureTempDir();
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        const maxAge = 30 * 60 * 1000;
        
        let deletedCount = 0;
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (error) {
            }
        });
        
        if (deletedCount > 0) {
        }
        } catch (error) {
            Logger.error(`Error cleaning up temp files: ${error}`);
        }
    }

let tempCleanupInterval = null;

class MusicManager {
    constructor(client, emitAddonEvent) {
        if (_instance) {
            Logger.warn("MusicManager already initialized - returning existing instance");
            return _instance;
        }

        this.client = client;
        this.emitAddonEvent = emitAddonEvent;
        this.config = global.config.Music;
        this.playerMessages = new Map();
        this.updateIntervals = new Map();
        this.activeTimers = new Map();

        if (!tempCleanupInterval) {
            tempCleanupInterval = setInterval(cleanupTempFiles, 15 * 60 * 1000);
        }
        this.activeTimers.set('tempCleanup', tempCleanupInterval);

        this.cleanupInterval = setInterval(() => {
            this.cleanupDataStructures();
        }, 5 * 60 * 1000);
        this.activeTimers.set('dataCleanup', this.cleanupInterval);

        this.autoLoopManager = autoLoopManager;

        if (!global.musicData) {
            global.musicData = {
                nowPlayingMessages: {}
            };
        } else if (!global.musicData.nowPlayingMessages) {
            global.musicData.nowPlayingMessages = {};
        }

        try {
            mongoose.connection.on('disconnected', () => {
                this.mongoDisconnected = true;
            });
            
            mongoose.connection.on('connected', () => {
                this.mongoDisconnected = false;
            });
            
            mongoose.connection.on('error', (err) => {
                Logger.error(`MongoDB connection error: ${err}`);
                this.mongoDisconnected = true;
            });


        } catch (error) {
            Logger.error(`Error setting up MongoDB event handlers: ${error}`);
        }
        
        this.setupPlayer();
        this.setupQueueSaveRestore();

        this._voiceStateUpdateHandlers = [];
        this._patchedVoiceStateUpdateHandlers = [];

        process.on('exit', () => this.cleanupEventListeners());
        process.on('SIGINT', () => this.cleanupEventListeners());
        process.on('SIGTERM', () => this.cleanupEventListeners());
    }

    async setupPlayer() {
        try {
            this.player = global.player || useMainPlayer();
            
            if (!this.player) {
                Logger.error('No player instance available. Player must be initialized in index.js first.');
                return { success: false, error: new Error('Player not initialized') };
            }
            


            this.applyVoiceConnectionPatches();

            this.setupConnectionPatching();

            try {
                const duplicates = await MusicQueue.find({});

                const queuesByGuild = {};
                for (const queue of duplicates) {
                    if (!queuesByGuild[queue.guildId]) {
                        queuesByGuild[queue.guildId] = [];
                    }
                    queuesByGuild[queue.guildId].push(queue);
                }

                let fixedGuilds = 0;
                for (const [guildId, queues] of Object.entries(queuesByGuild)) {
                    if (queues.length > 1) {


                        queues.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                        const keepQueue = queues[0];

                        await MusicQueue.deleteMany({ guildId });

                        await MusicQueue.create(keepQueue.toObject());
                        
                        fixedGuilds++;
                    }
                }
                
                if (fixedGuilds > 0) {

                }

                const allQueues = await MusicQueue.find({});
                let fixedRequestedBy = 0;
                
                for (const queue of allQueues) {
                    let needsUpdate = false;

                    if (queue.currentTrack && queue.currentTrack.requestedBy === null) {
                        queue.currentTrack.requestedBy = undefined;
                        needsUpdate = true;
                    }

                    if (queue.queue && queue.queue.length > 0) {
                        for (const track of queue.queue) {
                            if (track.requestedBy === null) {
                                track.requestedBy = undefined;
                                needsUpdate = true;
                            }
                        }
                    }
                    
                    if (needsUpdate) {
                        await MusicQueue.updateOne(
                            { _id: queue._id },
                            { 
                                currentTrack: queue.currentTrack,
                                queue: queue.queue
                            }
                        );
                        fixedRequestedBy++;
                    }
                }
                
                if (fixedRequestedBy > 0) {

                }
            } catch (error) {
                Logger.error(`Error during queue auto-fixing on startup: ${error}`);
            }

            this.registerEvents();

            this.setupQueueSaveRestore();

            await this.restoreQueues();
            

            
            return { success: true, player: this.player };
        } catch (error) {
            Logger.error('Error setting up player:', error);
            return { success: false, error };
        }
    }

    setupQueueSaveRestore() {
        try {
            if (!global.config.Music?.SaveQueuesOnRestart) {

                return;
            }

            if (this.config.AutoSaveInterval) {
                this.autoSaveInterval = setInterval(() => {
                    this.saveQueues();
                }, this.config.AutoSaveInterval || 30000);
            }
            
            const handleShutdown = async (signal) => {


                global.isShuttingDown = true;

                if (this.autoSaveInterval) {
                    clearInterval(this.autoSaveInterval);
                    this.autoSaveInterval = null;
                }
                
                if (this._scheduledSave) {
                    clearTimeout(this._scheduledSave);
                    this._scheduledSave = null;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            };

            process.once('SIGINT', async () => {
                await handleShutdown('SIGINT');
            });
            
            process.once('SIGTERM', async () => {
                await handleShutdown('SIGTERM');
            });

            if (mongoose && mongoose.connection) {
                this.mongoDisconnected = !mongoose.connection.readyState;
                
                mongoose.connection.on('disconnected', () => {
                    this.mongoDisconnected = true;
                });
                
                mongoose.connection.on('connected', () => {
                    this.mongoDisconnected = false;
                });
            } else {
                this.mongoDisconnected = true;
            }

        } catch (error) {
            Logger.error(`Error setting up queue save/restore: ${error}`);
        }
    }

    async saveQueues(forceAll = false) {
        if (!global.config.Music?.SaveQueuesOnRestart) {
            return;
        }

        const now = Date.now();
        

        if (!forceAll && this._lastSaveTime && (now - this._lastSaveTime < 2000)) {

            if (!this._scheduledSave) {
                this._scheduledSave = setTimeout(() => {
                    this._scheduledSave = null;
                    this.saveQueues(true).catch(err => {
                        Logger.error(`Error in scheduled queue save: ${err}`);
                    });
                }, 2000);
            }
            
            return;
        }

        this._lastSaveTime = now;

        if (this._scheduledSave) {
            clearTimeout(this._scheduledSave);
            this._scheduledSave = null;
        }
        
        try {
            if (this.mongoDisconnected) {
                return;
            }

            const queues = this.player.nodes.cache;
            if (queues.size === 0 && !forceAll) {
                return;
            }

            try {
                const guildIds = Array.from(queues.keys());

                for (const guildId of guildIds) {
                    const duplicates = await MusicQueue.find({ guildId });
                    
                    if (duplicates.length > 1) {

                        duplicates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                        const keepId = duplicates[0]._id;

                        await MusicQueue.deleteMany({ guildId, _id: { $ne: keepId } });
                    }
                }
            } catch (error) {
                Logger.error(`Error cleaning up duplicate queues: ${error}`);
            }
            

            const processedGuilds = new Map();
            
            for (const [guildId, queue] of queues) {
                if (processedGuilds.has(guildId)) {
                    continue;
                }

                processedGuilds.set(guildId, true);
                
                try {
                    let voiceChannelId = null;
                    if (queue.connection && queue.connection.channel) {
                        voiceChannelId = queue.connection.channel.id;
                    } else if (queue.channel) {
                        voiceChannelId = queue.channel.id;
                    } else {
                        const { getVoiceConnection } = require('@discordjs/voice');
                        const connection = getVoiceConnection(guildId);
                        if (connection) {
                            voiceChannelId = connection.joinConfig.channelId;
                        }
                    }


                    const hasNowPlaying = queue.metadata && queue.metadata.nowPlayingMessages && 
                        queue.metadata.nowPlayingMessages.length > 0;
                        
                    if (!queue.currentTrack && queue.tracks.size === 0 && !hasNowPlaying) {
                        const existingQueue = await MusicQueue.findOne({ guildId });
                        if (existingQueue && (existingQueue.nowPlayingMessageId || existingQueue.nowPlayingChannelId)) {

                            await MusicQueue.updateOne(
                                { guildId },
                                { 
                                    $set: { 
                                        currentTrack: null,
                                        queue: [],
                                        updatedAt: new Date()
                                    }
                                }
                            );
                        } else {
                        await MusicQueue.deleteMany({ guildId });
                        }
                        continue;
                    }

                    let nowPlayingMessageId = null;
                    let nowPlayingChannelId = null;
                    
                    if (queue.metadata && queue.metadata.nowPlayingMessages && queue.metadata.nowPlayingMessages.length > 0) {
                        nowPlayingMessageId = queue.metadata.nowPlayingMessages[queue.metadata.nowPlayingMessages.length - 1];
                        nowPlayingChannelId = queue.metadata.channel?.id;
                    }

                    const currentTrackRequestedById = queue.currentTrack?.requestedBy?.id || undefined;

                    const queueData = {
                        guildId,
                        nowPlayingMessageId,
                        nowPlayingChannelId,
                        currentTrack: queue.currentTrack && queue.isPlaying() ? {
                            title: queue.currentTrack.title,
                            url: queue.currentTrack.url,
                            author: queue.currentTrack.author,
                            duration: queue.currentTrack.duration,
                            thumbnail: queue.currentTrack.thumbnail,
                            durationMS: queue.currentTrack.durationMS,
                            requestedBy: currentTrackRequestedById
                        } : null,
                        queue: queue.tracks.toArray().map(track => ({
                            title: track.title,
                            url: track.url,
                            author: track.author,
                            duration: track.duration,
                            thumbnail: track.thumbnail,
                            durationMS: track.durationMS,
                            requestedBy: track.requestedBy?.id || undefined
                        })),
                        volume: queue.node.volume,
                        repeatMode: queue.repeatMode,
                        voiceChannelId: voiceChannelId,
                        textChannelId: queue.metadata?.channel?.id || null,
                        isPaused: queue.node.isPaused(),
                        updatedAt: new Date()
                    };

                    const existingQueue = await MusicQueue.findOne({ guildId });
                    if (existingQueue) {

                        await MusicQueue.updateOne({ guildId }, { $set: queueData });
                    } else {
                    await MusicQueue.create(queueData);
                    }
                } catch (error) {
                    Logger.error(`Error saving queue for guild ${guildId}: ${error}`);
                }
            }
        } catch (error) {
            Logger.error(`Error saving queues to MongoDB: ${error}`);
        }
    }

    async restoreQueues() {
        try {
            if (!global.config.Music?.SaveQueuesOnRestart) {
                return;
            }

            if (!this.client.isReady()) {
                await new Promise(resolve => {
                    this.client.once('clientReady', resolve);
                });
            }

            const savedQueues = await MusicQueue.find({});
            
            if (savedQueues.length === 0) {
                return;
            }
            

            try {
                await this.fixDuplicateQueues();
                const updatedQueues = await MusicQueue.find({});
                if (updatedQueues.length < savedQueues.length) {
                    if (updatedQueues.length === 0) {
                        return;
                    }
                }
            } catch (error) {
                Logger.error(`Error fixing duplicate queues during restore: ${error}`);
            }

            for (const queueData of await MusicQueue.find({})) {
                try {
                    const hasNowPlayingData = queueData.nowPlayingMessageId && queueData.nowPlayingChannelId;
                    
                    if (!queueData.currentTrack && (!queueData.queue || queueData.queue.length === 0)) {
                        if (hasNowPlayingData) {
                        } else {
                        continue;
                        }
                    }

                    const guild = await this.client.guilds.fetch(queueData.guildId).catch((err) => {
                        return null;
                    });
                    
                    if (!guild) {
                        continue;
                    }

                    let textChannel = null;
                    if (queueData.nowPlayingChannelId) {
                        textChannel = await guild.channels.fetch(queueData.nowPlayingChannelId).catch((err) => {
                        return null;
                    });
                    
                        if (textChannel) {
                        }
                    }

                    if (!textChannel && queueData.textChannelId) {
                        textChannel = await guild.channels.fetch(queueData.textChannelId).catch((err) => {
                            return null;
                        });
                    }

                    if (!textChannel) {
                        textChannel = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('SendMessages'));
                        if (!textChannel) {
                            continue;
                        }
                    }

                    let nowPlayingMessage = null;
                    if (queueData.nowPlayingMessageId && textChannel) {
                        try {
                            nowPlayingMessage = await textChannel.messages.fetch(queueData.nowPlayingMessageId).catch(() => null);
                            if (nowPlayingMessage) {
                            }
                        } catch (error) {
                        }
                    }

                    if ((!queueData.currentTrack || !queueData.currentTrack.url) && (!queueData.queue || queueData.queue.length === 0)) {
                        if (nowPlayingMessage) {
                            
                            try {
                                const emptyCanvas = await this.createEmptyNowPlayingCanvas();
                                const tempFile = createTempFile('np_empty', '.png');
                                fs.writeFileSync(tempFile, emptyCanvas.toBuffer());

                                await nowPlayingMessage.edit({
                                    content: null,
                                    embeds: [],
                                    files: [{
                                        attachment: tempFile,
                                        name: path.basename(tempFile)
                                    }]
                                });

                                setTimeout(() => {
                                    try {
                                        fs.unlinkSync(tempFile);
                                    } catch (error) {
                                    }
                                }, 5000);
                                
                                continue;
                            } catch (error) {
                                Logger.error(`Error updating nowPlaying message to empty state: ${error}`);
                            }
                        }

                        continue;
                    }

                    if (!queueData.voiceChannelId) {
                        continue;
                    }

                    const voiceChannel = await guild.channels.fetch(queueData.voiceChannelId).catch((err) => {
                        return null;
                    });
                    
                    if (!voiceChannel || !voiceChannel.isVoiceBased()) {
                        continue;
                    }

                    const queue = this.player.nodes.create(guild, {
                        metadata: {
                            channel: textChannel,
                            client: guild.members.me,
                            guild: guild,
                            requestedBy: this.client.user
                        },
                        volume: queueData.volume || global.config.Music?.DefaultVolume || 80,
                        leaveOnEmpty: global.config.Music?.LeaveOnEmpty === true,
                        leaveOnEmptyCooldown: global.config.Music?.LeaveEmptyDelay || 60000,
                        leaveOnEnd: global.config.Music?.LeaveOnEnd === true,
                        leaveOnStop: global.config.Music?.LeaveOnEnd === true,
                        leaveOnEndCooldown: global.config.Music?.LeaveEndDelay || 300000,
                        skipOnNoStream: true,
                        connectionTimeout: 30000,
                        bufferingTimeout: 20000,
                        pauseOnEmpty: global.config.Music?.AutoPause !== false,
                        highWaterMark: (global.config.Music?.HighWaterMark || 1) * 1024 * 1024
                    });
                    
                    try {
                        await queue.connect(voiceChannel);

                        const tracksToAdd = [];

                        if (queueData.queue && queueData.queue.length > 0) {
                            for (const trackData of queueData.queue) {
                                try {
                                    let requestedBy = null;
                                    
                                    if (trackData.requestedBy) {
                                        try {

                                            requestedBy = await this.client.users.fetch(trackData.requestedBy)
                                                .catch(() => this.client.user);
                                        } catch (userError) {
                                            requestedBy = this.client.user;
                                        }
                                    } else {
                                        requestedBy = this.client.user;
                                    }

                                    const searchResult = await this.player.search(trackData.url, {
                                        requestedBy: requestedBy,
                                        searchEngine: 'spotifySearch'
                                    });
                                    
                                    if (searchResult.tracks.length > 0) {
                                        tracksToAdd.push(searchResult.tracks[0]);
                                    }
                                } catch (trackError) {
                                    Logger.error(`Error processing queued track: ${trackError}`);
                                }
                            }

                            if (tracksToAdd.length > 0) {
                                queue.addTrack(tracksToAdd);
                            }
                        }

                        if (queueData.currentTrack) {
                            try {
                                let requestedBy = null;
                                
                                if (queueData.currentTrack.requestedBy) {
                                    try {
                                        requestedBy = await this.client.users.fetch(queueData.currentTrack.requestedBy)
                                            .catch(() => this.client.user);
                                    } catch (userError) {
                                        requestedBy = this.client.user;
                                    }
                                } else {
                                    requestedBy = this.client.user;
                                }

                                const currentTrackResult = await this.player.search(queueData.currentTrack.url, {
                                    requestedBy: requestedBy,
                                    searchEngine: 'spotifySearch'
                                });
                                
                                if (currentTrackResult.tracks.length > 0) {
                                    await queue.node.play(currentTrackResult.tracks[0]);

                                    queue.node.setVolume(queueData.volume || global.config.Music?.DefaultVolume || 80);

                                    if (queueData.repeatMode !== undefined) {
                                        queue.setRepeatMode(queueData.repeatMode);
                                    }

                                    if (queueData.isPaused) {
                                        queue.node.pause();
                                    }
                                    

                                    setTimeout(async () => {
                                        try {
                                            if (queue && queue.currentTrack && textChannel) {
                                                                                if (queueData.nowPlayingMessageId && queueData.nowPlayingChannelId) {
                                    try {
                                        const existingMessage = await textChannel.messages.fetch(queueData.nowPlayingMessageId).catch(() => null);
                                        
                                        if (existingMessage) {
                                            queue.metadata.nowPlayingMessages = [queueData.nowPlayingMessageId];
                                            await this.handleNowPlayingMessage(queue, queue.currentTrack);
                                            return;
                                        }
                                    } catch (msgError) {
                                    }
                                }

                                                await this.handleNowPlayingMessage(queue, queue.currentTrack);
                                            }
                                        } catch (err) {
                                            Logger.error(`Error creating nowplaying message for restored queue: ${err}`);
                                        }
                                    }, 2000);
                                } else {
                                    if (tracksToAdd.length > 0) {
                                        await queue.node.play();

                                        setTimeout(async () => {
                                            try {
                                                if (queue && queue.currentTrack && textChannel) {
                                                    await this.handleNowPlayingMessage(queue, queue.currentTrack);
                                                }
                                            } catch (err) {
                                                Logger.error(`Error creating nowplaying message for restored queue: ${err}`);
                                            }
                                        }, 2000);
                                    } else {
                                        queue.delete();

                                        if (queueData.nowPlayingMessageId && queueData.nowPlayingChannelId) {
                                            await MusicQueue.updateOne(
                                                { guildId: queueData.guildId },
                                                { 
                                                    $set: { 
                                                        currentTrack: null,
                                                        queue: [],
                                                        updatedAt: new Date()
                                                    }
                                                }
                                            );
                                        } else {
                                        await MusicQueue.deleteMany({ guildId: queueData.guildId });
                                        }
                                    }
                                }
                            } catch (currentTrackError) {
                                Logger.error(`Error processing current track: ${currentTrackError}`);

                                if (tracksToAdd.length > 0) {
                                    await queue.node.play();

                                    setTimeout(async () => {
                                        try {
                                            if (queue && queue.currentTrack && textChannel) {
                                                await this.handleNowPlayingMessage(queue, queue.currentTrack);
                                            }
                                        } catch (err) {
                                            Logger.error(`Error creating nowplaying message for restored queue: ${err}`);
                                        }
                                    }, 2000);
                                } else {
                                    queue.delete();
                                }
                            }
                        } else if (tracksToAdd.length > 0) {
                            await queue.node.play();

                            setTimeout(async () => {
                                try {
                                    if (queue && queue.currentTrack && textChannel) {
                                        await this.handleNowPlayingMessage(queue, queue.currentTrack);
                                    }
                                } catch (err) {
                                    Logger.error(`Error creating nowplaying message for restored queue: ${err}`);
                                }
                            }, 2000);
                        } else {
                            queue.delete();
                        }
                    } catch (queueError) {
                        Logger.error(`Error setting up restored queue for guild ${queueData.guildId}: ${queueError}`);
                        if (queue) {
                            queue.delete();
                        }
                    }
                } catch (error) {
                    Logger.error(`Error restoring queue for guild ${queueData.guildId}: ${error}`);
                }
            }
        } catch (error) {
            Logger.error(`Error restoring queues: ${error}`);
        }
    }

    registerEvents() {
        try {
            if (this._eventsRegistered) {
                return;
            }

            this._eventsRegistered = true;

            let isProcessingPlayerStart = false;

            this.player.events.on('playerStart', async (queue, track) => {
                try {
                    if (isProcessingPlayerStart) {
                        return;
                    }
                    
                    isProcessingPlayerStart = true;

                    if (this.emitAddonEvent) {
                        Promise.resolve(this.emitAddonEvent('music:trackStart', {
                            track: track,
                            queue: {
                                size: queue.size,
                                repeatMode: queue.repeatMode,
                                volume: queue.node.volume
                            },
                            guild: queue.metadata?.guild,
                            channel: queue.metadata?.channel,
                            requestedBy: track.requestedBy
                        })).catch(error => Logger.error(`Addon event music:trackStart failed: ${error.message}`));
                    }

                    const resetTimer = setTimeout(() => {
                        isProcessingPlayerStart = false;
                    }, 3000);
                    
                    try {
                
                if (this.config?.DisplayNowPlaying) {
                    try {
                                if (!this._processedTracks) {
                                    this._processedTracks = new Map();
                                }
                                
                            const guildId = queue.metadata?.guild?.id;
                            const trackId = track.id || track.url;
                                const processingKey = `${guildId}-${trackId}`;
                            
                                
                                const lastProcessed = this._processedTracks.get(processingKey);
                                const now = Date.now();
                                
                                if (lastProcessed && (now - lastProcessed < 5000)) {
                                    clearTimeout(resetTimer);
                                    isProcessingPlayerStart = false;
                                return;
                            }
                            
                                this._processedTracks.set(processingKey, now);
                            
                                const cleanupTime = now - 60000;
                                for (const [key, timestamp] of this._processedTracks.entries()) {
                                    if (timestamp < cleanupTime) {
                                        this._processedTracks.delete(key);
                                        }
                                    }
                                
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                
                                Logger.debug(`PlayerStart - Queue metadata channel: ${queue.metadata?.channel ? `${queue.metadata.channel.name} (${queue.metadata.channel.id})` : 'undefined'}`);
                                Logger.debug(`PlayerStart - Queue guild: ${queue.guild ? `${queue.guild.name} (${queue.guild.id})` : 'undefined'}`);
                                
                                await this.handleNowPlayingMessage(queue, track).catch(err => {
                                Logger.error(`Error handling now playing message: ${err}`);
                            });

            try {
                if (this.autoLoopManager.isAutoLoopEnabled(queue.guild.id)) {
                    const queueSize = queue.tracks.size;
                    if (queueSize <= 2) {
                        Logger.debug(`Queue getting low (${queueSize} tracks) for guild ${queue.guild.id}, triggering auto-loop in playerStart`);
                        await this.autoLoopManager.addSimilarSongs(queue);
                    }
                }
            } catch (autoLoopError) {
                Logger.error(`Error in playerStart auto-loop check: ${autoLoopError}`);
            }
                    } catch (error) {
                        Logger.error(`Error in playerStart event: ${error}`);
                    }
                        }
                        
                        try {
                            await this.saveQueues();
                        } catch (error) {
                            Logger.error(`Error saving queue after playerStart: ${error}`);
                        }
                    } finally {
                        clearTimeout(resetTimer);
                        isProcessingPlayerStart = false;
                    }
                } catch (error) {
                    Logger.error(`Unhandled error in playerStart event: ${error}`);
                    isProcessingPlayerStart = false;
                }
            });
            
            this.player.events.on('audioTrackAdd', (queue, track) => {
                this.saveQueues().catch(err => {
                    Logger.error(`Error saving queue after track add: ${err}`);
                });

                if (this.emitAddonEvent) {
                    Promise.resolve(this.emitAddonEvent('music:trackAdded', {
                        track: track,
                        queue: {
                            size: queue.size,
                            repeatMode: queue.repeatMode,
                            volume: queue.node.volume
                        },
                        guild: queue.metadata?.guild,
                        channel: queue.metadata?.channel,
                        requestedBy: track.requestedBy
                    })).catch(error => Logger.error(`Addon event music:trackAdded failed: ${error.message}`));
                }
            });
            
            this.player.events.on('audioTracksAdd', (queue, tracks) => {
                this.saveQueues().catch(err => {
                    Logger.error(`Error saving queue after tracks add: ${err}`);
                });
            });
            
            this.player.events.on('queueEnd', async (queue) => {
                this.saveQueues().catch(err => {
                    Logger.error(`Error saving queue after queue end: ${err}`);
                });

                try {
                    if (this.autoLoopManager.isAutoLoopEnabled(queue.guild.id)) {
                        Logger.debug(`Queue ended but auto-loop is enabled for guild ${queue.guild.id}, attempting to add songs`);
                        await this.autoLoopManager.addSimilarSongs(queue);

                        if (queue.tracks.size > 0) {
                            Logger.debug(`Auto-loop added songs, restarting playback for guild ${queue.guild.id}`);
                            try {
                                await queue.node.play();
                                return;
                            } catch (playError) {
                                Logger.error(`Error restarting playback after auto-loop: ${playError}`);
                            }
                        }
                    }
                } catch (error) {
                    Logger.error(`Error in auto-loop queue end handling: ${error}`);
                }
                
                this.handleQueueEnd(queue).catch(err => {
                    Logger.error(`Error handling queue end: ${err}`);
                });
                
                if (global.config.Music?.LeaveOnEnd === false && queue.connection) {
                    
                    if (queue.connection._disconnect) {
                        const originalDisconnect = queue.connection._disconnect;
                        
                        queue.connection._disconnect = function(...args) {
                            if (args[0] === 'manual') {
                                return originalDisconnect.apply(this, args);
                            }
                            return null;
                        };
                    }
                    
                    if (queue.connection.leaveTimeout) {
                        clearTimeout(queue.connection.leaveTimeout);
                        queue.connection.leaveTimeout = null;
                    }
                    
                    try {
                        const guildId = queue.metadata?.guild?.id;
                        if (guildId && queue.metadata?.nowPlayingMessages?.length > 0) {
                            const messageId = queue.metadata.nowPlayingMessages[queue.metadata.nowPlayingMessages.length - 1];
                            const channelId = queue.metadata.channel?.id;
                            
                            if (messageId && channelId) {
                                MusicQueue.updateOne(
                                    { guildId },
                                    {
                                        $set: {
                                            nowPlayingMessageId: messageId,
                                            nowPlayingChannelId: channelId,
                                            currentTrack: null,
                                            queue: [],
                                            updatedAt: new Date()
                                        }
                                    },
                                    { upsert: true }
                                ).catch(err => {
                                    Logger.error(`Error preserving queue data: ${err}`);
                                });
                            }
                        }
                    } catch (error) {
                        Logger.error(`Error preserving queue data after end: ${error}`);
                    }
                }
            });
            
            this.player.events.on('connectionCreate', (queue) => {
                this.saveQueues().catch(err => {
                    Logger.error(`Error saving queue after connection create: ${err}`);
                });
                
                if (queue && queue.connection) {
                    
                    const connection = queue.connection;
                    
                    const originalOnVoiceStateUpdate = connection.voiceConnection.onVoiceStateUpdate;
                    
                    connection.voiceConnection.onVoiceStateUpdate = function(oldState, newState) {
                        const result = originalOnVoiceStateUpdate.call(this, oldState, newState);
                        
                        try {
                            if (global.config.Music?.LeaveOnEmpty === false) {
                                if (connection.leaveTimeout) {
                                    clearTimeout(connection.leaveTimeout);
                                    connection.leaveTimeout = null;
                                }
                            } else if (global.config.Music?.LeaveOnEmpty === true && 
                                       global.config.Music?.LeaveEmptyDelay) {
                                const delay = global.config.Music.LeaveEmptyDelay;
                            }
                            
                            if (global.config.Music?.LeaveOnEnd === false) {
                                if (connection._disconnectTimeout) {
                                    clearTimeout(connection._disconnectTimeout);
                                    connection._disconnectTimeout = null;
                                }
                            }
                        } catch (err) {
                            Logger.error(`Error in custom voice state handler: ${err}`);
                        }
                        
                        return result;
                    };
                }
            });
            
            this.player.events.on('connectionDestroy', (queue) => {
                this.saveQueues().catch(err => {
                    Logger.error(`Error saving queue after connection destroy: ${err}`);
                });
            });
            
            this.player.events.on('queueDelete', async (queue) => {
                try {
                    const guildId = queue.metadata?.guild?.id;
                    if (guildId) {
                        
                        const existingData = await MusicQueue.findOne({ guildId });
                        
                        if (existingData && (existingData.nowPlayingMessageId || existingData.nowPlayingChannelId)) {
                            await MusicQueue.updateOne(
                                { guildId },
                                {
                                    $set: {
                                        currentTrack: null,
                                        queue: [],
                                        isPaused: false,
                                        updatedAt: new Date()
                                    }
                                }
                            );
                        } else {
                        await MusicQueue.deleteMany({ guildId });
                        }
                    }
                } catch (error) {
                    Logger.error(`Error handling queue delete: ${error}`);
                }
            });
            
            this.player.events.on('error', (queue, error) => {
                Logger.error(`Player error: ${error.message} in guild ${queue.metadata?.guild?.id || 'unknown'}`);
            });
            
            this.player.events.on('playerError', (queue, error) => {
                Logger.error(`Player playback error: ${error.message} in guild ${queue.metadata?.guild?.id || 'unknown'}`);
            });
            
            this.player.events.on('connectionError', (queue, error) => {
                Logger.error(`Player connection error: ${error.message} in guild ${queue.metadata?.guild?.id || 'unknown'}`);
            });
            
            this.player.events.on('playerFinish', async (queue, track) => {
                
                try {
                    const guildId = queue.metadata?.guild?.id;
                    
                    const hasMoreTracks = queue.tracks.size > 0;
                    
                    if (!hasMoreTracks) {
                        
                        if (guildId) {
                            const existingQueue = await MusicQueue.findOne({ guildId });
                            
                            if (existingQueue) {
                                existingQueue.currentTrack = null;
                                existingQueue.updatedAt = new Date();
                                await existingQueue.save();
                            }
                        }
                    } else {
                    }
                } catch (error) {
                    Logger.error(`Error handling track finish: ${error}`);
                }
            });
            
        } catch (error) {
            Logger.error(`Error registering player events: ${error}`);
        }
    }

    async handleNowPlayingMessage(queue, track) {
        try {
            if (!this.config?.DisplayNowPlaying) {
                return null;
            }

            if (!queue || !track) {
                return null;
            }

            const guildId = queue.guild.id;
            if (!guildId) {
                return null;
            }

            const textChannel = queue.metadata?.channel;
            Logger.debug(`Music Manager - textChannel from queue metadata: ${textChannel ? `${textChannel.name} (${textChannel.id})` : 'undefined'}`);
            Logger.debug(`Music Manager - Queue guild: ${queue.guild ? `${queue.guild.name} (${queue.guild.id})` : 'undefined'}`);
            
            if (!textChannel || !textChannel.isTextBased()) {
                Logger.debug('Music Manager - No valid text channel found in queue metadata');
                return null;
            }

            if (textChannel.guildId !== queue.guild.id) {
                Logger.error(`Channel guild mismatch! Channel ${textChannel.name} (${textChannel.id}) belongs to guild ${textChannel.guildId}, but queue is for guild ${queue.guild.id}`);

                const correctGuildChannel = queue.guild.channels.cache.find(c => 
                    c.isTextBased() && 
                    c.permissionsFor(queue.guild.members.me)?.has(['SendMessages', 'EmbedLinks', 'AttachFiles'])
                );
                
                if (correctGuildChannel) {
                    queue.metadata.channel = correctGuildChannel;
                    return await this.handleNowPlayingMessage(queue, track);
                } else {
                    Logger.error('No suitable channel found in the correct guild');
                    return null;
                }
            }
            
            let existingNowPlayingMessage = null;
            
            if (queue.metadata?.nowPlayingMessages?.length > 0) {
                const knownMessageId = queue.metadata.nowPlayingMessages[queue.metadata.nowPlayingMessages.length - 1];
                try {
                    const knownMessage = await textChannel.messages.fetch(knownMessageId).catch(() => null);
                    if (knownMessage && knownMessage.author.id === this.client.user.id) {
                        existingNowPlayingMessage = knownMessage;
                    }
                } catch (error) {
                }
            }
            
            if (!existingNowPlayingMessage) {
                try {
                    const recentMessages = await textChannel.messages.fetch({ limit: 5 });
                    
                    for (const msg of recentMessages.values()) {
                    if (msg.author.id === this.client.user.id) {
                        const isNowPlayingMessage = msg.content?.includes('**Now Playing') || 
                                                  msg.content?.includes('**Ready for music') ||
                                                  msg.content?.includes('**Nothing currently playing') ||
                                                  msg.embeds?.[0]?.image?.url?.includes('np_');
                        
                        if (isNowPlayingMessage) {
                            
                            const isEmptyMessage = msg.content?.includes('Nothing currently playing') ||
                                                  msg.content?.includes('Ready for music') ||
                                                  msg.content?.includes('Waiting for your next track') ||
                                                  msg.embeds?.[0]?.image?.url?.includes('np_empty') ||
                                                  msg.embeds?.[0]?.fields?.some(field => 
                                                      field.value?.includes('No tracks in queue') || 
                                                      field.value?.includes('Queue ended') ||
                                                      field.value?.includes('Use /play to add music') ||
                                                      field.value?.includes('Playback stopped')
                                                  );
                            
                            const currentTrackTitle = track.title.substring(0, 40); // First 40 chars for comparison
                            const isSameTrack = msg.content?.includes(currentTrackTitle);
                            
                            if (isSameTrack) {
                                return null;
                            } else {
                                existingNowPlayingMessage = msg;
                                break;
                            }
                        }
                    }
                }
                
                if (!existingNowPlayingMessage) {
                }
                } catch (error) {
                }
            }
            
            if (!global.musicData) {
                global.musicData = {};
            }
            if (!global.musicData.nowPlayingMessages) {
                global.musicData.nowPlayingMessages = {};
            }
            if (!global.musicData.nowPlayingMessages[guildId]) {
                global.musicData.nowPlayingMessages[guildId] = [];
            }
            
            if (this.config.RemoveOldNowPlaying) {
                await this.cleanupOldMessages(guildId, 'nowplaying');
            } else {
            }
            const canvas = await this.createNowPlayingCanvas(queue, track);
            const tempFile = createTempFile('np', '.png');
            fs.writeFileSync(tempFile, canvas.toBuffer());
            
            const controlButtons = this.createControlButtons(queue);
            
            let message;
            if (textChannel.guildId !== queue.guild.id) {
                Logger.error(`Channel guild mismatch: ${textChannel.id} vs ${queue.guild.id}`);
                return null;
            }
            
            const messageData = {
                content: null,
                embeds: [],
                components: controlButtons,
                files: [{
                    attachment: tempFile,
                    name: path.basename(tempFile)
                }]
            };
            
            if (existingNowPlayingMessage) {
                message = await existingNowPlayingMessage.edit(messageData);
                Logger.debug(`Updated existing now playing message in ${textChannel.name} (${textChannel.id})`);
            } else {
                message = await textChannel.send(messageData);
                Logger.debug(`Posted new now playing message in ${textChannel.name} (${textChannel.id})`);
            }
            
            if (!global.musicData.nowPlayingMessages[guildId].includes(message.id)) {
                global.musicData.nowPlayingMessages[guildId].push(message.id);
            }
            
            if (!queue.metadata.nowPlayingMessages) {
                queue.metadata.nowPlayingMessages = [];
            }
            if (!queue.metadata.nowPlayingMessages.includes(message.id)) {
                queue.metadata.nowPlayingMessages.push(message.id);
            }
            
            this.setupNowPlayingInterval(queue, textChannel);
            
            await this.saveNowPlayingMessage(guildId, message.id, textChannel.id, queue);
            
            setTimeout(() => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (error) {
                }
            }, 5000);
            
            return message;
        } catch (error) {
            Logger.error('Error handling now playing message:', error);
            return null;
        }
    }

    setupNowPlayingInterval(queue, textChannel) {
        try {
            const guildId = queue.metadata?.guild?.id;
            const timerKey = `nowplaying_${guildId}`;
            
            if (this.activeTimers.has(timerKey)) {
                clearInterval(this.activeTimers.get(timerKey));
                this.activeTimers.delete(timerKey);
            }
            
            if (queue.metadata.nowPlayingInterval) {
                clearInterval(queue.metadata.nowPlayingInterval);
                queue.metadata.nowPlayingInterval = null;
            }
            
            const intervalId = setInterval(async () => {
                try {
                    if (!queue || !queue.metadata) {
                        this.activeTimers.delete(timerKey);
                        clearInterval(intervalId);
                        return;
                    }
                    
                    const messageId = queue.metadata.nowPlayingMessages && 
                        queue.metadata.nowPlayingMessages.length > 0 ? 
                        queue.metadata.nowPlayingMessages[queue.metadata.nowPlayingMessages.length - 1] : null;
                    
                    if (!messageId) {
                        this.activeTimers.delete(timerKey);
                        clearInterval(intervalId);
                        queue.metadata.nowPlayingInterval = null;
                        return;
                    }
                    
                    const message = await textChannel.messages.fetch(messageId).catch(() => null);
                    if (!message || message.deleted) {
                        this.activeTimers.delete(timerKey);
                        clearInterval(intervalId);
                        queue.metadata.nowPlayingInterval = null;
                        return;
                    }
                    
                    if (!queue.isPlaying() || !queue.currentTrack) {
                        
                        try {
                        const emptyCanvas = await this.createEmptyNowPlayingCanvas();
                        const tempFile = createTempFile('np_empty', '.png');
                        fs.writeFileSync(tempFile, emptyCanvas.toBuffer());

                            await message.edit({
                                content: null,
                                embeds: [],
                                files: [{
                                    attachment: tempFile,
                                    name: path.basename(tempFile)
                                }]
                            });
                            
                            setTimeout(() => {
                                try {
                                    fs.unlinkSync(tempFile);
                                } catch (error) {
                                }
                            }, 5000);
                            
                            return;
                        } catch (error) {
                            Logger.error(`Error updating to empty state: ${error}`);
                            this.activeTimers.delete(timerKey);
                            clearInterval(intervalId);
                            queue.metadata.nowPlayingInterval = null;
                        return;
                    }
                    }
                    
                    const updatedCanvas = await this.createNowPlayingCanvas(queue, queue.currentTrack);
                    const tempFile = createTempFile('np_update', '.png');
                    fs.writeFileSync(tempFile, updatedCanvas.toBuffer());
                    
                    const updatedButtons = this.createControlButtons(queue);
                    
                    await message.edit({
                        content: null,
                        embeds: [],
                        components: updatedButtons,
                        files: [{
                            attachment: tempFile,
                            name: path.basename(tempFile)
                        }]
                    });
                    
                    setTimeout(() => {
                        try {
                            fs.unlinkSync(tempFile);
                        } catch (error) {
                        }
                    }, 5000);
                } catch (error) {
                    Logger.error(`Error in now playing update interval: ${error}`);
                    this.activeTimers.delete(timerKey);
                    clearInterval(intervalId);
                    if (queue && queue.metadata) {
                        queue.metadata.nowPlayingInterval = null;
                    }
                }
            }, 10000);
            
            if (!queue._hasCleanupListener) {
                const originalDelete = queue.delete;
                queue.delete = function() {
                    if (this.metadata && this.metadata.nowPlayingInterval) {
                        clearInterval(this.metadata.nowPlayingInterval);
                        this.metadata.nowPlayingInterval = null;
                    }
                    return originalDelete.apply(this, arguments);
                };
                queue._hasCleanupListener = true;
            }

            this.activeTimers.set(timerKey, intervalId);
        } catch (error) {
            Logger.error(`Error setting up nowplaying interval: ${error}`);
        }
    }

    async createEmptyNowPlayingCanvas() {
        const canvasWidth = 500;
        const canvasHeight = 100;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        ctx.save();
        ctx.fillStyle = '#0d0d0d';
        ctx.beginPath();
        ctx.roundRect(0, 0, canvasWidth, canvasHeight, 12);
        ctx.fill();
        ctx.restore();
        
        const iconSize = 56;
        const iconX = 22;
        const iconY = (canvasHeight - iconSize) / 2;
        
        ctx.save();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.roundRect(iconX, iconY, iconSize, iconSize, 8);
        ctx.fill();
        ctx.restore();
        
        ctx.save();
        ctx.fillStyle = '#333';
        const playX = iconX + iconSize / 2;
        const playY = iconY + iconSize / 2;
        ctx.beginPath();
        ctx.moveTo(playX - 8, playY - 12);
        ctx.lineTo(playX - 8, playY + 12);
        ctx.lineTo(playX + 10, playY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        const textX = iconX + iconSize + 16;
        
        ctx.save();
        ctx.font = '600 18px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(getMusicLang('NowPlaying.NothingPlaying'), textX, canvasHeight / 2 - 8);
        ctx.restore();
        
        ctx.save();
        ctx.font = '400 13px sans-serif';
        ctx.fillStyle = '#666';
        ctx.textBaseline = 'middle';
        ctx.fillText(getMusicLang('NowPlaying.StartPlaying'), textX, canvasHeight / 2 + 14);
        ctx.restore();
        
        return canvas;
    }

    getSourceIcon(url) {
        if (!url) return '🎵';
        
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return '📺';
        } else if (url.includes('spotify.com')) {
            return '🟢';
        } else if (url.includes('soundcloud.com')) {
            return '🟠';
        } else {
            return '🎵';
        }
    }

    createControlButtons(queue) {
        const mainRow = new ActionRowBuilder();
        const secondRow = new ActionRowBuilder();
        
        
        if (this.config?.Buttons?.ShowPrevious !== false) {
            mainRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_previous')
                    .setEmoji('⏮️')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        if (this.config?.Buttons?.ShowPauseResume !== false) {
            mainRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_playpause')
                    .setEmoji(queue?.node?.isPaused() ? '▶️' : '⏸️')
                    .setStyle(queue?.node?.isPaused() ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        }
        
        if (this.config?.Buttons?.ShowSkip !== false) {
            mainRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_skip')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        if (this.config?.Buttons?.ShowLoop !== false) {
            mainRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_loop')
                    .setEmoji('🔁')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        if (this.config?.Buttons?.ShowShuffle !== false) {
            mainRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_shuffle')
                    .setEmoji('🔀')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        
        let hasSecondRowButtons = false;
        
        if (this.config?.Buttons?.ShowVolumeControls !== false) {
            secondRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_volumedown')
                    .setEmoji('🔉')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('music_volumeup')
                    .setEmoji('🔊')
                    .setStyle(ButtonStyle.Secondary)
            );
            hasSecondRowButtons = true;
        }
        
        if (this.config?.Buttons?.ShowStop !== false) {
            secondRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger)
        );
            hasSecondRowButtons = true;
        }
        
        const rows = [mainRow];
        if (hasSecondRowButtons) {
            rows.push(secondRow);
        }
        
        return rows;
    }

    storePlayerMessage(guildId, type, messageId, channelId) {
        if (!this.playerMessages.has(guildId)) {
            this.playerMessages.set(guildId, new Map());
        }
        
        this.playerMessages.get(guildId).set(type, { messageId, channelId });
    }

    async cleanupOldMessages(guildId, type) {
        try {
            if (type === 'nowplaying' && !this.config.RemoveOldNowPlaying) {
                return 0;
            }
            
            if (!this.client || !guildId) {
                return 0;
            }
            
            let messageCollection;
            if (type === 'nowplaying') {
                if (!global.musicData?.nowPlayingMessages?.[guildId]) {
                    return 0;
                }
                messageCollection = [...global.musicData.nowPlayingMessages[guildId]];
            } else if (type === 'player') {
                if (!global.musicData?.playerMessages?.[guildId]) {
                    return 0;
                }
                messageCollection = [...global.musicData.playerMessages[guildId]];
            } else {
                return 0;
            }
            
            if (!messageCollection || messageCollection.length === 0) {
                return 0;
            }
            
            let messagesToKeep = [];
            if (type === 'nowplaying') {
                messagesToKeep = messageCollection.slice(-2);
            } else if (type === 'player') {
                messagesToKeep = messageCollection.slice(-1);
            }
            
            const messagesToDelete = messageCollection.filter(
                msgId => !messagesToKeep.includes(msgId)
            );
            
            if (messagesToDelete.length === 0) {
                return 0;
            }
            
            let deletedCount = 0;
            const collection = type === 'nowplaying' 
                ? global.musicData.nowPlayingMessages
                : global.musicData.playerMessages;
            
            for (const messageId of messagesToDelete) {
                try {
                    const messageData = await this.db.get(
                        `SELECT * FROM music_messages WHERE guild_id = ? AND message_id = ? AND type = ?`,
                        [guildId, messageId, type]
                    );
                    
                    if (messageData) {
                        const channel = await this.client.channels.fetch(messageData.channel_id).catch(() => null);
                        
                        if (channel && channel.isTextBased()) {
                            const message = await channel.messages.fetch(messageId).catch(() => null);
                            
                            if (message && message.deletable) {
                                await message.delete();
                                deletedCount++;
                                
                                await this.db.run(
                                    'DELETE FROM music_messages WHERE guild_id = ? AND message_id = ? AND type = ?',
                                    [guildId, messageId, type]
                                );
                            }
                        }
                    }
                    
                    const index = collection[guildId].indexOf(messageId);
                    if (index > -1) {
                        collection[guildId].splice(index, 1);
                    }
                } catch (error) {
                    Logger.error(`Error deleting ${type} message ${messageId}: ${error}`);
                    
                    const index = collection[guildId].indexOf(messageId);
                    if (index > -1) {
                        collection[guildId].splice(index, 1);
                    }
                }
            }
            
            return deletedCount;
        } catch (error) {
            Logger.error(`Error in cleanupOldMessages: ${error}`);
            return 0;
        }
    }

    async handleQueueEnd(queue) {
        try {
            const channel = queue?.metadata?.channel;
            if (channel) {
                const message = await channel.send({
                    content: getMusicLang('NowPlaying.NothingPlaying')
                });
                
                if (this.config.AutoDeleteCommands) {
                    setTimeout(() => {
                        if (message && message.deletable) {
                            message.delete().catch(() => {});
                        }
                    }, this.config.CommandDeleteDelay || 5000);
                }
            }
            
            if (queue.metadata?.nowPlayingMessages?.length > 0 && channel) {
                try {
                    const messageId = queue.metadata.nowPlayingMessages[queue.metadata.nowPlayingMessages.length - 1];
                    const nowPlayingMessage = await channel.messages.fetch(messageId).catch(() => null);
                    
                    if (nowPlayingMessage) {
                        
                        const emptyCanvas = await this.createEmptyNowPlayingCanvas();
                        const tempFile = createTempFile('np_empty', '.png');
                        fs.writeFileSync(tempFile, emptyCanvas.toBuffer());
                        
                        await nowPlayingMessage.edit({
                            content: null,
                            embeds: [],
                            files: [{
                                attachment: tempFile,
                                name: path.basename(tempFile)
                            }]
                        });
                        
                        setTimeout(() => {
                            try {
                                fs.unlinkSync(tempFile);
                            } catch (error) {
                            }
                        }, 5000);
                    }
                } catch (error) {
                    Logger.error(`Error updating nowplaying message on queue end: ${error}`);
                }
            }
        } catch (error) {
            Logger.error('Error handling queue end:', error);
        }
    }

    /**
     * Play a track in a voice channel
     * @param {VoiceChannel} voiceChannel - The voice channel to join
     * @param {string} query - The track query (URL or search terms)
     * @param {Interaction} interaction - The interaction that triggered the play command
     * @param {Object} options - Additional options for playback
     * @returns {Promise<Object>} - Queue and track information
     */
    async play(voiceChannel, query, interaction, skipSearch = false, options = {}) {
        try {
            const { playTop = false, skipCurrent = false } = options;
            
            const botVC = interaction.guild.members.me.voice.channel;
            if (botVC) {
                if (voiceChannel.id !== botVC.id) {
                    return { success: false, message: 'You must be in the same voice channel as the bot to play music.' };
                }
            }
            
            const guildId = interaction.guild.id;
            let existingQueueData = null;
            let existingNowPlayingData = null;
            
            try {
                existingQueueData = await MusicQueue.findOne({ guildId });
                if (existingQueueData) {
                    
                    if (existingQueueData.nowPlayingMessageId && existingQueueData.nowPlayingChannelId) {
                        existingNowPlayingData = {
                            messageId: existingQueueData.nowPlayingMessageId,
                            channelId: existingQueueData.nowPlayingChannelId
                        };
                    }
                }
            } catch (error) {
                Logger.error(`Error checking for existing queue: ${error}`);
            }
            
            let result;
            if (skipSearch === true && typeof query === 'object' && query.tracks && query.tracks.length > 0) {
                result = query;
            } else {
                result = await this.player.search(query, {
                    requestedBy: interaction.user,
                    searchEngine: 'spotifySearch'
                }).catch(error => {
                    Logger.error(`Search error: ${error}`);
                    return null;
                });
            }
            
            if (!result || result.tracks.length === 0) {
                return { success: false, message: getMusicLang('Errors.NoResults', { query: typeof query === 'string' ? query : 'the provided input' }) };
            }
            
            const queue = this.player.nodes.create(interaction.guild, {
                metadata: {
                    channel: interaction.channel,
                    client: interaction.guild.members.me,
                    guild: interaction.guild,
                    requestedBy: interaction.user,
                    nowPlayingMessages: []
                },
                volume: global.config.Music?.DefaultVolume || 80,
                leaveOnEmpty: global.config.Music?.LeaveOnEmpty === true,
                leaveOnEmptyCooldown: global.config.Music?.LeaveEmptyDelay || 60000,
                leaveOnEnd: global.config.Music?.LeaveOnEnd === true,
                leaveOnStop: global.config.Music?.LeaveOnEnd === true,
                leaveOnEndCooldown: global.config.Music?.LeaveEndDelay || 300000,
                skipOnNoStream: true,
                connectionTimeout: 60000,
                bufferingTimeout: 30000,
                pauseOnEmpty: global.config.Music?.AutoPause !== false,
                selfDeaf: true,
                nodeOptions: {
                    leaveOnEmptyCooldown: global.config.Music?.LeaveEmptyDelay || 60000,
                    leaveOnEndCooldown: global.config.Music?.LeaveEndDelay || 300000,
                }
            });
            
            
            if (!queue.connection) {
                await queue.connect(voiceChannel);
            }
            
            const maxQueueSize = global.config.Music?.MaxQueueSize || 100;
            
            if (result.playlist) {
                const tracks = result.tracks;
                
                if (queue.tracks.size + tracks.length > maxQueueSize) {
                    const availableSpace = Math.max(0, maxQueueSize - queue.tracks.size);
                    const tracksToAdd = tracks.slice(0, availableSpace);
                    
                    if (playTop) {
                        for (let i = tracksToAdd.length - 1; i >= 0; i--) {
                            queue.insertTrack(tracksToAdd[i]);
                        }
                    } else {
                        queue.addTrack(tracksToAdd);
                    }
                    
                    if (!queue.isPlaying()) {
                        await queue.node.play();
                    } else if (skipCurrent) {
                        await queue.node.skip();
                    }
                    
                    return {
                        success: true,
                        message: `Added ${tracksToAdd.length} tracks to the queue`,
                        playlist: result.playlist,
                        tracks: tracksToAdd,
                        limitReached: true
                    };
                } else {
                    if (playTop) {
                        for (let i = tracks.length - 1; i >= 0; i--) {
                            queue.insertTrack(tracks[i]);
                        }
                    } else {
                        queue.addTrack(tracks);
                    }
                    
                    if (!queue.isPlaying()) {
                        await queue.node.play();
                    } else if (skipCurrent) {
                        await queue.node.skip();
                    }
                    
                    return {
                        success: true,
                        message: `Added ${tracks.length} tracks to the queue`,
                        playlist: result.playlist,
                        tracks: tracks
                    };
                }
            } else {
                const track = result.tracks[0];
                
                if (queue.tracks.size >= maxQueueSize) {
                    return {
                        success: false,
                        message: `Cannot add track: Queue size limit reached`,
                        limitReached: true
                    };
                }
                
                if (playTop) {
                    queue.insertTrack(track);
                } else {
                    queue.addTrack(track);
                }
                
                if (!queue.isPlaying()) {
                    await queue.node.play();
                } else if (skipCurrent) {
                    await queue.node.skip();
                }
                
                return {
                    success: true,
                    message: `Song Queued`,
                    track: track
                };
            }
        } catch (error) {
            Logger.error(`Error in play method: ${error}`);
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    async fixDuplicateQueues() {
        try {
            
            const allQueues = await MusicQueue.find({});
            
            const queuesByGuild = {};
            for (const queue of allQueues) {
                if (!queuesByGuild[queue.guildId]) {
                    queuesByGuild[queue.guildId] = [];
                }
                queuesByGuild[queue.guildId].push(queue);
            }
            
            let fixedCount = 0;
            let totalDuplicates = 0;
            
            for (const [guildId, queues] of Object.entries(queuesByGuild)) {
                if (queues.length > 1) {
                    totalDuplicates += queues.length - 1;
                    
                    queues.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    
                    const keepQueue = queues[0];
                    
                    let mergedQueue = { ...keepQueue.toObject() };
                    
                    if (!mergedQueue.currentTrack && mergedQueue.queue && mergedQueue.queue.length > 0) {
                        mergedQueue.currentTrack = mergedQueue.queue.shift();
                    }
                    
                    for (let i = 1; i < queues.length; i++) {
                        const dupQueue = queues[i].toObject();
                        
                        if (!mergedQueue.currentTrack && dupQueue.currentTrack) {
                            mergedQueue.currentTrack = dupQueue.currentTrack;
                        }
                        
                        if (dupQueue.queue && dupQueue.queue.length > 0) {
                            const existingTrackUrls = new Set(
                                mergedQueue.queue.map(track => track.url)
                            );
                            
                            for (const track of dupQueue.queue) {
                                if (!existingTrackUrls.has(track.url)) {
                                    mergedQueue.queue.push(track);
                                    existingTrackUrls.add(track.url);
                                }
                            }
                        }
                    }
                    
                    await MusicQueue.deleteMany({ guildId });
                    
                    await MusicQueue.create(mergedQueue);
                    
                    fixedCount++;
                }
            }
            
            return { fixedGuilds: fixedCount, totalDuplicates };
        } catch (error) {
            Logger.error(`Error fixing duplicate queues: ${error}`);
            return { error: error.message };
        }
    }

    async cleanMusicQueues() {
        try {
            const result = await MusicQueue.deleteMany({});
            return result.deletedCount;
        } catch (error) {
            Logger.error(`Failed to clean up music queues: ${error}`);
            return 0;
        }
    }

    patchQueueSettings(queue) {
        try {
            if (!queue) return;
            
            
            queue._customLeaveOnEnd = global.config.Music?.LeaveOnEnd === true;
            queue._customLeaveOnEmpty = global.config.Music?.LeaveOnEmpty === true;
            queue._customLeaveEndDelay = global.config.Music?.LeaveEndDelay || 300000;
            queue._customLeaveEmptyDelay = global.config.Music?.LeaveEmptyDelay || 60000;
            
            queue.once('connectionCreate', (connection) => {
                if (!connection) return;
                
                
                try {
                    if (!connection._originalDisconnect && connection.disconnect) {
                        connection._originalDisconnect = connection.disconnect;
                        
                        connection.disconnect = () => {
                            if (!queue._customLeaveOnEnd && !queue._customLeaveOnEmpty) {
                                return;
                            }
                            
                            return connection._originalDisconnect();
                        };
                    }
                    
                    if (connection.voiceConnection) {
                        const checkAndClearTimeouts = () => {
                            if (!queue._customLeaveOnEmpty) {
                                if (connection._emptyTimeout) {
                                    clearTimeout(connection._emptyTimeout);
                                    connection._emptyTimeout = null;
                                }
                            }
                            
                            if (!queue._customLeaveOnEnd) {
                                if (connection._endTimeout) {
                                    clearTimeout(connection._endTimeout);
                                    connection._endTimeout = null;
                                }
                            }
                        };
                        
                        checkAndClearTimeouts();
                        
                        const intervalId = setInterval(checkAndClearTimeouts, 5000);
                        
                        connection._leaveCheckInterval = intervalId;
                        
                        const originalDestroy = connection.destroy;
                        connection.destroy = function(...args) {
                            if (this._leaveCheckInterval) {
                                clearInterval(this._leaveCheckInterval);
                                this._leaveCheckInterval = null;
                            }
                            
                            return originalDestroy.apply(this, args);
                        };
                    }
                } catch (error) {
                    Logger.error(`Error patching voice connection: ${error}`);
                }
            });
            
            if (queue.connection) {
                try {
                    
                    const connection = queue.connection;
                    
                    if (!connection._originalDisconnect && connection.disconnect) {
                        connection._originalDisconnect = connection.disconnect;
                        
                        connection.disconnect = () => {
                            if (!queue._customLeaveOnEnd && !queue._customLeaveOnEmpty) {
                                return;
                            }
                            
                            return connection._originalDisconnect();
                        };
                    }
                    
                    if (!queue._customLeaveOnEmpty) {
                        if (connection._emptyTimeout) {
                            clearTimeout(connection._emptyTimeout);
                            connection._emptyTimeout = null;
                        }
                    }
                    
                    if (!queue._customLeaveOnEnd) {
                        if (connection._endTimeout) {
                            clearTimeout(connection._endTimeout);
                            connection._endTimeout = null;
                        }
                    }
                } catch (error) {
                    Logger.error(`Error patching existing voice connection: ${error}`);
                }
            }
        } catch (error) {
            Logger.error(`Error in patchQueueSettings: ${error}`);
        }
    }

    applyVoiceConnectionPatches() {
        try {
            const { Logger } = require('../../../utils/core/logger');
            
            if (this._patchedVoiceStateUpdateHandlers) {
                this._patchedVoiceStateUpdateHandlers.forEach(handler => {
                    if (this.client && handler) {
                        this.client.off('voiceStateUpdate', handler);
                    }
                });
            }
            this._patchedVoiceStateUpdateHandlers = [];
            
            try {
                const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
                global.voiceChannelConfigs = global.voiceChannelConfigs || new Map();
                
                if (!global.originalJoinVoiceChannel) {
                    global.originalJoinVoiceChannel = joinVoiceChannel;
                }
                
                global.patchedJoinVoiceChannel = function(config) {
                    if (config && config.guildId) {
                        global.voiceChannelConfigs.set(config.guildId, config);
                    }
                    return global.originalJoinVoiceChannel(config);
                };
                
                global.joinVoiceChannel = global.patchedJoinVoiceChannel;
                
            } catch (error) {
                Logger.error(`Failed to patch discord-player directly: ${error}`);
            }
            
            try {
                if (this.client && this.client.on) {
                    const voiceStateHandler = (oldState, newState) => {
                        if (oldState.member.id !== this.client.user.id && newState.member.id !== this.client.user.id) {
                            return;
                        }
                        
                        if (oldState.channel && !newState.channel) {
                            
                            if (global.config.Music?.LeaveOnEmpty === false) {
                                try {
                                    const player = this.player;
                                    if (!player) return;
                                    
                                    const guild = oldState.guild;
                                    const queue = player.nodes.get(guild.id);
                                    
                                    if (queue) {
                                        setTimeout(async () => {
                                            try {
                                                if (oldState.channel.joinable) {
                                                    await queue.connect(oldState.channel);
                                                }
                                            } catch (error) {
                                                Logger.error(`Error reconnecting to voice channel: ${error}`);
                                            }
                                        }, 1000);
                                    }
                                } catch (error) {
                                    Logger.error(`Error in voice state reconnect handler: ${error}`);
                                }
                            }
                        }
                    };
                    
                    this.client.on('voiceStateUpdate', voiceStateHandler);
                    this._patchedVoiceStateUpdateHandlers = this._patchedVoiceStateUpdateHandlers || [];
                    this._patchedVoiceStateUpdateHandlers.push(voiceStateHandler);
                    
                }
            } catch (error) {
                Logger.error(`Failed to patch voice state handler: ${error}`);
            }
        } catch (error) {
            Logger.error(`Error applying voice connection patches: ${error}`);
        }
    }

    async saveNowPlayingMessage(guildId, messageId, channelId, queue = null) {
        try {
            if (!guildId || !messageId || !channelId) return;
            
            const existingQueue = await MusicQueue.findOne({ guildId });
            
            if (existingQueue) {
                existingQueue.nowPlayingMessageId = messageId;
                existingQueue.nowPlayingChannelId = channelId;
                existingQueue.updatedAt = new Date();
                await existingQueue.save();
            } else {
                await MusicQueue.create({
                    guildId,
                    nowPlayingMessageId: messageId,
                    nowPlayingChannelId: channelId,
                    textChannelId: channelId,
                    updatedAt: new Date()
                });
            }
            
        } catch (error) {
            Logger.error(`Error saving nowPlaying message to MongoDB: ${error}`);
        }
    }

    async createNowPlayingCanvas(queue, track) {
        let progress = 0;
        let currentLabel = '0:00';
        
        const formatMs = (ms) => {
            if (!ms || ms <= 0) return null;
            const totalSecs = Math.floor(ms / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        
        Logger.debug(`[NowPlaying] Track info: title="${track?.title}", url="${track?.url?.substring(0, 60)}..."`);
        Logger.debug(`[NowPlaying] Track duration fields: duration="${track?.duration}", durationMS=${track?.durationMS}`);
        Logger.debug(`[NowPlaying] Track raw fields: raw.duration="${track?.raw?.duration}", raw.durationMS=${track?.raw?.durationMS}`);
        
        const getDuration = () => {
            if (track?.duration && track.duration !== '0:00' && track.duration !== '00:00') return track.duration;
            if (track?.durationMS > 0) return formatMs(track.durationMS);
            if (track?.raw?.duration) return track.raw.duration;
            if (track?.raw?.durationMS > 0) return formatMs(track.raw.durationMS);
            return null;
        };
        
        let totalLabel = getDuration() || '0:00';
        let trackDurationMS = track?.durationMS || 0;
        
        Logger.debug(`[NowPlaying] Initial totalLabel="${totalLabel}", checking if Deezer URL...`);
        
        if (totalLabel === '0:00' && track?.url && isDeezerTrackUrl(track.url)) {
            Logger.debug('[NowPlaying] Duration is 0:00 and is Deezer URL, fetching from API...');
            try {
                const deezerInfo = await getDeezerTrackInfo(track.url);
                Logger.debug(`[NowPlaying] Deezer API returned: ${JSON.stringify(deezerInfo)}`);
                if (deezerInfo?.duration) {
                    totalLabel = deezerInfo.duration;
                    trackDurationMS = deezerInfo.durationMS || 0;
                    Logger.debug(`[NowPlaying] Updated totalLabel="${totalLabel}" from Deezer API`);
                }
            } catch (e) {
                Logger.error(`[NowPlaying] Error fetching Deezer info: ${e.message}`);
            }
        }
        
        try {
            const timestamp = queue.node.getTimestamp();
            Logger.debug(`[NowPlaying] Timestamp: current=${timestamp?.current?.value}ms (${timestamp?.current?.label}), total=${timestamp?.total?.value}ms (${timestamp?.total?.label})`);
            if (timestamp && timestamp.total && timestamp.total.value > 0) {
                progress = Math.min(timestamp.current.value / timestamp.total.value, 1);
                currentLabel = timestamp.current.label || '0:00';
                if (timestamp.total.label && timestamp.total.label !== '0:00' && timestamp.total.label !== '00:00') {
                    totalLabel = timestamp.total.label;
                    Logger.debug(`[NowPlaying] Using timestamp.total.label="${totalLabel}"`);
                } else if (totalLabel === '0:00') {
                    totalLabel = formatMs(timestamp.total.value) || '0:00';
                    Logger.debug(`[NowPlaying] Calculated totalLabel="${totalLabel}" from timestamp.total.value`);
                }
            } else if (trackDurationMS > 0) {
                const playbackTime = queue.node.streamTime || 0;
                progress = Math.min(playbackTime / trackDurationMS, 1);
                const currentSecs = Math.floor(playbackTime / 1000);
                const currentMins = Math.floor(currentSecs / 60);
                currentLabel = `${currentMins}:${(currentSecs % 60).toString().padStart(2, '0')}`;
            }
        } catch (err) {
            Logger.error(`[NowPlaying] Error getting timestamp: ${err.message}`);
        }
        
        Logger.debug(`[NowPlaying] Final display: currentLabel="${currentLabel}", totalLabel="${totalLabel}", progress=${progress}`);
        
        if (isNaN(progress) || !isFinite(progress)) progress = 0;
        
        const canvasWidth = 500;
        const canvasHeight = 100;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        ctx.save();
        ctx.fillStyle = '#0d0d0d';
        ctx.beginPath();
        ctx.roundRect(0, 0, canvasWidth, canvasHeight, 12);
        ctx.fill();
        ctx.restore();
        
        const imageSize = 56;
        const imageX = 22;
        const imageY = (canvasHeight - imageSize) / 2;
        
        let thumbnail;
        try {
            let thumbnailUrl = track?.thumbnail || 'https://i.imgur.com/AfFp7pu.png';
            
            if (thumbnailUrl?.includes('ytimg.com')) {
                const match = thumbnailUrl.match(/\/vi(?:_webp)?\/([^\/]+)\//);
                if (match?.[1]) {
                    thumbnailUrl = `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
                }
            }
            
            if (thumbnailUrl?.endsWith('.webp')) {
                thumbnailUrl = thumbnailUrl.replace('.webp', '.jpg');
            }
            
            thumbnail = await loadImage(thumbnailUrl);
        } catch (error) {
            thumbnail = await loadImage('https://i.imgur.com/AfFp7pu.png');
        }
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(imageX, imageY, imageSize, imageSize, 8);
        ctx.clip();
        
        const imgWidth = thumbnail.width;
        const imgHeight = thumbnail.height;
        const minDimension = Math.min(imgWidth, imgHeight);
        const sourceX = (imgWidth - minDimension) / 2;
        const sourceY = (imgHeight - minDimension) / 2;
        
        ctx.drawImage(
            thumbnail,
            sourceX, sourceY, minDimension, minDimension,
            imageX, imageY, imageSize, imageSize
        );
        ctx.restore();
        
        const textX = imageX + imageSize + 16;
        const maxTextWidth = canvasWidth - textX - 20;
        
        ctx.save();
        ctx.font = '600 16px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        
        let displayTitle = track?.title || 'Unknown';
        if (ctx.measureText(displayTitle).width > maxTextWidth) {
            while (ctx.measureText(displayTitle + '...').width > maxTextWidth && displayTitle.length > 0) {
                displayTitle = displayTitle.slice(0, -1);
            }
            displayTitle += '...';
        }
        ctx.fillText(displayTitle, textX, 32);
        ctx.restore();
        
        ctx.save();
        ctx.font = '400 13px sans-serif';
        ctx.fillStyle = '#888';
        ctx.textBaseline = 'middle';
        ctx.fillText(track?.author || 'Unknown', textX, 50);
        ctx.restore();
        
        const barY = 72;
        const barHeight = 4;
        const barX = textX;
        const barWidth = maxTextWidth;
        
        ctx.save();
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 2);
        ctx.fill();
        ctx.restore();
        
        ctx.save();
        ctx.fillStyle = '#1db954';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth * progress, barHeight, 2);
        ctx.fill();
        ctx.restore();
        
        ctx.save();
        ctx.font = '400 11px sans-serif';
        ctx.fillStyle = '#666';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentLabel, barX, barY + 14);
        ctx.textAlign = 'right';
        ctx.fillText(totalLabel, barX + barWidth, barY + 14);
        ctx.restore();
        
        return canvas;
    }

    setupConnectionPatching() {
        try {
            const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
            const { useQueue } = require('discord-player');
            const { Logger } = require('../../../utils/core/logger');
            
            this._voiceStateUpdateHandlers = this._voiceStateUpdateHandlers || [];
            
            const guildJoinConfigs = new Map();
            
            if (!global.originalJoinVoiceChannel) {
                global.originalJoinVoiceChannel = joinVoiceChannel;
            }
            
            global.joinVoiceChannel = function(config) {
                if (config && config.guildId) {
                    guildJoinConfigs.set(config.guildId, config);
                }
                
                return global.originalJoinVoiceChannel(config);
            };
            
            if (this._voiceStateUpdateHandlers.length > 0) {
                this._voiceStateUpdateHandlers.forEach(handler => {
                    if (this.client && handler) {
                        this.client.off('voiceStateUpdate', handler);
                    }
                });
                this._voiceStateUpdateHandlers = [];
            }
            
            const voiceStateHandler = (oldState, newState) => {
                if (oldState.member.id !== this.client.user.id) return;

                if (oldState.channel && !newState.channel) {
                    const queue = useQueue(oldState.guild.id);
                    if (!queue) return;

                    const leaveOnEmpty = queue.node.options?.leaveOnEmpty !== false;
                    const leaveOnEnd = queue.node.options?.leaveOnEnd !== false;

                    if ((!leaveOnEmpty || !leaveOnEnd) && (queue.isPlaying() || queue.tracks.data.length > 0)) {
                        const config = guildJoinConfigs.get(oldState.guild.id);
                        if (config) {
                            setTimeout(() => {
                                try {
                                    global.joinVoiceChannel(config);
                                } catch (err) {
                                    Logger.error(`Failed to reconnect after voice state update: ${err.message}`);
                                }
                            }, 5000);
                        }
                    }
                }
            };
            
            this.client.on('voiceStateUpdate', voiceStateHandler);
            this._voiceStateUpdateHandlers.push(voiceStateHandler);
            
        } catch (error) {
            Logger.error(`Failed to setup connection patching: ${error.message}`);
        }
    }

    patchNewConnection(connection) {
        try {
            if (!connection || connection._customPatched) return;
            
            connection._customPatched = true;
            
            if (global.connectionsPatcher && typeof global.connectionsPatcher.patchConnection === 'function') {
                if (connection.voiceConnection) {
                    global.connectionsPatcher.patchConnection(connection.voiceConnection);
                }
            }
            
            if (connection.disconnect && typeof connection.disconnect === 'function') {
                if (!connection._originalDisconnect) {
                    connection._originalDisconnect = connection.disconnect;
                    
                    connection.disconnect = () => {
                        const leaveOnEmpty = global.config.Music?.LeaveOnEmpty === true;
                        const leaveOnEnd = global.config.Music?.LeaveOnEnd === true;
                        
                        
                        if (!leaveOnEmpty && !leaveOnEnd) {
                            return null;
                        }
                        
                        return connection._originalDisconnect();
                    };
                    
                }
            }
        } catch (error) {
            Logger.error(`Error patching new connection: ${error}`);
        }
    }

    /**
     * Handle a button interaction for music controls
     * @param {ButtonInteraction} interaction The Discord.js button interaction
     * @returns {Promise<void>}
     */
    async handleButtonInteraction(interaction) {
        try {
            
            const buttonAction = interaction.customId.split('_')[1];
            
            if (buttonAction === 'play') {
                return this.handlePlayButton(interaction);
            }
            
            const queue = this.player.nodes.get(interaction.guildId);
            
            if (!queue || !queue.connection) {
                return await interaction.followUp({
                    content: '? There is no active music queue.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            switch (buttonAction) {
                case 'playpause':
                    await this.handlePlayPauseButton(interaction, queue);
                    break;
                case 'skip':
                    await this.handleSkipButton(interaction, queue);
                    break;
                case 'previous':
                    await this.handlePreviousButton(interaction, queue);
                    break;
                case 'stop':
                    await this.handleStopButton(interaction, queue);
                    break;
                case 'loop':
                    await this.handleLoopButton(interaction, queue);
                    break;
                case 'shuffle':
                    await this.handleShuffleButton(interaction, queue);
                    break;
                case 'volume':
                    try {
                        
                        const volumeRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('music_volumedown')
                                .setEmoji('🔉')
                                .setLabel('-10%')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('music_volumeup')
                                .setEmoji('🔊')
                                .setLabel('+10%')
                                .setStyle(ButtonStyle.Secondary)
                        );
                        
                        await interaction.followUp({
                            content: `🔊 Current volume: **${queue.node.volume}%**\nUse the buttons below to adjust:`,
                            components: [volumeRow],
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (error) {
                        Logger.error(`Error showing volume controls: ${error.stack || error}`);
                    }
                    break;
                case 'volumeup':
                    await this.handleVolumeUpButton(interaction, queue);
                    break;
                case 'volumedown':
                    await this.handleVolumeDownButton(interaction, queue);
                    break;
                default:
                    await interaction.followUp({
                        content: '? Unknown music button action.',
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            Logger.error(`Error handling music button interaction: ${error.stack || error}`);
            
            try {
                if (interaction.deferred || interaction.replied) {
                    return interaction.followUp({
                        content: `? Error performing music action: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                } else {
                    return interaction.reply({
                        content: `? Error performing music action: ${error.message}`,
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            } catch (finalError) {
                Logger.error(`Failed to send final error message: ${finalError}`);
            }
        }
    }

    /**
     * Handle play modal button
     */
    async handlePlayButton(interaction) {
        try {
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({
                    content: '? You need to be in a voice channel to play music.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const modal = new ModalBuilder()
                .setCustomId('music_play_search')
                .setTitle('Play Music');
            
            const songInput = new TextInputBuilder()
                .setCustomId('song_query')
                .setLabel("Enter a song name or URL")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Never Gonna Give You Up')
                .setRequired(true);
            
            const firstActionRow = new ActionRowBuilder().addComponents(songInput);
            modal.addComponents(firstActionRow);
            
            await interaction.showModal(modal);
        } catch (error) {
            Logger.error(`Error showing play music modal: ${error.stack || error}`);
            if (!interaction.replied) {
                await interaction.reply({
                    content: `? Failed to open play dialog: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }

    /**
     * Handle play/pause button
     */
    async handlePlayPauseButton(interaction, queue) {
        try {
            if (queue.node.isPaused()) {
                queue.node.resume();
                await interaction.followUp({
                    content: getMusicLang('Success.Resumed'),
                    flags: MessageFlags.Ephemeral
                });
            } else {
                queue.node.pause();
                await interaction.followUp({
                    content: getMusicLang('Success.Paused'),
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            Logger.error(`Error toggling playback: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to toggle playback: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle skip button
     */
    async handleSkipButton(interaction, queue) {
        try {
            if (!queue.isPlaying()) {
                return await interaction.followUp({
                    content: '? Nothing is currently playing.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const currentTrack = queue.currentTrack;
            
            await queue.node.skip();
            
            return await interaction.followUp({
                content: `⏭️ Skipped **${currentTrack?.title || 'current track'}**`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error skipping track: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to skip track: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle previous button
     */
    async handlePreviousButton(interaction, queue) {
        try {
            if (!queue.isPlaying()) {
                return await interaction.followUp({
                    content: '? Nothing is currently playing.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (!queue.history || !queue.history.previousTrack) {
                return await interaction.followUp({
                    content: '? There is no previous track in the history.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const previousTrackTitle = queue.history.previousTrack?.title || 'previous track';
            
            await queue.history.back();
            
            return await interaction.followUp({
                content: `⏮️ Going back to **${previousTrackTitle}**`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error going to previous track: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to go to previous track: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle stop button
     */
    async handleStopButton(interaction, queue) {
        try {
            const hasMoreTracks = queue.tracks.size > 0;
            
            const channel = interaction.channel;
            
            if (queue.metadata?.nowPlayingMessages?.length > 0 && channel) {
                try {
                    const messageId = queue.metadata.nowPlayingMessages[queue.metadata.nowPlayingMessages.length - 1];
                    const message = await channel.messages.fetch(messageId).catch(() => null);
                    
                    if (message && !hasMoreTracks) {
                        
                        const emptyCanvas = await this.createEmptyNowPlayingCanvas();
                        const tempFile = createTempFile('np_empty', '.png');
                        fs.writeFileSync(tempFile, emptyCanvas.toBuffer());
                        
                        await message.edit({
                            content: null,
                            embeds: [],
                            components: [],
                            files: [{
                                attachment: tempFile,
                                name: path.basename(tempFile)
                            }]
                        });
                        
                        setTimeout(() => {
                            try {
                                fs.unlinkSync(tempFile);
                            } catch (error) {
                            }
                        }, 5000);
                    }
                } catch (error) {
                }
            }
            
            queue.delete();

            await interaction.followUp({
                content: getMusicLang('Success.Stopped'),
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error stopping playback: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to stop playback: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    /**
     * Handle loop button
     */
    async handleLoopButton(interaction, queue) {
        try {
            const { QueueRepeatMode } = require('discord-player');
            const currentMode = queue.repeatMode;
            
            let newMode;
            let modeText;
            
            if (currentMode === QueueRepeatMode.OFF) {
                newMode = QueueRepeatMode.TRACK;
                modeText = 'Repeating current track';
            } else if (currentMode === QueueRepeatMode.TRACK) {
                newMode = QueueRepeatMode.QUEUE;
                modeText = 'Repeating entire queue';
            } else {
                newMode = QueueRepeatMode.OFF;
                modeText = 'Loop mode disabled';
            }

            queue.setRepeatMode(newMode);

            return await interaction.followUp({
                content: `🔁 ${modeText}`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error setting loop mode: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to set loop mode: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async handleShuffleButton(interaction, queue) {
        try {
            if (queue.tracks.size === 0) {
                return await interaction.followUp({
                    content: '? There are no tracks in the queue to shuffle.',
                    flags: MessageFlags.Ephemeral
                });
            }

            queue.tracks.shuffle();
            
            return await interaction.followUp({
                content: `🔀 Shuffled the queue (${queue.tracks.size} tracks)`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error shuffling queue: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to shuffle queue: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async handlePlayModalSubmit(interaction) {
        try {
            const query = interaction.fields.getTextInputValue('song_query');

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const memberVC = interaction.member.voice.channel;
            if (!memberVC) {
                return interaction.editReply('? You need to be in a voice channel to play music.');
            }

            const botVC = interaction.guild.members.me.voice.channel;
            if (botVC) {
                if (memberVC.id !== botVC.id) {
                    return interaction.editReply('? You must be in the same voice channel as the bot to play music.');
                }
            }
            

            try {
                const fuzzyResult = await searchWithFuzzy(query, interaction.user);
                
                if (!fuzzyResult.success) {
                    let errorMessage = getMusicLang('Errors.NoResults', { query });
                    
                    if (fuzzyResult.suggestions && fuzzyResult.suggestions.length > 0) {
                        errorMessage += `\n\n🎵 **Did you mean:**\n`;
                        fuzzyResult.suggestions.forEach((suggestion, index) => {
                            errorMessage += `• ${suggestion.title}\n`;
                        });
                    }
                    
                    return interaction.editReply(errorMessage);
                }

                const result = await this.play(memberVC, fuzzyResult.result, interaction, true, { playTop: false, skipCurrent: false });
                
                let successMessage = `✅ Song Queued`;
                if (fuzzyResult.type === 'fuzzy') {
                    successMessage += `\n🎯 *Found similar match for your search*`;
                }
                
                if (result.success) {
                    return interaction.editReply(successMessage);
                } else {
                    return interaction.editReply(`❌ ${result.message || 'An error occurred while playing the song.'}`);
                }
            } catch (error) {
                Logger.error(`Error searching for tracks: ${error.stack || error}`);
                return interaction.editReply(`❌ Error searching for tracks: ${error.message}`);
            }
        } catch (error) {
            Logger.error(`Error in modal music play handler: ${error.stack || error}`);
            try {
                if (interaction.deferred) {
                    return interaction.editReply('? An error occurred while trying to play music.');
                } else {
                    return interaction.reply({
                        content: '? An error occurred while trying to play music.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (responseError) {
                Logger.error(`Failed to respond with error: ${responseError}`);
            }
        }
    }

    async handleQueueNavigation(interaction, queue, action) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            let currentPage = 1;
            
            if (interaction.message.embeds[0] && interaction.message.embeds[0].footer) {
                const footerText = interaction.message.embeds[0].footer.text;
                const pageMatch = footerText.match(/Page (\d+)\/(\d+)/);
                
                if (pageMatch) {
                    currentPage = parseInt(pageMatch[1]);
                    const totalPages = parseInt(pageMatch[2]);
                    
                    if (action === 'prev') {
                        currentPage = Math.max(1, currentPage - 1);
                    } else if (action === 'next') {
                        currentPage = Math.min(totalPages, currentPage + 1);
                    }
                }
            }

            await this.displayQueuePage(interaction, queue, currentPage);
        } catch (error) {
            Logger.error(`Error in handleQueueNavigation: ${error.stack || error}`);
            await interaction.followUp({
                content: `? Failed to navigate queue: ${error.message}`,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }

    async displayQueuePage(interaction, queue, page) {
        try {
            const tracksPerPage = 10;
            const tracks = queue.tracks.toArray();
            const totalPages = Math.max(Math.ceil(tracks.length / tracksPerPage), 1);

            const validPage = Math.min(Math.max(page, 1), totalPages);

            const startIndex = (validPage - 1) * tracksPerPage;
            const endIndex = Math.min(startIndex + tracksPerPage, tracks.length);

            const parseDuration = (duration) => {
                if (!duration) return 0;
                const parts = duration.split(':').map(Number);
                if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                }
                return 0;
            };

            const formatDuration = (seconds) => {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                if (hours > 0) {
                    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                }
                return `${minutes}:${secs.toString().padStart(2, '0')}`;
            };

            const formatMs = (ms) => {
                const totalSecs = Math.floor(ms / 1000);
                const mins = Math.floor(totalSecs / 60);
                const secs = totalSecs % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            };

            const currentTrack = queue.currentTrack;
            let currentTrackDuration = currentTrack.duration || (currentTrack.durationMS > 0 ? formatMs(currentTrack.durationMS) : '0:00');
            
            if (currentTrackDuration === '0:00' && isDeezerTrackUrl(currentTrack.url)) {
                try {
                    const deezerInfo = await getDeezerTrackInfo(currentTrack.url);
                    if (deezerInfo?.duration) currentTrackDuration = deezerInfo.duration;
                } catch (e) {}
            }
            
            const currentDuration = parseDuration(currentTrackDuration);
            const totalQueueDuration = tracks.reduce((acc, track) => {
                const dur = track.duration || (track.durationMS > 0 ? formatMs(track.durationMS) : '0:00');
                return acc + parseDuration(dur);
            }, currentDuration);

            let currentTrackRequestedBy = 'Unknown';
            if (currentTrack.requestedBy) {
                if (currentTrack.requestedBy.id === 'autoloop') {
                    currentTrackRequestedBy = '🔄 Auto Loop';
                } else if (currentTrack.requestedBy.id) {
                    currentTrackRequestedBy = `<@${currentTrack.requestedBy.id}>`;
                } else if (typeof currentTrack.requestedBy === 'string') {
                    currentTrackRequestedBy = currentTrack.requestedBy;
                } else if (currentTrack.requestedBy.username) {
                    currentTrackRequestedBy = currentTrack.requestedBy.username;
                }
            }

            let progressBar = '';
            if (global.config.Music.ShowProgressBar) {
                try {
                    const timestamp = queue.node.getTimestamp();
                    if (timestamp && timestamp.total && timestamp.total.value > 0) {
                        const barLength = 20;
                        const progress = Math.min(timestamp.current.value / timestamp.total.value, 1);
                        const filled = Math.floor(progress * barLength);
                        const empty = barLength - filled;
                        progressBar = `\n${'▰'.repeat(filled)}${'▱'.repeat(empty)} \`${timestamp.current.label}/${timestamp.total.label}\``;
                    }
                } catch (e) {}
            }

            let description = '';
            if (tracks.length === 0) {
                description = '```\nNo upcoming tracks in the queue.\n```';
            } else {
                description = tracks.slice(startIndex, endIndex).map((track, i) => {
                    let requestedBy = '';
                    if (track.requestedBy) {
                        if (track.requestedBy.id === 'autoloop') {
                            requestedBy = '🔄';
                        } else if (track.requestedBy.id) {
                            requestedBy = `👤`;
                        } else if (typeof track.requestedBy === 'string') {
                            requestedBy = track.requestedBy;
                        } else if (track.requestedBy.username) {
                            requestedBy = track.requestedBy.username;
                        }
                    }
                    
                    const trackDuration = track.duration || (track.durationMS > 0 ? formatMs(track.durationMS) : '0:00');
                    const number = `${startIndex + i + 1}`.padStart(2, '0');
                    return `\`${number}.\` [${track.title}](${track.url})\n     \`⏱️ ${trackDuration}\` ${requestedBy}`;
                }).join('\n');
            }

            const autoLoopStatus = this.getAutoLoopStatus(interaction.guild.id);
            const autoLoopText = autoLoopStatus ? ' • 🔄 Auto Loop Active' : '';

            const embed = new EmbedBuilder()
                .setColor(parseInt(global.config.Music.EmbedColor?.replace('#', '') || '5865F2', 16))
                .setAuthor({ 
                    name: '🎵 Music Queue',
                    iconURL: interaction.guild.iconURL()
                })
                .addFields(
                    {
                        name: '🎧 Now Playing',
                        value: `**[${currentTrack.title}](${currentTrack.url})**\n\`⏱️ ${currentTrackDuration}\` • ${currentTrackRequestedBy}${progressBar}`,
                        inline: false
                    },
                    {
                        name: `📋 Upcoming Tracks (${tracks.length})`,
                        value: description || 'None',
                        inline: false
                    }
                )
                .setFooter({ 
                    text: `Page ${validPage}/${totalPages} • Total Duration: ${formatDuration(totalQueueDuration)}${autoLoopText}`
                });

            const components = [];
            if (totalPages > 1) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('queue_prev')
                        .setEmoji('⏮️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(validPage === 1),
                    new ButtonBuilder()
                        .setCustomId('queue_page')
                        .setLabel(`${validPage} / ${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('queue_next')
                        .setEmoji('⏭️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(validPage === totalPages),
                    new ButtonBuilder()
                        .setCustomId('queue_refresh')
                        .setEmoji('🔄')
                        .setStyle(ButtonStyle.Secondary)
                );
                components.push(row);
            }

            await interaction.editReply({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            Logger.error(`Error in displayQueuePage: ${error}`);
            throw error;
        }
    }

    createProgressBar(current, total, length = 15, filledChar = '?', emptyChar = '?') {
        if (!total || total === 0) return emptyChar.repeat(length);
        
        const progress = Math.min(Math.max(current / total, 0), 1);
        const filledLength = Math.round(length * progress);
        const emptyLength = length - filledLength;
        
        return filledChar.repeat(filledLength) + emptyChar.repeat(emptyLength);
    }

    async handleVolumeUpButton(interaction, queue) {
        try {
            const currentVolume = queue.node.volume;

            const newVolume = Math.min(currentVolume + 10, 100);

            queue.node.setVolume(newVolume);
            
            return await interaction.followUp({
                content: `🔊 Volume increased to ${newVolume}%`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error increasing volume: ${error.stack || error}`);
            try {
                await interaction.followUp({
                    content: `? Failed to increase volume: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (followUpError) {
                Logger.error(`Failed to send follow-up message: ${followUpError}`);
            }
        }
    }

    async handleVolumeDownButton(interaction, queue) {
        try {
            const currentVolume = queue.node.volume;

            const newVolume = Math.max(currentVolume - 10, 0);

            queue.node.setVolume(newVolume);
            
            return await interaction.followUp({
                content: `🔉 Volume decreased to ${newVolume}%`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            Logger.error(`Error decreasing volume: ${error.stack || error}`);
            try {
                await interaction.followUp({
                    content: `? Failed to decrease volume: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (followUpError) {
                Logger.error(`Failed to send follow-up message: ${followUpError}`);
            }
        }
    }

    cleanupEventListeners() {
        try {
            for (const [name, intervalId] of this.activeTimers.entries()) {
                clearInterval(intervalId);
            }
            this.activeTimers.clear();

            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }

            if (tempCleanupInterval) {
                clearInterval(tempCleanupInterval);
            }

            if (this.autoSaveInterval) {
                clearInterval(this.autoSaveInterval);
                this.autoSaveInterval = null;
            }

            if (this._voiceStateUpdateHandlers && this._voiceStateUpdateHandlers.length > 0) {
                this._voiceStateUpdateHandlers.forEach(handler => {
                    if (this.client && handler) {
                        this.client.off('voiceStateUpdate', handler);
                    }
                });
                this._voiceStateUpdateHandlers = [];
            }
            
            if (this._patchedVoiceStateUpdateHandlers && this._patchedVoiceStateUpdateHandlers.length > 0) {
                this._patchedVoiceStateUpdateHandlers.forEach(handler => {
                    if (this.client && handler) {
                        this.client.off('voiceStateUpdate', handler);
                    }
                });
                this._patchedVoiceStateUpdateHandlers = [];
            }

            this.playerMessages.clear();
            this.updateIntervals.clear();

        } catch (error) {
            console.error('Error cleaning up music manager:', error);
        }
    }

    async createAndSendEmptyNowPlaying(channel, guild) {
        try {
            if (!channel || !channel.isTextBased()) {
                return null;
            }
            
            const emptyCanvas = await this.createEmptyNowPlayingCanvas();
            const tempFile = createTempFile('np_empty', '.png');
            fs.writeFileSync(tempFile, emptyCanvas.toBuffer());

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_play')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
            );

            const message = await channel.send({
                embeds: [],
                components: [row],
                files: [{
                    attachment: tempFile,
                    name: path.basename(tempFile)
                }]
            });

            setTimeout(() => {
                try { fs.unlinkSync(tempFile); } catch {}
            }, 5000);

            if (guild) {
                await this.saveNowPlayingMessage(guild.id, message.id, channel.id);
            }

            return message;
        } catch (error) {
            Logger.error(`Error creating empty now playing: ${error}`);
            return null;
        }
    }

    async enableAutoLoop(queue) {
        try {
            return await this.autoLoopManager.enableAutoLoop(queue);
        } catch (error) {
            Logger.error(`Error enabling auto-loop: ${error}`);
            return false;
        }
    }

    async disableAutoLoop(queue) {
        try {
            return await this.autoLoopManager.disableAutoLoop(queue);
        } catch (error) {
            Logger.error(`Error disabling auto-loop: ${error}`);
            return false;
        }
    }

    isAutoLoopEnabled(guildId) {
        return this.autoLoopManager.isAutoLoopEnabled(guildId);
    }

    getAutoLoopStatus(guildId) {
        return this.autoLoopManager.getAutoLoopStatus(guildId);
    }

    cleanupDataStructures() {
        try {
            if (this.playerMessages.size > 100) {
                const entries = Array.from(this.playerMessages.entries());
                const toDelete = entries.slice(0, Math.floor(entries.length / 3));
                for (const [guildId] of toDelete) {
                    this.playerMessages.delete(guildId);
                }
            }
            
            if (this.updateIntervals.size > 50) {
                const entries = Array.from(this.updateIntervals.entries());
                const toDelete = entries.slice(0, Math.floor(entries.length / 2));
                for (const [guildId, interval] of toDelete) {
                    clearInterval(interval);
                    this.updateIntervals.delete(guildId);
                }
            }
            
            if (global.musicData && global.musicData.nowPlayingMessages) {
                const messageKeys = Object.keys(global.musicData.nowPlayingMessages);
                if (messageKeys.length > 100) {
                    const toDelete = messageKeys.slice(0, Math.floor(messageKeys.length / 3));
                    for (const key of toDelete) {
                        delete global.musicData.nowPlayingMessages[key];
                    }
                }
            }
            
            if (global.voiceChannelConfigs && global.voiceChannelConfigs instanceof Map) {
                if (global.voiceChannelConfigs.size > 100) {
                    const currentGuildIds = this.client ? new Set(this.client.guilds.cache.keys()) : new Set();
                    for (const [guildId] of global.voiceChannelConfigs.entries()) {
                        if (!currentGuildIds.has(guildId)) {
                            global.voiceChannelConfigs.delete(guildId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error in music manager cleanup:', error);
        }
    }
    
    _originalCleanupDataStructures() {
        try {
            for (const [guildId, messages] of this.playerMessages.entries()) {
                if (messages.length > 5) {
                    const toKeep = messages.slice(-5);
                    this.playerMessages.set(guildId, toKeep);
                }
            }

            const activeGuilds = new Set(this.player?.nodes?.cache?.keys() || []);
            for (const [guildId, intervalId] of this.updateIntervals.entries()) {
                if (!activeGuilds.has(guildId)) {
                    clearInterval(intervalId);
                    this.updateIntervals.delete(guildId);
                }
            }

            if (this._processedTracks && this._processedTracks.size > 1000) {
                this._processedTracks.clear();
            }

        } catch (error) {
            Logger.error(`Error in music manager cleanup: ${error}`);
        }
    }

    registerTimer(name, intervalId) {
        if (this.activeTimers.has(name)) {
            clearInterval(this.activeTimers.get(name));
        }
        this.activeTimers.set(name, intervalId);
        return intervalId;
    }
}

function getMusicManager(client = null, emitAddonEvent = null) {
    if (_instance) {
        return _instance;
    }

    if (client) {
        _instance = new MusicManager(client, emitAddonEvent);
        return _instance;
        }

    return null;
}

module.exports = { MusicManager, getMusicManager };
