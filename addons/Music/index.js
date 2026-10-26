'use strict';

module.exports = {
    name: 'Music',
    version: '1.0.0',
    description: 'Music player, queue persistence and radio streaming',
    async run(client, eventManager, api) {
        const config = api.config || global.config || {};
                const { Player } = require('discord-player');
        const { DefaultExtractors } = require('@discord-player/extractor');
        const { DeezerExtractor } = require('discord-player-deezer');
        const { Logger } = require('../../utils/core/logger');

        let player = null;

        process.env.DISCORD_PLAYER_SILENCE_WARNINGS = 'true';

        player = new Player(client, {
            skipFFmpeg: false, 
            lagMonitor: 1000,
            connectionTimeout: 60000,
            leaveOnEnd: config.Music?.LeaveOnEnd === true,
            leaveOnStop: config.Music?.LeaveOnEnd === true,
            leaveOnEmpty: config.Music?.LeaveOnEmpty === true,
            leaveOnEmptyCooldown: config.Music?.LeaveEmptyDelay || 60000,
            ytdlOptions: {
                quality: 'highestaudio',
                highWaterMark: 1 << 25,
                dlChunkSize: 0,
            },
        });

        global.player = player;

        async function registerExtractors() {
            try {
                if (config.Music?.DeezerDecryptionKey && config.Music?.DeezerARLCookie) {
                    await player.extractors.register(DeezerExtractor, {
                        decryptionKey: config.Music.DeezerDecryptionKey,
                        arl: config.Music.DeezerARLCookie
                    });
                    Logger.debug('Deezer extractor loaded');
                }
                
                await player.extractors.loadMulti(DefaultExtractors);
                
                Logger.debug('Music extractors loaded successfully');
            } catch (error) {
                Logger.error('Failed to load music extractors:', error);
            }
        }

        player.events.on('playerStart', (queue, track) => {
            if (queue.metadata?.lastTrackId === track.id) return;
            queue.metadata.lastTrackId = track.id;
            queue.metadata.channel?.send(`🎵 Now playing: **${track.title}** by **${track.author}**`);
        });

        player.events.on('error', (queue, error) => {
            Logger.error(`Player error: ${error.message}`);
            
            if (queue && !queue.deleted) {
                try {
                    if (queue.tracks.size > 0) {
                        setTimeout(() => {
                            if (!queue.deleted) {
                                queue.node.skip().catch(() => {});
                            }
                        }, 500);
                    }
                } catch (e) {
                    Logger.error(`Error recovering from player error: ${e.message}`);
                }
            }
        });

        player.events.on('playerError', (queue, error) => {
            Logger.error(`Playback error: ${error.message}`);
            
            const skipableErrors = [
                'Could not extract stream',
                'aborted',
                'Sign in to confirm',
                'age-restricted',
                'not available',
                'Video unavailable',
                '410',
                'private video',
                'removed by the uploader',
                'copyright',
                'ERR_NO_RESULT',
                'Could not find any stream',
                'No streams found',
                'Status code: 4'
            ];
            
            const connectionErrors = [
                'EPIPE',
                'ECONNRESET',
                'premature close',
                'ETIMEDOUT',
                'ENOTFOUND',
                'RequestContentLengthMismatchError',
                'ERR_CONTENT_LENGTH_MISMATCH',
                'network',
                'socket hang up'
            ];
            
            const isSkipableError = skipableErrors.some(e => error.message.toLowerCase().includes(e.toLowerCase()));
            const isConnectionError = connectionErrors.some(e => error.message.toLowerCase().includes(e.toLowerCase()));
            
            if (isSkipableError) {
                queue.metadata.channel?.send(`⚠️ Couldn't play **${queue.currentTrack?.title || 'this track'}** - Skipping to next track...`).catch(() => {});
                try {
                if (queue.tracks.size > 0) {
                        queue.node.skip().catch(() => {});
                    } else if (!queue.deleted) {
                    queue.delete();
                    }
                } catch (e) {
                    Logger.error(`Error skipping track: ${e.message}`);
                }
            } else if (isConnectionError) {
                Logger.warn(`Stream connection issue, attempting to recover...`);
                try {
                    if (queue.currentTrack && !queue.deleted) {
                        setTimeout(async () => {
                            try {
                                if (!queue.deleted && queue.tracks.size > 0) {
                                    await queue.node.skip();
                                } else if (!queue.deleted && queue.currentTrack) {
                        const currentTime = queue.node.streamTime || 0;
                                    await queue.node.seek(Math.max(0, currentTime - 2000));
                                }
                            } catch (recoverError) {
                                Logger.error(`Failed to recover stream: ${recoverError.message}`);
                                if (queue.tracks.size > 0 && !queue.deleted) {
                                    queue.node.skip().catch(() => {});
                                }
                            }
                        }, 1000);
                    }
                } catch (seekError) {
                    Logger.error(`Failed to recover stream: ${seekError.message}`);
                }
            } else {
                queue.metadata.channel?.send(`⚠️ Error playing track, skipping...`).catch(() => {});
                try {
                    if (queue.tracks.size > 0 && !queue.deleted) {
                        queue.node.skip().catch(() => {});
                    }
                } catch (e) {
                    Logger.error(`Error handling unknown playerError: ${e.message}`);
                }
            }
        });

        player.events.on('connectionError', (queue, error) => {
            Logger.error(`Connection error: ${error.message}`);
            
            if (queue && !queue.deleted && queue.connection) {
                setTimeout(async () => {
                    try {
                        if (!queue.deleted && queue.metadata?.guild) {
                            const voiceChannel = queue.metadata.guild.members.me?.voice?.channel;
                            if (voiceChannel && !queue.connection?.state?.status !== 'ready') {
                                await queue.connect(voiceChannel);
                                Logger.debug(`Reconnected to voice channel after connection error`);
                                if (queue.currentTrack && !queue.isPlaying()) {
                                    await queue.node.play();
                                }
                            }
                        }
                    } catch (reconnectError) {
                        Logger.error(`Failed to reconnect: ${reconnectError.message}`);
                    }
                }, 2000);
            }
        });

        const playCommand = require('./commands/play');
        const controlsCommand = require('./commands/controls');
        api.registerModel('MusicQueue', require('./models/musicQueue'));
        api.registerCommand(playCommand, global.config?.Music?.Enabled !== false);
        api.registerCommand(controlsCommand, global.config?.Music?.Enabled !== false);

        const initialize = async () => {
            await registerExtractors();
            if (!global.MusicManager) {
                const { getMusicManager } = require('./utils/musicManager');
                global.MusicManager = getMusicManager(client, (eventName, payload) => api.emit(eventName, payload));
            }
            const { startRadio24x7 } = require('./utils/radio24x7');
            await startRadio24x7(client);
            api.registerService('music.manager', global.MusicManager);
        };

        if (client.isReady?.()) initialize().catch(error => Logger.error(`Music startup failed: ${error.stack || error}`));
        else client.once('clientReady', () => initialize().catch(error => Logger.error(`Music startup failed: ${error.stack || error}`)));

        const musicInteraction = require('./events/musicInteraction');
        api.onDiscord('interactionCreate', async ({ interaction }) => {
            if (!interaction?.customId || !(interaction.customId.startsWith('music_') || interaction.customId.startsWith('queue_'))) return false;
            await musicInteraction(client, interaction);
            return true;
        });

        return () => {
            global.MusicManager?.cleanupEventListeners?.();
            if (global.player === player) global.player = null;
            player?.destroy?.();
        };
    }
};
