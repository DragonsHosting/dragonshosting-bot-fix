const { REST, Routes } = require('discord.js');
const sharp = require('sharp');

async function resizeImage(url, width, height) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        const resized = await sharp(buffer)
            .resize(width, height || width, { fit: 'inside' })
            .png()
            .toBuffer();
        return resized;
    } catch (error) {
        console.error('[ComponentsV2] Failed to resize image:', error);
        return null;
    }
}

function buildComponentsV2Payload(componentsConfig, placeholderReplacer, mediaToResize = []) {
    if (!componentsConfig || !componentsConfig.Components) return null;

    const buildComponent = (comp) => {
        if (!comp || !comp.Type) return null;

        const type = comp.Type.toLowerCase();

        switch (type) {
            case 'container':
                const containerChildren = (comp.Components || [])
                    .map(child => buildComponent(child))
                    .filter(Boolean);
                
                return {
                    type: 17,
                    accent_color: comp.AccentColor ? parseInt(comp.AccentColor.replace('#', ''), 16) : null,
                    spoiler: comp.Spoiler || false,
                    components: containerChildren
                };

            case 'section':
                const section = {
                    type: 9,
                    components: []
                };
                
                if (comp.Text && comp.Text.Content) {
                    section.components.push({
                        type: 10,
                        content: placeholderReplacer(comp.Text.Content)
                    });
                }
                
                if (comp.Accessory) {
                    if (comp.Accessory.Type === 'thumbnail' && comp.Accessory.Media) {
                        const mediaUrl = placeholderReplacer(comp.Accessory.Media.Url || comp.Accessory.Media.URL);
                        const width = comp.Accessory.Media.Width || comp.Accessory.Media.Size;
                        const height = comp.Accessory.Media.Height;
                        
                        const isValidUrl = mediaUrl && mediaUrl.trim() !== '' && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') || mediaUrl.startsWith('attachment://'));
                        
                        if (isValidUrl) {
                            if (width) {
                                const filename = `thumb_${mediaToResize.length}.png`;
                                mediaToResize.push({ url: mediaUrl, width: parseInt(width), height: height ? parseInt(height) : null, filename });
                                section.accessory = {
                                    type: 11,
                                    media: { url: `attachment://${filename}` }
                                };
                            } else {
                                section.accessory = {
                                    type: 11,
                                    media: { url: mediaUrl }
                                };
                            }
                        }
                    } else if (comp.Accessory.Type === 'button') {
                        const btnStyle = (comp.Accessory.Style || 'Primary').toLowerCase();
                        let styleNum = 1;
                        switch (btnStyle) {
                            case 'primary': styleNum = 1; break;
                            case 'secondary': styleNum = 2; break;
                            case 'success': styleNum = 3; break;
                            case 'danger': styleNum = 4; break;
                            case 'link': styleNum = 5; break;
                        }
                        
                        const button = {
                            type: 2,
                            style: styleNum,
                            label: placeholderReplacer(comp.Accessory.Label)
                        };
                        
                        if (comp.Accessory.CustomId) {
                            button.custom_id = comp.Accessory.CustomId;
                        }
                        if (comp.Accessory.Url || comp.Accessory.URL) {
                            button.url = placeholderReplacer(comp.Accessory.Url || comp.Accessory.URL);
                        }
                        if (comp.Accessory.Emoji) {
                            button.emoji = { name: comp.Accessory.Emoji };
                        }
                        
                        section.accessory = button;
                    }
                }
                
                if (!section.accessory) {
                    if (section.components.length > 0) {
                        return section.components[0];
                    }
                    return null;
                }
                
                return section;

            case 'text_display':
                return {
                    type: 10,
                    content: placeholderReplacer(comp.Content)
                };

            case 'media_gallery':
                const items = (comp.Items || []).map((item, idx) => {
                    const mediaUrl = placeholderReplacer(item.Media ? (item.Media.Url || item.Media.URL) : (item.Url || item.URL));
                    const width = item.Media?.Width || item.Media?.Size || item.Width || item.Size;
                    const height = item.Media?.Height || item.Height;
                    
                    const isValidUrl = mediaUrl && mediaUrl.trim() !== '' && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') || mediaUrl.startsWith('attachment://'));
                    if (!isValidUrl) return null;
                    
                    if (width) {
                        const filename = `gallery_${mediaToResize.length}.png`;
                        mediaToResize.push({ url: mediaUrl, width: parseInt(width), height: height ? parseInt(height) : null, filename });
                        return {
                            media: { url: `attachment://${filename}` },
                            description: item.Description ? placeholderReplacer(item.Description) : undefined,
                            spoiler: item.Spoiler || false
                        };
                    }
                    
                    return {
                        media: { url: mediaUrl },
                        description: item.Description ? placeholderReplacer(item.Description) : undefined,
                        spoiler: item.Spoiler || false
                    };
                }).filter(Boolean);
                
                if (items.length === 0) return null;
                
                return {
                    type: 12,
                    items: items
                };

            case 'separator':
                return {
                    type: 14,
                    divider: comp.Divider !== false,
                    spacing: comp.Spacing === 'large' ? 2 : 1
                };

            case 'file':
                return {
                    type: 13,
                    file: {
                        url: placeholderReplacer(comp.File?.Url || comp.File?.URL),
                        filename: comp.File?.Filename || 'file'
                    },
                    spoiler: comp.Spoiler || false
                };

            case 'action_row':
                const rowChildren = (comp.Components || [])
                    .map(child => buildComponent(child))
                    .filter(Boolean);
                
                return {
                    type: 1,
                    components: rowChildren
                };

            case 'button':
                const buttonStyle = (comp.Style || 'Primary').toLowerCase();
                let buttonStyleNum = 1;
                switch (buttonStyle) {
                    case 'primary': buttonStyleNum = 1; break;
                    case 'secondary': buttonStyleNum = 2; break;
                    case 'success': buttonStyleNum = 3; break;
                    case 'danger': buttonStyleNum = 4; break;
                    case 'link': buttonStyleNum = 5; break;
                }
                
                const buttonComp = {
                    type: 2,
                    style: buttonStyleNum,
                    label: placeholderReplacer(comp.Label)
                };
                
                if (comp.CustomId) {
                    buttonComp.custom_id = comp.CustomId;
                }
                if (comp.Url || comp.URL) {
                    buttonComp.url = placeholderReplacer(comp.Url || comp.URL);
                }
                if (comp.Emoji) {
                    buttonComp.emoji = { name: comp.Emoji };
                }
                if (comp.Disabled) {
                    buttonComp.disabled = true;
                }
                
                return buttonComp;

            default:
                return null;
        }
    };

    return componentsConfig.Components
        .map(comp => buildComponent(comp))
        .filter(Boolean);
}

