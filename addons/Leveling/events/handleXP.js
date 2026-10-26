const { EmbedBuilder, ChannelType } = require('discord.js');
const UserData = require('../../../models/UserData');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const { getLogChannel } = require('../../../utils/handlers/messageUtils.js');
const { sendComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const { checkActiveBooster } = require('../../Economy/commands/Utility/helpers');

const config = getConfig();
const lang = getLang();

const xpCooldown = new Map();
const voiceXpTimers = new Map();

const xpBatchQueue = new Map();
const XP_BATCH_SIZE = 250;
const XP_BATCH_TIMEOUT = 4000;
let xpBatchTimeout = null;

function getRandomXP(range) {
    const [min, max] = range.split('-').map(Number);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calculateXPNeeded(level) {
    if (level === 0) return 70;
    
    if (config.LevelingSystem.UseFormula && config.LevelingSystem.Formula) {
        try {
            const formula = config.LevelingSystem.Formula.replace(/\{level\}/g, (level + 1).toString());
            const result = eval(formula.replace(/\^/g, '**'));
            return Math.max(1, Math.floor(result));
        } catch (error) {
            console.error('Error evaluating XP formula:', error);
            return (level + 1) * config.LevelingSystem.XPNeeded;
        }
    }
    
    return (level + 1) * config.LevelingSystem.XPNeeded;
}

function getRandomLevelMessage(placeholders) {
    const messages = lang.Levels.LevelMessages;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    return replacePlaceholders(randomMessage, placeholders);
}

function replacePlaceholders(text, placeholders) {
    return text.replace(/{(\w+)}/g, (_, key) => placeholders[key] || `{${key}}`);
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function getRoleXPMultiplier(member) {
    const boostRoles = config.LevelingSystem.XPBoostRoles;
    if (!boostRoles || !Array.isArray(boostRoles) || !member) return 1.0;
    let highest = 1.0;
    for (const entry of boostRoles) {
        if (!entry.roleID || entry.roleID === '' || entry.roleID === 'ROLE_ID') continue;
        if (member.roles.cache.has(entry.roleID) && entry.multiplier > highest) {
            highest = entry.multiplier;
        }
    }
    return highest;
}

async function getXPMultiplier(member) {
    let multiplier = getRoleXPMultiplier(member);
    try {
        const userData = await UserData.findOne({ userId: member.id, guildId: member.guild.id });
        if (userData) {
            const boosterMult = checkActiveBooster(userData, 'XP');
            if (boosterMult > 1.0) {
                multiplier *= boosterMult;
            }
        }
    } catch {}
    return multiplier;
}

function parseTime(timeString) {
    const regex = /^(\d+)([smhd])$/;
    const match = timeString.match(regex);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 0;
    }
}

async function processXPBatch() {
    if (xpBatchQueue.size === 0) return;
    
    try {
        const operations = [];
        const levelUpUsers = [];
        
        for (const [key, data] of xpBatchQueue.entries()) {
            const [userId, guildId] = key.split(':');
            
            if (data.checkLevelUp) {
                await handleAtomicXPUpdate(userId, guildId, data.xpToAdd, data.message);
            } else {
                operations.push({
                    updateOne: {
                        filter: { userId, guildId },
                        update: {
                            $inc: { xp: data.xpToAdd },
                            $setOnInsert: {
                                userId,
                                guildId,
                                level: 0,
                                totalMessages: 0,
                                balance: 0,
                                warns: 0,
                                bans: 0,
                                kicks: 0,
                                timeouts: 0,
                                note: "None",
                                warnings: []
                            }
                        },
                        upsert: true
                    }
                });
            }
        }
        
        if (operations.length > 0) {
            const { observeAsync } = require('../../../utils/core/perfMonitor');
            await observeAsync('xp.bulkWrite', async () => await UserData.bulkWrite(operations, { ordered: false }));
        }
        
        xpBatchQueue.clear();
        xpBatchTimeout = null;
    } catch (error) {
        console.error('Error processing XP batch:', error);
        xpBatchQueue.clear();
        xpBatchTimeout = null;
    }
}

function scheduleXPBatchProcess() {
    if (!xpBatchTimeout) {
        xpBatchTimeout = setTimeout(processXPBatch, XP_BATCH_TIMEOUT);
    }
}

async function handleAtomicXPUpdate(userId, guildId, xpToAdd, message) {
    try {
        const userData = await UserData.findOneAndUpdate(
            { userId, guildId },
            {
                $inc: { xp: xpToAdd },
                $setOnInsert: {
                    userId,
                    guildId,
                    level: 0,
                    totalMessages: 0,
                    balance: 0,
                    warns: 0,
                    bans: 0,
                    kicks: 0,
                    timeouts: 0,
                    note: "None",
                    warnings: []
                }
            },
            { upsert: true, new: true }
        );

        if (!userData) return;

        let currentLevel = userData.level;
        let currentXP = userData.xp;
        const oldLevel = userData.level;
        let levelsGained = 0;

        while (true) {
            const xpNeeded = calculateXPNeeded(currentLevel);
            
            if (currentXP >= xpNeeded) {
                currentXP -= xpNeeded;
                currentLevel += 1;
                levelsGained++;
            } else {
                break;
            }
        }

        if (levelsGained > 0) {
            const updatedUser = await UserData.findOneAndUpdate(
                { userId, guildId },
                { 
                    $set: { 
                        xp: currentXP, 
                        level: currentLevel 
                    } 
                },
                { new: true }
            );

            if (updatedUser && message) {
                await handleLevelUpRewards(updatedUser, message);
                await sendLevelUpMessage(updatedUser, oldLevel, message);

                if (global.addonLoader) {
                    global.addonLoader.getEventManager().emitSafe('level:up', {
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        userData: updatedUser.toObject(),
                        oldLevel: oldLevel,
                        newLevel: currentLevel,
                        levelsGained: levelsGained,
                        xpGained: xpToAdd,
                        totalXP: updatedUser.xp
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error in atomic XP update:', error);
    }
}

async function checkLevelUp(userId, guildId, message) {
    try {
        const userData = await UserData.findOne({ userId, guildId });
        if (!userData) return;
        
        let currentLevel = userData.level;
        let currentXP = userData.xp;
        const oldLevel = userData.level;
        let levelsGained = 0;
        
        while (true) {
            const xpNeeded = calculateXPNeeded(currentLevel);
            
            if (currentXP >= xpNeeded) {
                currentXP -= xpNeeded;
                currentLevel += 1;
                levelsGained++;
            } else {
                break;
            }
        }
        
        if (levelsGained > 0) {
            const updatedUser = await UserData.findOneAndUpdate(
                { userId, guildId },
                { 
                    $set: { 
                        xp: currentXP, 
                        level: currentLevel 
                    } 
                },
                { new: true, upsert: false }
            );
            
            if (updatedUser) {
                await handleLevelUpRewards(updatedUser, message);
                await sendLevelUpMessage(updatedUser, oldLevel, message);

                if (global.addonLoader) {
                    global.addonLoader.getEventManager().emitSafe('level:up', {
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        userData: updatedUser.toObject(),
                        oldLevel: oldLevel,
                        newLevel: currentLevel,
                        levelsGained: levelsGained,
                        totalXP: updatedUser.xp
                    });
                }
            } else {
                console.warn(`[LEVELING] Could not update user ${userId} in guild ${guildId} - document may have been deleted`);
            }
        }
    } catch (error) {
        console.error('Error in level up check:', error);
    }
}

function findRoleForGuild(roleIdConfig, guild) {
    if (!roleIdConfig) return null;
    const roleIds = Array.isArray(roleIdConfig) ? roleIdConfig : [roleIdConfig];
    for (const roleId of roleIds) {
        if (!roleId || roleId === "" || roleId === "ROLE_ID") continue;
        const role = guild.roles.cache.get(roleId);
        if (role) return role;
    }
    return null;
}

async function handleLevelUpRewards(userData, message) {
    const roleSettings = config.LevelingSystem.RoleSettings || {};
    const levelUpRoles = roleSettings.LevelRoles || [];
    for (const levelUpRole of levelUpRoles) {
        if (userData.level >= levelUpRole.level && levelUpRole.roleID) {
            const role = findRoleForGuild(levelUpRole.roleID, message.guild);
            if (role) {
                try {
                    await message.member.roles.add(role);
                    
                    if (!roleSettings.StackRoles) {
                        for (const otherLevelUpRole of levelUpRoles) {
                            if (userData.level > otherLevelUpRole.level && otherLevelUpRole.roleID) {
                                const oldRole = findRoleForGuild(otherLevelUpRole.roleID, message.guild);
                                if (oldRole && oldRole.id !== role.id) {
                                    try {
                                        await message.member.roles.remove(oldRole);
                                    } catch (error) {
                                        console.error(`[LEVELING] Error removing role: ${error.message}`);
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[LEVELING] Error assigning role: ${error.message}`);
                }
            }
        }
    }
    
    const scaleRewards = roleSettings.ScaleRewards || {};
    const rewards = scaleRewards.Rewards || [];
    
    let highestReward = { level: 0, coins: 0 };
    for (const scaleReward of rewards) {
        if (userData.level % scaleReward.level === 0 && scaleReward.coins > highestReward.coins) {
            highestReward = scaleReward;
        }
    }
    
    if (highestReward.coins > 0) {
        userData.balance += highestReward.coins;
    }
}

async function sendLevelUpMessage(userData, oldLevel, message) {
    if (!config.LevelingSystem.LevelUpMessageSettings.Enabled) {
        return;
    }
    
    let channel = message.channel;
    
    const levelUpChannel = getLogChannel(message.guild, config.LevelingSystem.ChannelSettings.LevelUpChannelID);
    if (levelUpChannel && levelUpChannel.type === ChannelType.GuildText) {
        channel = levelUpChannel;
    }
    
    const placeholders = {
        userId: message.author.id,
        tag: message.author.tag,
        username: message.author.username,
        userName: message.author.username,
        user: `<@${message.author.id}>`,
        userMention: `<@${message.author.id}>`,
        userIcon: message.author.displayAvatarURL({ dynamic: true }),
        userBanner: message.author.bannerURL({ dynamic: true, size: 512 }) || message.author.displayAvatarURL({ dynamic: true }),
        oldLevel: oldLevel,
        newLevel: userData.level,
        oldXP: calculateXPNeeded(oldLevel - 1),
        newXP: calculateXPNeeded(userData.level),
        xp: userData.xp,
        xpNeeded: calculateXPNeeded(userData.level),
        serverName: message.guild.name,
        guildName: message.guild.name,
        guildIcon: message.guild.iconURL({ dynamic: true }) || '',
        randomLevelMessage: getRandomLevelMessage({
            user: `<@${message.author.id}>`,
            userName: message.author.username,
            newLevel: userData.level,
            guildName: message.guild.name
        })
    };
    
    try {
        if (config.LevelingSystem.LevelUpMessageSettings.UseComponentsV2 && config.LevelingSystem.LevelUpMessageSettings.ComponentsV2) {
            const placeholderReplacer = createSimplePlaceholderReplacer(placeholders);
            await sendComponentsV2Message(message.client, channel.id, config.LevelingSystem.LevelUpMessageSettings.ComponentsV2, placeholderReplacer);
        } else if (config.LevelingSystem.LevelUpMessageSettings.UseEmbed) {
            const embed = new EmbedBuilder().setColor(config.LevelingSystem.LevelUpMessageSettings.Embed.Color || '#34eb6b');
            
            if (config.LevelingSystem.LevelUpMessageSettings.Embed.Title) {
                embed.setTitle(replacePlaceholders(config.LevelingSystem.LevelUpMessageSettings.Embed.Title, placeholders));
            }
            
            if (config.LevelingSystem.LevelUpMessageSettings.Embed.Description && config.LevelingSystem.LevelUpMessageSettings.Embed.Description.length > 0) {
                embed.setDescription(config.LevelingSystem.LevelUpMessageSettings.Embed.Description.map(line => replacePlaceholders(line, placeholders)).join('\n'));
            }
            
            if (config.LevelingSystem.LevelUpMessageSettings.Embed.Footer && config.LevelingSystem.LevelUpMessageSettings.Embed.Footer.Text) {
                const footerText = replacePlaceholders(config.LevelingSystem.LevelUpMessageSettings.Embed.Footer.Text, placeholders);
                embed.setFooter({ text: footerText });
            }
            
            await channel.send({ embeds: [embed] });
        } else {
            const levelUpMessage = replacePlaceholders(config.LevelingSystem.LevelUpMessageSettings.LevelUpMessage, placeholders);
            if (levelUpMessage.trim() !== '') {
                await channel.send(levelUpMessage);
            }
        }
    } catch (error) {
        console.error('Error sending level up message:', error);
    }
}

async function handleXP(message) {
    if (!message || !message.guild) {
        return;
    }

    if (!config.LevelingSystem || !config.CommandsPrefix) {
        return;
    }

    if (!config.LevelingSystem.Enabled || message.author.bot || message.content.startsWith(config.CommandsPrefix) ||
        config.LevelingSystem.ChannelSettings.DisabledChannels?.includes(message.channel.id) ||
        (message.channel.parentId && config.LevelingSystem.ChannelSettings.DisabledCategories?.includes(message.channel.parentId))) {
        return;
    }

    if (config.LevelingSystem.CooldownSettings.EnableXPCooldown) {
        const cooldownAmount = parseTime(config.LevelingSystem.CooldownSettings.XPCooldown || '20s');
        const currentTime = Date.now();
        const userCooldown = xpCooldown.get(message.author.id);

        if (userCooldown && currentTime < userCooldown + cooldownAmount) {
            return;
        }

        xpCooldown.set(message.author.id, currentTime);
        
        setTimeout(() => xpCooldown.delete(message.author.id), cooldownAmount + 1000);
    }

    try {
        let xpToAdd = getRandomXP(config.LevelingSystem.MessageXP);
        if (isNaN(xpToAdd) || xpToAdd <= 0) {
            return;
        }

        const multiplier = await getXPMultiplier(message.member);
        if (multiplier > 1.0) {
            xpToAdd = Math.floor(xpToAdd * multiplier);
        }

        const key = `${message.author.id}:${message.guild.id}`;
        const existing = xpBatchQueue.get(key) || { xpToAdd: 0, checkLevelUp: false, message: null };
        existing.xpToAdd += xpToAdd;
        existing.checkLevelUp = true;
        existing.message = message;
        xpBatchQueue.set(key, existing);
        
        if (xpBatchQueue.size >= XP_BATCH_SIZE) {
            if (xpBatchTimeout) {
                clearTimeout(xpBatchTimeout);
                xpBatchTimeout = null;
            }
            await processXPBatch();
        } else {
            scheduleXPBatchProcess();
        }
    } catch (error) {
        console.error('Error handling XP:', error);
    }
}

function cleanupVoiceTimer(memberId) {
    if (voiceXpTimers.has(memberId)) {
        clearInterval(voiceXpTimers.get(memberId));
        voiceXpTimers.delete(memberId);
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of xpCooldown.entries()) {
        if (now - timestamp > 60000) {
            xpCooldown.delete(userId);
        }
    }
    if (xpCooldown.size > 300) {
        const entries = Array.from(xpCooldown.entries())
            .sort((a, b) => a[1] - b[1]);
        const toDelete = entries.slice(0, xpCooldown.size - 300);
        toDelete.forEach(([key]) => xpCooldown.delete(key));
    }
}, 30000);

setInterval(() => {
    if (voiceXpTimers.size > 30) {
        const entries = Array.from(voiceXpTimers.entries());
        const toRemove = entries.slice(0, Math.floor(entries.length / 4));
        toRemove.forEach(([memberId]) => cleanupVoiceTimer(memberId));
        if (toRemove.length > 0) {
        }
    }
}, 120000);

async function handleVoiceXP(client, member) {
    if (!member || !member.guild || !config.LevelingSystem || !config.LevelingSystem.Enabled || member.user.bot) {
        return;
    }

    if (!member.voice?.channel) {
        return;
    }

    if (member.voice.channel.parentId &&
        config.LevelingSystem.ChannelSettings.DisabledCategories?.includes(member.voice.channel.parentId)) {
        return;
    }

    if (config.LevelingSystem.ChannelSettings.DisabledChannels?.includes(member.voice.channel.id)) {
        return;
    }

    let xpToAdd = getRandomXP(config.LevelingSystem.VoiceXP);
    if (isNaN(xpToAdd) || xpToAdd <= 0) {
        return;
    }

    const multiplier = await getXPMultiplier(member);
    if (multiplier > 1.0) {
        xpToAdd = Math.floor(xpToAdd * multiplier);
    }

    const key = `${member.id}:${member.guild.id}`;
    const existing = xpBatchQueue.get(key) || { xpToAdd: 0, checkLevelUp: false, message: null };
    existing.xpToAdd += xpToAdd;
    xpBatchQueue.set(key, existing);
    
    if (xpBatchQueue.size >= XP_BATCH_SIZE) {
        if (xpBatchTimeout) {
            clearTimeout(xpBatchTimeout);
            xpBatchTimeout = null;
        }
        await processXPBatch();
    } else {
        scheduleXPBatchProcess();
    }
}

process.on('SIGTERM', async () => {
    if (xpBatchTimeout) {
        clearTimeout(xpBatchTimeout);
    }
    await processXPBatch();
    
    voiceXpTimers.forEach((timer, memberId) => {
        clearInterval(timer);
    });
    voiceXpTimers.clear();
});

process.on('SIGINT', async () => {
    if (xpBatchTimeout) {
        clearTimeout(xpBatchTimeout);
    }
    await processXPBatch();
    
    voiceXpTimers.forEach((timer, memberId) => {
        clearInterval(timer);
    });
    voiceXpTimers.clear();
});

module.exports = {
    handleXP,
    handleVoiceXP
};