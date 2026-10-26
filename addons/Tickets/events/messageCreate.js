'use strict';
const { EmbedBuilder } = require('discord.js');
const sharp = require('sharp');
const axios = require('axios');
const Ticket = require('../models/tickets');
const { handleAutoClaim } = require('../utils/ticketClaiming');
const { notifyWatchers } = require('../utils/ticketWatchers');
const { autoHandleAlertCancel } = require('../commands/tickets');

async function checkStaffMentionStatus(message, ticket, config) {
    try {
        if (!message.mentions.users.size) return;
        
        const ticketType = config.TicketTypes[ticket.ticketType];
        if (!ticketType) return;
        
        const supportRoles = ticketType.SupportRole || [];
        if (!supportRoles.length) return;
        
        const staffMentionConfig = config.TicketSettings?.StaffMentionAlert;
        if (!staffMentionConfig?.Enabled) return;

        for (const [userId, user] of message.mentions.users) {
            if (user.bot || userId === message.author.id) continue;
            
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (!member) continue;
            
            const isStaff = member.roles.cache.some(role => supportRoles.includes(role.id));
            if (!isStaff) continue;
            
            const presence = member.presence;
            const status = presence?.status || 'offline';

            const alertStatuses = staffMentionConfig.AlertStatuses || ['offline', 'idle', 'dnd'];
            if (!alertStatuses.includes(status)) continue;
            
            const statusMessages = {
                offline: staffMentionConfig.Messages?.Offline || 'âš ï¸ {staff} is currently **offline** and may not see your message right away.',
                idle: staffMentionConfig.Messages?.Idle || 'âš ï¸ {staff} is currently **away** and may take longer to respond.',
                dnd: staffMentionConfig.Messages?.DND || 'âš ï¸ {staff} has **Do Not Disturb** enabled and may not respond immediately.'
            };
            
            const alertMessage = (statusMessages[status] || statusMessages.offline)
                .replace('{staff}', `<@${userId}>`)
                .replace('{user}', message.author.toString());
            
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor(staffMentionConfig.EmbedColor || '#FFA500')
                .setDescription(alertMessage);
            
            if (staffMentionConfig.ShowAlternatives && supportRoles.length > 0) {
                const onlineStaff = [];
                for (const roleId of supportRoles) {
                    const role = message.guild.roles.cache.get(roleId);
                    if (!role) continue;
                    for (const [memberId, roleMember] of role.members) {
                        if (memberId === userId) continue;
                        const memberPresence = roleMember.presence;
                        if (memberPresence?.status === 'online' || memberPresence?.status === 'idle') {
                            onlineStaff.push(roleMember);
                            if (onlineStaff.length >= 3) break;
                        }
                    }
                    if (onlineStaff.length >= 3) break;
                }
                
                if (onlineStaff.length > 0) {
                    const onlineList = onlineStaff.map(s => `<@${s.id}>`).join(', ');
                    embed.addFields({
                        name: staffMentionConfig.AlternativesTitle || 'ðŸŸ¢ Available Staff',
                        value: onlineList
                    });
                }
            }
            
            await message.channel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (error) {
        console.error('Error checking staff mention status:', error);
    }
}


const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

async function handleTicketMessageLogging(message) {
    try {
        const ticket = await Ticket.findOne({ channelId: message.channel.id, status: 'open' }).select('_id messageCount').lean();
        if (!ticket) return;

        const attachmentsToProcess = Array.from(message.attachments.values()).slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
        
        const attachmentPromises = attachmentsToProcess.map(async attachment => {
            const attachmentData = {
                url: attachment.url,
                proxyURL: attachment.proxyURL,
                contentType: attachment.contentType,
                name: attachment.name,
                id: attachment.id,
                timestamp: message.createdAt
            };

            if (attachment.contentType?.startsWith('image/') && attachment.size < MAX_IMAGE_SIZE) {
                try {
                    const response = await axios.get(attachment.url, { 
                        responseType: 'arraybuffer',
                        timeout: 5000,
                        maxContentLength: MAX_IMAGE_SIZE
                    });
                    const imageBuffer = Buffer.from(response.data);

                    const compressedImage = await sharp(imageBuffer)
                        .jpeg({ quality: 50, progressive: true })
                        .resize(1280, 720, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .toBuffer();

                    attachmentData.binaryData = compressedImage;
                    attachmentData.size = compressedImage.length;
                    attachmentData.compressed = true;
                } catch (error) {
                }
            }

            return attachmentData;
        });

        const attachments = await Promise.all(attachmentPromises);

        const newMessage = {
            author: message.author.tag,
            authorId: message.author.id,
            content: message.content,
            timestamp: message.createdAt,
            attachments: attachments
        };

        await Ticket.updateOne(
            { channelId: message.channel.id, status: 'open' },
            {
                $push: { 
                    messages: newMessage,
                    attachments: { $each: attachments }
                },
                $inc: { messageCount: 1 }
            }
        );
    } catch (error) {
        console.error('Error logging ticket message:', error);
    }
}

module.exports = async (client, message, config) => {
    if (!message?.guild || !message.member || message.author?.bot) return false;
    try {
        if (config.TicketSettings?.Enabled) {
            const ticket = await Ticket.findOne({ 
                channelId: message.channel.id,
                status: 'open'
            }).select('alertTime alertMessageId userId channelId ticketId ticketType claimed claimedBy firstMessageId questions').lean();
            
            if (ticket) {
                if (ticket.alertTime && ticket.alertMessageId && ticket.userId === message.author.id) {
                    await autoHandleAlertCancel(ticket, message.author.id, message.channel.id, client);
                }

                if (!ticket.claimed && ticket.userId !== message.author.id) {
                    await handleAutoClaim(client, message, ticket);
                }

                await checkStaffMentionStatus(message, ticket, config);
                await handleTicketMessageLogging(message);
                
                const fullTicket = await Ticket.findOne({ channelId: message.channel.id }).lean();
                if (fullTicket && fullTicket.watchers && fullTicket.watchers.length > 0) {
                    notifyWatchers(client, fullTicket, 'message', {
                        authorId: message.author.id,
                        content: message.content,
                        attachments: message.attachments.size
                    });
                }
                
                const ticketType = config.TicketTypes[ticket.ticketType];
                if (ticket.claimed && ticket.claimedBy === message.author.id && ticketType?.SupportRole) {
                    await Ticket.updateOne(
                        { channelId: message.channel.id },
                        { $set: { lastStaffResponse: new Date() } }
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error in ticket handling:', error);
    }

    return true;
};