async function sendComponentsV2Message(client, channelId, componentsConfig, placeholderReplacer, additionalRows = []) {
    const mediaToResize = [];
    const v2Components = buildComponentsV2Payload(componentsConfig, placeholderReplacer, mediaToResize);
    
    if (!v2Components || v2Components.length === 0) {
        return null;
    }

    if (additionalRows && additionalRows.length > 0) {
        for (const row of additionalRows) {
            if (row.toJSON) {
                v2Components.push(row.toJSON());
            } else {
                v2Components.push(row);
            }
        }
    }

    const rest = new REST({ version: '10' }).setToken(client.token);
    const body = { flags: 32768, components: v2Components, allowed_mentions: { parse: [] } };
    
    try {
        if (mediaToResize.length > 0) {
            const attachments = [];
            const files = [];
            
            for (let i = 0; i < mediaToResize.length; i++) {
                const media = mediaToResize[i];
                const buffer = await resizeImage(media.url, media.width, media.height);
                if (buffer) {
                    attachments.push({ id: i, filename: media.filename });
                    files.push({ name: media.filename, data: buffer });
                }
            }
            
            if (files.length > 0) {
                body.attachments = attachments;
                const message = await rest.post(
                    Routes.channelMessages(channelId),
                    { body, files }
                );
                return message;
            }
        }
        
        const message = await rest.post(
            Routes.channelMessages(channelId),
            { body }
        );
        return message;
    } catch (error) {
        console.error('[ComponentsV2] Failed to send message:', error);
        return null;
    }
}

async function editComponentsV2Message(client, channelId, messageId, componentsConfig, placeholderReplacer, additionalRows = []) {
    const mediaToResize = [];
    const v2Components = buildComponentsV2Payload(componentsConfig, placeholderReplacer, mediaToResize);
    
    if (!v2Components || v2Components.length === 0) {
        return null;
    }

    if (additionalRows && additionalRows.length > 0) {
        for (const row of additionalRows) {
            if (row.toJSON) {
                v2Components.push(row.toJSON());
            } else {
                v2Components.push(row);
            }
        }
    }

    const rest = new REST({ version: '10' }).setToken(client.token);
    const body = { flags: 32768, components: v2Components, allowed_mentions: { parse: [] } };
    
    try {
        if (mediaToResize.length > 0) {
            const attachments = [];
            const files = [];
            
            for (let i = 0; i < mediaToResize.length; i++) {
                const media = mediaToResize[i];
                const buffer = await resizeImage(media.url, media.width, media.height);
                if (buffer) {
                    attachments.push({ id: i, filename: media.filename });
                    files.push({ name: media.filename, data: buffer });
                }
            }
            
            if (files.length > 0) {
                body.attachments = attachments;
                const message = await rest.patch(
                    Routes.channelMessage(channelId, messageId),
                    { body, files }
                );
                return message;
            }
        }
        
        const message = await rest.patch(
            Routes.channelMessage(channelId, messageId),
            { body }
        );
        return message;
    } catch (error) {
        console.error('[ComponentsV2] Failed to edit message:', error);
        return null;
    }
}

