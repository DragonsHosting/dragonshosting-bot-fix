/*
  _____            _           ____        _   
 |  __ \          | |         |  _ \      | |  
 | |  | |_ __ __ _| | _____   | |_) | ___ | |_ 
 | |  | | '__/ _` | |/ / _ \  |  _ < / _ \| __|
 | |__| | | | (_| |   < (_) | | |_) | (_) | |_ 
 |_____/|_|  \__,_|_|\_\___/  |____/ \___/ \__|
                                             
                                        
 Thank you for choosing DragonHosting!

 Should you encounter any issues, require assistance, or have suggestions for improving the bot,
 we invite you to connect with us on our Discord server and create a support ticket: 

 https://discord.gg/DragonsHosting
 
*/

const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require("discord.js");
const fs = require("fs");
const yaml = require("js-yaml");

const giveawayActions = require("../events/giveawayActions.js");
const { getConfig } = require('../../../utils/core/configLoader.js');
const config = getConfig();


function extractAndValidateRoleIds(input, guild) {
    if (!input) return { validRoles: [], invalidRoles: [] };

    const roleMentionRegex = /<@&(\d+)>|(\d+)/g;
    let match;
    const validRoles = [];
    const invalidRoles = [];

    while ((match = roleMentionRegex.exec(input)) !== null) {
        const roleId = match[1] || match[2];
        if (guild.roles.cache.has(roleId)) {
            validRoles.push(roleId);
        } else {
            invalidRoles.push(roleId);
        }
    }

    return { validRoles, invalidRoles };
}

function hasCommonElements(arr1, arr2) {
    return arr1.some((item) => arr2.includes(item));
}

function isValidDateFormat(dateString) {
    const regex = /^[a-zA-Z]+\s\d{1,2}\s\d{4}$/;
    return regex.test(dateString);
}

