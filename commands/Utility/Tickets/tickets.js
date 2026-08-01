/*
  _____            _           ____        _   
 |  __ \          | |         |  _ \      | |  
 | |  | |_ __ __ _| | _____   | |_) | ___ | |_ 
 | |  | | '__/ _` | |/ / _ \  |  _ < / _ \| __|
 | |__| | | | (_| |   < (_) | | |_) | (_) | |_ 
 |_____/|_|  \__,_|_|\_\___/  |____/ \___/ \__|
                                             
                                        
 Thank you for choosing DragonsHosting Bot!

 Should you encounter any issues, require assistance, or have suggestions for improving the bot,
 we invite you to connect with us on our Discord server and create a support ticket: 

 https://discord.gg/DragonsHosting
 
*/

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, PermissionsBitField, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment');
const colors = require('ansi-colors');
const Ticket = require('../../../models/tickets');
const Blacklist = require('../../../models/blacklist');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');

const { handleTicketClose } = require('../../../utils/ticketClosure.js');
const { safeInteractionResponse } = require('../../../utils/ticketUtils.js');
const { notifyWatchers } = require('../../../utils/ticketWatchers.js');
const { buildComponentsV2Payload, sendComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');

const config = getConfig();
const lang = getLang();

const channelRenameQueue = new Map();
const RENAME_COOLDOWN = 60000;
const MAX_RETRIES = 5;
let lastRenameTime = 0;
let isProcessing = false;

const priorityChangeCooldowns = new Map();
const PRIORITY_CHANGE_COOLDOWN = 5000;

const PRIORITY_COLORS = {
    'High': '#ff0000',
    'Medium': '#ffff00',
    'Low': '#00ff00'
};

async function processRenameQueue() {
    if (isProcessing) {
        return;
    }
    
    isProcessing = true;

    try {
        const entries = Array.from(channelRenameQueue.entries());
        for (const [channelId, data] of entries) {
            const now = Date.now();
            
            if (now - lastRenameTime < RENAME_COOLDOWN) {
                continue;
            }

            try {
                const freshChannel = await data.channel.guild.channels.fetch(channelId);
                
                const updateData = { name: data.name.toLowerCase() };
                
                if (data.ticket && data.ticketType && data.ticketType.ChannelTopic) {
                    const topic = data.ticketType.ChannelTopic
                        .replace('{ticketType}', data.ticketType.Name)
                        .replace('{userid}', `<@${data.ticket.userId}>`)
                        .replace('{user}', `<@${data.ticket.userId}>`)
                        .replace('{ticket-id}', data.ticket.ticketId)
                        .replace('{priority}', data.ticket.priority)
                        .replace('{created-at}', moment(data.ticket.createdAt).format('MMMM Do YYYY, h:mm:ss a'))
                        .replace('{category}', freshChannel.parent?.name || 'None');
                    
                    updateData.topic = topic;
                }

                let updatedChannel = null;
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    try {
                        updatedChannel = await freshChannel.edit(updateData, 'Ticket priority update');
                        break;
                    } catch (retryError) {
                        console.error(`Retry ${retryCount + 1} failed:`, retryError);
                        retryCount++;
                        if (retryCount < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }

                if (!updatedChannel) {
                    throw new Error('Failed to update channel after retries');
                }

                if (updatedChannel.name === updateData.name) {
                    lastRenameTime = now;
                    channelRenameQueue.delete(channelId);
                } else {
                    data.retries = (data.retries || 0) + 1;
                    if (data.retries > MAX_RETRIES) {
                        channelRenameQueue.delete(channelId);
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error updating channel ${channelId}:`, error);
                
                if (error.message.includes('rate limit')) {
                    data.queuedAt = now;
                    data.retries = (data.retries || 0) + 1;
                    
                    if (data.retries > MAX_RETRIES) {
                        channelRenameQueue.delete(channelId);
                    }
                } else {
                    channelRenameQueue.delete(channelId);
                }
            }
        }
    } finally {
        isProcessing = false;
    }
}

async function queueChannelRename(channel, newName, ticket = null, ticketType = null) {
    const now = Date.now();

    if (now - lastRenameTime >= RENAME_COOLDOWN && !isProcessing) {
        try {
            
            const freshChannel = await channel.guild.channels.fetch(channel.id);
            
            const updateData = { name: newName.toLowerCase() };
            
            if (ticket && ticketType && ticketType.ChannelTopic) {
                const topic = ticketType.ChannelTopic
                    .replace('{ticketType}', ticketType.Name)
                    .replace('{userid}', `<@${ticket.userId}>`)
                    .replace('{user}', `<@${ticket.userId}>`)
                    .replace('{ticket-id}', ticket.ticketId)
                    .replace('{priority}', ticket.priority)
                    .replace('{created-at}', moment(ticket.createdAt).format('MMMM Do YYYY, h:mm:ss a'))
                    .replace('{category}', freshChannel.parent?.name || 'None');
                
                updateData.topic = topic;
            }

            let updatedChannel = null;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    updatedChannel = await freshChannel.edit(updateData, 'Ticket priority update');
                    break;
                } catch (retryError) {
                    console.error(`Retry ${retryCount + 1} failed:`, retryError);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            if (!updatedChannel) {
                throw new Error('Failed to update channel after retries');
            }


            if (updatedChannel.name === updateData.name) {
                lastRenameTime = now;
                return true;
            }
        } catch (error) {
            console.error('Error during immediate channel update:', error);
            if (error.message.includes('rate limit')) {
            } else {
                console.error('Unexpected error during channel update:', error);
            }

        }
    } else {
    }

    channelRenameQueue.set(channel.id, {
        channel,
        name: newName.toLowerCase(),
        ticket,
        ticketType,
        queuedAt: now,
        retries: 0
    });

    return false;
}

const queueProcessor = setInterval(processRenameQueue, 5000);

process.on('exit', () => {
    clearInterval(queueProcessor);
});

function parseDuration(duration) {
    const timeUnits = {
        s: 1000,
        m: 1000 * 60,
        h: 1000 * 60 * 60,
        d: 1000 * 60 * 60 * 24,
        w: 1000 * 60 * 60 * 24 * 7
    };

    const matches = duration.match(/(\d+\s*[smhdw])/g);
    if (!matches) return 0;

    return matches.reduce((total, match) => {
        const value = parseInt(match.match(/\d+/)[0]);
        const unit = match.match(/[smhdw]/)[0];
        return total + value * timeUnits[unit];
    }, 0);
}

function isValidHttpUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}


function formatDuration(ms) {
    const duration = moment.duration(ms);
    const days = duration.days();
    const hours = duration.hours();
    const minutes = duration.minutes();
    const seconds = duration.seconds();

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

async function getUserPriority(member) {
    const priorityConfig = config.Priority;
    if (!priorityConfig.Enabled) {
        return priorityConfig.DefaultPriority;
    }

    for (const level of Object.keys(priorityConfig.Levels)) {
        const levelConfig = priorityConfig.Levels[level];
        for (const roleId of levelConfig.Roles) {
            if (member.roles.cache.has(roleId)) {
                return level;
            }
        }
    }

    return priorityConfig.DefaultPriority;
}

const replacePlaceholders = (text, workingHours) => {
    if (!text) return '';
    return text
        .replace('{workinghours_start}', workingHours.start)
        .replace('{workinghours_end}', workingHours.end)
        .replace('{workinghours_start_monday}', workingHours.mondayStart)
        .replace('{workinghours_end_monday}', workingHours.mondayEnd)
        .replace('{workinghours_start_tuesday}', workingHours.tuesdayStart)
        .replace('{workinghours_end_tuesday}', workingHours.tuesdayEnd)
        .replace('{workinghours_start_wednesday}', workingHours.wednesdayStart)
        .replace('{workinghours_end_wednesday}', workingHours.wednesdayEnd)
        .replace('{workinghours_start_thursday}', workingHours.thursdayStart)
        .replace('{workinghours_end_thursday}', workingHours.thursdayEnd)
        .replace('{workinghours_start_friday}', workingHours.fridayStart)
        .replace('{workinghours_end_friday}', workingHours.fridayEnd)
        .replace('{workinghours_start_saturday}', workingHours.saturdayStart)
        .replace('{workinghours_end_saturday}', workingHours.saturdayEnd)
        .replace('{workinghours_start_sunday}', workingHours.sundayStart)
        .replace('{workinghours_end_sunday}', workingHours.sundayEnd);
};

async function updateChannelPermissions(channel, newTicketType, userId) {
    try {
        const permissionOverwrites = [
            {
                id: channel.guild.roles.everyone.id,
                deny: ['SendMessages', 'ViewChannel']
            },
            {
                id: userId,
                allow: ['SendMessages', 'ViewChannel', 'AttachFiles', 'EmbedLinks', 'ReadMessageHistory']
            }
        ];

        newTicketType.SupportRole.forEach(roleId => {
            const role = channel.guild.roles.cache.get(roleId);
            if (role) {
                permissionOverwrites.push({
                    id: role.id,
                    allow: ['SendMessages', 'ViewChannel', 'AttachFiles', 'EmbedLinks', 'ReadMessageHistory']
                });
            }
        });

        await channel.permissionOverwrites.set(permissionOverwrites);
    } catch (error) {
        console.error('Error updating channel permissions:', error);
        throw new Error('Failed to update channel permissions');
    }
}

async function moveChannel(channel, newCategoryId) {
    try {
        await channel.setParent(newCategoryId, { lockPermissions: false });
    } catch (error) {
        console.error('Error moving channel:', error);
        throw new Error('Failed to move channel');
    }
}

async function renameChannel(channel, newName) {
    try {
        await channel.setName(newName);
    } catch (error) {
        console.error('Error renaming channel:', error);
        throw new Error('Failed to rename channel');
    }
}

async function autoHandleAlertCancel(ticket, userId, channelId, client) {
    if (!ticket.alertTime || !ticket.alertMessageId || ticket.userId !== userId) {
        return false;
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return false;

        try {
            const alertMessage = await channel.messages.fetch(ticket.alertMessageId);
            if (alertMessage) {
                await alertMessage.delete();
            }
        } catch (error) {
            if (error.code !== 10008) {
                console.error('Error deleting alert message during auto-cancel:', error);
            }
        }

        await Ticket.updateOne(
            { channelId },
            {
                $set: {
                    alertTime: null,
                    alertReason: null,
                    alertMessageId: null
                }
            }
        );

        return true;

    } catch (error) {
        console.error('Error in auto alert cancel:', error);
        return false;
    }
}

async function handlePriorityChange(interaction, ticket, newPriority) {
    const now = Date.now();
    const channel = interaction.channel;
    const ticketType = config.TicketTypes[ticket.ticketType];
    const oldPriority = ticket.priority;

    if (!interaction.member.roles.cache.some(role => ticketType.SupportRole.includes(role.id))) {
        throw new Error('NO_PERMISSION');
    }

    const lastChange = priorityChangeCooldowns.get(ticket.channelId);
    if (lastChange && now - lastChange < PRIORITY_CHANGE_COOLDOWN) {
        const remainingTime = Math.ceil((PRIORITY_CHANGE_COOLDOWN - (now - lastChange)) / 1000);
        throw new Error(`COOLDOWN:${remainingTime}`);
    }

    ticket.priority = newPriority;
    await ticket.save();
    priorityChangeCooldowns.set(ticket.channelId, now);

    const member = await interaction.guild.members.fetch(ticket.userId);
    const newName = ticketType.ChannelName
        .replace('{ticket-id}', ticket.ticketId)
        .replace('{user}', member?.user.username || 'unknown')
        .replace('{priority}', newPriority);

    const willBeQueued = now - lastRenameTime < RENAME_COOLDOWN || channelRenameQueue.size > 0;
    const description = `Ticket priority has been changed from **${oldPriority}** to **${newPriority}** by <@${interaction.user.id}>` +
        (willBeQueued ? '\n\n? This action has been queued, it can take up to 1 minute.' : '');

    const responseEmbed = new EmbedBuilder()
        .setColor(PRIORITY_COLORS[newPriority])
        .setDescription(description);

    await interaction.reply({ embeds: [responseEmbed], flags: MessageFlags.Ephemeral });

    await queueChannelRename(channel, newName, ticket, ticketType);

    if (config.Priority.Levels[newPriority]?.MoveTop) {
        const category = channel.parent;
        if (category) {
            const firstPosition = category.children.cache
                .filter(ch => ch.id !== channel.id)
                .first()?.position || 0;
            await channel.setPosition(firstPosition);
        }
    }

    const notifPlaceholders = {
        oldPriority,
        newPriority,
        changedBy: interaction.user.id,
        priorityColor: PRIORITY_COLORS[newPriority]
    };

    if (config.TicketNotifications?.PriorityChanged?.Components) {
        const replacer = createSimplePlaceholderReplacer(notifPlaceholders);
        await sendComponentsV2Message(interaction.client, channel.id, { Components: config.TicketNotifications.PriorityChanged.Components }, replacer);
    } else {
        const notificationEmbed = new EmbedBuilder()
            .setColor(PRIORITY_COLORS[newPriority])
            .setDescription(`Ã°ÂÂÂ **Priority Update**\n\nPriority changed from **${oldPriority}** to **${newPriority}**\nUpdated by: <@${interaction.user.id}>`);
        await channel.send({ embeds: [notificationEmbed] });
    }

    notifyWatchers(interaction.client, ticket, 'priority', {
        oldPriority,
        newPriority,
        changedBy: interaction.user.id,
        excludeUser: interaction.user.id
    });
}

module.exports = {
    autoHandleAlertCancel,
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('Various ticket commands for managing tickets')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the ticket')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add to the ticket')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('alert')
                .setDescription('Send an alert about pending ticket closure.')
                .addStringOption(option => 
                    option
                        .setName('reason')
                        .setDescription('Reason for the alert')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel-alert')
                .setDescription('Cancel an active alert for this ticket.')
        )
        .addSubcommandGroup(group =>
            group
                .setName('blacklist')
                .setDescription('Manage the blacklist')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Blacklist a user from opening tickets')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('The user to blacklist')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('reason')
                                .setDescription('Reason for blacklisting')
                                .setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('view')
                        .setDescription('View the blacklist reason for a user')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('The user to check')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a user from the blacklist')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('The user to remove from the blacklist')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('addtemp')
                        .setDescription('Temporarily blacklist a user from opening tickets')
                        .addUserOption(option =>
                            option.setName('user')
                                .setDescription('The user to blacklist')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName('duration')
                                .setDescription('Duration of the blacklist')
                                .setRequired(true)
                                .setMinValue(1)
                        )
                        .addStringOption(option =>
                            option.setName('unit')
                                .setDescription('Time unit for the duration')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Minutes', value: 'minutes' },
                                    { name: 'Hours', value: 'hours' },
                                    { name: 'Days', value: 'days' },
                                    { name: 'Weeks', value: 'weeks' }
                                )
                        )
                        .addStringOption(option =>
                            option.setName('reason')
                                .setDescription('Reason for blacklisting')
                                .setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('View all blacklisted users')
                )
        )
        .addSubcommand(subcommand => {
            const closeCommand = subcommand
                .setName('close')
                .setDescription('Close the current ticket')
                .addBooleanOption(option =>
                    option
                        .setName('silent')
                        .setDescription('Silently close and delete the ticket without triggering any events')
                        .setRequired(false)
                );

            if (config.TicketSettings.CloseReasons.Enabled) {
                closeCommand.addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for closing the ticket')
                        .setRequired(false)
                        .addChoices(
                            ...config.TicketSettings.CloseReasons.Reasons.map(reason => ({
                                name: `${reason.emoji} ${reason.name}`,
                                value: reason.value
                            }))
                        )
                );

                if (config.TicketSettings.CloseReasons.AllowCustomReason) {
                    closeCommand.addStringOption(option =>
                        option
                            .setName('custom_reason')
                            .setDescription('Custom reason for closing the ticket')
                            .setRequired(false)
                    );
                }
            }

            return closeCommand;
        })
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Send the ticket panel')
                .addStringOption(option => {
                    option.setName('panel')
                        .setDescription('The panel to display')
                        .setRequired(true);

                    Object.keys(config.TicketPanelSettings).forEach(panel => {
                        option.addChoices({ name: panel, value: panel });
                    });

                    return option;
                })
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the ticket')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove from the ticket')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rename')
                .setDescription('Rename the ticket channel')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The new name for the ticket channel')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show general ticket stats')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('transfer')
                .setDescription('Transfer a ticket to a new type')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('The new ticket type')
                        .setRequired(true)
                        .addChoices(
                            ...Object.keys(config.TicketTypes).map(key => ({
                                name: config.TicketTypes[key].Name,
                                value: key
                            }))
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('priority')
                .setDescription('Change the priority of the ticket')
                .addStringOption(option => {
                    const priorityOption = option
                        .setName('priority')
                        .setDescription('The new priority level')
                        .setRequired(true);

                    const priorityEmojis = {
                                'Low': 'Ã°ÂÂÂ¢',
        'Medium': 'Ã°ÂÂÂ¡',
        'High': 'Ã°ÂÂÂ´'
                    };

                    const choices = Object.keys(config.Priority.Levels).map(level => ({
                        name: `${priorityEmojis[level] || ''} ${level} Priority`,
                        value: level
                    }));

                    priorityOption.addChoices(...choices);
                    return priorityOption;
                })
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('closerequest')
                .setDescription('Request the ticket creator to close the ticket')
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the close request')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('watch')
                .setDescription('Watch this ticket to receive DM notifications on updates')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unwatch')
                .setDescription('Stop watching this ticket')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('watchers')
                .setDescription('View all users watching this ticket')
        ),
    category: 'Utility',
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        if (subcommand === 'add' && !group) {
            try {
                const userToAdd = interaction.options.getUser('user');
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

                if (!ticket) {
                    return interaction.reply({ content: 'This command can only be used within a ticket channel.', flags: MessageFlags.Ephemeral });
                }

                const supportRoles = config.TicketTypes[ticket.ticketType].SupportRole;
                const hasSupportRole = interaction.member.roles.cache.some(role => supportRoles.includes(role.id));

                if (!hasSupportRole) {
                    return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                }

                const channel = interaction.channel;

                const memberPermissions = channel.permissionsFor(userToAdd);
                if (memberPermissions && memberPermissions.has(PermissionsBitField.Flags.ViewChannel, false)) {
                    return interaction.reply({ content: 'User is already added to this ticket.', flags: MessageFlags.Ephemeral });
                }

                await channel.permissionOverwrites.create(userToAdd, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                });

                await interaction.reply({ content: `Successfully added ${userToAdd.tag} to the ticket.`, flags: MessageFlags.Ephemeral });

                const addPlaceholders = {
                    addedUser: userToAdd.id,
                    addedBy: interaction.user.id
                };

                if (config.TicketNotifications?.UserAdded?.Components) {
                    const replacer = createSimplePlaceholderReplacer(addPlaceholders);
                    await sendComponentsV2Message(interaction.client, channel.id, { Components: config.TicketNotifications.UserAdded.Components }, replacer);
                } else {
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(`<@${userToAdd.id}> has been added to the ticket by <@${interaction.user.id}>.`);
                    await channel.send({ embeds: [notificationEmbed] });
                }

                notifyWatchers(interaction.client, ticket, 'user_added', {
                    addedUser: userToAdd.id,
                    addedBy: interaction.user.id,
                    excludeUser: interaction.user.id
                });
            } catch (error) {
                console.error('Error adding user to ticket:', error);
                await interaction.reply({ content: 'An error occurred while adding the user to the ticket. Please try again later.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'alert' && !group) {
            const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
            if (!ticket) {
                return interaction.reply({ content: 'This command can only be used in ticket channels.', flags: MessageFlags.Ephemeral });
            }

            const ticketType = config.TicketTypes[ticket.ticketType];
            if (!ticketType) {
                return interaction.reply({ content: 'Ticket type configuration not found.', flags: MessageFlags.Ephemeral });
            }

            const supportRoles = ticketType.SupportRole;
            if (!interaction.member.roles.cache.some(role => supportRoles.includes(role.id))) {
                return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
            }

            if (!config.Alert.Enabled) {
                return interaction.reply({ content: 'Alert feature is disabled.', flags: MessageFlags.Ephemeral });
            }

            if (ticket.alertTime && ticket.alertMessageId && ticket.alertTime > new Date()) {
                const existingTimestamp = `<t:${Math.floor(ticket.alertTime.getTime() / 1000)}:R>`;
                return interaction.reply({ 
                    content: `Ã¢ÂÂ Ã¯Â¸Â An alert is already active for this ticket. It will trigger ${existingTimestamp}.\n\nUse \`/tickets cancel-alert\` to cancel the existing alert first.`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const reason = interaction.options.getString('reason') || 'No reason provided';
            const timeDuration = config.Alert.Time;
            const alertDurationMs = parseDuration(timeDuration);
            const alertTime = new Date(Date.now() + alertDurationMs);
            const discordTimestamp = `<t:${Math.floor(alertTime.getTime() / 1000)}:R>`;

            const placeholders = {
                user: `<@${ticket.userId}>`,
                time: discordTimestamp,
                reason: reason
            };

            const closeButton = new ButtonBuilder()
                .setCustomId(`ticketclose-${ticket.ticketId}`)
                .setLabel(config.Alert?.Embed?.Button?.Label || 'Close Ticket')
                .setStyle(ButtonStyle[config.Alert?.Embed?.Button?.Style || 'Danger'])
                .setEmoji(config.Alert?.Embed?.Button?.Emoji || 'Ã°ÂÂÂ');

            const actionRow = new ActionRowBuilder().addComponents(closeButton);

            const tagMessage = await interaction.channel.send(`<@${ticket.userId}>`);
            
            let alertMessage;
            if (config.Alert?.Components && Array.isArray(config.Alert.Components)) {
                const replacer = createSimplePlaceholderReplacer(placeholders);
                alertMessage = await sendComponentsV2Message(interaction.client, interaction.channel.id, { Components: config.Alert.Components }, replacer, [actionRow]);
            } else if (config.Alert?.Embed) {
                const alertConfig = config.Alert.Embed;
                const embed = new EmbedBuilder()
                    .setDescription(alertConfig.Description.join('\n')
                        .replace('{user}', placeholders.user)
                        .replace('{time}', placeholders.time)
                        .replace('{reason}', placeholders.reason));

                if (alertConfig.Title) embed.setTitle(alertConfig.Title);
                if (alertConfig.Color) embed.setColor(alertConfig.Color);
                if (alertConfig.Footer?.Text) {
                    embed.setFooter({
                        text: alertConfig.Footer.Text,
                        iconURL: alertConfig.Footer.Icon || null
                    });
                }
                if (alertConfig.Author?.Text) {
                    embed.setAuthor({
                        name: alertConfig.Author.Text,
                        iconURL: alertConfig.Author.Icon || null
                    });
                }
                if (alertConfig.Image) embed.setImage(alertConfig.Image);
                if (alertConfig.Thumbnail) embed.setThumbnail(alertConfig.Thumbnail);

                alertMessage = await interaction.channel.send({ embeds: [embed], components: [actionRow] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Ã¢ÂÂ Ã¯Â¸Â Ticket Alert')
                    .setDescription(`This ticket requires attention.\n\n**User:** ${placeholders.user}\n**Time Until Close:** ${placeholders.time}\n**Reason:** ${placeholders.reason}`);
                alertMessage = await interaction.channel.send({ embeds: [embed], components: [actionRow] });
            }

            setTimeout(() => tagMessage.delete(), 500);

            await Ticket.findOneAndUpdate(
                { channelId: interaction.channel.id },
                {
                    alertTime: alertTime,
                    alertReason: reason,
                    alertMessageId: alertMessage.id
                }
            );

            if (config.Alert.DM?.Enabled) {
                try {
                    const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
                    if (!user) {
                        console.warn(`Ticket user not found: ${ticket.userId}`);
                        return;
                    }
                    const guild = interaction.guild;
                    const ticketUrl = `https://discord.com/channels/${guild.id}/${ticket.channelId}`;

                    const dmPlaceholders = {
                        user: `<@${ticket.userId}>`,
                        guild: guild.name,
                        time: discordTimestamp,
                        reason: reason
                    };

                    const ticketButton = new ButtonBuilder()
                        .setLabel(config.Alert.DM?.Button?.Label || 'Go to Ticket')
                        .setStyle(ButtonStyle.Link)
                        .setURL(ticketUrl)
                        .setEmoji(config.Alert.DM?.Button?.Emoji || 'Ã°ÂÂÂ¨');

                    const dmActionRow = new ActionRowBuilder().addComponents(ticketButton);

                    if (config.Alert.DM?.Components && Array.isArray(config.Alert.DM.Components)) {
                        const { REST, Routes } = require('discord.js');
                        const rest = new REST({ version: '10' }).setToken(interaction.client.token);
                        const dmChannel = await user.createDM();
                        const replacer = createSimplePlaceholderReplacer(dmPlaceholders);
                        const v2Components = buildComponentsV2Payload({ Components: config.Alert.DM.Components }, replacer, []);
                        if (v2Components && v2Components.length > 0) {
                            v2Components.push(dmActionRow.toJSON());
                            await rest.post(Routes.channelMessages(dmChannel.id), {
                                body: { flags: 32768, components: v2Components, allowed_mentions: { parse: [] } }
                            }).catch(() => {
                                if (config.Alert.DM?.LogFailures) {
                                    interaction.channel.send({ content: 'Unable to send DM to the user. They may have DMs disabled.' }).catch(() => {});
                                }
                            });
                        }
                    } else if (config.Alert.DM?.Embed) {
                        const dmConfig = config.Alert.DM.Embed;
                        const dmEmbed = new EmbedBuilder();

                        if (dmConfig.Title) dmEmbed.setTitle(dmConfig.Title);
                        if (dmConfig.Color) dmEmbed.setColor(dmConfig.Color);
                        
                        const description = dmConfig.Description
                            .join('\n')
                            .replace('{user}', dmPlaceholders.user)
                            .replace('{guild}', dmPlaceholders.guild)
                            .replace('{time}', dmPlaceholders.time)
                            .replace('{reason}', dmPlaceholders.reason);
                        
                        dmEmbed.setDescription(description);

                        if (dmConfig.Footer?.Text) {
                            dmEmbed.setFooter({
                                text: dmConfig.Footer.Text,
                                iconURL: dmConfig.Footer.Icon || null
                            });
                        }
                        if (dmConfig.Author?.Text) {
                            dmEmbed.setAuthor({
                                name: dmConfig.Author.Text,
                                iconURL: dmConfig.Author.Icon || null
                            });
                        }
                        if (dmConfig.Image) dmEmbed.setImage(dmConfig.Image);
                        if (dmConfig.Thumbnail) dmEmbed.setThumbnail(dmConfig.Thumbnail);

                        await user.send({
                            embeds: [dmEmbed],
                            components: [dmActionRow]
                        }).catch(() => {
                            if (config.Alert.DM?.LogFailures) {
                                interaction.channel.send({ content: 'Unable to send DM to the user. They may have DMs disabled.' }).catch(() => {});
                            }
                        });
                    }
                } catch (error) {
                    if (error.code !== 50007) {
                        console.error('Error sending DM:', error);
                    }
                }
            }

            notifyWatchers(interaction.client, ticket, 'alert', {
                excludeUser: interaction.user.id
            });

            if (interaction.user.id !== interaction.client.user.id) {
                await interaction.editReply({ 
                    content: `Alert sent successfully! The ticket will be automatically closed ${discordTimestamp} if no response is received.`
                });
            }

        } else if (subcommand === 'cancel-alert' && !group) {
            try {
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.reply({ content: 'This command can only be used in ticket channels.', flags: MessageFlags.Ephemeral });
                }

                const ticketType = config.TicketTypes[ticket.ticketType];
                if (!ticketType) {
                    return interaction.reply({ content: 'Ticket type configuration not found.', flags: MessageFlags.Ephemeral });
                }

                const supportRoles = ticketType.SupportRole;
                if (!interaction.member.roles.cache.some(role => supportRoles.includes(role.id))) {
                    return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
                }

                if (!ticket.alertTime || !ticket.alertMessageId) {
                    return interaction.reply({ content: 'No active alert found for this ticket.', flags: MessageFlags.Ephemeral });
                }

                try {
                    const alertMessage = await interaction.channel.messages.fetch(ticket.alertMessageId);
                    if (alertMessage) {
                        await alertMessage.delete();
                    }
                } catch (error) {
                    if (error.code !== 10008) {
                        console.error('Error deleting alert message:', error);
                    }
                }

                const autoAlertDuration = ticketType.AutoAlert ? parseDuration(ticketType.AutoAlert) : 0;
                ticket.alertTime = autoAlertDuration > 0 ? new Date(Date.now() + autoAlertDuration) : null;
                ticket.alertReason = null;
                ticket.alertMessageId = null;
                await ticket.save();

                await interaction.reply({ content: 'Alert has been cancelled.', flags: MessageFlags.Ephemeral });

                const cancelPlaceholders = { cancelledBy: interaction.user.id };

                if (config.TicketNotifications?.AlertCancelled?.Components) {
                    const replacer = createSimplePlaceholderReplacer(cancelPlaceholders);
                    await sendComponentsV2Message(interaction.client, interaction.channel.id, { Components: config.TicketNotifications.AlertCancelled.Components }, replacer);
                } else {
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription((lang.Tickets?.AlertCancelledBy || 'Alert has been cancelled by {user}.').replace('{user}', `<@${interaction.user.id}>`));
                    await interaction.channel.send({ embeds: [notificationEmbed] });
                }

            } catch (error) {
                console.error('Error cancelling alert:', error);
                await interaction.reply({ content: 'An error occurred while cancelling the alert. Please try again later.', flags: MessageFlags.Ephemeral });
            }

        } else if (group === 'blacklist') {
            if (subcommand === 'add') {
                try {
                    const userToBlacklist = interaction.options.getUser('user');
                    const reason = interaction.options.getString('reason') || 'No reason provided';
                    const supportRoles = config.ModerationRoles.blacklist;
                    const hasPermission = interaction.member.roles.cache.some(role => supportRoles.includes(role.id)) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                    if (!hasPermission) {
                        return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                    }

                    const existingEntry = await Blacklist.findOne({ userId: userToBlacklist.id });
                    if (existingEntry) {
                        return interaction.reply({ content: `${userToBlacklist.tag} is already blacklisted.`, flags: MessageFlags.Ephemeral });
                    }

                    const blacklistEntry = new Blacklist({
                        userId: userToBlacklist.id,
                        addedBy: interaction.user.id,
                        addedAt: new Date(),
                        reason: reason
                    });

                    await blacklistEntry.save();

                    const blPlaceholders = {
                        userId: userToBlacklist.id,
                        reason: reason,
                        addedBy: interaction.user.id,
                        date: `<t:${Math.floor(new Date(blacklistEntry.addedAt).getTime() / 1000)}:F>`,
                        userIcon: userToBlacklist.displayAvatarURL({ dynamic: true })
                    };

                    if (config.TicketNotifications?.Blacklist?.Added?.Components) {
                        const { REST, Routes } = require('discord.js');
                        const rest = new REST({ version: '10' }).setToken(interaction.client.token);
                        const replacer = createSimplePlaceholderReplacer(blPlaceholders);
                        const v2Components = buildComponentsV2Payload({ Components: config.TicketNotifications.Blacklist.Added.Components }, replacer, []);
                        if (v2Components && v2Components.length > 0) {
                            await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
                                body: { type: 4, data: { flags: 32768 | 64, components: v2Components } }
                            });
                        } else {
                            await interaction.reply({ content: `<@${userToBlacklist.id}> has been blacklisted.`, flags: MessageFlags.Ephemeral });
                        }
                    } else {
                        const blConfig = lang.Tickets?.BlacklistManagement?.UserBlacklisted || {};
                        const embed = new EmbedBuilder()
                            .setColor(blConfig.Color || '#FF0000')
                            .setTitle(blConfig.Title || 'Ã°ÂÂÂ« User Blacklisted')
                            .setDescription((blConfig.Description || '{user} has been blacklisted from opening tickets.').replace('{user}', `**<@${userToBlacklist.id}>**`))
                            .addFields(
                                { name: blConfig.Fields?.Reason || 'Reason', value: reason, inline: false },
                                { name: blConfig.Fields?.BlacklistedBy || 'Blacklisted By', value: `<@${interaction.user.id}>`, inline: true },
                                { name: blConfig.Fields?.Date || 'Date', value: `<t:${Math.floor(new Date(blacklistEntry.addedAt).getTime() / 1000)}:F>`, inline: true }
                            )
                            .setThumbnail(userToBlacklist.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: blConfig.Footer || 'Contact an admin if you believe this is a mistake.' });
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    console.error('Error blacklisting user:', error);
                    await interaction.reply({ content: 'An error occurred while blacklisting the user. Please try again later.', flags: MessageFlags.Ephemeral });
                }
            } else if (subcommand === 'view') {
                try {
                    const userToCheck = interaction.options.getUser('user');
                    const supportRoles = config.ModerationRoles.blacklist;
                    const hasPermission = interaction.member.roles.cache.some(role => supportRoles.includes(role.id)) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                    if (!hasPermission) {
                        return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                    }

                    const blacklistEntry = await Blacklist.findOne({ userId: userToCheck.id });

                    if (!blacklistEntry) {
                        return interaction.reply({ content: `${userToCheck.tag} is not blacklisted.`, flags: MessageFlags.Ephemeral });
                    }

                    const viewPlaceholders = {
                        userId: blacklistEntry.userId,
                        addedBy: blacklistEntry.addedBy,
                        reason: blacklistEntry.reason,
                        date: `<t:${Math.floor(new Date(blacklistEntry.addedAt).getTime() / 1000)}:F>`,
                        userIcon: userToCheck.displayAvatarURL({ dynamic: true })
                    };

                    if (config.TicketNotifications?.Blacklist?.View?.Components) {
                        const { REST, Routes } = require('discord.js');
                        const rest = new REST({ version: '10' }).setToken(interaction.client.token);
                        const replacer = createSimplePlaceholderReplacer(viewPlaceholders);
                        const v2Components = buildComponentsV2Payload({ Components: config.TicketNotifications.Blacklist.View.Components }, replacer, []);
                        if (v2Components && v2Components.length > 0) {
                            await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
                                body: { type: 4, data: { flags: 32768 | 64, components: v2Components } }
                            });
                        } else {
                            await interaction.reply({ content: `<@${blacklistEntry.userId}> is blacklisted.`, flags: MessageFlags.Ephemeral });
                        }
                    } else {
                        const blInfoConfig = lang.Tickets?.BlacklistManagement?.BlacklistInfo || {};
                        const embed = new EmbedBuilder()
                            .setColor(blInfoConfig.Color || '#FFA500')
                            .setTitle(blInfoConfig.Title || 'Ã°ÂÂÂ Blacklist Information')
                            .addFields(
                                { name: blInfoConfig.Fields?.User || 'User', value: `<@${blacklistEntry.userId}>`, inline: true },
                                { name: blInfoConfig.Fields?.BlacklistedBy || 'Blacklisted By', value: `<@${blacklistEntry.addedBy}>`, inline: true },
                                { name: blInfoConfig.Fields?.Reason || 'Reason', value: blacklistEntry.reason, inline: false },
                                { name: blInfoConfig.Fields?.Date || 'Date', value: `<t:${Math.floor(new Date(blacklistEntry.addedAt).getTime() / 1000)}:F>`, inline: true }
                            )
                            .setThumbnail(userToCheck.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: blInfoConfig.Footer || 'Contact an admin if you need more information.' });
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    console.error('Error fetching blacklist information:', error);
                    await interaction.reply({ content: 'An error occurred while fetching the blacklist information. Please try again later.', flags: MessageFlags.Ephemeral });
                }
            } else if (subcommand === 'remove') {
                try {
                    const userToRemove = interaction.options.getUser('user');
                    const supportRoles = config.ModerationRoles.blacklist;
                    const hasPermission = interaction.member.roles.cache.some(role => supportRoles.includes(role.id)) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                    if (!hasPermission) {
                        return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                    }

                    const result = await Blacklist.findOneAndDelete({ userId: userToRemove.id });

                    if (!result) {
                        return interaction.reply({ content: `${userToRemove.tag} is not blacklisted.`, flags: MessageFlags.Ephemeral });
                    }

                    const removePlaceholders = {
                        userId: userToRemove.id,
                        removedBy: interaction.user.id,
                        date: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`,
                        userIcon: userToRemove.displayAvatarURL({ dynamic: true })
                    };

                    if (config.TicketNotifications?.Blacklist?.Removed?.Components) {
                        const { REST, Routes } = require('discord.js');
                        const rest = new REST({ version: '10' }).setToken(interaction.client.token);
                        const replacer = createSimplePlaceholderReplacer(removePlaceholders);
                        const v2Components = buildComponentsV2Payload({ Components: config.TicketNotifications.Blacklist.Removed.Components }, replacer, []);
                        if (v2Components && v2Components.length > 0) {
                            await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
                                body: { type: 4, data: { flags: 32768 | 64, components: v2Components } }
                            });
                        } else {
                            await interaction.reply({ content: `<@${userToRemove.id}> has been removed from the blacklist.`, flags: MessageFlags.Ephemeral });
                        }
                    } else {
                        const unblConfig = lang.Tickets?.BlacklistManagement?.UserUnblacklisted || {};
                        const embed = new EmbedBuilder()
                            .setColor(unblConfig.Color || '#00FF00')
                            .setTitle(unblConfig.Title || 'Ã¢ÂÂ User Removed from Blacklist')
                            .setDescription((unblConfig.Description || '{user} has been removed from the blacklist.').replace('{user}', `**<@${userToRemove.id}>**`))
                            .addFields(
                                { name: unblConfig.Fields?.RemovedBy || 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
                                { name: unblConfig.Fields?.Date || 'Date', value: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`, inline: true }
                            )
                            .setThumbnail(userToRemove.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: unblConfig.Footer || 'The user can now open tickets again.' });
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    console.error('Error removing user from blacklist:', error);
                    await interaction.reply({ content: 'An error occurred while removing the user from the blacklist. Please try again later.', flags: MessageFlags.Ephemeral });
                }
            } else if (subcommand === 'addtemp') {
                try {
                    const userToBlacklist = interaction.options.getUser('user');
                    const duration = interaction.options.getInteger('duration');
                    const unit = interaction.options.getString('unit');
                    const reason = interaction.options.getString('reason') || 'No reason provided';
                    const supportRoles = config.ModerationRoles.blacklist;
                    const hasPermission = interaction.member.roles.cache.some(role => supportRoles.includes(role.id)) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                    if (!hasPermission) {
                        return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                    }

                    const existingEntry = await Blacklist.findOne({ userId: userToBlacklist.id });
                    if (existingEntry) {
                        return interaction.reply({ content: `${userToBlacklist.tag} is already blacklisted.`, flags: MessageFlags.Ephemeral });
                    }

                    const unitMs = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
                    const expiresAt = new Date(Date.now() + duration * unitMs[unit]);

                    const blacklistEntry = new Blacklist({
                        userId: userToBlacklist.id,
                        addedBy: interaction.user.id,
                        addedAt: new Date(),
                        reason: reason,
                        type: 'temporary',
                        expiresAt: expiresAt
                    });

                    await blacklistEntry.save();

                    const blPlaceholders = {
                        userId: userToBlacklist.id,
                        reason: reason,
                        addedBy: interaction.user.id,
                        date: `<t:${Math.floor(blacklistEntry.addedAt.getTime() / 1000)}:F>`,
                        expiresAt: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
                        expiresRelative: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
                        duration: `${duration} ${unit}`,
                        userIcon: userToBlacklist.displayAvatarURL({ dynamic: true })
                    };

                    if (config.TicketNotifications?.Blacklist?.TempAdded?.Components) {
                        const { REST, Routes } = require('discord.js');
                        const rest = new REST({ version: '10' }).setToken(interaction.client.token);
                        const replacer = createSimplePlaceholderReplacer(blPlaceholders);
                        const v2Components = buildComponentsV2Payload({ Components: config.TicketNotifications.Blacklist.TempAdded.Components }, replacer, []);
                        if (v2Components && v2Components.length > 0) {
                            await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
                                body: { type: 4, data: { flags: 32768 | 64, components: v2Components } }
                            });
                        } else {
                            await interaction.reply({ content: `<@${userToBlacklist.id}> has been temporarily blacklisted for ${duration} ${unit}.`, flags: MessageFlags.Ephemeral });
                        }
                    } else {
                        const embed = new EmbedBuilder()
                            .setColor('#FF8C00')
                            .setTitle('Ã¢ÂÂ³ User Temporarily Blacklisted')
                            .setDescription(`<@${userToBlacklist.id}> has been temporarily blacklisted from opening tickets.`)
                            .addFields(
                                { name: 'Reason', value: reason, inline: false },
                                { name: 'Duration', value: `${duration} ${unit}`, inline: true },
                                { name: 'Expires', value: `${blPlaceholders.expiresAt} (${blPlaceholders.expiresRelative})`, inline: true },
                                { name: 'Blacklisted By', value: `<@${interaction.user.id}>`, inline: true }
                            )
                            .setThumbnail(userToBlacklist.displayAvatarURL({ dynamic: true }))
                            .setFooter({ text: 'This blacklist will expire automatically.' });
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    console.error('Error temporarily blacklisting user:', error);
                    await interaction.reply({ content: 'An error occurred while blacklisting the user. Please try again later.', flags: MessageFlags.Ephemeral });
                }
            } else if (subcommand === 'list') {
                try {
                    const supportRoles = config.ModerationRoles.blacklist;
                    const hasPermission = interaction.member.roles.cache.some(role => supportRoles.includes(role.id)) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                    if (!hasPermission) {
                        return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                    }

                    await Blacklist.deleteMany({ type: 'temporary', expiresAt: { $lte: new Date() } });

                    const blacklistedUsers = await Blacklist.find({}).sort({ addedAt: -1 });

                    if (!blacklistedUsers.length) {
                        return interaction.reply({ content: 'There are no blacklisted users.', flags: MessageFlags.Ephemeral });
                    }

                    const itemsPerPage = 5;
                    const totalPages = Math.ceil(blacklistedUsers.length / itemsPerPage);
                    let currentPage = 0;

                    const generateEmbed = (page) => {
                        const start = page * itemsPerPage;
                        const pageEntries = blacklistedUsers.slice(start, start + itemsPerPage);

                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('Ã°ÂÂÂ Blacklisted Users')
                            .setFooter({ text: `Page ${page + 1} of ${totalPages} Ã¢ÂÂ¢ ${blacklistedUsers.length} total entries` });

                        const description = pageEntries.map((entry, i) => {
                            const num = start + i + 1;
                            const type = entry.type === 'temporary' ? 'Ã¢ÂÂ³ Temporary' : 'Ã°ÂÂÂ Permanent';
                            const expires = entry.expiresAt ? `\n> **Expires:** <t:${Math.floor(entry.expiresAt.getTime() / 1000)}:R>` : '';
                            return `**${num}.** <@${entry.userId}>\n> **Type:** ${type}\n> **Reason:** ${entry.reason}\n> **By:** <@${entry.addedBy}>\n> **Date:** <t:${Math.floor(new Date(entry.addedAt).getTime() / 1000)}:f>${expires}`;
                        }).join('\n\n');

                        embed.setDescription(description);
                        return embed;
                    };

                    const generateButtons = (page) => {
                        return new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('blacklist_list_prev')
                                .setLabel('Ã¢ÂÂ Previous')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(page === 0),
                            new ButtonBuilder()
                                .setCustomId('blacklist_list_next')
                                .setLabel('Next Ã¢ÂÂ¶')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(page >= totalPages - 1)
                        );
                    };

                    const reply = await interaction.reply({
                        embeds: [generateEmbed(0)],
                        components: totalPages > 1 ? [generateButtons(0)] : [],
                        flags: MessageFlags.Ephemeral
                    });

                    if (totalPages <= 1) return;

                    const collector = reply.createMessageComponentCollector({ time: 120000 });

                    collector.on('collect', async (i) => {
                        if (i.user.id !== interaction.user.id) return;

                        if (i.customId === 'blacklist_list_prev') currentPage--;
                        else if (i.customId === 'blacklist_list_next') currentPage++;

                        await i.update({
                            embeds: [generateEmbed(currentPage)],
                            components: [generateButtons(currentPage)]
                        });
                    });

                    collector.on('end', async () => {
                        try {
                            await interaction.editReply({ components: [] });
                        } catch {}
                    });
                } catch (error) {
                    console.error('Error fetching blacklist:', error);
                    await interaction.reply({ content: 'An error occurred while fetching the blacklist. Please try again later.', flags: MessageFlags.Ephemeral });
                }
            }
        } else if (subcommand === 'close' && !group) {
            try {
                const isSilent = interaction.options.getBoolean('silent') || false;
                const reason = interaction.options.getString('reason');
                const customReason = interaction.options.getString('custom_reason');

                if (isSilent) {
                    try {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        
                        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                        if (!ticket) {
                            return interaction.editReply({ content: 'Ticket not found or already closed.' });
                        }

                        const ticketType = config.TicketTypes[ticket.ticketType];
                        if (ticketType.RestrictDeletion) {
                            const hasSupportRole = interaction.member.roles.cache.some(role => ticketType.SupportRole.includes(role.id));
                            if (!hasSupportRole) {
                                return interaction.reply({ content: 'You do not have permission to close this ticket.', flags: MessageFlags.Ephemeral });
                            }
                        }
                        
                        await interaction.editReply({ content: 'Ticket closed silently.' });
                        
                        await Ticket.findOneAndUpdate(
                            { channelId: interaction.channel.id },
                            { 
                                status: 'deleted', 
                                closedAt: new Date(), 
                                closedBy: interaction.user.id 
                            }
                        );

                        await interaction.channel.delete();
                        return;
                    } catch (error) {
                        console.error('Error in silent close:', error);
                        await safeInteractionResponse(interaction, 
                            'An error occurred while silently closing the ticket.', true
                        );
                        return;
                    }
                }
                
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.editReply({ content: 'Ticket not found or already closed.' });
                }
                
                await handleTicketClose(interaction.client, interaction, ticket.ticketId, reason, customReason);

            } catch (error) {
                console.error('Error executing /close command:', error);
                await safeInteractionResponse(interaction, 
                    'An error occurred while closing the ticket. Please try again later.', true
                );
            }

        } else if (subcommand === 'panel' && !group) {
            try {
                if (!config.TicketSettings?.Enabled) {
                    return interaction.reply({ content: 'This command has been disabled in the config!', flags: MessageFlags.Ephemeral });
                }

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                }

                const selectedPanel = interaction.options.getString('panel');
                const panelConfig = config.TicketPanelSettings[selectedPanel];

                if (!panelConfig) {
                    return interaction.reply({ content: 'Invalid panel selected!', flags: MessageFlags.Ephemeral });
                }

                const currentTime = moment().tz(config.WorkingHours.Timezone);
                const currentDay = currentTime.format('dddd');
                const formattedDay = currentDay.charAt(0).toUpperCase() + currentDay.slice(1).toLowerCase();
                const workingHoursPlaceholders = {
                    guildIcon: interaction.guild.iconURL({ dynamic: true }) || ''
                };
                
                if (config.WorkingHours.NonWorkingDays && config.WorkingHours.NonWorkingDays.includes(formattedDay)) {
                    workingHoursPlaceholders.workinghours_start = "N/A";
                    workingHoursPlaceholders.workinghours_end = "N/A";
                } else {
                    const workingHours = config.WorkingHours.Schedule[formattedDay];
                    if (workingHours) {
                        const [start, end] = workingHours.split('-');
                        const [startHour, startMinute] = start.split(':');
                        const [endHour, endMinute] = end.split(':');
                        const now = moment().tz(config.WorkingHours.Timezone);
                        const startTime = now.clone().hour(parseInt(startHour)).minute(parseInt(startMinute)).second(0).millisecond(0);
                        const endTime = now.clone().hour(parseInt(endHour)).minute(parseInt(endMinute)).second(0).millisecond(0);
                        workingHoursPlaceholders.workinghours_start = `<t:${startTime.unix()}:t>`;
                        workingHoursPlaceholders.workinghours_end = `<t:${endTime.unix()}:t>`;
                    }
                }
                
                Object.keys(config.WorkingHours.Schedule).forEach(day => {
                    const dayLower = day.toLowerCase();
                    if (config.WorkingHours.NonWorkingDays && config.WorkingHours.NonWorkingDays.includes(day)) {
                        workingHoursPlaceholders[`workinghours_start_${dayLower}`] = "N/A";
                        workingHoursPlaceholders[`workinghours_end_${dayLower}`] = "N/A";
                    } else {
                        const [dayStart, dayEnd] = config.WorkingHours.Schedule[day].split('-');
                        const [startHour, startMinute] = dayStart.split(':');
                        const [endHour, endMinute] = dayEnd.split(':');
                        const now = moment().tz(config.WorkingHours.Timezone);
                        const dayStartTime = now.clone().hour(parseInt(startHour)).minute(parseInt(startMinute)).second(0).millisecond(0);
                        const dayEndTime = now.clone().hour(parseInt(endHour)).minute(parseInt(endMinute)).second(0).millisecond(0);
                        workingHoursPlaceholders[`workinghours_start_${dayLower}`] = `<t:${dayStartTime.unix()}:t>`;
                        workingHoursPlaceholders[`workinghours_end_${dayLower}`] = `<t:${dayEndTime.unix()}:t>`;
                    }
                });

                const { useSelectMenu } = config.TicketSettings;

                const rows = [];
                let currentRow = new ActionRowBuilder();

                if (useSelectMenu) {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('ticketcreate')
                        .setPlaceholder(lang.Tickets.TicketTypePlaceholder);

                    selectMenu.addOptions({
                        label: lang.Tickets.TicketTypePlaceholder,
                        value: 'nothing_selected',
                        default: true
                    });

                    Object.keys(config.TicketTypes).forEach(key => {
                        const ticketType = config.TicketTypes[key];
                        if (ticketType.Enabled && ticketType.Panel === selectedPanel) {
                            selectMenu.addOptions({
                                label: replacePlaceholders(ticketType.Button.Name || 'Unnamed Ticket', workingHoursPlaceholders),
                                emoji: ticketType.Button.Emoji || '',
                                value: key,
                                description: replacePlaceholders(ticketType.Button.Description || '', workingHoursPlaceholders)
                            });
                        }
                    });

                    if (selectMenu.options.length > 0) {
                        currentRow.addComponents(selectMenu);
                        rows.push(currentRow);
                    } else {
                        throw new Error('No ticket types are enabled for this panel.');
                    }
                } else {
                    Object.keys(config.TicketTypes).forEach(key => {
                        const ticketType = config.TicketTypes[key];
                        if (ticketType.Enabled && ticketType.Panel === selectedPanel) {
                            const buttonStyleMap = {
                                'Primary': ButtonStyle.Primary,
                                'Secondary': ButtonStyle.Secondary,
                                'Success': ButtonStyle.Success,
                                'Danger': ButtonStyle.Danger
                            };
                            const buttonStyle = buttonStyleMap[ticketType.Button.Style] || ButtonStyle.Primary;

                            currentRow.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`ticketcreate-${key}`)
                                    .setLabel(replacePlaceholders(ticketType.Button.Name || 'Unnamed Ticket', workingHoursPlaceholders))
                                    .setEmoji(ticketType.Button.Emoji || '')
                                    .setStyle(buttonStyle)
                            );

                            if (currentRow.components.length === 5) {
                                rows.push(currentRow);
                                currentRow = new ActionRowBuilder();
                            }
                        }
                    });

                    if (currentRow.components.length > 0) {
                        rows.push(currentRow);
                    }

                    if (rows.length === 0) {
                        console.log('\n' + colors.bold.yellow('Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ'));
                        console.log(colors.bold.yellow('Ã°ÂÂÂ« TICKET PANEL WARNING - NO VALID TICKET TYPES'));
                        console.log(colors.bold.yellow('Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ'));
                        console.log(colors.yellow('Ã¢ÂÂ'));
                        console.log(colors.yellow(`Ã¢ÂÂ  Ã¢ÂÂ Ã¯Â¸Â  Warning: No enabled ticket types found for panel "${selectedPanel}"`));
                        console.log(colors.yellow('Ã¢ÂÂ'));
                        console.log(colors.yellow('Ã¢ÂÂ  Ã°ÂÂÂ§ To fix this:'));
                        console.log(colors.yellow('Ã¢ÂÂ     1. Open your tickets.yml file'));
                        console.log(colors.yellow('Ã¢ÂÂ     2. Navigate to the TicketTypes section'));
                        console.log(colors.yellow('Ã¢ÂÂ     3. Ensure at least one ticket type has:'));
                        console.log(colors.yellow('Ã¢ÂÂ        Ã¢ÂÂ¢ Enabled: true'));
                        console.log(colors.yellow(`Ã¢ÂÂ        Ã¢ÂÂ¢ Panel: "${selectedPanel}"`));
                        console.log(colors.yellow('Ã¢ÂÂ     4. Configure CategoryID and SupportRole properly'));
                        console.log(colors.yellow('Ã¢ÂÂ'));
                        console.log(colors.yellow('Ã¢ÂÂ  Ã°ÂÂÂ Example configuration:'));
                        console.log(colors.yellow('Ã¢ÂÂ     TicketType1:'));
                        console.log(colors.yellow('Ã¢ÂÂ       Enabled: true'));
                        console.log(colors.yellow(`Ã¢ÂÂ       Panel: "${selectedPanel}"`));
                        console.log(colors.yellow('Ã¢ÂÂ       Name: "General Support"'));
                        console.log(colors.yellow('Ã¢ÂÂ       CategoryID: "YOUR_CATEGORY_ID"'));
                        console.log(colors.yellow('Ã¢ÂÂ       SupportRole: ["YOUR_ROLE_ID"]'));
                        console.log(colors.yellow('Ã¢ÂÂ'));
                        console.log(colors.yellow('Ã¢ÂÂ  Ã°ÂÂÂ Setup Guide:'));
                        console.log(colors.yellow('Ã¢ÂÂ     Ã°ÂÂÂ https://docs.dragonshosting.nl/core-features/ticket-system'));
                        console.log(colors.yellow('Ã¢ÂÂ'));
                        console.log(colors.bold.yellow('Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ\n'));
                        throw new Error('No enabled ticket types found for this panel.');
                    }
                }

                await interaction.reply({ content: 'Ticket panel sent!', flags: MessageFlags.Ephemeral });
                
                if (panelConfig.Components) {
                    const replacer = createSimplePlaceholderReplacer(workingHoursPlaceholders);
                    await sendComponentsV2Message(
                        interaction.client,
                        interaction.channel.id,
                        { Components: panelConfig.Components },
                        replacer,
                        rows
                    );
                }
            } catch (error) {
                console.error('Error sending ticket panel:', error);
                await safeInteractionResponse(interaction, 
                    'An error occurred while sending the ticket panel.', true
                );
            }
        } else if (subcommand === 'remove' && !group) {
            try {
                const userToRemove = interaction.options.getUser('user');
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

                if (!ticket) {
                    return interaction.reply({ content: 'This command can only be used within a ticket channel.', flags: MessageFlags.Ephemeral });
                }

                const supportRoles = config.TicketTypes[ticket.ticketType].SupportRole;
                const hasSupportRole = interaction.member.roles.cache.some(role => supportRoles.includes(role.id));

                if (!hasSupportRole) {
                    return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                }

                const channel = interaction.channel;

                const memberPermissions = channel.permissionsFor(userToRemove);
                if (!memberPermissions || !memberPermissions.has(PermissionsBitField.Flags.ViewChannel)) {
                    return interaction.reply({ content: 'User is not part of this ticket.', flags: MessageFlags.Ephemeral });
                }

                await channel.permissionOverwrites.create(userToRemove, {
                    ViewChannel: false,
                    SendMessages: false,
                    ReadMessageHistory: false,
                    AttachFiles: false,
                    EmbedLinks: false
                });

                await interaction.reply({ content: `Successfully removed ${userToRemove.tag} from the ticket.`, flags: MessageFlags.Ephemeral });

                const removePlaceholders = {
                    removedUser: userToRemove.id,
                    removedBy: interaction.user.id
                };

                if (config.TicketNotifications?.UserRemoved?.Components) {
                    const replacer = createSimplePlaceholderReplacer(removePlaceholders);
                    await sendComponentsV2Message(interaction.client, channel.id, { Components: config.TicketNotifications.UserRemoved.Components }, replacer);
                } else {
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription(`<@${userToRemove.id}> has been removed from the ticket by <@${interaction.user.id}>.`);
                    await channel.send({ embeds: [notificationEmbed] });
                }

                notifyWatchers(interaction.client, ticket, 'user_removed', {
                    removedUser: userToRemove.id,
                    removedBy: interaction.user.id,
                    excludeUser: interaction.user.id
                });
            } catch (error) {
                console.error('Error removing user from ticket:', error);
                await interaction.reply({ content: 'An error occurred while removing the user from the ticket. Please try again later.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'rename' && !group) {
            try {
                const newName = interaction.options.getString('name');
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

                if (!ticket) {
                    return interaction.reply({ content: 'This command can only be used within a ticket channel.', flags: MessageFlags.Ephemeral });
                }

                const supportRoles = config.TicketTypes[ticket.ticketType].SupportRole;
                const hasSupportRole = interaction.member.roles.cache.some(role => supportRoles.includes(role.id));

                if (!hasSupportRole) {
                    return interaction.reply({ content: 'You do not have permissions to use this command.', flags: MessageFlags.Ephemeral });
                }

                const channel = interaction.channel;

                await queueChannelRename(channel, newName);

                await interaction.reply({ content: `Successfully renamed the ticket to ${newName}.`, flags: MessageFlags.Ephemeral });

                const renamePlaceholders = {
                    newName: newName,
                    renamedBy: interaction.user.id
                };

                if (config.TicketNotifications?.Renamed?.Components) {
                    const replacer = createSimplePlaceholderReplacer(renamePlaceholders);
                    await sendComponentsV2Message(interaction.client, channel.id, { Components: config.TicketNotifications.Renamed.Components }, replacer);
                } else {
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(`The ticket has been renamed to ${newName} by <@${interaction.user.id}>.`);
                    await channel.send({ embeds: [notificationEmbed] });
                }
            } catch (error) {
                console.error('Error renaming ticket:', error);
                await interaction.reply({ content: 'An error occurred while renaming the ticket. Please try again later.', flags: MessageFlags.Ephemeral });
            }

        } else if (subcommand === 'stats' && !group) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const now = moment();
                const twentyFourHoursAgo = now.clone().subtract(24, 'hours').toDate();
                const sevenDaysAgo = now.clone().subtract(7, 'days').toDate();
                const thirtyDaysAgo = now.clone().subtract(30, 'days').toDate();

                const [statsResult] = await Ticket.aggregate([
                    {
                        $facet: {
                            totalCounts: [
                                {
                                    $group: {
                                        _id: null,
                                        totalTickets: { $sum: 1 },
                                        totalMessages: { $sum: { $ifNull: ["$messageCount", 0] } },
                                        openTickets: {
                                            $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] }
                                        },
                                        closedTickets: {
                                            $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] }
                                        },
                                        deletedTickets: {
                                            $sum: { $cond: [{ $eq: ["$status", "deleted"] }, 1, 0] }
                                        },
                                        claimedTickets: {
                                            $sum: { $cond: [{ $eq: ["$claimed", true] }, 1, 0] }
                                        },
                                        unclaimedTickets: {
                                            $sum: { $cond: [
                                                { $and: [
                                                    { $eq: ["$status", "open"] },
                                                    { $ne: ["$claimed", true] }
                                                ]}, 
                                                1, 0
                                            ]}
                                        }
                                    }
                                }
                            ],
                            recentActivity: [
                                {
                                    $group: {
                                        _id: null,
                                        last24Hours: {
                                            $sum: { $cond: [{ $gte: ["$createdAt", twentyFourHoursAgo] }, 1, 0] }
                                        },
                                        last7Days: {
                                            $sum: { $cond: [{ $gte: ["$createdAt", sevenDaysAgo] }, 1, 0] }
                                        },
                                        last30Days: {
                                            $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] }
                                        },
                                        closedLast24Hours: {
                                            $sum: { $cond: [
                                                { $and: [
                                                    { $gte: ["$closedAt", twentyFourHoursAgo] },
                                                    { $in: ["$status", ["closed", "deleted"]] }
                                                ]},
                                                1, 0
                                            ]}
                                        },
                                        closedLast7Days: {
                                            $sum: { $cond: [
                                                { $and: [
                                                    { $gte: ["$closedAt", sevenDaysAgo] },
                                                    { $in: ["$status", ["closed", "deleted"]] }
                                                ]},
                                                1, 0
                                            ]}
                                        }
                                    }
                                }
                            ],
                            priorityStats: [
                                { $match: { priority: { $exists: true, $ne: null } } },
                                {
                                    $group: {
                                        _id: "$priority",
                                        count: { $sum: 1 },
                                        openCount: { 
                                            $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] }
                                        }
                                    }
                                }
                            ],
                            ticketTypeStats: [
                                { $match: { ticketType: { $exists: true, $ne: null } } },
                                {
                                    $group: {
                                        _id: "$ticketType",
                                        count: { $sum: 1 },
                                        openCount: { 
                                            $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] }
                                        }
                                    }
                                }
                            ],
                            ratingStats: [
                                { $match: { rating: { $regex: /\(\d\/5\)$/ } } },
                                {
                                    $addFields: {
                                        numericRating: {
                                            $toInt: { $arrayElemAt: [{ $split: [{ $arrayElemAt: [{ $split: ["$rating", "("] }, 1] }, "/"] }, 0] }
                                        }
                                    }
                                },
                                {
                                    $group: {
                                        _id: "$numericRating",
                                        count: { $sum: 1 },
                                        sum: { $sum: "$numericRating" }
                                    }
                                }
                            ],
                            responseMetrics: [
                                { 
                                    $match: { 
                                        "messages.1": { $exists: true },
                                        userId: { $exists: true }
                                    }
                                },
                                {
                                    $addFields: {
                                        firstUserMsg: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$messages",
                                                        as: "msg",
                                                        cond: { $eq: ["$$msg.authorId", "$userId"] }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        firstStaffMsg: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$messages",
                                                        as: "msg",
                                                        cond: { $ne: ["$$msg.authorId", "$userId"] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    }
                                },
                                {
                                    $addFields: {
                                        responseTime: {
                                            $cond: [
                                                { 
                                                    $and: [
                                                        { $ne: ["$firstUserMsg", null] },
                                                        { $ne: ["$firstStaffMsg", null] },
                                                        { $gt: ["$firstStaffMsg.timestamp", "$firstUserMsg.timestamp"] }
                                                    ]
                                                },
                                                { $subtract: ["$firstStaffMsg.timestamp", "$firstUserMsg.timestamp"] },
                                                null
                                            ]
                                        }
                                    }
                                },
                                {
                                    $match: {
                                        responseTime: { $ne: null, $gt: 0 }
                                    }
                                },
                                {
                                    $group: {
                                        _id: null,
                                        avgFirstResponse: {
                                            $avg: "$responseTime"
                                        },
                                        minResponseTime: { $min: "$responseTime" },
                                        maxResponseTime: { $max: "$responseTime" },
                                        count: { $sum: 1 }
                                    }
                                }
                            ],
                            resolutionMetrics: [
                                {
                                    $match: {
                                        status: { $in: ["closed", "deleted"] },
                                        createdAt: { $exists: true },
                                        closedAt: { $exists: true, $ne: null }
                                    }
                                },
                                {
                                    $addFields: {
                                        resolutionTime: { 
                                            $cond: [
                                                { $gt: ["$closedAt", "$createdAt"] },
                                                { $subtract: ["$closedAt", "$createdAt"] },
                                                null
                                            ]
                                        }
                                    }
                                },
                                {
                                    $match: {
                                        resolutionTime: { $ne: null, $gt: 0 }
                                    }
                                },
                                {
                                    $group: {
                                        _id: null,
                                        avgResolutionTime: { $avg: "$resolutionTime" },
                                        minResolutionTime: { $min: "$resolutionTime" },
                                        maxResolutionTime: { $max: "$resolutionTime" },
                                        count: { $sum: 1 }
                                    }
                                }
                            ],
                            staffPerformance: [
                                {
                                    $match: {
                                        claimed: true,
                                        claimedBy: { $exists: true, $ne: null }
                                    }
                                },
                                {
                                    $group: {
                                        _id: "$claimedBy",
                                        ticketsClaimed: { $sum: 1 },
                                        ticketsClosed: { 
                                            $sum: { $cond: [{ $in: ["$status", ["closed", "deleted"]] }, 1, 0] }
                                        }
                                    }
                                },
                                { $sort: { ticketsClaimed: -1 } },
                                { $limit: 5 }
                            ],
                            timeOfDayAnalysis: [
                                {
                                    $addFields: {
                                        hour: { $hour: "$createdAt" }
                                    }
                                },
                                {
                                    $group: {
                                        _id: "$hour",
                                        count: { $sum: 1 }
                                    }
                                },
                                { $sort: { _id: 1 } }
                            ]
                        }
                    }
                ]);

                const totalCounts = statsResult.totalCounts[0] || {
                    totalTickets: 0,
                    totalMessages: 0,
                    openTickets: 0,
                    closedTickets: 0,
                    deletedTickets: 0,
                    claimedTickets: 0,
                    unclaimedTickets: 0
                };

                const recentActivity = statsResult.recentActivity[0] || {
                    last24Hours: 0,
                    last7Days: 0,
                    last30Days: 0,
                    closedLast24Hours: 0,
                    closedLast7Days: 0
                };

                const priorityStats = statsResult.priorityStats.reduce((acc, item) => {
                    if (item._id && item._id !== "undefined") {
                        acc[item._id] = item.count;
                    }
                    return acc;
                }, {});

                const ticketTypeStats = statsResult.ticketTypeStats.reduce((acc, item) => {
                    if (item._id) {
                        const typeName = config.TicketTypes[item._id]?.Name || item._id;
                        if (!typeName.match(/^TicketType\d+$/)) {
                            acc[typeName] = {
                                total: item.count,
                                open: item.openCount
                            };
                        }
                    }
                    return acc;
                }, {});

                const ratingCounts = statsResult.ratingStats.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {});
                
                const totalRatings = statsResult.ratingStats.reduce((sum, item) => sum + item.count, 0);
                const ratingSum = statsResult.ratingStats.reduce((sum, item) => sum + (item._id * item.count), 0);
                const averageRating = totalRatings > 0 ? (ratingSum / totalRatings).toFixed(1) : 'N/A';

                const responseMetrics = statsResult.responseMetrics[0] || { 
                    avgFirstResponse: 0,
                    minResponseTime: 0,
                    maxResponseTime: 0
                };
                
                const resolutionMetrics = statsResult.resolutionMetrics[0] || { 
                    avgResolutionTime: 0,
                    minResolutionTime: 0,
                    maxResolutionTime: 0
                };

                const staffPerformance = statsResult.staffPerformance || [];

                const timeOfDayData = statsResult.timeOfDayAnalysis || [];
                const peakHours = timeOfDayData.length > 0 
                    ? timeOfDayData.sort((a, b) => b.count - a.count).slice(0, 3)
                    : [];

                const statsEmbed = new EmbedBuilder()
                    .setTitle('Ã°ÂÂÂ Ticket Statistics')
                    .setColor('#2B2D31')
                    .addFields([
                        {
                            name: 'Ã°ÂÂÂ Current Status',
                            value: `> Ã°ÂÂÂ« Total Tickets: \`${totalCounts.totalTickets}\`\n` +
                                   `> Ã°ÂÂÂ¬ Total Messages: \`${totalCounts.totalMessages}\`\n` +
                                   `> Ã°ÂÂÂ¢ Open: \`${totalCounts.openTickets}\`\n` +
                                   `> Ã¢ÂÂ Closed: \`${totalCounts.closedTickets}\`\n` +
                                   `> Ã°ÂÂÂÃ¯Â¸Â Deleted: \`${totalCounts.deletedTickets}\`\n` +
                                   `> Ã°ÂÂÂ¤ Claimed: \`${totalCounts.claimedTickets}\`\n` +
                                   `> Ã¢ÂÂ Unclaimed: \`${totalCounts.unclaimedTickets}\``,
                            inline: false
                        },
                        {
                            name: 'Ã¢ÂÂ° Recent Activity',
                            value: `> Ã°ÂÂÂ Created (24h): \`${recentActivity.last24Hours} tickets\`\n` +
                                   `> Ã¢ÂÂ Closed (24h): \`${recentActivity.closedLast24Hours} tickets\`\n` +
                                   `> Ã°ÂÂÂ Created (7d): \`${recentActivity.last7Days} tickets\`\n` +
                                   `> Ã¢ÂÂ Closed (7d): \`${recentActivity.closedLast7Days} tickets\`\n` +
                                   `> Ã°ÂÂÂ Created (30d): \`${recentActivity.last30Days} tickets\``,
                            inline: true
                        },
                        {
                            name: 'Ã°ÂÂÂ¢ Priority Distribution',
                            value: Object.entries(priorityStats).length > 0
                                ? Object.entries(priorityStats)
                                    .map(([priority, count]) => {
                                        const emoji = priority === 'High' ? 'Ã°ÂÂÂ´' 
                                            : priority === 'Medium' ? 'Ã°ÂÂÂ¡' 
                                            : priority === 'Low' ? 'Ã°ÂÂÂ¢' 
                                            : 'Ã¢ÂÂª';
                                        return `> ${emoji} ${priority}: \`${count} tickets\``;
                                    })
                                    .join('\n')
                                : '> No priority tickets found',
                            inline: true
                        },
                        {
                            name: 'Ã°ÂÂÂ Ticket Type Distribution',
                            value: Object.entries(ticketTypeStats).length > 0
                                ? Object.entries(ticketTypeStats)
                                    .filter(([type]) => !type.match(/^TicketType\d+$/))
                                    .map(([type, stats]) => 
                                        `> ${type}: \`${stats.total} total\` (\`${stats.open} open\`)`)
                                    .join('\n')
                                : '> No named ticket types found',
                            inline: false
                        },
                        {
                            name: 'Ã¢Â­Â Rating Statistics',
                            value: totalRatings > 0 
                                ? `> Average Rating: \`${averageRating}/5\` ${'Ã¢Â­Â'.repeat(Math.round(parseFloat(averageRating)))}\n` +
                                  Object.entries(ratingCounts)
                                    .sort((a, b) => b[0] - a[0])
                                    .map(([rating, count]) => `> ${rating}Ã¢Â­Â: \`${count} reviews\``)
                                    .join('\n')
                                : '> No ratings yet',
                            inline: false
                        },
                        {
                            name: 'Ã¢ÂÂ±Ã¯Â¸Â Response Metrics',
                            value: `> Average First Response: \`${formatDuration(responseMetrics.avgFirstResponse > 0 ? responseMetrics.avgFirstResponse : 0)}\`\n` +
                                   `> Fastest Response: \`${formatDuration(responseMetrics.minResponseTime > 0 ? responseMetrics.minResponseTime : 0)}\`\n` +
                                   `> Slowest Response: \`${formatDuration(responseMetrics.maxResponseTime > 0 ? responseMetrics.maxResponseTime : 0)}\`\n` +
                                   `> Average Resolution Time: \`${formatDuration(resolutionMetrics.avgResolutionTime > 0 ? resolutionMetrics.avgResolutionTime : 0)}\`\n` +
                                   `> Fastest Resolution: \`${formatDuration(resolutionMetrics.minResolutionTime > 0 ? resolutionMetrics.minResolutionTime : 0)}\``,
                            inline: false
                        }
                    ])
                    .setFooter({ 
                        text: 'Last Updated', 
                        iconURL: interaction.guild.iconURL() 
                    })
                    .setTimestamp();

                const embeds = [statsEmbed];
                
                if (staffPerformance.length > 0) {
                    const staffEmbed = new EmbedBuilder()
                        .setTitle('Ã°ÂÂÂ¥ Staff Performance')
                        .setColor('#2B2D31')
                        .setDescription(
                            staffPerformance.map(staff => {
                                const closedPercentage = staff.ticketsClaimed > 0 
                                    ? Math.round((staff.ticketsClosed / staff.ticketsClaimed) * 100) 
                                    : 0;
                                return `<@${staff._id}>: \`${staff.ticketsClaimed} claimed\` | \`${staff.ticketsClosed} closed\` | \`${closedPercentage}% resolution rate\``;
                            }).join('\n\n')
                        )
                        .setFooter({ 
                            text: 'Top 5 staff members by tickets claimed', 
                            iconURL: interaction.guild.iconURL() 
                        });
                    
                    embeds.push(staffEmbed);
                }

                if (peakHours.length > 0) {
                    const peakHoursField = {
                                                    name: 'Ã¢ÂÂ° Peak Activity Hours',
                        value: peakHours.map(hour => 
                            `> ${hour._id}:00 - ${hour._id}:59: \`${hour.count} tickets\``
                        ).join('\n'),
                        inline: false
                    };
                    
                    if (statsEmbed.data.fields.length < 25) {
                        statsEmbed.addFields(peakHoursField);
                    } else if (embeds.length > 1) {
                        embeds[1].addFields(peakHoursField);
                    }
                }

                await interaction.editReply({ embeds: embeds });
            } catch (error) {
                console.error('Error fetching ticket stats:', error);
                await interaction.editReply({ 
                    content: 'An error occurred while fetching ticket stats. Please try again later.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } else if (subcommand === 'transfer' && !group) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const newType = interaction.options.getString('type');
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });

                if (!ticket) {
                    return interaction.editReply({ content: 'This command can only be used within a ticket channel.' });
                }

                const oldTicketType = config.TicketTypes[ticket.ticketType];
                const newTicketType = config.TicketTypes[newType];

                if (!newTicketType) {
                    return interaction.editReply({ content: 'New ticket type not found.' });
                }

                if (ticket.ticketType === newType) {
                    return interaction.editReply({ content: 'This ticket is already of the specified type.' });
                }

                const hasSupportRole = interaction.member.roles.cache.some(role => oldTicketType.SupportRole.includes(role.id));

                if (!hasSupportRole) {
                    return interaction.editReply({ content: 'You do not have permission to use this command.' });
                }

                const channel = await interaction.guild.channels.fetch(ticket.channelId);
                if (!channel) {
                    return interaction.editReply({ content: 'Channel not found.' });
                }

                const member = await interaction.guild.members.fetch(ticket.userId);
                const userPriority = await getUserPriority(member);

                let targetCategoryId = null;
                const categoryIDs = newTicketType.CategoryID;
                if (Array.isArray(categoryIDs)) {
                    for (const catId of categoryIDs) {
                        if (!catId || catId === "" || catId === "CATEGORY_ID") continue;
                        const cat = channel.guild.channels.cache.get(catId);
                        if (cat) {
                            targetCategoryId = catId;
                            break;
                        }
                    }
                } else if (categoryIDs && categoryIDs !== "" && categoryIDs !== "CATEGORY_ID") {
                    targetCategoryId = categoryIDs;
                }
                
                let selectedCategoryId = null;

                if (targetCategoryId) {
                    const mainCategory = channel.guild.channels.cache.get(targetCategoryId);
                    if (mainCategory && mainCategory.children?.cache.size >= 50 && Array.isArray(config.TicketSettings?.overFlow)) {
                        for (const overflowCategoryId of config.TicketSettings.overFlow) {
                            if (!overflowCategoryId || overflowCategoryId === "" || overflowCategoryId === "CATEGORY_ID") continue;
                            const overflowCategory = channel.guild.channels.cache.get(overflowCategoryId);
                            if (overflowCategory && overflowCategory.children?.cache.size < 50) {
                                selectedCategoryId = overflowCategory.id;
                                break;
                            }
                        }
                    } else if (mainCategory) {
                        selectedCategoryId = mainCategory.id;
                    }
                }

                try {
                    await moveChannel(channel, selectedCategoryId);
                    await updateChannelPermissions(channel, newTicketType, ticket.userId);
                } catch (error) {
                    console.error('Error during channel operations:', error);
                    await safeInteractionResponse(interaction, 
                        'An error occurred while transferring the ticket. Please try again later.', true
                    );
                    return;
                }

                ticket.questions = ticket.questions.map(q => ({
                    question: q.question || 'No Question Provided',
                    answer: q.answer || 'No Answer Provided'
                }));

                ticket.ticketType = newType;
                await ticket.save();

                const newName = newTicketType.ChannelName
                    .replace('{ticket-id}', ticket.ticketId)
                    .replace('{user}', member.user.username)
                    .replace('{priority}', userPriority);

                await queueChannelRename(channel, newName, ticket, newTicketType);

                await interaction.editReply({ content: `Successfully transferred the ticket to ${newTicketType.Name}.` });

                const transferPlaceholders = {
                    newType: newTicketType.Name,
                    transferredBy: interaction.user.id
                };

                if (config.TicketNotifications?.Transferred?.Components) {
                    const replacer = createSimplePlaceholderReplacer(transferPlaceholders);
                    await sendComponentsV2Message(interaction.client, channel.id, { Components: config.TicketNotifications.Transferred.Components }, replacer);
                } else {
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(`Ticket has been transferred to ${newTicketType.Name} by <@${interaction.user.id}>.`);
                    await channel.send({ embeds: [notificationEmbed] });
                }

            } catch (error) {
                console.error('Error transferring ticket:', error);
                await safeInteractionResponse(interaction, 
                    'An error occurred while transferring the ticket. Please try again later.', true
                );
            }
        } else if (subcommand === 'priority' && !group) {
            try {
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.reply({ 
                        content: 'This command can only be used within a ticket channel.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const newPriority = interaction.options.getString('priority');
                await handlePriorityChange(interaction, ticket, newPriority);

            } catch (error) {
                console.error('Error changing ticket priority:', error);
                
                if (error.message.startsWith('COOLDOWN:')) {
                    const remainingTime = error.message.split(':')[1];
                    return interaction.reply({ 
                        content: `Please wait ${remainingTime} seconds before changing priority again.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                if (error.message === 'NO_PERMISSION') {
                    return interaction.reply({ 
                        content: 'You do not have permission to change ticket priority.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                await safeInteractionResponse(interaction, 
                    'An error occurred while changing the ticket priority. Please try again later.', true
                );
            }
        } else if (subcommand === 'closerequest' && !group) {
            try {
                const closeRequestConfig = config.CloseRequest;
                if (!closeRequestConfig?.Enabled) {
                    return interaction.reply({ 
                        content: 'Close request feature is disabled.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.reply({ 
                        content: 'This command can only be used within a ticket channel.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const ticketType = config.TicketTypes[ticket.ticketType];
                if (!ticketType) {
                    return interaction.reply({ 
                        content: 'Ticket type configuration not found.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const supportRoles = ticketType.SupportRole || [];
                const hasSupportRole = interaction.member.roles.cache.some(role => supportRoles.includes(role.id));

                if (!hasSupportRole) {
                    return interaction.reply({ 
                        content: 'You do not have permission to send close requests.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                if (ticket.closeRequestPending) {
                    return interaction.reply({ 
                        content: 'A close request is already pending for this ticket.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                if (ticket.status === 'closed') {
                    return interaction.reply({ 
                        content: 'This ticket is already closed.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const reason = interaction.options.getString('reason') || closeRequestConfig.DefaultReason || 'Issue has been resolved';

                await Ticket.updateOne(
                    { channelId: interaction.channel.id },
                    { 
                        closeRequestPending: true,
                        closeRequestBy: interaction.user.id,
                        closeRequestReason: reason,
                        closeRequestAt: new Date()
                    }
                );

                const buttonConfig = closeRequestConfig.Buttons;
                const acceptButton = new ButtonBuilder()
                    .setCustomId(`closerequest-${ticket.ticketId}-accept`)
                    .setLabel(buttonConfig.Accept?.Label || 'Accept')
                    .setStyle(ButtonStyle[buttonConfig.Accept?.Style || 'Success'])
                    .setEmoji(buttonConfig.Accept?.Emoji || 'Ã¢ÂÂ');

                const declineButton = new ButtonBuilder()
                    .setCustomId(`closerequest-${ticket.ticketId}-decline`)
                    .setLabel(buttonConfig.Decline?.Label || 'Decline')
                    .setStyle(ButtonStyle[buttonConfig.Decline?.Style || 'Danger'])
                    .setEmoji(buttonConfig.Decline?.Emoji || 'Ã¢ÂÂ');

                const actionRow = new ActionRowBuilder().addComponents(acceptButton, declineButton);

                const placeholders = {
                    user: `<@${ticket.userId}>`,
                    staff: `<@${interaction.user.id}>`,
                    reason: reason
                };

                const tagMessage = await interaction.channel.send(`<@${ticket.userId}>`);
                
                let requestMessage;
                if (closeRequestConfig.Components) {
                    const replacer = createSimplePlaceholderReplacer(placeholders);
                    requestMessage = await sendComponentsV2Message(
                        interaction.client,
                        interaction.channel.id,
                        { Components: closeRequestConfig.Components },
                        replacer,
                        [actionRow]
                    );
                }

                setTimeout(() => tagMessage.delete().catch(() => {}), 500);

                await Ticket.updateOne(
                    { channelId: interaction.channel.id },
                    { closeRequestMessageId: requestMessage.id }
                );

                const confirmPlaceholders = { userId: ticket.userId };

                if (config.TicketNotifications?.CloseRequestSent?.Components) {
                    const { REST, Routes } = require('discord.js');
                    const rest = new REST({ version: '10' }).setToken(interaction.client.token);
                    const replacer = createSimplePlaceholderReplacer(confirmPlaceholders);
                    const v2Components = buildComponentsV2Payload({ Components: config.TicketNotifications.CloseRequestSent.Components }, replacer, []);
                    if (v2Components && v2Components.length > 0) {
                        await rest.post(Routes.interactionCallback(interaction.id, interaction.token), {
                            body: { type: 4, data: { flags: 32768 | 64, components: v2Components } }
                        });
                    } else {
                        await interaction.reply({ content: `Close request sent to <@${ticket.userId}>.`, flags: MessageFlags.Ephemeral });
                    }
                } else {
                    const confirmEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(`Close request sent to <@${ticket.userId}>.`);
                    await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });
                }

                notifyWatchers(interaction.client, ticket, 'close_request', {
                    requestedBy: interaction.user.id,
                    reason: reason,
                    excludeUser: interaction.user.id
                });

            } catch (error) {
                console.error('Error sending close request:', error);
                await interaction.reply({ 
                    content: 'An error occurred while sending the close request.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } else if (subcommand === 'watch' && !group) {
            try {
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.reply({ 
                        content: 'This command can only be used within a ticket channel.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const ticketType = config.TicketTypes[ticket.ticketType];
                if (!ticketType) {
                    return interaction.reply({ 
                        content: 'Ticket type configuration not found.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const supportRoles = ticketType.SupportRole || [];
                const hasSupportRole = interaction.member.roles.cache.some(role => supportRoles.includes(role.id));

                if (!hasSupportRole) {
                    return interaction.reply({ 
                        content: 'Only support staff can watch tickets.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                if (ticket.watchers && ticket.watchers.includes(interaction.user.id)) {
                    return interaction.reply({ 
                        content: 'You are already watching this ticket.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                await Ticket.updateOne(
                    { channelId: interaction.channel.id },
                    { $addToSet: { watchers: interaction.user.id } }
                );

                await interaction.reply({ content: 'Ã°ÂÂÂÃ¯Â¸Â You are now watching this ticket. You will receive DM notifications when there are updates.', flags: MessageFlags.Ephemeral });

                const watchPlaceholders = { watcherId: interaction.user.id };

                if (config.TicketNotifications?.Watch?.Components) {
                    const replacer = createSimplePlaceholderReplacer(watchPlaceholders);
                    await sendComponentsV2Message(interaction.client, interaction.channel.id, { Components: config.TicketNotifications.Watch.Components }, replacer);
                } else {
                    const notificationEmbed = new EmbedBuilder()
                        .setColor('#2B2D31')
                        .setDescription(`Ã°ÂÂÂÃ¯Â¸Â <@${interaction.user.id}> is now watching this ticket.`);
                    await interaction.channel.send({ embeds: [notificationEmbed] });
                }

            } catch (error) {
                console.error('Error adding watcher:', error);
                await interaction.reply({ 
                    content: 'An error occurred while watching this ticket.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } else if (subcommand === 'unwatch' && !group) {
            try {
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.reply({ 
                        content: 'This command can only be used within a ticket channel.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                if (!ticket.watchers || !ticket.watchers.includes(interaction.user.id)) {
                    return interaction.reply({ 
                        content: 'You are not watching this ticket.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                await Ticket.updateOne(
                    { channelId: interaction.channel.id },
                    { $pull: { watchers: interaction.user.id } }
                );

                await interaction.reply({ content: 'Ã°ÂÂÂÃ¯Â¸Â You are no longer watching this ticket.', flags: MessageFlags.Ephemeral });

            } catch (error) {
                console.error('Error removing watcher:', error);
                await interaction.reply({ 
                    content: 'An error occurred while unwatching this ticket.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        } else if (subcommand === 'watchers' && !group) {
            try {
                const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
                if (!ticket) {
                    return interaction.reply({ 
                        content: 'This command can only be used within a ticket channel.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const ticketType = config.TicketTypes[ticket.ticketType];
                if (!ticketType) {
                    return interaction.reply({ 
                        content: 'Ticket type configuration not found.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const supportRoles = ticketType.SupportRole || [];
                const hasSupportRole = interaction.member.roles.cache.some(role => supportRoles.includes(role.id));

                if (!hasSupportRole && ticket.userId !== interaction.user.id) {
                    return interaction.reply({ 
                        content: 'You do not have permission to view watchers.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const watchers = ticket.watchers || [];
                
                const embed = new EmbedBuilder()
                    .setColor('#2B2D31')
                    .setTitle('Ã°ÂÂÂÃ¯Â¸Â Ticket Watchers')
                    .setDescription(
                        watchers.length > 0 
                            ? watchers.map(id => `> <@${id}>`).join('\n')
                            : '> No one is watching this ticket.'
                    )
                    .setFooter({ text: `${watchers.length} watcher${watchers.length !== 1 ? 's' : ''}` });

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } catch (error) {
                console.error('Error fetching watchers:', error);
                await interaction.reply({ 
                    content: 'An error occurred while fetching watchers.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    }
};