async function deleteComponentsV2Message(client, channelId, messageId) {
    const rest = new REST({ version: '10' }).setToken(client.token);
    
    try {
        await rest.delete(Routes.channelMessage(channelId, messageId));
        return true;
    } catch (error) {
        console.error('[ComponentsV2] Failed to delete message:', error);
        return false;
    }
}

async function replyComponentsV2(interaction, componentsConfig, placeholderReplacer, options = {}) {
    const mediaToResize = [];
    const v2Components = buildComponentsV2Payload({ Components: componentsConfig }, placeholderReplacer, mediaToResize);
    
    if (!v2Components || v2Components.length === 0) {
        return null;
    }

    const rest = new REST({ version: '10' }).setToken(interaction.client.token);
    const payload = { 
        flags: 32768 | (options.ephemeral ? 64 : 0), 
        components: v2Components,
        allowed_mentions: { parse: [] }
    };

    try {
        let files = null;
        if (mediaToResize.length > 0) {
            const attachments = [];
            files = [];
            
            for (let i = 0; i < mediaToResize.length; i++) {
                const media = mediaToResize[i];
                const buffer = await resizeImage(media.url, media.width, media.height);
                if (buffer) {
                    attachments.push({ id: i, filename: media.filename });
                    files.push({ name: media.filename, data: buffer });
                }
            }
            
            if (files.length > 0) {
                payload.attachments = attachments;
            } else {
                files = null;
            }
        }

        if (interaction.deferred || interaction.replied) {
            const message = await rest.patch(
                Routes.webhookMessage(interaction.client.user.id, interaction.token),
                { body: payload, files }
            );
            return message;
        } else {
            await rest.post(
                Routes.interactionCallback(interaction.id, interaction.token),
                { body: { type: 4, data: payload }, files }
            );
            return await interaction.fetchReply().catch(() => null);
        }
    } catch (error) {
        console.error('[ComponentsV2] Failed to reply:', error);
        return null;
    }
}

async function editReplyComponentsV2(interaction, componentsConfig, placeholderReplacer, additionalComponents = []) {
    const mediaToResize = [];
    const v2Components = buildComponentsV2Payload({ Components: componentsConfig }, placeholderReplacer, mediaToResize);
    
    if (!v2Components || v2Components.length === 0) {
        return null;
    }

    const allComponents = [...v2Components, ...additionalComponents];

    const rest = new REST({ version: '10' }).setToken(interaction.client.token);
    const body = { flags: 32768, components: allComponents, allowed_mentions: { parse: [] } };
    
    try {
        let files = null;
        if (mediaToResize.length > 0) {
            const attachments = [];
            files = [];
            
            for (let i = 0; i < mediaToResize.length; i++) {
                const media = mediaToResize[i];
                const buffer = await resizeImage(media.url, media.width, media.height);
                if (buffer) {
                    attachments.push({ id: i, filename: media.filename });
                    files.push({ name: media.filename, data: buffer });
                }
            }
            
            if (files.length > 0) {
                body.attachments = attachments;
            } else {
                files = null;
            }
        }

        const message = await rest.patch(
            Routes.webhookMessage(interaction.client.user.id, interaction.token),
            { body, files }
        );
        return message;
    } catch (error) {
        console.error('[ComponentsV2] Failed to edit reply:', error);
        return null;
    }
}

function buildEconomyComponentsV2(config, placeholders, mediaToResize = []) {
    if (!config || !config.Components) return null;
    const replacer = createSimplePlaceholderReplacer(placeholders);
    return buildComponentsV2Payload(config, replacer, mediaToResize);
}

function createSimplePlaceholderReplacer(replacements) {
    return (text) => {
        if (!text) return text;
        if (Array.isArray(text)) {
            text = text.join('\n');
        }
        if (typeof text !== 'string') return text;
        let result = text;
        for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(new RegExp(`{${key}}`, 'g'), value ?? '');
        }
        result = result.replace(/\\n/g, '\n');
        return result;
    };
}

module.exports = {
    buildComponentsV2Payload,
    sendComponentsV2Message,
    editComponentsV2Message,
    deleteComponentsV2Message,
    createSimplePlaceholderReplacer,
    replyComponentsV2,
    editReplyComponentsV2,
    buildEconomyComponentsV2,
    resizeImage
};

