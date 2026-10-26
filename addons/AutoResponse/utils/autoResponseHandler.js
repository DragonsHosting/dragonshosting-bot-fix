const { EmbedBuilder } = require("discord.js");
const AutoResponse = require('../models/autoResponse');

const autoResponseCache = new Map();
const CACHE_TTL = 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

function getCachedAutoResponses(guildId) {
    const cached = autoResponseCache.get(guildId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCachedAutoResponses(guildId, data) {
    if (autoResponseCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = autoResponseCache.keys().next().value;
        autoResponseCache.delete(oldestKey);
    }
    autoResponseCache.set(guildId, { data, timestamp: Date.now() });
}

async function processAutoResponses(message) {
    try {
        const guildId = message.guild.id;
        
        let autoResponses = getCachedAutoResponses(guildId);
        if (!autoResponses) {
            autoResponses = await AutoResponse.find({ guildId }).lean();
            setCachedAutoResponses(guildId, autoResponses || []);
        }
        
        if (!autoResponses || autoResponses.length === 0) {
            return;
        }

        const messageContent = message.content.toLowerCase().trim();
        const messageWords = messageContent.split(/\s+/);

        for (const response of autoResponses) {
            const trigger = response.trigger.toLowerCase().trim();
            
            const isExactMatch = messageContent === trigger || 
                               messageWords.some(word => word === trigger);
            
            if (isExactMatch) {
                if (response.whitelistRoles?.length > 0 && !response.whitelistRoles.some(roleId => message.member.roles.cache.has(roleId))) {
                    continue;
                }
                if (response.blacklistRoles?.some(roleId => message.member.roles.cache.has(roleId))) {
                    continue;
                }
                if (response.whitelistChannels?.length > 0 && !response.whitelistChannels.includes(message.channel.id)) {
                    continue;
                }
                if (response.blacklistChannels?.includes(message.channel.id)) {
                    continue;
                }

                if (response.type === 'text' && response.content) {
                    await message.reply(response.content).catch(error => {
                        console.error('Failed to send text response:', error);
                    });

                    if (global.addonLoader) {
                        global.addonLoader.getEventManager().emitSafe('autoResponse:triggered', {
                            message: message,
                            trigger: response.trigger,
                            responseType: 'text',
                            responseContent: response.content,
                            response: response,
                            guild: message.guild,
                            user: message.author
                        });
                    }
                }
                else if (response.type === 'embed' && response.embed) {
                    const embed = new EmbedBuilder()
                        .setColor(response.embed.color || '#5865F2');

                    if (response.embed.title) {
                        embed.setTitle(response.embed.title);
                    }

                    if (response.embed.description) {
                        embed.setDescription(response.embed.description);
                    }

                    if (response.embed.author?.name) {
                        embed.setAuthor({
                            name: response.embed.author.name,
                            iconURL: response.embed.author.icon_url || null
                        });
                    }

                    if (response.embed.footer?.text) {
                        embed.setFooter({
                            text: response.embed.footer.text,
                            iconURL: response.embed.footer.icon_url || null
                        });
                    }

                    if (response.embed.thumbnail) {
                        embed.setThumbnail(response.embed.thumbnail);
                    }

                    if (response.embed.image) {
                        embed.setImage(response.embed.image);
                    }

                    if (response.embed.fields && response.embed.fields.length > 0) {
                        const limitedFields = response.embed.fields.slice(0, 25);
                        limitedFields.forEach(field => {
                            if (field.name && field.value) {
                                embed.addFields({
                                    name: field.name,
                                    value: field.value,
                                    inline: field.inline || false
                                });
                            }
                        });
                    }

                    await message.reply({ embeds: [embed] }).catch(error => {
                        console.error('Failed to send embed response:', error);
                    });

                    if (global.addonLoader) {
                        global.addonLoader.getEventManager().emitSafe('autoResponse:triggered', {
                            message: message,
                            trigger: response.trigger,
                            responseType: 'embed',
                            responseContent: embed,
                            response: response,
                            guild: message.guild,
                            user: message.author
                        });
                    }
                }
                else if (response.responseType === 'TEXT' && response.responseText) {
                    await message.reply(response.responseText).catch(error => {
                        console.error('Failed to send text response:', error);
                    });
                }
                else if (response.responseType === 'EMBED' && response.embedData) {
                    const embed = new EmbedBuilder()
                        .setColor(response.embedData.color || '#5865F2');

                    if (response.embedData.title) {
                        embed.setTitle(response.embedData.title);
                    }

                    if (response.embedData.description) {
                        embed.setDescription(response.embedData.description);
                    }

                    if (response.embedData.author?.name) {
                        embed.setAuthor({
                            name: response.embedData.author.name,
                            iconURL: response.embedData.author.icon_url || null
                        });
                    }

                    if (response.embedData.footer?.text) {
                        embed.setFooter({
                            text: response.embedData.footer.text,
                            iconURL: response.embedData.footer.icon_url || null
                        });
                    }

                    if (response.embedData.thumbnail?.url) {
                        embed.setThumbnail(response.embedData.thumbnail.url);
                    }

                    if (response.embedData.image?.url) {
                        embed.setImage(response.embedData.image.url);
                    }

                    if (response.embedData.fields && response.embedData.fields.length > 0) {
                        const limitedFields = response.embedData.fields.slice(0, 25);
                        limitedFields.forEach(field => {
                            if (field.name && field.value) {
                                embed.addFields({
                                    name: field.name,
                                    value: field.value,
                                    inline: field.inline || false
                                });
                            }
                        });
                    }

                    await message.reply({ embeds: [embed] }).catch(error => {
                        console.error('Failed to send embed response:', error);
                    });
                }
                break;
            }
        }
    } catch (error) {
        console.error('Error processing auto responses:', error);
    }
}

module.exports = { processAutoResponses };