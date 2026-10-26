const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const UserData = require('../../../models/UserData');
const fs = require('fs');
const yaml = require('js-yaml');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();

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

async function assignLevelRoles(member, newLevel) {
    const levelUpRoles = config.LevelingSystem.RoleSettings.LevelRoles || [];
    const stackRoles = config.LevelingSystem.RoleSettings.StackRoles;
    
    const qualifiedRoles = levelUpRoles.filter(r => newLevel >= r.level && r.roleID);
    const highestQualified = qualifiedRoles.length > 0 
        ? qualifiedRoles.reduce((a, b) => a.level > b.level ? a : b) 
        : null;
    
    for (const levelUpRole of levelUpRoles) {
        const role = levelUpRole.roleID ? member.guild.roles.cache.get(levelUpRole.roleID) : null;
        if (!role) continue;
        
        const shouldHaveRole = stackRoles 
            ? newLevel >= levelUpRole.level 
            : highestQualified && levelUpRole.roleID === highestQualified.roleID;
        
        if (shouldHaveRole && !member.roles.cache.has(role.id)) {
            try {
                await member.roles.add(role);
            } catch (error) {
                if (error.code === 50013) {
                    console.error(`[LEVEL COMMAND] Bot lacks permissions to assign level role "${role.name}" (${role.id}) to ${member.user.tag}. Please ensure the bot's role is positioned above the level roles in the server settings.`);
                } else {
                    console.error(`[LEVEL COMMAND] Error assigning level role "${role.name}" to ${member.user.tag}:`, error);
                }
            }
        } else if (!shouldHaveRole && member.roles.cache.has(role.id)) {
            try {
                await member.roles.remove(role);
            } catch (error) {
                if (error.code === 50013) {
                    console.error(`[LEVEL COMMAND] Bot lacks permissions to remove level role "${role.name}" (${role.id}) from ${member.user.tag}. Please ensure the bot's role is positioned above the level roles in the server settings.`);
                } else {
                    console.error(`[LEVEL COMMAND] Error removing level role "${role.name}" from ${member.user.tag}:`, error);
                }
            }
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Manage user levels and XP')
        .addSubcommand(subcommand =>
            subcommand.setName('give')
                .setDescription('Give XP or Levels to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give XP or Levels to')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Choose XP or Level')
                        .setRequired(true)
                        .addChoices(
                            { name: 'XP', value: 'xp' },
                            { name: 'Level', value: 'level' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of XP or Levels to give')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('remove')
                .setDescription('Remove XP or Levels from a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove XP or Levels from')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Choose XP or Level')
                        .setRequired(true)
                        .addChoices(
                            { name: 'XP', value: 'xp' },
                            { name: 'Level', value: 'level' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of XP or Levels to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('set')
                .setDescription('Set the XP or Level of a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to set XP or Level for')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Choose XP or Level')
                        .setRequired(true)
                        .addChoices(
                            { name: 'XP', value: 'xp' },
                            { name: 'Level', value: 'level' }
                        ))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Set the amount of XP or Level')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('check')
                .setDescription('Check the XP and level of a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to check XP and level for')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand.setName('reset')
                .setDescription('Reset all users\' levels and XP in the server')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Choose what to reset')
                        .setRequired(true)
                        .addChoices(
                            { name: 'XP Only', value: 'xp' },
                            { name: 'Level Only', value: 'level' },
                            { name: 'Both XP and Level', value: 'both' }
                        ))),
    category: 'General',
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand !== 'check') {
            const requiredRoles = config.LevelingSystem.Permission;
            const hasPermission = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                requiredRoles.some(roleId => interaction.member.roles.cache.has(roleId));

            if (!hasPermission) {
                await interaction.reply({ content: lang.Levels.NoPermission, flags: MessageFlags.Ephemeral });
                return;
            }
        }

        if (subcommand === 'reset') {
            const type = interaction.options.getString('type');
            
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Level System Reset Confirmation')
                .setDescription(`Are you sure you want to reset ${type === 'both' ? 'both XP and levels' : type} for all users in this server?\n\nThis action cannot be undone!`)
                .setColor('#FFA500');

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_level_reset')
                .setLabel('Confirm Reset')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_level_reset')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            const response = await interaction.reply({
                embeds: [confirmEmbed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });

            try {
                const confirmation = await response.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id,
                    time: 30000
                });

                if (confirmation.customId === 'cancel_level_reset') {
                    return confirmation.update({
                        content: 'Reset cancelled.',
                        embeds: [],
                        components: []
                    });
                }

                if (confirmation.customId === 'confirm_level_reset') {
                    await confirmation.update({
                        content: 'Processing reset...',
                        embeds: [],
                        components: []
                    });

                    const updateQuery = {};
                    if (type === 'xp' || type === 'both') {
                        updateQuery.xp = 0;
                    }
                    if (type === 'level' || type === 'both') {
                        updateQuery.level = 0;
                    }

                    try {
                        const result = await UserData.updateMany(
                            { guildId: interaction.guild.id },
                            { $set: updateQuery }
                        );

                        const resultEmbed = new EmbedBuilder()
                            .setDescription(`Successfully reset ${type === 'both' ? 'XP and levels' : type} for ${result.modifiedCount} users.`)
                            .setColor('#FF0000');

                        return confirmation.editReply({
                            content: '',
                            embeds: [resultEmbed]
                        });
                    } catch (error) {
                        console.error('Error resetting levels:', error);
                        return confirmation.editReply({
                            content: 'An error occurred while resetting the levels.',
                            embeds: []
                        });
                    }
                }
            } catch (error) {
                if (error.code === 'InteractionCollectorError') {
                    await interaction.editReply({
                        content: 'Confirmation timed out. Please try again.',
                        embeds: [],
                        components: []
                    });
                } else {
                    console.error('Error in confirmation handling:', error);
                    await interaction.editReply({
                        content: 'An error occurred while processing the confirmation.',
                        embeds: [],
                        components: []
                    });
                }
            }
            return;
        }

        const user = interaction.options.getUser('user') || interaction.user;

        switch (subcommand) {
            case 'give':
            case 'remove':
            case 'set':
                const type = interaction.options.getString('type');
                const amount = interaction.options.getInteger('amount');
                const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);

                if (type === 'xp') {
                    const currentData = await UserData.findOne({ userId: user.id, guildId: guildId }) || { xp: 0, level: 0 };
                    
                    let newXP = (subcommand === 'set') ? amount : 
                               (subcommand === 'give') ? currentData.xp + amount : 
                               Math.max(0, currentData.xp - amount);

                    let currentLevel = currentData.level;
                    let currentXP = newXP;
                    let levelChanged = false;
                    
                    while (true) {
                        const xpNeeded = calculateXPNeeded(currentLevel);
                        
                        if (currentXP >= xpNeeded) {
                            currentXP -= xpNeeded;
                            currentLevel++;
                            levelChanged = true;
                        } else {
                            break;
                        }
                    }

                    const updatedUser = await UserData.findOneAndUpdate(
                        { userId: user.id, guildId: guildId },
                        {
                            $set: { level: currentLevel, xp: currentXP },
                            $setOnInsert: {
                                userId: user.id,
                                guildId: guildId,
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

                    if (levelChanged && targetMember) {
                        await assignLevelRoles(targetMember, currentLevel);
                    }

                    if (levelChanged) {
                        await interaction.reply({
                            content: lang.Levels.UpdatedXPAndLevel
                                .replace('{user}', user.username)
                                .replace('{xp}', currentXP)
                                .replace('{level}', currentLevel),
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        await interaction.reply({
                            content: lang.Levels.UpdatedXP
                                .replace('{user}', user.username)
                                .replace('{xp}', currentXP),
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } else {
                    const currentData = await UserData.findOne({ userId: user.id, guildId: guildId }) || { level: 0 };
                    
                    const newLevel = (subcommand === 'set') ? amount : 
                                   (subcommand === 'give') ? currentData.level + amount : 
                                   Math.max(0, currentData.level - amount);

                    const updatedUser = await UserData.findOneAndUpdate(
                        { userId: user.id, guildId: guildId },
                        {
                            $set: { level: newLevel },
                            $setOnInsert: {
                                userId: user.id,
                                guildId: guildId,
                                xp: 0,
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

                    if (targetMember) {
                        await assignLevelRoles(targetMember, newLevel);
                    }

                    await interaction.reply({
                        content: lang.Levels.UpdatedLevel
                            .replace('{user}', user.username)
                            .replace('{level}', newLevel),
                        flags: MessageFlags.Ephemeral
                    });
                }
                break;
            case 'check':
                const userData = await UserData.findOne({ userId: user.id, guildId: guildId });
                if (!userData) {
                    await interaction.reply({ 
                        content: lang.Levels.DataNotFound.replace('{user}', user.username), 
                        flags: MessageFlags.Ephemeral 
                    });
                    return;
                }
                await interaction.reply({
                    content: lang.Levels.CurrentLevelAndXP
                        .replace('{user}', user.username)
                        .replace('{level}', userData.level)
                        .replace('{xp}', userData.xp),
                    flags: MessageFlags.Ephemeral
                });
                break;
        }
    }
};