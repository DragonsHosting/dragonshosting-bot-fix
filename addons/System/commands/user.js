const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const moment = require('moment');
const UserData = require('../../../models/UserData');
const { getConfig, getLang, getCommands, replacePlaceholders } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();

const badgesFlags = {
    Discord_Employee: 1,
    Partnered_Server_Owner: 2,
    HypeSquad_Events: 4,
    Bug_Hunter_Level_1: 8,
    House_Bravery: 64,
    House_Brilliance: 128,
    House_Balance: 256,
    Early_Supporter: 512,
    Bug_Hunter_Level_2: 16384,
    Early_Verified_Bot_Developer: 131072,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Get a user\'s profile, avatar, or banner')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('What information to retrieve')
                .setRequired(true)
                .addChoices(
                    { name: 'Profile', value: 'profile' },
                    { name: 'Avatar', value: 'avatar' },
                    { name: 'Banner', value: 'banner' },
                    { name: 'Both Avatar & Banner', value: 'both' },
                ))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to get the information from')
                .setRequired(false)),
    category: 'General',
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const user = interaction.options.getUser('user') || interaction.user;
            const type = interaction.options.getString('type');

            const fullUser = await interaction.client.users.fetch(user.id, { force: true });
            const member = await interaction.guild.members.fetch(user.id);
            const avatarUrl = user.displayAvatarURL({ format: 'png', dynamic: true, size: 1024 });
            const bannerUrl = fullUser.bannerURL({ format: 'png', dynamic: true, size: 1024 });
            const userIcon = avatarUrl;
            const guildIcon = interaction.guild.iconURL({ format: 'png', dynamic: true, size: 1024 });

            const embed = new EmbedBuilder().setColor(config.EmbedColors);

            if (type === 'profile') {
                const flags = member.user.flags?.bitfield ?? 0;
                let badges = Object.keys(badgesFlags).filter(badge => (flags & badgesFlags[badge]) === badgesFlags[badge])
                    .map(badge => badge.replace(/_/g, ' '));

                if (badges.length === 0) badges = ['None'];

                const userData = await UserData.findOne(
                    { userId: user.id, guildId: interaction.guild.id },
                    'xp level balance bank totalMessages inventory commandData.dailyStreak'
                );

                const creationTimestamp = Math.floor(user.createdAt.getTime() / 1000);
                const accountAgeInDays = moment().diff(moment(user.createdAt), 'days');

                let description = lang.Profile.Embed.Description.map(line => {
                    return line
                        .replace("{joinDate}", `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`)
                        .replace("{role}", member.roles.highest.toString())
                        .replace("{nickname}", member.nickname || "*None*")
                        .replace("{userID}", user.id)
                        .replace("{user}", user.username)
                        .replace("{creationDate}", `<t:${creationTimestamp}:F>`)
                        .replace("{creationDays}", `<t:${creationTimestamp}:R>`)
                        .replace("{badges}", badges.join(', '))
                        .replace("{xp}", userData ? userData.xp.toLocaleString() : '0')
                        .replace("{level}", userData ? userData.level : '0')
                        .replace("{balance}", userData ? userData.balance.toLocaleString() : '0')
                        .replace("{bank}", userData ? userData.bank.toLocaleString() : '0')
                        .replace("{totalMessages}", userData ? userData.totalMessages.toLocaleString() : '0')
                        .replace("{inventoryItems}", userData && userData.inventory.length > 0 ? userData.inventory.map(item => `${item.itemId} x${item.quantity}`).join(', ') : '*None*')
                        .replace("{dailyStreak}", userData ? `${userData.commandData.dailyStreak} days` : '*None*');
                }).join('\n');

                embed.setDescription(description);

                if (lang.Profile.Embed.Title) {
                    embed.setTitle(replacePlaceholders(lang.Profile.Embed.Title));
                }

                if (lang.Profile.Embed.Footer.Text) {
                    let footerText = replacePlaceholders(lang.Profile.Embed.Footer.Text).replace("{userIcon}", userIcon).replace("{guildIcon}", guildIcon);
                    let footerIcon = lang.Profile.Embed.Footer.Icon.replace("{userIcon}", userIcon).replace("{guildIcon}", guildIcon);
                    embed.setFooter({
                        text: footerText,
                        iconURL: footerIcon || undefined
                    });
                }

                const authorText = replacePlaceholders(lang.Profile.Embed.Author.Text).replace("{nickname}", member.nickname || user.username);
                if (authorText) {
                    embed.setAuthor({
                        name: authorText,
                        iconURL: lang.Profile.Embed.Author.Icon.replace("{userIcon}", userIcon).replace("{guildIcon}", guildIcon) || undefined
                    });
                }

                if (lang.Profile.Embed.Thumbnail) {
                    embed.setThumbnail(lang.Profile.Embed.Thumbnail.replace("{userIcon}", userIcon).replace("{guildIcon}", guildIcon) || undefined);
                }

                if (lang.Profile.Embed.Image) {
                    embed.setImage(lang.Profile.Embed.Image);
                }

                await interaction.editReply({ embeds: [embed] });

            } else if (type === 'avatar') {
                embed.setTitle(`${user.username}'s Avatar`)
                    .setImage(avatarUrl)
                    .setFooter({ text: `${lang.AvatarSearchedBy} ${interaction.user.username}` });

                await interaction.editReply({ embeds: [embed] });

            } else if (type === 'banner') {
                if (bannerUrl) {
                    embed.setTitle(`${user.username}'s Banner`)
                        .setImage(bannerUrl)
                        .setFooter({ text: `${lang.BannerSearchedBy} ${interaction.user.username}` });

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({ content: lang.NoBannerSet, flags: MessageFlags.Ephemeral });
                }

            } else if (type === 'both') {
                if (bannerUrl) {
                    embed.setTitle(`${user.username}'s Avatar & Banner`)
                        .setImage(bannerUrl)
                        .setThumbnail(avatarUrl)
                        .setFooter({ text: `${lang.BannerSearchedBy} ${interaction.user.username}` });

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({ content: lang.NoBannerSet, flags: MessageFlags.Ephemeral });
                }
            }

        } catch (error) {
            console.error("Error in user command: ", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.editReply({ content: 'Sorry, there was an error processing your request.', flags: MessageFlags.Ephemeral });
            }
        }
    },
};