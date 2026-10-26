const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const { loadConfig } = require('../../lib/config.server.js');
const { getDiscordClient } = require('../../bot');
const crypto = require('crypto');

const uploadedFiles = new Map();

const checkEmbedPermissions = async (req, res, next) => {
    try {
        const config = loadConfig();
        const allowedRoles = config?.Dashboard?.Permissions?.Dashboard?.Embed || [];
        const userRoles = req.user?.roles || [];

        if (!userRoles.some(role => allowedRoles.includes(role))) {
            return res.status(403).json({ error: 'You do not have permission to use the embed builder' });
        }

        next();
    } catch (error) {
        console.error('Error checking embed permissions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get('/', auth, async (req, res) => {
    try {
        const client = global.client;
        const guild = client.guilds.cache.get(req.user.guildId);
        
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found' });
        }

        const channels = guild.channels.cache
            .filter(channel => channel.type === 0 || channel.type === 5)
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                parent: channel.parent ? {
                    id: channel.parent.id,
                    name: channel.parent.name
                } : null
            }));

        res.json(channels);
    } catch (error) {
        console.error('[Channels] Error fetching channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

router.post('/:channelId/messages', auth, checkEmbedPermissions, async (req, res) => {
    try {
        const { channelId } = req.params;
        const { embeds, linkButtons, flags, components: v2Components } = req.body;
        
        const client = global.client;
        const channel = await client.channels.fetch(channelId);
        
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        if (!channel.permissionsFor(client.user).has('SendMessages')) {
            return res.status(403).json({ error: 'Bot does not have permission to send messages in this channel' });
        }

        if (flags === 32768 && v2Components) {
            const { REST, Routes } = require('discord.js');
            const rest = new REST({ version: '10' }).setToken(client.token);
            
            const filesToAttach = [];
            const processedComponents = JSON.parse(JSON.stringify(v2Components));
            
            const fetchAndAttach = async (url, preferredName, index, uploadId = null) => {
                if (!url && !uploadId) return url;
                if (url && url.startsWith('attachment://')) return url;
                
                if (uploadId) {
                    const uploadData = uploadedFiles.get(uploadId);
                    if (uploadData?.buffer) {
                        const filename = preferredName || uploadData.filename;
                        filesToAttach.push({ name: filename, data: uploadData.buffer, id: filesToAttach.length });
                        return `attachment://${filename}`;
                    }
                }
                
                if (url) {
                    try {
                        const response = await fetch(url);
                        if (response.ok) {
                            const buffer = Buffer.from(await response.arrayBuffer());
                            const ext = url.split('.').pop()?.split('?')[0] || 'bin';
                            const fullFilename = preferredName.includes('.') ? preferredName : `${preferredName}.${ext}`;
                            filesToAttach.push({ name: fullFilename, data: buffer, id: filesToAttach.length });
                            return `attachment://${fullFilename}`;
                        }
                    } catch (err) {
                        console.error('[Channels] Failed to fetch file:', err);
                    }
                }
                return url;
            };
            
            const processComponent = async (comp, index) => {
                if (comp.type === 13 && (comp.file?.url || comp.file?.uploadId)) {
                    comp.file.url = await fetchAndAttach(comp.file.url, comp.file.filename || `file_${index}`, index, comp.file.uploadId);
                    delete comp.file.uploadId;
                }
                if (comp.type === 12 && comp.items && Array.isArray(comp.items)) {
                    for (let i = 0; i < comp.items.length; i++) {
                        const item = comp.items[i];
                        if (item.media?.url || item.media?.uploadId) {
                            item.media.url = await fetchAndAttach(item.media.url, `gallery_${index}_${i}`, `${index}_${i}`, item.media.uploadId);
                            delete item.media.uploadId;
                        }
                    }
                }
                if (comp.type === 9 && comp.accessory?.type === 11 && (comp.accessory.media?.url || comp.accessory.media?.uploadId)) {
                    comp.accessory.media.url = await fetchAndAttach(comp.accessory.media.url, `thumb_${index}`, index, comp.accessory.media.uploadId);
                    delete comp.accessory.media.uploadId;
                }
                if (comp.components && Array.isArray(comp.components)) {
                    for (let i = 0; i < comp.components.length; i++) {
                        await processComponent(comp.components[i], `${index}_${i}`);
                    }
                }
            };
            
            for (let i = 0; i < processedComponents.length; i++) {
                await processComponent(processedComponents[i], i);
            }
            
            const messagePayload = {
                flags: 32768,
                components: processedComponents
            };
            
            if (filesToAttach.length > 0) {
                messagePayload.attachments = filesToAttach.map((f, i) => ({ id: i, filename: f.name }));
            }
            
            try {
                const message = await rest.post(
                    Routes.channelMessages(channelId),
                    { body: messagePayload, files: filesToAttach.length > 0 ? filesToAttach : undefined }
                );
                return res.json({ success: true, message });
            } catch (v2Error) {
                console.error('[Channels] Components V2 error:', JSON.stringify(v2Error.rawError || v2Error, null, 2));
                const errorMessage = v2Error.rawError?.message || v2Error.message || 'Failed to send Components V2 message';
                const errorDetails = v2Error.rawError?.errors || null;
                return res.status(v2Error.status || 400).json({ 
                    error: errorMessage, 
                    details: errorDetails,
                    message: errorMessage
                });
            }
        }

        if (!Array.isArray(embeds) || embeds.length === 0) {
            return res.status(400).json({ error: 'Invalid embeds array' });
        }

        const components = [];
        if (linkButtons && linkButtons.length > 0) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const buttons = linkButtons.map(button => {
                const btn = new ButtonBuilder()
                    .setLabel(button.label)
                    .setURL(button.url)
                    .setStyle(ButtonStyle.Link);
                
                if (button.emoji) {
                    btn.setEmoji(button.emoji);
                }
                
                return btn;
            });

            for (let i = 0; i < buttons.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                components.push(row);
            }
        }

        const message = await channel.send({ embeds, components });
        res.json({ success: true, message });
    } catch (error) {
        console.error('[Channels] Error sending message:', error);
        const discordError = error.rawError?.message || error.message || 'Failed to send message';
        res.status(error.status || 500).json({ error: discordError, details: error.rawError?.errors });
    }
});

router.post('/upload', auth, checkEmbedPermissions, async (req, res) => {
    try {
        const { data, filename, mimetype } = req.body;
        
        if (!data || !filename) {
            return res.status(400).json({ error: 'No file data provided' });
        }

        const base64Data = data.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        if (buffer.length > 25 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large (max 25MB)' });
        }

        const uploadId = crypto.randomBytes(16).toString('hex');
        uploadedFiles.set(uploadId, {
            buffer,
            filename,
            mimetype,
            size: buffer.length,
            uploadedAt: Date.now()
        });
        
        setTimeout(() => {
            uploadedFiles.delete(uploadId);
        }, 30 * 60 * 1000);
        
        res.json({ uploadId, filename, size: buffer.length });
    } catch (error) {
        console.error('[Channels] Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

router.post('/:channelId/embeds', auth, checkEmbedPermissions, async (req, res) => {
    try {
        const { channelId } = req.params;
        const { embed } = req.body;
        const client = getDiscordClient();
        const channel = await client.channels.fetch(channelId);

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        if (embed.color) {
            embed.color = parseInt(embed.color.replace('#', ''), 16);
        }

        const components = [];
        if (embed.linkButtons && embed.linkButtons.length > 0) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const buttons = embed.linkButtons.map(button => {
                const btn = new ButtonBuilder()
                    .setLabel(button.label)
                    .setURL(button.url)
                    .setStyle(ButtonStyle.Link);
                
                if (button.emoji) {
                    btn.setEmoji(button.emoji);
                }
                
                return btn;
            });

            for (let i = 0; i < buttons.length; i += 5) {
                const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
                components.push(row);
            }
        }

        const { linkButtons, ...embedData } = embed;

        await channel.send({ embeds: [embedData], components });
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending embed:', error);
        res.status(500).json({ error: 'Failed to send embed' });
    }
});

module.exports = router;