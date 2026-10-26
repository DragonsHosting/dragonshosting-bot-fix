const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getConfig, getLang } = require('../../../utils/core/configLoader.js');
const { editReplyComponentsV2, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const config = getConfig();
const lang = getLang();
const UserData = require('../../../models/UserData.js');
const getInviteModel = () => global.addonLoader?.getModel('Invite');
const leaderboardCache = require('../utils/leaderboard-cache.js');
const CACHE_DURATION = 5 * 60 * 1000;

const LEADERBOARD_THEMES = {
    balance: { color: '#22c55e', key: 'Balance' },
    levels: { color: '#eab308', key: 'Levels' },
    messages: { color: '#3b82f6', key: 'Messages' },
    invites: { color: '#ec4899', key: 'Invites' }
};

function formatNumber(num) {
    if (num === undefined || num === null) num = 0;
    const suffixes = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    const magnitude = Math.floor(Math.log10(Math.abs(num)) / 3);
    
    if (magnitude >= suffixes.length) {
        return '∞';
    }
    
    return magnitude !== 0
        ? (num / Math.pow(1000, magnitude)).toFixed(1).replace(/\.0$/, '') + suffixes[magnitude]
        : num.toString();
}

function createLeaderboardComponentsV2(users, subCmd, page, pageSize, totalUsers, userPosition) {
    const theme = LEADERBOARD_THEMES[subCmd];
    const langSection = lang.Leaderboard?.[theme.key] || {};
    const maxPages = Math.ceil(totalUsers / pageSize);
    
    const title = langSection.Top || `Leaderboard - ${theme.key}`;
    const positionTemplate = lang.Leaderboard?.Position || 'Your position: #{position} - Page {pageMin}/{pageMax}';
    const footer = positionTemplate
        .replace(/{position}/g, userPosition || 'N/A')
        .replace(/{pageMin}/g, page + 1)
        .replace(/{pageMax}/g, maxPages);
    
    if (!users || users.length === 0) {
        return {
            Components: [{
                Type: 'container',
                AccentColor: theme.color,
                Components: [
                    { Type: 'text_display', Content: `**${title}**\n\nNo data available for this leaderboard.` },
                    { Type: 'text_display', Content: `-# ${footer}` }
                ]
            }]
        };
    }

    let leaderboardLines = [];
    let rank = (page * pageSize) + 1;

    for (const user of users) {
        let statValue = '';
        const msgTemplate = langSection.Messages || '{count}';
        
        switch(subCmd) {
            case 'balance': 
                statValue = msgTemplate.replace(/{count}/g, formatNumber(user.totalBalance || 0)); 
                break;
            case 'levels': 
                statValue = msgTemplate
                    .replace(/{count_level}/g, user.level || 0)
                    .replace(/{count_xp}/g, formatNumber(user.xp || 0)); 
                break;
            case 'messages': 
                statValue = msgTemplate.replace(/{count}/g, formatNumber(user.totalMessages || 0)); 
                break;
            case 'invites': 
                statValue = msgTemplate.replace(/{count}/g, formatNumber(user.invites || 0)); 
                break;
        }

        let rankBadge = '';
        if (rank === 1) rankBadge = '🥇';
        else if (rank === 2) rankBadge = '🥈';
        else if (rank === 3) rankBadge = '🥉';
        else rankBadge = '🔹';

        let displayName = user.username;
        if (displayName.length > 20) {
            displayName = displayName.substring(0, 17) + '...';
        }

        leaderboardLines.push(`${rankBadge} **\` ${statValue} \`** - \`${displayName}\``);
        rank++;
    }

    return {
        Components: [{
            Type: 'container',
            AccentColor: theme.color,
            Components: [
                { Type: 'text_display', Content: `**${title}**\n\n${leaderboardLines.join('\n')}` },
                { Type: 'text_display', Content: `-# ${footer}` }
            ]
        }]
    };
}

async function getUserPosition(guild, type, userId) {
    try {
        let position = null;
        
        switch(type) {
            case 'balance':
                const balanceRank = await UserData.aggregate([
                    {
                        $match: {
                            guildId: guild.id,
                            $or: [
                                { balance: { $gt: 0 } },
                                { bank: { $gt: 0 } }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            totalBalance: {
                                $add: [
                                    { $ifNull: ['$balance', 0] },
                                    { $ifNull: ['$bank', 0] }
                                ]
                            }
                        }
                    },
                    { $sort: { totalBalance: -1 } },
                    {
                        $group: {
                            _id: null,
                            users: { $push: { userId: '$userId', totalBalance: '$totalBalance' } }
                        }
                    }
                ]);
                
                if (balanceRank[0]) {
                    position = balanceRank[0].users.findIndex(user => user.userId === userId) + 1;
                }
                break;

            case 'levels':
                const levelRank = await UserData.aggregate([
                    {
                        $match: {
                            guildId: guild.id,
                            $or: [{ level: { $gt: 0 } }, { xp: { $gt: 0 } }]
                        }
                    },
                    { $sort: { level: -1, xp: -1 } },
                    {
                        $group: {
                            _id: null,
                            users: { $push: { userId: '$userId', level: '$level', xp: '$xp' } }
                        }
                    }
                ]);
                
                if (levelRank[0]) {
                    position = levelRank[0].users.findIndex(user => user.userId === userId) + 1;
                }
                break;

            case 'messages':
                const messageRank = await UserData.aggregate([
                    {
                        $match: {
                            guildId: guild.id,
                            totalMessages: { $gt: 0 }
                        }
                    },
                    { $sort: { totalMessages: -1 } },
                    {
                        $group: {
                            _id: null,
                            users: { $push: { userId: '$userId', totalMessages: '$totalMessages' } }
                        }
                    }
                ]);
                
                if (messageRank[0]) {
                    position = messageRank[0].users.findIndex(user => user.userId === userId) + 1;
                }
                break;

            case 'invites':
                const inviteRank = await getInviteModel().aggregate([
                    {
                        $match: { guildID: guild.id }
                    },
                    {
                        $group: {
                            _id: "$inviterID",
                            userId: { $first: "$inviterID" },
                            invites: { $sum: "$uses" }
                        }
                    },
                    {
                        $match: { invites: { $gt: 0 } }
                    },
                    { $sort: { invites: -1 } },
                    {
                        $group: {
                            _id: null,
                            users: { $push: { userId: '$userId', invites: '$invites' } }
                        }
                    }
                ]);
                
                if (inviteRank[0]) {
                    position = inviteRank[0].users.findIndex(user => user.userId === userId) + 1;
                }
                break;
        }
        
        return position > 0 ? position : null;
    } catch (error) {
        console.error('Error getting user position:', error);
        return null;
    }
}

async function getLeaderboardData(guild, type, page, pageSize) {
    const cacheKey = `${guild.id}-${type}-${page}-${pageSize}`;
    const cached = leaderboardCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }

    const skip = page * pageSize;
    let data;
    
    switch(type) {
        case 'balance':
            data = await UserData.aggregate([
                {
                    $match: {
                        guildId: guild.id,
                        $or: [
                            { balance: { $gt: 0 } },
                            { bank: { $gt: 0 } }
                        ]
                    }
                },
                {
                    $addFields: {
                        totalBalance: {
                            $add: [
                                { $ifNull: ['$balance', 0] },
                                { $ifNull: ['$bank', 0] }
                            ]
                        }
                    }
                },
                { $sort: { totalBalance: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ], { allowDiskUse: true });
            break;

        case 'levels':
            data = await UserData.aggregate([
                {
                    $match: {
                        guildId: guild.id,
                        $or: [{ level: { $gt: 0 } }, { xp: { $gt: 0 } }]
                    }
                },
                { $sort: { level: -1, xp: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ], { allowDiskUse: true });
            break;

        case 'messages':
            data = await UserData.aggregate([
                {
                    $match: {
                        guildId: guild.id,
                        totalMessages: { $gt: 0 }
                    }
                },
                { $sort: { totalMessages: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ], { allowDiskUse: true });
            break;

        case 'invites':
            data = await getInviteModel().aggregate([
                {
                    $match: {
                        guildID: guild.id
                    }
                },
                {
                    $group: {
                        _id: "$inviterID",
                        userId: { $first: "$inviterID" },
                        invites: { $sum: "$uses" }
                    }
                },
                {
                    $match: {
                        invites: { $gt: 0 }
                    }
                },
                { $sort: { invites: -1 } },
                { $skip: skip },
                { $limit: pageSize }
            ], { allowDiskUse: true });
            break;
    }

    const userIds = data.map(user => user.userId || user._id);
    const members = await guild.members.fetch({ user: userIds }).catch(() => new Map());
    
    const enrichedData = await Promise.all(data.map(async (user) => {
        const userId = user.userId || user._id;
        const member = members.get(userId);
        if (member) {
            return {
                ...user,
                username: member.user.username,
                discriminator: member.user.discriminator,
                avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 })
            };
        }
        const fetchedUser = await guild.client.users.fetch(userId).catch(() => null);
        if (fetchedUser) {
            return {
                ...user,
                username: fetchedUser.username,
                discriminator: fetchedUser.discriminator,
                avatar: fetchedUser.displayAvatarURL({ extension: 'png', size: 128 })
            };
        }
        return {
            ...user,
            username: 'Unknown User',
            discriminator: '0',
            avatar: ''
        };
    }));

    leaderboardCache.set(cacheKey, {
        data: enrichedData,
        timestamp: Date.now()
    });

    return enrichedData;
}

async function getTotalCount(guild, type) {
    const cacheKey = `count-${guild.id}-${type}`;
    const cached = leaderboardCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }

    let count;
    switch(type) {
        case 'balance':
            count = await UserData.countDocuments({
                guildId: guild.id,
                $or: [
                    { balance: { $gt: 0 } },
                    { bank: { $gt: 0 } }
                ]
            });
            break;

        case 'levels':
            count = await UserData.countDocuments({
                guildId: guild.id,
                $or: [{ level: { $gt: 0 } }, { xp: { $gt: 0 } }]
            });
            break;

        case 'messages':
            count = await UserData.countDocuments({
                guildId: guild.id,
                totalMessages: { $gt: 0 }
            });
            break;

        case 'invites':
            const inviteCount = await getInviteModel().aggregate([
                {
                    $match: { guildID: guild.id }
                },
                {
                    $group: {
                        _id: "$inviterID",
                        invites: { $sum: "$uses" }
                    }
                },
                {
                    $match: { invites: { $gt: 0 } }
                },
                {
                    $count: "total"
                }
            ], { allowDiskUse: true });
            count = inviteCount[0]?.total || 0;
            break;
    }

    leaderboardCache.set(cacheKey, {
        data: count,
        timestamp: Date.now()
    });

    return count;
}

function createPaginationButtons(currentPage, maxPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('lb_first')
            .setLabel('⏮️ First')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('lb_prev')
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('lb_next')
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= maxPages - 1),
        new ButtonBuilder()
            .setCustomId('lb_last')
            .setLabel('Last ⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= maxPages - 1)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View leaderboards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('View the users with the highest balance')
                .addIntegerOption(option =>
                    option
                        .setName('page')
                        .setDescription('Page number to view')
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('levels')
                .setDescription('View the users with the highest level')
                .addIntegerOption(option =>
                    option
                        .setName('page')
                        .setDescription('Page number to view')
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('messages')
                .setDescription('View the users with the most messages')
                .addIntegerOption(option =>
                    option
                        .setName('page')
                        .setDescription('Page number to view')
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('invites')
                .setDescription('View the users with the most invites')
                .addIntegerOption(option =>
                    option
                        .setName('page')
                        .setDescription('Page number to view')
                        .setMinValue(1)
                )
        ),
    category: 'General',
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const subCmd = interaction.options.getSubcommand();
            let currentPage = (interaction.options.getInteger('page') || 1) - 1;
            const pageSize = 10;

            const totalUsers = await getTotalCount(interaction.guild, subCmd);
            const maxPages = Math.max(1, Math.ceil(totalUsers / pageSize));
            
            if (currentPage >= maxPages) currentPage = Math.max(0, maxPages - 1);

            async function renderLeaderboard(pageNum) {
                const users = await getLeaderboardData(interaction.guild, subCmd, pageNum, pageSize);
                const userPosition = await getUserPosition(interaction.guild, subCmd, interaction.user.id);
                const componentsV2 = createLeaderboardComponentsV2(users, subCmd, pageNum, pageSize, totalUsers, userPosition);
                const buttons = createPaginationButtons(pageNum, maxPages);
                return { componentsV2, buttons };
            }

            const { componentsV2, buttons } = await renderLeaderboard(currentPage);
            await editReplyComponentsV2(interaction, componentsV2.Components, createSimplePlaceholderReplacer({}), [buttons]);

            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'You cannot use these buttons as you did not run the command.', flags: MessageFlags.Ephemeral });
                }

                switch (i.customId) {
                    case 'lb_first': currentPage = 0; break;
                    case 'lb_prev': currentPage = Math.max(0, currentPage - 1); break;
                    case 'lb_next': currentPage = Math.min(maxPages - 1, currentPage + 1); break;
                    case 'lb_last': currentPage = maxPages - 1; break;
                }

                try {
                    await i.deferUpdate();
                    const { componentsV2: newV2, buttons: newButtons } = await renderLeaderboard(currentPage);
                    await editReplyComponentsV2(interaction, newV2.Components, createSimplePlaceholderReplacer({}), [newButtons]);
                } catch (error) {
                    if (error.code !== 10062) console.error('Leaderboard update error:', error);
                }
            });

            collector.on('end', async () => {
                try {
                    const { componentsV2: finalV2 } = await renderLeaderboard(currentPage);
                    const disabledButtons = createPaginationButtons(currentPage, maxPages);
                    disabledButtons.components.forEach(btn => btn.setDisabled(true));
                    await editReplyComponentsV2(interaction, finalV2.Components, createSimplePlaceholderReplacer({}), [disabledButtons]);
                } catch {}
            });

        } catch (error) {
            console.error(error);
            const errorMsg = lang.Leaderboard?.Error?.replace(/{guild}/g, interaction.guild.name) || 'An error occurred while fetching the leaderboard.';
            const errorV2 = { Components: [{ Type: 'container', AccentColor: '#ed4245', Components: [
                { Type: 'text_display', Content: errorMsg }
            ]}]};
            await editReplyComponentsV2(interaction, errorV2.Components, createSimplePlaceholderReplacer({}));
        }
    }
};
