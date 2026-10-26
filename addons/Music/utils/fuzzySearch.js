const { useMainPlayer } = require('discord-player');

const MIN_SONG_DURATION_MS = 45000;
const MAX_SONG_DURATION_MS = 900000;

const UNWANTED_TITLE_PATTERNS = [
    /sound\s*effect/i,
    /\bsfx\b/i,
    /ringtone/i,
    /1\s*hour\s*(loop|version|mix)?/i,
    /10\s*hour/i,
    /\breaction\b/i,
    /\breview\b/i,
    /\btutorial\b/i,
    /\bhow\s*to\b/i,
];

function getDurationMs(track) {
    if (track.durationMS) return track.durationMS;
    if (!track.duration) return 0;
    
    const parts = track.duration.split(':').map(Number);
    if (parts.length === 3) {
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    } else if (parts.length === 2) {
        return (parts[0] * 60 + parts[1]) * 1000;
    }
    return 0;
}

function isUnwantedResult(track) {
    const title = (track.title || '').toLowerCase();
    
    for (const pattern of UNWANTED_TITLE_PATTERNS) {
        if (pattern.test(title)) {
            return true;
        }
    }
    
    return false;
}

function scoreTrack(track, originalQuery) {
    let score = 100;
    const title = (track.title || '').toLowerCase();
    const author = (track.author || '').toLowerCase();
    const queryLower = originalQuery.toLowerCase().trim();
    
    const durationMs = getDurationMs(track);
    if (durationMs > 0 && durationMs < MIN_SONG_DURATION_MS) {
        score -= 50;
    } else if (durationMs > MAX_SONG_DURATION_MS) {
        score -= 30;
    }
    
    if (isUnwantedResult(track)) {
        score -= 80;
    }
    
    const combined = `${author} ${title}`.toLowerCase();
    if (combined.includes(queryLower)) {
        score += 40;
    }
    
    const queryWords = queryLower.split(/[\s\-]+/).filter(w => w.length > 1);
    let matchedWords = 0;
    for (const word of queryWords) {
        if (combined.includes(word)) matchedWords++;
    }
    if (queryWords.length > 0) {
        score += (matchedWords / queryWords.length) * 30;
    }
    
    return score;
}

function selectBestTrack(tracks, originalQuery) {
    if (!tracks || tracks.length === 0) return null;
    if (tracks.length === 1) return tracks[0];
    
    const validTracks = tracks.filter(t => {
        const duration = getDurationMs(t);
        return duration === 0 || duration >= MIN_SONG_DURATION_MS;
    });
    
    if (validTracks.length === 0) {
        return tracks[0];
    }
    
    const scoredTracks = validTracks.map(track => ({
        track,
        score: scoreTrack(track, originalQuery)
    }));
    
    scoredTracks.sort((a, b) => b.score - a.score);
    
    return scoredTracks[0].track;
}

async function searchWithFuzzy(query, requestedBy) {
    const player = useMainPlayer();
    if (!player) return { success: false, error: 'Player not available' };
    
    try {
        let result = await player.search(query, {
            requestedBy,
            searchEngine: 'spotifySearch'
        });
        
        if (result?.tracks?.length > 0) {
            if (result.tracks.length > 1) {
                const bestTrack = selectBestTrack(result.tracks, query);
                if (bestTrack && bestTrack !== result.tracks[0]) {
                    const reordered = [bestTrack, ...result.tracks.filter(t => t.url !== bestTrack.url)];
                    return { 
                        success: true, 
                        result: { ...result, tracks: reordered },
                        type: 'spotify'
                    };
                }
            }
            return { success: true, result, type: 'spotify' };
        }
        
        result = await player.search(query, {
            requestedBy,
            searchEngine: 'soundcloud'
        });
        
        if (result?.tracks?.length > 0) {
            return { success: true, result, type: 'soundcloud' };
        }
        
        result = await player.search(query, { requestedBy });
        
        if (result?.tracks?.length > 0) {
            return { success: true, result, type: 'auto' };
        }
        
        return { success: false, suggestions: [] };
        
    } catch (error) {
        console.error('Error in searchWithFuzzy:', error);
        return { success: false, error: error.message };
    }
}

async function findSimilarSongsLive(seedTrack, limit = 5, excludeSet = new Set()) {
    const player = useMainPlayer();
    if (!player) return [];

    const artist = seedTrack.author || seedTrack.artist || '';
    const title = seedTrack.title || '';
    
    const searchQueries = [
        `${artist} songs`,
        `${artist} popular`,
        `${artist}`,
    ].filter(q => q.trim().length > 2);

    const foundTracks = [];
    const seenKeys = new Set();

    for (const query of searchQueries.slice(0, 2)) {
        try {
            const searchResult = await player.search(query, {
                requestedBy: { 
                    id: 'autoloop', 
                    username: 'Auto-Loop',
                    bot: true
                },
                searchEngine: 'spotifySearch'
            });

            if (searchResult?.tracks?.length > 0) {
                for (const track of searchResult.tracks.slice(0, 10)) {
                    const durationMs = getDurationMs(track);
                    if (durationMs > 0 && durationMs < MIN_SONG_DURATION_MS) {
                        continue;
                    }
                    if (isUnwantedResult(track)) {
                        continue;
                    }
                    
                    const trackKey = normalizeString(`${track.author} ${track.title}`);
                    const seedKey = normalizeString(`${artist} ${title}`);
                    
                    if (!excludeSet.has(trackKey) && !seenKeys.has(trackKey) && trackKey !== seedKey) {
                        foundTracks.push({
                            artist: track.author,
                            title: track.title,
                            searchQuery: `${track.author} ${track.title}`,
                            url: track.url,
                            similarity: 0.8,
                            source: query
                        });
                        seenKeys.add(trackKey);
                    }
                }
            }
        } catch (error) {
            continue;
        }

        if (foundTracks.length >= limit * 2) break;
    }

    for (let i = foundTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [foundTracks[i], foundTracks[j]] = [foundTracks[j], foundTracks[i]];
    }

    return foundTracks.slice(0, limit);
}

function normalizeString(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    searchWithFuzzy,
    findSimilarSongsLive,
    normalizeString,
    getDurationMs,
    isUnwantedResult,
    scoreTrack,
    selectBestTrack
};
