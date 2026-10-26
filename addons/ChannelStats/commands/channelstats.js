const { SlashCommandBuilder, ChannelType, PermissionsBitField, MessageFlags } = require('discord.js');
const ChannelStat = require('../models/ChannelStat');
const UserData = require('../../../models/UserData');
const formatCurrentDate = require('../date');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('channelstats')
        .setDescription('Manage channel statistics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a channel stat')
                .addStringOption(option =>
                    option.setName('channelname')
                        .setDescription('The name of the channel with {stats} placeholder')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of the stat')
                        .setRequired(true)
                        .addChoices(
                            { name: 'MemberCount', value: 'MemberCount' },
                            { name: 'HumanMemberCount', value: 'HumanMemberCount' },
                            { name: 'BotCount', value: 'BotCount' },
                            { name: 'CurrentDate', value: 'CurrentDate' },
                            { name: 'NitroBoosterCount', value: 'NitroBoosterCount' },
                            { name: 'ServerCreationDate', value: 'ServerCreationDate' },
                            { name: 'TotalRolesCount', value: 'TotalRolesCount' },
                            { name: 'TotalEmojisCount', value: 'TotalEmojisCount' },
                            { name: 'TotalChannelsCount', value: 'TotalChannelsCount' },
                            { name: 'OnlineMembersCount', value: 'OnlineMembersCount' },
                            { name: 'ServerRegion', value: 'ServerRegion' },
                            { name: 'TotalBannedMembers', value: 'TotalBannedMembers' },
                            { name: 'TotalMembersWithRole', value: 'TotalMembersWithRole' },
                            { name: 'OnlineMembersWithRole', value: 'OnlineMembersWithRole' },
                            { name: 'TotalTickets', value: 'TotalTickets' },
                            { name: 'OpenTickets', value: 'OpenTickets' },
                            { name: 'ClosedTickets', value: 'ClosedTickets' },
                            { name: 'DeletedTickets', value: 'DeletedTickets' },
                            { name: 'TotalMessages', value: 'TotalMessages' },
                            { name: 'BotUptime', value: 'BotUptime' },
                            { name: 'TotalCases', value: 'TotalCases' },
                            { name: 'TotalSuggestions', value: 'TotalSuggestions' }
                        ))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The voice channel to update')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to count (required for role-based stats)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a channel stat')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The voice channel stat to remove')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice))),
    category: 'Utility',
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        const channelName = interaction.options.getString('channelname');
        const type = interaction.options.getString('type');
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const guildId = interaction.guild.id;

        if (subcommand === 'add') {
            if (!channelName.includes('{stats}')) {
                return interaction.reply({ content: 'The channel name must include the {stats} placeholder.', flags: MessageFlags.Ephemeral });
            }

            if ((type === 'TotalMembersWithRole' || type === 'OnlineMembersWithRole') && !role) {
                return interaction.reply({ content: 'You must specify a role for this stat type.', flags: MessageFlags.Ephemeral });
            }

            try {
                const existingStat = await ChannelStat.findOne({ guildId: guildId, channelId: channel.id });
                if (existingStat) {
                    return interaction.reply({ content: `This channel already has a stat set.`, flags: MessageFlags.Ephemeral });
                }

                let value;
                const guild = interaction.guild;

                switch (type) {
                    case 'MemberCount':
                        value = guild.memberCount.toString();
                        break;
                    case 'HumanMemberCount': {
                        try {
                            const members = await guild.members.fetch();
                            value = members.filter(m => !m.user.bot).size.toString();
                        } catch {
                            const botCount = guild.members.cache.filter(m => m.user.bot).size;
                            value = Math.max(guild.memberCount - botCount, 0).toString();
                        }
                        break;
                    }
                    case 'BotCount': {
                        try {
                            const members = await guild.members.fetch();
                            value = members.filter(m => m.user.bot).size.toString();
                        } catch {
                            value = guild.members.cache.filter(m => m.user.bot).size.toString();
                        }
                        break;
                    }
                    case 'CurrentDate':
                        value = formatCurrentDate(global.config?.Timezone);
                        break;
                    case 'NitroBoosterCount':
                        value = guild.premiumSubscriptionCount.toString();
                        break;
                    case 'ServerCreationDate':
                        value = guild.createdAt.toDateString();
                        break;
                    case 'TotalRolesCount':
                        value = guild.roles.cache.size.toString();
                        break;
                    case 'TotalEmojisCount':
                        value = guild.emojis.cache.size.toString();
                        break;
                    case 'TotalChannelsCount':
                        value = guild.channels.cache.size.toString();
                        break;
                    case 'OnlineMembersCount':
                        value = guild.members.cache.filter(m =>
                            ['online', 'dnd', 'idle'].includes(m.presence?.status) && !m.user.bot
                        ).size.toString();
                        break;
                    case 'ServerRegion':
                        value = guild.preferredLocale || 'en-US';
                        break;
                    case 'TotalMembersWithRole':
                        if (role) {
                            value = role.members.size.toString();
                        } else {
                            value = '0';
                        }
                        break;
                    case 'OnlineMembersWithRole':
                        if (role) {
                            value = role.members.filter(m =>
                                ['online', 'dnd', 'idle'].includes(m.presence?.status) && !m.user.bot
                            ).size.toString();
                        } else {
                            value = '0';
                        }
                        break;
                    case 'TotalTickets':
                        value = (await global.addonLoader?.getModel("Ticket")?.countDocuments({ guildId }) || 0).toString();
                        break;
                    case 'OpenTickets':
                        value = (await global.addonLoader?.getModel("Ticket")?.countDocuments({ guildId, status: 'open' }) || 0).toString();
                        break;
                    case 'ClosedTickets':
                        value = (await global.addonLoader?.getModel("Ticket")?.countDocuments({ guildId, status: 'closed' }) || 0).toString();
                        break;
                    case 'DeletedTickets':
                        value = (await global.addonLoader?.getModel("Ticket")?.countDocuments({ guildId, status: 'deleted' }) || 0).toString();
                        break;
                    case 'TotalMessages':
                        try {
                            const totalMessages = await UserData.aggregate([
                                { $match: { guildId } },
                                { $group: { _id: null, total: { $sum: '$totalMessages' } } }
                            ]);
                            value = totalMessages.length > 0 ? totalMessages[0].total.toString() : '0';
                        } catch { value = '0'; }
                        break;
                    case 'BotUptime': {
                        const uptime = interaction.client.uptime;
                        const days = Math.floor(uptime / 86400000);
                        const hours = Math.floor((uptime % 86400000) / 3600000);
                        const minutes = Math.floor((uptime % 3600000) / 60000);
                        value = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                        break;
                    }
                    case 'TotalCases':
                        try {
                            const totalCases = await UserData.aggregate([
                                { $match: { guildId } },
                                { $project: { caseCount: { $add: [
                                    { $size: { $ifNull: ['$warnings', []] } },
                                    { $size: { $ifNull: ['$kicks', []] } },
                                    { $size: { $ifNull: ['$bans', []] } },
                                    { $size: { $ifNull: ['$timeouts', []] } }
                                ]}}},
                                { $group: { _id: null, total: { $sum: '$caseCount' } } }
                            ]);
                            value = totalCases.length > 0 ? totalCases[0].total.toString() : '0';
                        } catch { value = '0'; }
                        break;
                    case 'TotalSuggestions':
                        try {
                            value = (await global.addonLoader?.getModel('Suggestion')?.countDocuments({ guildId }) || 0).toString();
                        } catch { value = '0'; }
                        break;
                    case 'TotalBannedMembers':
                        try {
                            const bans = await guild.bans.fetch();
                            value = bans.size.toString();
                        } catch { value = '0'; }
                        break;
                    default:
                        value = '0';
                }

                let formattedValue = value;
                if (!['ServerCreationDate', 'ServerRegion', 'BotUptime'].includes(type) && !isNaN(value)) {
                    formattedValue = new Intl.NumberFormat('en-US').format(value);
                }

                const newChannelName = channelName.replace('{stats}', formattedValue).substring(0, 100);
                await channel.setName(newChannelName).catch(console.error);

                const newStat = new ChannelStat({
                    guildId: guildId,
                    type: type,
                    channelId: channel.id,
                    channelName: channelName,
                    roleId: role ? role.id : null
                });
                await newStat.save();
                global.addonLoader?.getService('channelStats.update')?.().catch(error => console.error('[ChannelStats] Refresh after add failed:', error.message));
                await interaction.reply({ content: `Added stat for channel **${channel.name}** with type **${type}**${role ? ` and role **${role.name}**` : ''}.`, flags: MessageFlags.Ephemeral });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Failed to add the channel stat. Please try again later.', flags: MessageFlags.Ephemeral });
            }
        } else if (subcommand === 'remove') {
            try {
                const stat = await ChannelStat.findOneAndDelete({ guildId: guildId, channelId: channel.id });
                if (stat) {
                    global.addonLoader?.getService('channelStats.update')?.().catch(error => console.error('[ChannelStats] Refresh after remove failed:', error.message));
                    await interaction.reply({ content: `Removed stat for channel **${channel.name}**.`, flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: `Stat for channel **${channel.name}** not found.`, flags: MessageFlags.Ephemeral });
                }
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Failed to remove the channel stat. Please try again later.', flags: MessageFlags.Ephemeral });
            }
        }
    },
};
