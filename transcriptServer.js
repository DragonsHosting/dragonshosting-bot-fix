/**
 * DragonsHosting Transcript Server
 * Runs alongside the Discord bot on the allocated port.
 * Transcripts are stored as JSON files in /transcripts/ folder.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    ensureTranscriptCollections,
    getTranscriptDocument,
    listMongoTranscriptSummaries,
    saveTranscriptDocument,
    wantsMongoTranscripts
} = require('./utils/mongoTranscripts');

const PORT = process.env.SERVER_PORT || process.env.PORT || 25590;
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');
const PUBLIC_DIR = path.join(__dirname, 'public');
const BASE_URL = process.env.TRANSCRIPT_BASE_URL || `http://node.blackdragons.nl:${PORT}`;
const TRANSCRIPT_SECRET = process.env.TRANSCRIPT_SECRET;
if (!TRANSCRIPT_SECRET) {
    throw new Error('Missing required TRANSCRIPT_SECRET environment variable');
}
const DEFAULT_DASHBOARD_GUILD_ID = process.env.DASHBOARD_GUILD_ID || process.env.GUILD_ID || '1482512038788993034';
let discordClient = null;
const MIME_TYPES = {
    '.html': 'text/html;charset=UTF-8',
    '.css': 'text/css;charset=UTF-8',
    '.js': 'application/javascript;charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json;charset=UTF-8',
};

const TICKET_CATEGORY_LABELS = {
    '1498280273098313808': 'General Questions',
    '1498280276319535134': 'Player Report',
    '1498280275178950880': 'Bug Support',
    '1498280274252005486': 'Unban Request',
};

// Ensure transcripts directory exists
if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
}

/**
 * Save a transcript and return the public URL
 */
async function saveTranscript(data) {
    const id = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(TRANSCRIPTS_DIR, `${id}.json`);
    const url = `${BASE_URL}/t/${id}`;
    const storedData = {
        ...data,
        transcriptId: id,
        url,
        closedAt: data.closedAt || new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(storedData, null, 2));

    try {
        await saveTranscriptDocument(id, storedData, url);
    } catch (error) {
        console.log(`[Transcript DB] MongoDB save failed for ${id}: ${error.message}`);
    }

    return url;
}

function setDiscordClient(client) {
    discordClient = client;
}

function writeJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json;charset=UTF-8',
        'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(payload));
}

function getTicketTypeFromCategory(parentId) {
    return TICKET_CATEGORY_LABELS[parentId] || 'Support';
}

function isTicketChannel(channel) {
    if (!channel) return false;
    const channelName = String(channel.name || '').toLowerCase();
    return channelName.startsWith('ticket-') ||
        Boolean(channel.parentId && TICKET_CATEGORY_LABELS[channel.parentId]);
}

function cleanTicketOwner(channelName) {
    return String(channelName || '')
        .replace(/^ticket-?/i, '')
        .replace(/[-_]+/g, ' ')
        .trim() || 'Unknown';
}

