const { MessageFlags } = require("discord.js");
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');

const config = getConfig();
const lang = getLang();

function getFormattedReason(reasonValue, customReason = null) {
    if (customReason) return customReason;
    if (!reasonValue) return config.TicketSettings.CloseReasons.DefaultReason;

    const reasonMap = {
        'resolved': '✅ Issue Resolved',
        'user_request': '👋 User Request',
        'inactive': '⏰ Inactive',
        'invalid': '❌ Invalid'
    };
    return reasonMap[reasonValue] || config.TicketSettings.CloseReasons.DefaultReason;
}

function replacePlaceholders(text, replacements) {
    for (const key in replacements) {
        text = text.replace(new RegExp(`{${key}}`, 'g'), replacements[key]);
    }
    return text;
}

async function deferIfNeeded(interaction, timeout = 15000) {
    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Failed to defer interaction:', error);
            throw error;
        }
    }
}

async function replyOrFollowUp(interaction, message) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({ content: message });
        } else if (interaction.replied) {
            await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        console.error('Failed to respond to interaction:', error);
    }
}

async function safeInteractionResponse(interaction, message, isError = false) {
    try {
        const content = typeof message === 'string' ? message : message.content;
        const embeds = typeof message === 'object' && message.embeds ? message.embeds : undefined;
        const components = typeof message === 'object' && message.components ? message.components : undefined;
        
        const responseData = {
            flags: MessageFlags.Ephemeral
        };
        
        if (content) {
            responseData.content = content;
        } else if (!embeds && !components) {
            responseData.content = 'An error occurred.';
        }
        
        if (embeds) responseData.embeds = embeds;
        if (components) responseData.components = components;

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(responseData);
        } else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply(responseData);
        } else if (interaction.replied) {
            await interaction.followUp(responseData);
        }
    } catch (error) {
        console.error(`Failed to send ${isError ? 'error' : 'response'} to interaction:`, error);
    }
}

function parseDuration(duration) {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    const multipliers = {
        's': 1000,
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000
    };
    
    return value * multipliers[unit];
}

async function getUserPriority(member) {
    const priorityConfig = config.Priority;
    if (!priorityConfig.Enabled) {
        return priorityConfig.DefaultPriority;
    }

    const priorityOrder = ['Low', 'Medium', 'High'];
    let highestPriority = -1;
    let assignedPriority = priorityConfig.DefaultPriority;

    for (const memberRole of member.roles.cache.values()) {
        for (const [level, levelConfig] of Object.entries(priorityConfig.Levels)) {
            if (levelConfig.Roles.includes(memberRole.id)) {
                const priorityIndex = priorityOrder.indexOf(level);
                if (priorityIndex > highestPriority) {
                    highestPriority = priorityIndex;
                    assignedPriority = level;
                }
            }
        }
    }

    return assignedPriority;
}

async function generateUniqueTicketId() {
    const Ticket = require('../models/tickets');
    
    let newTicketId = 1;
    
    try {
        const lastTicket = await Ticket.findOne({ 
            ticketId: { $type: 'number', $ne: null } 
        }).sort({ ticketId: -1 });
        
        if (lastTicket && typeof lastTicket.ticketId === 'number' && !isNaN(lastTicket.ticketId)) {
            newTicketId = lastTicket.ticketId + 1;
        } else {
            const maxTicket = await Ticket.aggregate([
                { $match: { ticketId: { $type: 'number', $ne: null } } },
                { $group: { _id: null, maxId: { $max: '$ticketId' } } }
            ]);
            
            if (maxTicket.length > 0 && typeof maxTicket[0].maxId === 'number' && !isNaN(maxTicket[0].maxId)) {
                newTicketId = maxTicket[0].maxId + 1;
            }
        }
    } catch (error) {
        console.warn('Error finding last ticket ID, starting from 1:', error);
    }
    
    if (typeof newTicketId !== 'number' || isNaN(newTicketId) || newTicketId < 1) {
        console.warn('Invalid ticket ID calculated, falling back to 1');
        newTicketId = 1;
    }

    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10000;
    
    while (!isUnique && attempts < maxAttempts) {
        attempts++;
        
        if (newTicketId === 1488) {
            newTicketId++;
            continue;
        }
        
        try {
            const existingTicket = await Ticket.findOne({ ticketId: newTicketId });
            if (existingTicket) {
                newTicketId++;
            } else {
                isUnique = true;
            }
        } catch (error) {
            console.error('Error checking ticket uniqueness:', error);
            newTicketId++;
        }
    }
    
    if (!isUnique) {
        throw new Error(`Failed to generate unique ticket ID after ${maxAttempts} attempts`);
    }

    return newTicketId;
}

module.exports = {
    getFormattedReason,
    replacePlaceholders,
    deferIfNeeded,
    replyOrFollowUp,
    safeInteractionResponse,
    parseDuration,
    getUserPriority,
    generateUniqueTicketId
};