function generateMixedId(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function parseDuration(durationString) {
    const regex = /^(\d+)([mhdwy])$/;
    const match = durationString.match(regex);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
        'm': 60 * 1000,
        'h': 60 * 60 * 1000,
        'd': 24 * 60 * 60 * 1000,
        'w': 7 * 24 * 60 * 60 * 1000,
        'y': 365 * 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription(`Manage giveaways`)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create a giveaway")
                .addChannelOption((option) =>
                    option
                        .setName("channel")
                        .setDescription("The channel you want to create the giveaway in")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("time")
                        .setDescription(
                            "How long the giveaway should be, for example: 1m (minutes), 1h (hours), 1d (days), 1y (years)"
                        )
                        .setRequired(true)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("winners")
                        .setDescription("How many users can win the giveaway?")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("prize")
                        .setDescription("The prize to win")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("hostedby")
                        .setDescription(
                            'Who is hosting the giveaway? Do @ followed by the Username'
                        )
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("min_server_join_date")
                        .setDescription(
                            'Minimum server join date to enter (format: "January 1 2000") [Optional]'
                        )
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("min_account_age")
                        .setDescription(
                            'Minimum account age to enter (format: "January 1 2000") [Optional]'
                        )
                        .setRequired(false)
                )
                .addIntegerOption((option) =>
                    option
                        .setName("min_invites")
                        .setDescription("Minimum number of invites required to enter [Optional]")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('whitelist_roles')
                        .setDescription('Roles allowed to enter the giveaway, Do @ followed by the Role [Optional]')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('blacklist_roles')
                        .setDescription('Roles disallowed from entering the giveaway, Do @ followed by the Role [Optional]')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('notify')
                        .setDescription('Who to notify when the giveaway starts [Optional]')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Nobody', value: 'notify_nobody' },
                            { name: 'Whitelist Roles', value: 'notify_whitelist_roles' },
                            { name: 'Everyone', value: 'notify_everyone' },
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("min_messages")
                        .setDescription("Minimum number of messages required to enter [Optional]")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("extra_entries")
                        .setDescription("Roles to give extra entries to (Format: @role:entries @role2:entries) [Optional]")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("reroll")
                .setDescription("Reroll a giveaway")
                .addStringOption((option) =>
                    option
                        .setName("giveaway_id")
                        .setDescription("The giveaway ID at the footer of the giveaway embed")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("users")
                        .setDescription("The users to reroll, Do @ followed by the Username(s)")
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("end")
                .setDescription("End a giveaway")
                .addStringOption((option) =>
                    option
                        .setName("giveaway_id")
                        .setDescription("The giveaway ID at the footer of the giveaway embed")
                        .setRequired(true)
                )
    ),
    category: 'General',
    async execute(interaction, client) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const allowedRoles = config.Giveaways.AllowRoles;
            const userRoles = interaction.member.roles.cache.map((role) => role.id);
            const hasPermission = userRoles.some((role) =>
                allowedRoles.includes(role)
            ) || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!hasPermission) {
                return interaction.editReply({
                    content: "You do not have permission to use the giveaway command.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const subCommand = interaction.options.getSubcommand();
            switch (subCommand) {
                case "create":
                    let gTime = parseDuration(interaction.options.getString("time"));
                    if (gTime === null) {
                        return interaction.editReply({
                            content: "Invalid time format. Please use a number followed by m, h, d, w, or y (e.g., 1h for 1 hour).",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    let prize = interaction.options.getString("prize");
                    let channel = interaction.options.getChannel("channel");
                    let winnerCount = interaction.options.getInteger("winners");
                    let hostedBy = interaction.options.getString("hostedby");

                    let whitelistRolesInput = interaction.options.getString("whitelist_roles");
                    let blacklistRolesInput = interaction.options.getString("blacklist_roles");

                    const { validRoles: validWhitelistRoles, invalidRoles: invalidWhitelistRoles } = extractAndValidateRoleIds(whitelistRolesInput, interaction.guild);
                    const { validRoles: validBlacklistRoles, invalidRoles: invalidBlacklistRoles } = extractAndValidateRoleIds(blacklistRolesInput, interaction.guild);

                    if (invalidWhitelistRoles.length > 0 || invalidBlacklistRoles.length > 0) {
                        let errorMessage = "The following role IDs are invalid:";
                        if (invalidWhitelistRoles.length > 0) {
                            errorMessage += `\nInvalid whitelist role ID(s): ${invalidWhitelistRoles.join(", ")}`;
                        }
                        if (invalidBlacklistRoles.length > 0) {
                            errorMessage += `\nInvalid blacklist role ID(s): ${invalidBlacklistRoles.join(", ")}`;
                        }

                        return interaction.editReply({
                            content: errorMessage,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (hasCommonElements(validWhitelistRoles, validBlacklistRoles)) {
                        return interaction.editReply({
                            content: "A role cannot be both whitelisted and blacklisted.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    let minServerJoinDateInput = interaction.options.getString("min_server_join_date");
                    let minServerJoinDate = isValidDateFormat(minServerJoinDateInput) ? new Date(minServerJoinDateInput) : null;

                    let minAccountAgeInput = interaction.options.getString("min_account_age");
                    let minAccountAge = isValidDateFormat(minAccountAgeInput) ? new Date(minAccountAgeInput) : null;

                    if ((minServerJoinDateInput && !minServerJoinDate) || (minAccountAgeInput && !minAccountAge)) {
                        return interaction.editReply({
                            content: "One or more dates are in an incorrect format. Please use 'Month Day Year' (e.g., January 1 2000).",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    const notifyOption = interaction.options.getString('notify');

                    let notifyFollowing;
                    switch (notifyOption) {
                        case 'notify_everyone':
                            notifyFollowing = "@everyone"
                            break;
                        case 'notify_whitelist_roles':
                            notifyFollowing = validWhitelistRoles
                            break;
                        case 'notify_nobody':
                            notifyFollowing = ""
                            break;
                    }

                    let minInvites = interaction.options.getInteger("min_invites") || 0;
                    let minMessages = interaction.options.getInteger("min_messages") || 0;
                    let extraEntriesInput = interaction.options.getString("extra_entries");
                    
                    let extraEntries = [];
                    if (extraEntriesInput) {
                        const regex = /<@&(\d+)>:(\d+)/g;
                        let match;
                        while ((match = regex.exec(extraEntriesInput)) !== null) {
                            const roleId = match[1];
                            const entries = parseInt(match[2]);
                            if (entries > 0 && interaction.guild.roles.cache.has(roleId)) {
                                extraEntries.push({ roleId, entries });
                            }
                        }
                    }

                    const giveawayDetails = {
                        giveawayId: generateMixedId(8),
                        time: gTime,
                        prize: prize,
                        channel: channel,
                        winnerCount: winnerCount,
                        whitelistRoles: validWhitelistRoles,
                        blacklistRoles: validBlacklistRoles,
                        minServerJoinDate: minServerJoinDate,
                        minAccountAge: minAccountAge,
                        minInvites: minInvites,
                        minMessages: minMessages,
                        hostedBy: hostedBy,
                        notifyUsers: notifyFollowing,
                        extraEntries: extraEntries
                    };

                    await giveawayActions.startGiveaway(interaction, giveawayDetails);
                    break;
                case "reroll":
                    let rerollGiveawayId = interaction.options.getString("giveaway_id");
                    const usersToRerollInput = interaction.options.getString("users");

                    let userIdsToReroll = [];
                    if (usersToRerollInput) {
                        userIdsToReroll = usersToRerollInput.match(/<@!?(\d+)>/g)?.map(u => u.replace(/\D/g, '')) || [];
                    }

                    await giveawayActions.rerollGiveaway(interaction, rerollGiveawayId, userIdsToReroll);
                    break;
                case "end":
                    let giveawayId = interaction.options.getString("giveaway_id");
                    await giveawayActions.endGiveaway(giveawayId);
                    await interaction.editReply({
                        content: `Giveaway with ID ${giveawayId} has been ended.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    break;
                default:
                    break;
            }

        } catch (error) {
            console.error(error);
            interaction.editReply({
                content: "An error occurred while executing the giveaway command.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};