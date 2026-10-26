const { AttachmentBuilder, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const User = require('../../../models/UserData');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();
const { replacePlaceholders } = require('./Utility/helpers');

const transactionCache = new Map();
const bgCanvasCache = new Map();

const MAX_CACHE_SIZE = 500;
const MAX_LOGS_DISPLAY = 100;

setInterval(() => {
    if (transactionCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(transactionCache.entries());
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        transactionCache.clear();
        entries.slice(0, MAX_CACHE_SIZE/2).forEach(([key, value]) => {
            transactionCache.set(key, value);
        });
    }
    
    if (bgCanvasCache.size > 10) {
        bgCanvasCache.clear();
    }
}, 30 * 60 * 1000);

const createBackgroundCanvas = (width, height) => {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.roundRect(20, 20, width - 40, height - 40, 16);
    ctx.fill();

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(20, 20, width - 40, height - 40, 16);
    ctx.stroke();
    
    return canvas;
};

const getBackgroundCanvas = (width, height) => {
    const cacheKey = `${width}x${height}`;
    
    if (bgCanvasCache.has(cacheKey)) {
        const cachedCanvas = bgCanvasCache.get(cacheKey);
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cachedCanvas, 0, 0);
        return canvas;
    }
    
    const canvas = createBackgroundCanvas(width, height);
    bgCanvasCache.set(cacheKey, canvas);

    const clonedCanvas = createCanvas(width, height);
    const ctx = clonedCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    return clonedCanvas;
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance or another user\'s balance')
        .addUserOption(option => option.setName('user').setDescription('The user to check the balance of'))
        .addStringOption(option => option.setName('type').setDescription('Type of balance check').addChoices(
            { name: 'Log', value: 'log' }
        )),
    category: 'Economy',
    async execute(interaction) {
        const userOption = interaction.options.getUser('user');
        const type = interaction.options.getString('type');
        const targetUser = userOption || interaction.user;

        const cacheKey = `${targetUser.id}-${interaction.guild.id}`;
        const now = Date.now();
        
        const projection = { balance: 1, bank: 1 };
        let user = await User.findOne(
            { userId: targetUser.id, guildId: interaction.guild.id }, 
            projection
        ).lean();
        
        if (!user) {
            user = {
                balance: 0,
                bank: 0
            };
        }

        if (type === 'log') {
            let transactionLogs = [];
            
            if (transactionCache.has(cacheKey)) {
                transactionLogs = transactionCache.get(cacheKey).data;
            } else {
                const logData = await User.findOne(
                    { userId: targetUser.id, guildId: interaction.guild.id },
                    { transactionLogs: { $slice: -MAX_LOGS_DISPLAY } }
                ).lean();
                
                if (logData && logData.transactionLogs) {
                    transactionLogs = logData.transactionLogs;
                    
                    transactionCache.set(cacheKey, {
                        data: transactionLogs,
                        timestamp: now
                    });
                }
            }
            
            user.transactionLogs = transactionLogs;
        }

        const formatNumber = (num) => {
            if (num === undefined || num === null) num = 0;

            if (num >= 1_000_000_000_000_000) {
                return (num / 1_000_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'Q';
            } else if (num >= 1_000_000_000_000) {
                return (num / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'T';
            } else if (num >= 1_000_000_000) {
                return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
            } else if (num >= 1_000_000) {
                return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
            } else if (num >= 1_000) {
                return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
            }
            return num.toString();
        };

        const capitalizeWords = (str) => {
            return str.replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        };

        if (type === 'log') {
            const transactionLogs = user.transactionLogs || [];
            
            let totalGained = 0;
            let totalLost = 0;
            transactionLogs.forEach(log => {
                if (log.amount > 0) {
                    totalGained += log.amount;
                } else {
                    totalLost += Math.abs(log.amount);
                }
            });

            const categories = {
                games: ['blackjack_win', 'blackjack_draw', 'blackjack_lose', 'coinflip', 'roll', 'roulette', 'slot'],
                purchases: ['purchase'],
                interest: ['interest'],
                other: ['beg', 'crime', 'daily', 'deposit', 'admin-give-balance', 'admin-give-bank', 'admin-take-balance', 'admin-take-bank', 'admin-set-balance', 'admin-set-bank', 'rob', 'robbed', 'transfer_out', 'transfer_in', 'work']
            };

            let selectedCategory = 'all';
            let page = 1;
            const itemsPerPage = 10;
            
            const totalGainedStr = formatNumber(totalGained);
            const totalLostStr = formatNumber(totalLost);

            const filterLogs = (category) => {
                if (category === 'all') return transactionLogs;
                return transactionLogs.filter(log => categories[category].includes(log.type));
            };

            const createEmbed = (filteredLogs) => {
                const paginatedLogs = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);

                const transactionDescriptions = paginatedLogs
                    .map(log => {
                        let sign;
                        let amount = formatNumber(Math.abs(log.amount));
                        const type = capitalizeWords(log.type);
                        const emoji = '💰';

                        if (log.type === 'blackjack_lose') {
                            sign = '-';
                        } else {
                            sign = log.amount > 0 ? '+' : '-';
                        }

                        const formattedAmount = `${sign}${amount}`;

                        if (formattedAmount === '-0.00' && log.type === 'interest') {
                            return null;
                        }

                        return `${formattedAmount} ${emoji} (${type})`;
                    })
                    .filter(description => description !== null)
                    .join('\n');

                const logDescription = transactionDescriptions
                    ? `\`\`\`diff\n${transactionDescriptions}\n\`\`\``
                    : `\`\`\`prolog\nNo Transactions Found\`\`\``;

                return new EmbedBuilder()
                    .setTitle(replacePlaceholders(lang.Economy?.Balance?.TransactionLog || "{user}'s Transaction Log", { user: targetUser.username }))
                    .setDescription(logDescription)
                    .addFields(
                        { name: lang.Economy?.Balance?.Gained || "Total Gained", value: `+${totalGainedStr} 💰`, inline: true },
                        { name: lang.Economy?.Balance?.Lost || "Total Lost", value: `-${totalLostStr} 💰`, inline: true }
                    )
                    .setColor('#00FF00');
            };

            const updateMessage = async () => {
                const filteredLogs = filterLogs(selectedCategory);
                const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

                const embed = createEmbed(filteredLogs);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('category_select')
                    .setPlaceholder('Select category')
                    .addOptions(
                        {
                            label: 'All',
                            value: 'all',
                            description: 'View all transaction logs',
                            emoji: '📜',
                        },
                        {
                            label: 'Games',
                            value: 'games',
                            description: 'View logs from games like blackjack, roulette, etc.',
                            emoji: '🎮',
                        },
                        {
                            label: 'Purchases',
                            value: 'purchases',
                            description: 'View logs of your purchases',
                            emoji: '🛒',
                        },
                        {
                            label: 'Interest',
                            value: 'interest',
                            description: 'View logs of bank interest',
                            emoji: '🏦',
                        },
                        {
                            label: 'Other',
                            value: 'other',
                            description: 'View other transaction logs',
                            emoji: '📁',
                        },
                    );

                const row1 = new ActionRowBuilder().addComponents(selectMenu);

                const row2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('previous')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page <= 1),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page >= totalPages)
                    );

                await interaction.editReply({ content: '', embeds: [embed], components: [row1, row2] });
            };

            await interaction.reply({ content: 'Loading...', fetchReply: true });

            updateMessage();

            const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'You cannot interact with this menu.', flags: MessageFlags.Ephemeral });
                }
                
                if (i.customId === 'category_select') {
                    selectedCategory = i.values[0];
                    page = 1;
                    await updateMessage();
                    await i.deferUpdate();
                }

                if (i.customId === 'previous') {
                    page--;
                    await updateMessage();
                    await i.deferUpdate();
                }

                if (i.customId === 'next') {
                    page++;
                    await updateMessage();
                    await i.deferUpdate();
                }
            });

            collector.on('end', async () => {
                await interaction.editReply({ components: [] }).catch(() => {});
            });

        } else {
            const canvas = getBackgroundCanvas(900, 280);
            const ctx = canvas.getContext('2d');

            try {
                const avatar = await loadImage(targetUser.displayAvatarURL({ extension: 'jpg', size: 256 }));
                
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(50, 45, 95, 95, 14);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 50, 45, 95, 95);
                ctx.restore();

                ctx.strokeStyle = '#2a2a2a';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(50, 45, 95, 95, 14);
                ctx.stroke();

            } catch (error) {}

            ctx.font = 'bold 30px "Arial"';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(targetUser.username.toUpperCase(), 165, 85);

            const netWorth = (user.balance || 0) + (user.bank || 0);
            ctx.font = 'bold 18px "Arial"';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText('$' + formatNumber(netWorth) + '  NET WORTH', 165, 115);

            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.roundRect(50, 160, 385, 90, 12);
            ctx.fill();
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(50, 160, 385, 90, 12);
            ctx.stroke();

            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.roundRect(455, 160, 385, 90, 12);
            ctx.fill();
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(455, 160, 385, 90, 12);
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.font = 'bold 14px "Arial"';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('WALLET', 70, 195);

            ctx.font = 'bold 34px "Arial"';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('$' + formatNumber(user.balance), 70, 232);

            ctx.font = 'bold 14px "Arial"';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('BANK', 475, 195);

            ctx.font = 'bold 34px "Arial"';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('$' + formatNumber(user.bank), 475, 232);

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'balance.png' });
            return interaction.reply({ files: [attachment] });
        }
    },
};