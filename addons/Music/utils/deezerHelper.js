const { request } = require('undici');
const { Logger } = require('../../../utils/core/logger');

const deezerCache = new Map();
const CACHE_TTL = 3600000;

function isDeezerUrl(query) {
    return /deezer\.com\/(?:[a-z]{2}\/)?playlist\/\d+/.test(query);
}

function isDeezerTrackUrl(query) {
    if (!query) {
        Logger.debug('[Deezer] isDeezerTrackUrl called with empty query');
        return false;
    }
    const result = /deezer\.com\/(?:[a-z]{2}\/)?track\/\d+/.test(query);
    Logger.debug(`[Deezer] isDeezerTrackUrl("${query.substring(0, 50)}...") = ${result}`);
    return result;
}

function extractDeezerTrackId(url) {
    const match = url.match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/);
    return match ? match[1] : null;
}

function extractDeezerPlaylistId(url) {
    const match = url.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/);
    return match ? match[1] : null;
}

async function getDeezerTrackInfo(url) {
    try {
        Logger.debug(`[Deezer] getDeezerTrackInfo called with URL: ${url}`);
        
        const trackId = extractDeezerTrackId(url);
        if (!trackId) {
            Logger.debug('[Deezer] Could not extract track ID from URL');
            return null;
        }
        
        Logger.debug(`[Deezer] Extracted track ID: ${trackId}`);
        
        const cached = deezerCache.get(trackId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            Logger.debug(`[Deezer] Returning cached data for track ${trackId}: duration=${cached.data.duration}`);
            return cached.data;
        }
        
        const apiUrl = `https://api.deezer.com/track/${trackId}`;
        Logger.debug(`[Deezer] Fetching from API: ${apiUrl}`);
        
        const { statusCode, body } = await request(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        Logger.debug(`[Deezer] API response status: ${statusCode}`);
        
        if (statusCode !== 200) {
            Logger.debug('[Deezer] API returned non-200 status');
            return null;
        }
        
        const data = await body.json();
        Logger.debug(`[Deezer] API response: title=${data.title}, duration=${data.duration}s`);
        
        if (!data || data.error) {
            Logger.debug(`[Deezer] API error: ${JSON.stringify(data.error)}`);
            return null;
        }
        
        const durationSecs = data.duration || 0;
        const mins = Math.floor(durationSecs / 60);
        const secs = durationSecs % 60;
        
        const result = {
            title: data.title,
            artist: data.artist?.name,
            duration: `${mins}:${secs.toString().padStart(2, '0')}`,
            durationMS: durationSecs * 1000,
            thumbnail: data.album?.cover_big || data.album?.cover_medium
        };
        
        Logger.debug(`[Deezer] Parsed result: duration=${result.duration}, durationMS=${result.durationMS}`);
        
        deezerCache.set(trackId, { data: result, timestamp: Date.now() });
        
        return result;
    } catch (error) {
        Logger.error(`[Deezer] Error fetching track info: ${error.message}`);
        return null;
    }
}

async function getDeezerPlaylistTracks(url) {
    try {
        const playlistId = extractDeezerPlaylistId(url);
        if (!playlistId) return null;
        
        const apiUrl = `https://api.deezer.com/playlist/${playlistId}/tracks`;
        
        const { statusCode, body } = await request(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (statusCode !== 200) return null;
        
        const data = await body.json();
        
        if (!data.data || data.data.length === 0) return null;
        
        return data.data.map(track => ({
            title: track.title,
            artist: track.artist.name,
            searchQuery: `${track.artist.name} - ${track.title}`
        }));
    } catch (error) {
        console.error('[DEEZER HELPER] Error fetching playlist:', error);
        return null;
    }
}

async function getDeezerPlaylistInfo(url) {
    try {
        const playlistId = extractDeezerPlaylistId(url);
        if (!playlistId) return null;
        
        const apiUrl = `https://api.deezer.com/playlist/${playlistId}`;
        
        const { statusCode, body } = await request(apiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (statusCode !== 200) return null;
        
        const data = await body.json();
        
        return {
            title: data.title,
            description: data.description,
            trackCount: data.nb_tracks,
            creator: data.creator?.name || 'Unknown'
        };
    } catch (error) {
        console.error('[DEEZER HELPER] Error fetching playlist info:', error);
        return null;
    }
}

module.exports = {
    isDeezerUrl,
    isDeezerTrackUrl,
    extractDeezerPlaylistId,
    extractDeezerTrackId,
    getDeezerPlaylistTracks,
    getDeezerPlaylistInfo,
    getDeezerTrackInfo
};
