const { request } = require('undici');

function cleanYouTubeTitle(title) {
    if (!title) return null;
    
    let cleaned = title;
    
    const patternsToRemove = [
        /\(official\s*(music\s*)?(video|audio|clip|videoclip)?\)/gi,
        /\[official\s*(music\s*)?(video|audio|clip|videoclip)?\]/gi,
        /\(videoclip\)/gi,
        /\[videoclip\]/gi,
        /\(video\s*clip\)/gi,
        /\[video\s*clip\]/gi,
        /\(lyric\s*video\)/gi,
        /\[lyric\s*video\]/gi,
        /\(lyrics?\)/gi,
        /\[lyrics?\]/gi,
        /\(audio\)/gi,
        /\[audio\]/gi,
        /\(music\s*video\)/gi,
        /\[music\s*video\]/gi,
        /\(clip\s*officiel\)/gi,
        /\[clip\s*officiel\]/gi,
        /\(ofici[aá]ln[iy]\s*video\)/gi,
        /\[ofici[aá]ln[iy]\s*video\]/gi,
        /\(official\)/gi,
        /\[official\]/gi,
        /\(oficjalne\s*wideo\)/gi,
        /\[oficjalne\s*wideo\]/gi,
        /\(clipe\s*oficial\)/gi,
        /\[clipe\s*oficial\]/gi,
        /\(video\s*oficial\)/gi,
        /\[video\s*oficial\]/gi,
        /\((hd|4k|1080p|720p|8k)\)/gi,
        /\[(hd|4k|1080p|720p|8k)\]/gi,
        /\(explicit\)/gi,
        /\[explicit\]/gi,
        /\(clean\s*version\)/gi,
        /\[clean\s*version\]/gi,
        /\(visuali[sz]er\)/gi,
        /\[visuali[sz]er\]/gi,
        /\(prod\.?\s*[^)]+\)/gi,
        /\(starring\s*[^)]+\)/gi,
        /\[starring\s*[^]]+\]/gi,
        /\(with\s*[^)]+\)/gi,
        /\[with\s*[^]]+\]/gi,
        /\(dir\.?\s*(by\s*)?[^)]+\)/gi,
        /\[dir\.?\s*(by\s*)?[^]]+\]/gi,
        /\(directed\s*by\s*[^)]+\)/gi,
        /\s*-\s*topic\s*$/i,
        /\s*vevo\s*$/i,
        /\|\s*[^|]+$/gi,
        /\s*\(feat\.?\s*[^)]+\)/gi,
        /\s*\[feat\.?\s*[^]]+\]/gi,
        /\s*\(ft\.?\s*[^)]+\)/gi,
        /\s*\[ft\.?\s*[^]]+\]/gi,
        /\s*ft\.?\s+[^(\[]+(?=\s*$|\s*\(|\s*\[)/gi,
    ];
    
    for (const pattern of patternsToRemove) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\s*-\s*$/, '');
    cleaned = cleaned.replace(/^\s*-\s*/, '');
    cleaned = cleaned.trim();
    
    return cleaned;
}

async function getYouTubeVideoTitle(url) {
    try {
        const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        if (!videoIdMatch) return null;
        
        const videoId = videoIdMatch[1];
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        
        const { statusCode, body } = await request(oembedUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (statusCode !== 200) return null;
        
        const data = await body.json();
        return cleanYouTubeTitle(data.title);
    } catch (error) {
        return null;
    }
}

function isYouTubeUrl(query) {
    return /(?:youtube\.com|youtu\.be)/.test(query);
}

module.exports = {
    getYouTubeVideoTitle,
    isYouTubeUrl,
    cleanYouTubeTitle
};
