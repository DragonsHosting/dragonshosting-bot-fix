const { useMainPlayer } = require('discord-player');
const { findSimilarSongsLive, getDurationMs, isUnwantedResult } = require('./fuzzySearch');
const { Logger } = require('../../../utils/core/logger');

const MIN_SONG_DURATION_MS = 45000;

class AutoLoopManager {
    constructor() {
        this.activeAutoLoops = new Map();
        this.autoLoopHistory = new Map();
        this.queueMonitors = new Map();
        this.addingSongsLock = new Map();
    }

    async enableAutoLoop(queue) {
        const guildId = queue.guild.id;
        
        this.activeAutoLoops.set(guildId, {
            enabled: true,
            guildId: guildId,
            lastAddedTime: Date.now(),
            addedCount: 0,
            preferences: {
                targetQueueSize: 10,
                triggerThreshold: 8,
                cooldownMs: 15000
            }
        });

        if (!this.autoLoopHistory.has(guildId)) {
            this.autoLoopHistory.set(guildId, []);
        }

        this.startQueueMonitoring(queue);
        return true;
    }

    async disableAutoLoop(queue) {
        const guildId = queue.guild.id;
        
        this.activeAutoLoops.delete(guildId);
        this.addingSongsLock.delete(guildId);
        this.stopQueueMonitoring(guildId);
        return true;
    }

    isAutoLoopEnabled(guildId) {
        return this.activeAutoLoops.has(guildId);
    }

    startQueueMonitoring(queue) {
        const guildId = queue.guild.id;
        
        if (this.queueMonitors.has(guildId)) {
            clearInterval(this.queueMonitors.get(guildId));
        }

        const monitorInterval = setInterval(async () => {
            try {
                if (!this.activeAutoLoops.has(guildId)) {
                    this.stopQueueMonitoring(guildId);
                    return;
                }

                const { getMusicManager } = require('./musicManager');
                const musicManager = getMusicManager();
                if (!musicManager) return;

                const currentQueue = musicManager.player.nodes.get(guildId);
                if (!currentQueue) {
                    this.stopQueueMonitoring(guildId);
                    return;
                }

                const queueSize = currentQueue.tracks.size;
                const autoLoopConfig = this.activeAutoLoops.get(guildId);
                
                if (queueSize <= autoLoopConfig.preferences.triggerThreshold) {
                    await this.addSimilarSongs(currentQueue);
                }
            } catch (error) {
                Logger.error(`Error in auto-loop monitoring for guild ${guildId}: ${error}`);
            }
        }, 8000);

        this.queueMonitors.set(guildId, monitorInterval);
    }

    stopQueueMonitoring(guildId) {
        if (this.queueMonitors.has(guildId)) {
            clearInterval(this.queueMonitors.get(guildId));
            this.queueMonitors.delete(guildId);
        }
    }

    async addSimilarSongs(queue) {
        const guildId = queue.guild.id;
        const autoLoopConfig = this.activeAutoLoops.get(guildId);
        
        if (!autoLoopConfig) return;

        if (this.addingSongsLock.get(guildId)) {
            return;
        }

        const now = Date.now();
        const timeSinceLastAdd = now - autoLoopConfig.lastAddedTime;
        const cooldownMs = autoLoopConfig.preferences.cooldownMs;
        
        const currentQueueSize = queue.tracks.size;
        const adjustedCooldown = currentQueueSize <= 1 ? Math.min(cooldownMs, 5000) : cooldownMs;
        
        if (timeSinceLastAdd < adjustedCooldown) {
            return;
        }

        this.addingSongsLock.set(guildId, true);

        try {
            const history = this.autoLoopHistory.get(guildId) || [];
            const currentTrack = queue.currentTrack;
            const queueTracks = queue.tracks.toArray();
            const recentTracks = [currentTrack, ...queueTracks.slice(0, 5)].filter(Boolean);

            if (recentTracks.length === 0) {
                return;
            }

            const seedTracks = this.selectSeedTracks(recentTracks, history);
            
            if (seedTracks.length === 0) {
                return;
            }

            const existingTrackSet = this.buildTrackDedupeSet(history, queueTracks, currentTrack);
            const similarSongs = await this.findSimilarSongs(seedTracks, existingTrackSet);
            
            if (similarSongs.length === 0) {
                return;
            }

            const targetSize = autoLoopConfig.preferences.targetQueueSize;
            const neededSongs = Math.max(1, targetSize - currentQueueSize);
            const songsToAdd = Math.min(neededSongs, similarSongs.length, 3);
            let addedCount = 0;

            for (let i = 0; i < songsToAdd; i++) {
                try {
                    const song = similarSongs[i];
                    const player = useMainPlayer();
                    
                    const searchResult = await player.search(song.searchQuery, {
                        requestedBy: { 
                            id: 'autoloop', 
                            username: 'Auto-Loop',
                            bot: true,
                            displayName: 'Auto-Loop'
                        },
                        searchEngine: 'spotifySearch'
                    });

                    if (searchResult?.tracks?.length > 0) {
                        const validTrack = searchResult.tracks.find(t => {
                            const duration = getDurationMs(t);
                            return (duration === 0 || duration >= MIN_SONG_DURATION_MS) && !isUnwantedResult(t);
                        }) || searchResult.tracks[0];
                        
                        if (!validTrack.requestedBy || typeof validTrack.requestedBy !== 'object') {
                            validTrack.requestedBy = { 
                                id: 'autoloop', 
                                username: 'Auto-Loop',
                                bot: true,
                                displayName: 'Auto-Loop'
                            };
                        }
                        
                        queue.addTrack(validTrack);
                        history.push({
                            title: song.title,
                            artist: song.artist,
                            addedAt: now,
                            similarity: song.similarity
                        });
                        addedCount++;
                    }
                } catch (error) {
                    Logger.error(`Error adding similar song: ${error}`);
                }
            }

            if (addedCount > 0) {
                autoLoopConfig.lastAddedTime = now;
                autoLoopConfig.addedCount += addedCount;
                
                this.autoLoopHistory.set(guildId, history.slice(-50));
            }

        } catch (error) {
            Logger.error(`Error in addSimilarSongs for guild ${guildId}: ${error}`);
        } finally {
            this.addingSongsLock.delete(guildId);
        }
    }