function dateValue(value) {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

function readTranscriptFile(id) {
    const safeId = String(id || '').replace(/[^a-f0-9]/gi, '');
    if (!safeId) return null;

    const filePath = path.join(TRANSCRIPTS_DIR, `${safeId}.json`);
    if (!fs.existsSync(filePath)) return null;

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function readTranscript(id) {
    try {
        const fileTranscript = readTranscriptFile(id);
        if (fileTranscript) return fileTranscript;
    } catch (error) {
        console.log(`[Transcript Server] Failed to read transcript file ${id}: ${error.message}`);
    }

    try {
        return await getTranscriptDocument(id);
    } catch (error) {
        console.log(`[Transcript DB] MongoDB read failed for ${id}: ${error.message}`);
        return null;
    }
}

function listTranscriptFileSummaries() {
    if (!fs.existsSync(TRANSCRIPTS_DIR)) return [];

    return fs.readdirSync(TRANSCRIPTS_DIR)
        .filter(file => /^[a-f0-9]+\.json$/i.test(file))
        .map(file => {
            const id = file.replace(/\.json$/i, '');
            const filePath = path.join(TRANSCRIPTS_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const messages = Array.isArray(data.messages) ? data.messages : [];
                const lastMessage = messages[messages.length - 1];
                const closedAt = data.closedAt || lastMessage?.timestamp || stats.mtime;

                return {
                    id,
                    status: 'closed',
                    channelName: data.channelName || `ticket-${id.slice(0, 6)}`,
                    ticketType: data.ticketType || 'Support',
                    createdBy: data.createdBy || 'Unknown',
                    closedBy: data.closedBy || 'Unknown',
                    createdAt: data.createdAt || null,
                    closedAt,
                    messageCount: messages.length,
                    url: `/t/${id}`,
                };
            } catch (err) {
                console.log(`[Dashboard] Skipped transcript ${file}: ${err.message}`);
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => dateValue(b.closedAt) - dateValue(a.closedAt));
}

async function listTranscriptSummaries() {
    const byId = new Map();

    try {
        for (const item of await listMongoTranscriptSummaries()) {
            byId.set(item.id, item);
        }
    } catch (error) {
        if (wantsMongoTranscripts()) {
            console.log(`[Transcript DB] MongoDB dashboard read failed: ${error.message}`);
        }
    }

    for (const item of listTranscriptFileSummaries()) {
        if (!byId.has(item.id)) byId.set(item.id, item);
    }

    return [...byId.values()].sort((a, b) => dateValue(b.closedAt) - dateValue(a.closedAt));
}

async function listOpenTicketChannels(guildId) {
    if (!discordClient || (typeof discordClient.isReady === 'function' && !discordClient.isReady())) {
        return { ready: false, tickets: [] };
    }

    const guild = discordClient.guilds.cache.get(guildId) ||
        await discordClient.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
        return { ready: false, tickets: [] };
    }

    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    const values = typeof channels.values === 'function'
        ? [...channels.values()]
        : [...guild.channels.cache.values()];

    const tickets = values
        .filter(isTicketChannel)
        .map(channel => ({
            id: channel.id,
            status: 'open',
            channelName: channel.name,
            ticketType: getTicketTypeFromCategory(channel.parentId),
            createdBy: cleanTicketOwner(channel.name),
            createdAt: channel.createdAt || null,
            lastActivityAt: channel.lastMessage?.createdAt || channel.createdAt || null,
            parentName: channel.parent?.name || null,
            url: `https://discord.com/channels/${guild.id}/${channel.id}`,
        }))
        .sort((a, b) => dateValue(b.lastActivityAt) - dateValue(a.lastActivityAt));

    return {
        ready: true,
        guild: {
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL ? guild.iconURL({ size: 128 }) : null,
        },
        tickets,
    };
}

async function getDashboardData(guildId) {
    const [openResult, transcripts] = await Promise.all([
        listOpenTicketChannels(guildId),
        listTranscriptSummaries(),
    ]);

    const messageTotal = transcripts.reduce((total, item) => total + (item.messageCount || 0), 0);

    return {
        guildId,
        ready: openResult.ready,
        guild: openResult.guild || { id: guildId, name: 'DragonsHosting', iconUrl: null },
        stats: {
            openTickets: openResult.tickets.length,
            closedTranscripts: transcripts.length,
            transcriptMessages: messageTotal,
            lastTranscriptAt: transcripts[0]?.closedAt || null,
        },
        openTickets: openResult.tickets,
        transcripts,
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Render a Discord-styled HTML transcript page
 */
function renderTranscript(data) {
    const { guildName, guildIcon, channelName, ticketType, createdBy, closedBy, createdAt, messages } = data;

    const messagesHtml = (messages || []).map(msg => {
        const time = new Date(msg.timestamp).toLocaleString('en-US', {
            month: '2-digit', day: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const avatarUrl = msg.avatarUrl ||
            `https://cdn.discordapp.com/embed/avatars/${parseInt(msg.authorId || '0') % 5}.png`;

        const embedsHtml = (msg.embeds || []).map(embed => {
            const color = embed.color
                ? `#${embed.color.toString(16).padStart(6, '0')}`
                : '#5865f2';
            const fieldsHtml = (embed.fields || []).map(f =>
                `<div class="embed-field ${f.inline ? 'inline' : ''}">
                    <div class="field-name">${escHtml(f.name)}</div>
                    <div class="field-value">${escHtml(f.value)}</div>
                </div>`
            ).join('');
            return `<div class="embed" style="border-left-color:${color}">
                ${embed.author ? `<div class="embed-author">${escHtml(embed.author.name || '')}</div>` : ''}
                ${embed.title ? `<div class="embed-title">${escHtml(embed.title)}</div>` : ''}
                ${embed.description ? `<div class="embed-desc">${escHtml(embed.description)}</div>` : ''}
                ${fieldsHtml}
                ${embed.thumbnail ? `<img class="embed-thumb" src="${embed.thumbnail.url}" alt="thumbnail">` : ''}
                ${embed.image ? `<img class="embed-img" src="${embed.image.url}" alt="image">` : ''}
                ${embed.footer ? `<div class="embed-footer">${escHtml(embed.footer.text || '')}</div>` : ''}
            </div>`;
        }).join('');

        const attachmentsHtml = (msg.attachments || []).map(att => {
            if (att.contentType && att.contentType.startsWith('image')) {
                return `<img class="attachment-img" src="${att.url}" alt="${escHtml(att.name)}">`;
            }
            return `<a class="attachment-file" href="${att.url}" target="_blank">📎 ${escHtml(att.name)}</a>`;
        }).join('');

        const botBadge = msg.isBot ? '<span class="bot-badge">BOT</span>' : '';
        const content = msg.content
            ? `<div class="msg-content">${formatContent(msg.content)}</div>`
            : '';

        return `<div class="message">
            <img class="avatar" src="${avatarUrl}" alt="${escHtml(msg.authorName)}"
                onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            <div class="msg-body">
                <div class="msg-header">
                    <span class="author" style="color:${msg.authorColor || '#ffffff'}">${escHtml(msg.authorName)}</span>
                    ${botBadge}
                    <span class="timestamp">${time}</span>
                </div>
                ${content}
                ${embedsHtml}
                ${attachmentsHtml}
            </div>
        </div>`;
    }).join('');

    const guildIconHtml = guildIcon
        ? `<img class="guild-icon" src="${guildIcon}" alt="${escHtml(guildName)}">`
        : `<div class="guild-icon-placeholder">${(guildName || 'S').charAt(0)}</div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escHtml(guildName || 'DragonsHosting')} - #${escHtml(channelName)}</title>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#313338;color:#dcddde;font-family:'gg sans','Noto Sans',Whitney,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.375}
        a{color:#00a8fc;text-decoration:none}
        a:hover{text-decoration:underline}

        .header{background:#2b2d31;padding:20px 24px;display:flex;align-items:center;gap:16px;border-bottom:2px solid #1e1f22;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.3)}
        .guild-icon{width:60px;height:60px;border-radius:50%;object-fit:cover}
        .guild-icon-placeholder{width:60px;height:60px;border-radius:50%;background:#5865f2;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff}
        .header-info{flex:1}
        .guild-name{font-size:18px;font-weight:700;color:#f2f3f5}
        .channel-name{font-size:14px;color:#949ba4;margin-top:2px}
        .ticket-closed-badge{display:inline-flex;align-items:center;gap:4px;background:#ed4245;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;margin-top:4px}

        .info-bar{background:#2b2d31;padding:10px 24px;display:flex;gap:20px;flex-wrap:wrap;border-bottom:1px solid #1e1f22;font-size:13px}
        .info-item{display:flex;gap:6px;align-items:center}
        .info-label{color:#949ba4}
        .info-value{color:#f2f3f5;font-weight:500}
        .type-badge{background:#5865f2;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}

        .messages{max-width:860px;margin:0 auto;padding:16px 16px 40px}
        .message{display:flex;gap:16px;padding:2px 16px;margin:0;border-radius:3px;position:relative}
        .message:hover{background:#2e3035}
        .avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-top:2px;cursor:pointer}
        .msg-body{flex:1;min-width:0}
        .msg-header{display:flex;align-items:baseline;gap:8px;margin-bottom:2px;flex-wrap:wrap}
        .author{font-weight:500;font-size:15px;color:#f2f3f5;cursor:pointer}
        .author:hover{text-decoration:underline}
        .bot-badge{background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:.3px;text-transform:uppercase}
        .timestamp{color:#949ba4;font-size:11px}
        .msg-content{color:#dcddde;line-height:1.375;word-break:break-word;white-space:pre-wrap;font-size:15px}

        .embed{background:#2b2d31;border-left:4px solid #5865f2;border-radius:0 4px 4px 0;padding:12px 16px;margin-top:8px;max-width:520px;position:relative}
        .embed-author{font-size:13px;font-weight:600;color:#f2f3f5;margin-bottom:6px}
        .embed-title{font-size:15px;font-weight:700;color:#00a8fc;margin-bottom:6px}
        .embed-desc{font-size:14px;color:#dcddde;line-height:1.5;white-space:pre-wrap}
        .embed-fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
        .embed-field{flex:1 1 auto;min-width:120px}
        .embed-field.inline{flex:0 1 45%}
        .field-name{font-size:13px;font-weight:700;color:#f2f3f5;margin-bottom:2px}
        .field-value{font-size:14px;color:#dcddde}
        .embed-img{max-width:400px;max-height:300px;border-radius:4px;margin-top:8px;display:block}
        .embed-thumb{width:80px;height:80px;object-fit:cover;border-radius:4px;float:right;margin-left:16px;margin-bottom:8px}
        .embed-footer{font-size:12px;color:#949ba4;margin-top:8px;clear:both;padding-top:8px;border-top:1px solid #3f4147}

        .attachment-img{max-width:400px;max-height:300px;border-radius:4px;margin-top:8px;display:block}
        .attachment-file{display:inline-flex;align-items:center;gap:6px;background:#2b2d31;border:1px solid #1e1f22;padding:8px 12px;border-radius:4px;margin-top:8px;font-size:14px}

        .day-divider{display:flex;align-items:center;gap:12px;margin:16px 0;padding:0 16px}
        .day-divider-line{flex:1;height:1px;background:#3f4147}
        .day-divider-text{color:#949ba4;font-size:12px;font-weight:600;white-space:nowrap}

        .footer{text-align:center;padding:24px;color:#949ba4;font-size:12px;border-top:1px solid #1e1f22;margin-top:24px}
        .footer strong{color:#dcddde}

        @media(max-width:600px){
            .header{padding:12px 16px}
            .messages{padding:8px 8px 24px}
            .info-bar{padding:8px 16px;gap:12px}
            .message{padding:2px 8px}
        }
    </style>
</head>
<body>
    <div class="header">
        ${guildIconHtml}
        <div class="header-info">
            <div class="guild-name">${escHtml(guildName || 'DragonsHosting')}</div>
            <div class="channel-name">#${escHtml(channelName)}</div>
            <div class="ticket-closed-badge">🔒 Ticket Closed</div>
        </div>
    </div>
    <div class="info-bar">
        <div class="info-item"><span class="info-label">Type:</span><span class="type-badge">${escHtml(ticketType || 'Support')}</span></div>
        <div class="info-item"><span class="info-label">Opened by:</span><span class="info-value">${escHtml(createdBy || 'Unknown')}</span></div>
        <div class="info-item"><span class="info-label">Closed by:</span><span class="info-value">${escHtml(closedBy || 'Unknown')}</span></div>
        <div class="info-item"><span class="info-label">Created:</span><span class="info-value">${createdAt ? new Date(createdAt).toLocaleString('en-US') : 'Unknown'}</span></div>
        <div class="info-item"><span class="info-label">Messages:</span><span class="info-value">${(messages || []).length}</span></div>
    </div>
    <div class="messages">
        ${messagesHtml}
    </div>
    <div class="footer">
        Transcript generated by <strong>DragonsHosting Bot</strong>
    </div>
</body>
</html>`;
}

function renderNotFound() {
    return `<!DOCTYPE html><html><head><title>Not Found</title><meta charset="utf-8">
<style>body{background:#313338;color:#dcddde;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center}.icon{font-size:64px;margin-bottom:16px}.title{font-size:24px;font-weight:700;color:#f2f3f5;margin-bottom:8px}.sub{color:#949ba4}</style></head>
<body><div class="box"><div class="icon">🔍</div><div class="title">Transcript Not Found</div>
<div class="sub">This transcript may have expired or the link is incorrect.</div></div></body></html>`;
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatContent(content) {
    if (!content) return '';
    let s = escHtml(content);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/`(.+?)`/g, '<code style="background:#1e1f22;padding:2px 5px;border-radius:3px;font-family:monospace;font-size:85%">$1</code>');
    s = s.replace(/&lt;@!?(\d+)&gt;/g, '<span style="color:#c9cdfb;background:rgba(88,101,242,.15);padding:0 2px;border-radius:3px;cursor:pointer">@user</span>');
    s = s.replace(/&lt;@&amp;(\d+)&gt;/g, '<span style="color:#c9cdfb;background:rgba(88,101,242,.15);padding:0 2px;border-radius:3px">@role</span>');
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
}

function serveStaticFile(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return false;
    }

    if (!fs.existsSync(PUBLIC_DIR)) {
        return false;
    }

    let requestedPath;
    try {
        requestedPath = decodeURIComponent(pathname);
    } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain;charset=UTF-8' });
        res.end('Bad Request');
        return true;
    }

    if (requestedPath === '/' || /^\/dashboard\/\d+(?:\/[a-z0-9-]+)?\/?$/.test(requestedPath)) {
        requestedPath = '/index.html';
    }

    if (requestedPath.includes('\0')) {
        res.writeHead(400, { 'Content-Type': 'text/plain;charset=UTF-8' });
        res.end('Bad Request');
        return true;
    }

    const publicRoot = path.resolve(PUBLIC_DIR);
    const filePath = path.resolve(PUBLIC_DIR, requestedPath.replace(/^\/+/, ''));

    if (!filePath.startsWith(publicRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain;charset=UTF-8' });
        res.end('Forbidden');
        return true;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = ext === '.html'
        ? 'no-cache'
        : 'public, max-age=3600';

    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
    });

    if (req.method === 'HEAD') {
        res.end();
        return true;
    }

    fs.createReadStream(filePath).pipe(res);
    return true;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`);
    const pathname = url.pathname;

    // POST /save - Save transcript (called internally by the bot)
    if (req.method === 'POST' && pathname === '/save') {
        const secret = req.headers['x-transcript-secret'];
        if (secret !== TRANSCRIPT_SECRET) {
            res.writeHead(401);
            return res.end('Unauthorized');
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const transcriptUrl = await saveTranscript(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ url: transcriptUrl }));
            } catch (e) {
                res.writeHead(400);
                res.end('Bad Request');
            }
        });
        return;
    }

    // GET /t/:id - View transcript
    if (req.method === 'GET' && pathname.startsWith('/t/')) {
        const id = pathname.replace('/t/', '').replace(/[^a-f0-9]/g, '');
        const data = await readTranscript(id);
        if (!data) {
            res.writeHead(404, { 'Content-Type': 'text/html;charset=UTF-8' });
            return res.end(renderNotFound());
        }
        res.writeHead(200, { 'Content-Type': 'text/html;charset=UTF-8' });
        return res.end(renderTranscript(data));
    }

    // GET /api/dashboard/:guildId - Live dashboard data for tickets and transcripts
    if (req.method === 'GET' && pathname.startsWith('/api/dashboard')) {
        const guildId = pathname.replace('/api/dashboard/', '').replace(/\D/g, '') || DEFAULT_DASHBOARD_GUILD_ID;
        try {
            return writeJson(res, 200, await getDashboardData(guildId));
        } catch (err) {
            console.log(`[Dashboard] Failed to build dashboard data: ${err.message}`);
            return writeJson(res, 500, {
                error: 'Dashboard data unavailable',
                message: err.message,
            });
        }
    }

    // Health check
    if (pathname === '/health') {
        res.writeHead(200);
        return res.end('OK');
    }

    if (serveStaticFile(req, res, pathname)) {
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DragonsHosting Transcript Server');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Transcript Server] Running on port ${PORT}`);
    console.log(`[Transcript Server] Base URL: ${BASE_URL}`);
    ensureTranscriptCollections()
        .then(result => {
            if (result?.enabled) {
                console.log(`[Transcript DB] MongoDB ready: ${result.database}.${result.collection}`);
            }
        })
        .catch(error => console.log(`[Transcript DB] MongoDB setup skipped/failed: ${error.message}`));
    if (fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
        console.log(`[Website] Serving DragonsHosting site from ${PUBLIC_DIR}`);
    }
});

module.exports = { saveTranscript, setDiscordClient };
