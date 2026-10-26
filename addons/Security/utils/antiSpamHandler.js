const UserData = require('../../../models/UserData');
const { 
    hasPermissionOrRole, 
    parseDuration, 
    humanReadableDuration, 
    getTimeoutExpiryTimestamp,
    createLogEmbed, 
    sendLogMessage, 
    sendDirectMessage 
} = require('../../../utils/handlers/messageUtils');
const { getConfig } = require('../../../utils/core/configLoader');

const config = getConfig();
const parsedSpamTimeLimit = parseDuration(config.AntiSpam.TimeLimit);
const parsedSpamTimeout = parseDuration(config.AntiSpam.TimeoutTime);

let spamData = new Map();
const MAX_SPAM_ENTRIES = 1000;
const SPAM_DATA_TTL = 60000;

setInterval(() => {
    const now = Date.now();
    for (const [userId, userData] of spamData.entries()) {
        if (now - userData.firstMessage > SPAM_DATA_TTL) {
            spamData.delete(userId);
        }
    }
    if (spamData.size > MAX_SPAM_ENTRIES) {
        const entries = Array.from(spamData.entries())
            .sort((a, b) => a[1].firstMessage - b[1].firstMessage);
        const toDelete = entries.slice(0, spamData.size - MAX_SPAM_ENTRIES);
        toDelete.forEach(([key]) => spamData.delete(key));
    }
}, 30000);

async function checkAntiMassMention(message) {
    if (!config.AntiMassMention.Enabled) return;

    const mentionBypass = hasPermissionOrRole(message.member, config.AntiMassMention.BypassPerms, config.AntiMassMention.BypassRoles);
    if (mentionBypass) return;

    if (message.mentions.users.size > config.AntiMassMention.Amount) {
        try {
            await message.delete();
        } catch (error) {
            if (error.code === '%%__USER__%%') {
                console.error('Failed to delete message:', error);
            } else {
                console.error(`Error deleting message: ${error}`);
            }
        }

        const warningMsg = await message.channel.send(
            config.AntiMassMention.Message.replace(/{user}/g, `<@${message.author.id}>`)
        );
        setTimeout(() => warningMsg.delete().catch(console.error), 3000);

        if (config.AntiMassMention.TimeoutUser === true) {
            const timeInMs = parseDuration(config.AntiMassMention.TimeoutTime);
            try {
                await message.member.timeout(timeInMs, "Mass Mention (Auto Moderation)");
                await UserData.updateOne(
                    { userId: message.author.id, guildId: message.guild.id },
                    { $inc: { timeouts: 1 } }
                );

                if (global.addonLoader) {
                    global.addonLoader.getEventManager().emitSafe('moderation:antiSpam', {
                        type: 'massMention',
                        user: message.author,
                        member: message.member,
                        guild: message.guild,
                        channel: message.channel,
                        message: message,
                        action: 'timeout',
                        duration: timeInMs,
                        reason: 'Mass Mention (Auto Moderation)',
                        mentionCount: message.mentions.users.size
                    });
                }

                const logEmbed = createLogEmbed(
                    'Auto Moderation',
                    'Red',
                    'Mass Mention Detected',
                    `**User:** <@${message.author.id}> \n**Action:** Timeout`,
                    [
                        { name: 'Reason', value: 'Mass Mention', inline: true },
                        { name: 'Expires', value: getTimeoutExpiryTimestamp(timeInMs), inline: true },
                        { name: 'Mentions', value: `${message.mentions.users.size} users`, inline: true }
                    ],
                    `User ID: ${message.author.id}`
                );

                sendLogMessage(message.guild, config.AntiMassMention.LogsChannelID, logEmbed);

                if (config.AntiMassMention.SendDM) {
                    const dmData = {
                        user: message.author.username,
                        time: config.AntiMassMention.TimeoutTime
                    };
                    await sendDirectMessage(message.author, config.AntiMassMention.DirectMessage, dmData);
                }
            } catch (error) {
                console.error('Error applying timeout:', error);
            }
        }
    }
}

async function checkAntiSpam(message) {
    if (!config.AntiSpam.Enabled) return;

    const spamBypass = hasPermissionOrRole(message.member, config.AntiSpam.BypassPerms, config.AntiSpam.BypassRoles);
    if (spamBypass) return;

    const now = Date.now();
    const timeLimit = parsedSpamTimeLimit;

    if (!spamData.has(message.author.id)) {
        spamData.set(message.author.id, {
            msgCount: 1,
            firstMessage: now,
            messages: [message.id]
        });
    } else {
        const userData = spamData.get(message.author.id);
        const timeDiff = now - userData.firstMessage;

        if (timeDiff < timeLimit) {
            userData.msgCount++;
            userData.messages.push(message.id);
            
            if (userData.messages.length > 20) {
                userData.messages = userData.messages.slice(-10);
            }
            
            spamData.set(message.author.id, userData);

            if (userData.msgCount >= config.AntiSpam.MsgLimit) {
                const timeInMs = parsedSpamTimeout;
                try {
                    const warningMsg = await message.channel.send(
                        config.AntiSpam.Message.replace(/{user}/g, `<@${message.author.id}>`)
                    );
                    setTimeout(() => warningMsg.delete().catch(console.error), 3000);

                    await message.member.timeout(timeInMs, "Spamming (Auto Moderation)");
                    
                    await UserData.updateOne(
                        { userId: message.author.id, guildId: message.guild.id },
                        { $inc: { timeouts: 1 } }
                    ).catch(console.error);

                    if (global.addonLoader) {
                        global.addonLoader.getEventManager().emitSafe('moderation:antiSpam', {
                            type: 'messageSpam',
                            user: message.author,
                            member: message.member,
                            guild: message.guild,
                            channel: message.channel,
                            action: 'timeout',
                            duration: timeInMs,
                            reason: 'Spamming (Auto Moderation)',
                            messageCount: userData.msgCount,
                            timeWindow: humanReadableDuration(timeLimit)
                        });
                    }

                    const logEmbed = createLogEmbed(
                        'Auto Moderation',
                        'Red',
                        'Spam Detected',
                        `**User:** <@${message.author.id}> \n**Action:** Timeout`,
                        [
                            { name: 'Reason', value: 'Spamming Messages', inline: true },
                            { name: 'Expires', value: getTimeoutExpiryTimestamp(timeInMs), inline: true },
                            { name: 'Messages', value: `${userData.msgCount} messages in ${humanReadableDuration(timeLimit)}`, inline: true }
                        ],
                        `User ID: ${message.author.id}`
                    );

                    sendLogMessage(message.guild, config.AntiSpam.LogsChannelID, logEmbed);

                    if (config.AntiSpam.SendDM) {
                        const dmData = {
                            user: message.author.username,
                            guildName: message.guild.name,
                            messageContent: message.content,
                            time: config.AntiSpam.TimeoutTime
                        };
                        await sendDirectMessage(message.author, config.AntiSpam.DirectMessage, dmData);
                    }

                    try {
                        await message.channel.bulkDelete(userData.messages).catch(console.error);
                    } catch (error) {
                        console.error('Failed to delete messages:', error);
                    }

                } catch (error) {
                    console.error(`Error handling spam timeout: ${error}`);
                }

                spamData.delete(message.author.id);
            }
        } else {
            spamData.set(message.author.id, {
                msgCount: 1,
                firstMessage: now,
                messages: [message]
            });
        }
    }
}

module.exports = {
    checkAntiMassMention,
    checkAntiSpam
};