    buildTrackDedupeSet(history, queueTracks, currentTrack) {
        const trackSet = new Set();
        
        history.forEach(h => {
            trackSet.add(this.normalizeTrackKey(h.artist, h.title));
        });
        
        queueTracks.forEach(track => {
            const artist = track.author || '';
            const title = track.title || '';
            trackSet.add(this.normalizeTrackKey(artist, title));
        });
        
        if (currentTrack) {
            const artist = currentTrack.author || '';
            const title = currentTrack.title || '';
            trackSet.add(this.normalizeTrackKey(artist, title));
        }
        
        return trackSet;
    }

    normalizeTrackKey(artist, title) {
        return `${artist.toLowerCase().trim()} ${title.toLowerCase().trim()}`.replace(/[^\w\s]/g, '');
    }

    selectSeedTracks(recentTracks, history) {
        const recentHistory = history.slice(-10);
        const preferredSeeds = [];
        const fallbackSeeds = [];
        
        for (const track of recentTracks) {
            const trackArtist = track.author || '';
            const trackTitle = track.title || '';
            
            const isRecent = recentHistory.some(h => 
                h.artist.toLowerCase() === trackArtist.toLowerCase() &&
                h.title.toLowerCase() === trackTitle.toLowerCase()
            );
            
            if (!isRecent && !track.requestedBy?.bot) {
                preferredSeeds.push(track);
            } else {
                fallbackSeeds.push(track);
            }
        }
        
        return [...preferredSeeds, ...fallbackSeeds].slice(0, 3);
    }

    async findSimilarSongs(seedTracks, existingTrackSet) {
        const allSimilar = [];
        const recentArtists = seedTracks.slice(0, 3).map(t => 
            (t.author || '').toLowerCase()
        );
        
        for (const track of seedTracks.slice(0, 2)) {
            try {
                const similar = await findSimilarSongsLive(track, 8, existingTrackSet);
                allSimilar.push(...similar);
            } catch (error) {
                Logger.error(`Error finding similar songs for ${track.title}: ${error}`);
            }
        }

        const uniqueSongs = new Map();
        for (const song of allSimilar) {
            const songKey = this.normalizeTrackKey(song.artist, song.title);
            if (!existingTrackSet.has(songKey)) {
                if (!uniqueSongs.has(songKey) || uniqueSongs.get(songKey).similarity < song.similarity) {
                    uniqueSongs.set(songKey, song);
                }
            }
        }

        const filteredSongs = Array.from(uniqueSongs.values());
        
        filteredSongs.forEach(song => {
            const artistLower = song.artist.toLowerCase();
            const artistRepeatCount = recentArtists.filter(a => 
                artistLower.includes(a) || a.includes(artistLower)
            ).length;
            
            let diversityScore = 1.0;
            if (artistRepeatCount > 0) {
                diversityScore -= Math.min(0.6, 0.3 * artistRepeatCount);
            }
            
            song.diversityScore = Math.max(0.1, diversityScore);
            song.finalScore = (song.similarity * 0.5) + (song.diversityScore * 0.5);
        });

        const sortedSongs = filteredSongs.sort((a, b) => b.finalScore - a.finalScore);
        
        const selectedSongs = [];
        const artistCounts = new Map();
        const maxPerArtist = 2;
        
        for (const song of sortedSongs.slice(0, 20)) {
            const artistLower = song.artist.toLowerCase();
            const currentCount = artistCounts.get(artistLower) || 0;
            
            if (currentCount < maxPerArtist) {
                selectedSongs.push(song);
                artistCounts.set(artistLower, currentCount + 1);
            }
            
            if (selectedSongs.length >= 12) break;
        }
        
        for (let i = selectedSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [selectedSongs[i], selectedSongs[j]] = [selectedSongs[j], selectedSongs[i]];
        }

        return selectedSongs.slice(0, 6);
    }

    getAutoLoopStatus(guildId) {
        const config = this.activeAutoLoops.get(guildId);
        if (!config) return null;

        const history = this.autoLoopHistory.get(guildId) || [];
        
        return {
            enabled: true,
            addedCount: config.addedCount,
            targetQueueSize: config.preferences.targetQueueSize,
            cooldownRemaining: Math.max(0, 
                config.preferences.cooldownMs - (Date.now() - config.lastAddedTime)
            ),
            recentlyAdded: history.slice(-3).map(h => `${h.artist} - ${h.title}`)
        };
    }

    cleanup() {
        for (const [, interval] of this.queueMonitors) {
            clearInterval(interval);
        }
        this.queueMonitors.clear();
        this.activeAutoLoops.clear();
        this.autoLoopHistory.clear();
        this.addingSongsLock.clear();
    }
}

module.exports = new AutoLoopManager();
