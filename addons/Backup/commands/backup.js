const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder, ApplicationCommandOptionType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Logger } = require('../../../utils/core/logger');
const backup = require('discord-backup');
const BackupModel = require('../models/Backup');
const { splitBackup, groupBackups, assembleBackup } = require('../utils/storage');

const { getConfig } = require('../../../utils/core/configLoader.js');
const { getLogChannel } = require('../../../utils/handlers/messageUtils.js');
const config = getConfig();

const backupCleanupMap = new Map();

setInterval(() => {
    try {
        const cutoffTime = Date.now() - (5 * 60 * 1000);
        
        for (const [key, timestamp] of backupCleanupMap.entries()) {
            if (timestamp < cutoffTime) {
                backupCleanupMap.delete(key);
            }
        }
        
        if (backupCleanupMap.size > 1000) {
            const entries = Array.from(backupCleanupMap.entries());
            entries.sort((a, b) => a[1] - b[1]);
            const toDelete = entries.slice(0, Math.floor(entries.length / 2));
            
            for (const [key] of toDelete) {
                backupCleanupMap.delete(key);
            }
        }
    } catch (error) {
        console.error('Backup cleanup warning:', error.message);
    }
}, 5 * 60 * 1000);

async function persistBackup(guild, backupData, automatic = false) {
    const records = splitBackup(backupData, guild.id, new Date(), automatic);
    try {
        await BackupModel.insertMany(records, { ordered: true });
    } catch (error) {
        await BackupModel.deleteMany({ guildId: guild.id, backupId: backupData.id }).catch(() => {});
        throw error;
    }
}

async function pruneAutomaticBackups(guildId) {
    const maxBackups = Number(config.Backup?.MaxBackups || 0);
    if (maxBackups <= 0) return;

    const records = await BackupModel.find({ guildId, automatic: true }).sort({ createdAt: -1 }).allowDiskUse(true);
    const groups = [...groupBackups(records).entries()]
        .map(([backupId, docs]) => ({ backupId, docs, createdAt: docs[0]?.createdAt || new Date(0) }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (const stale of groups.slice(maxBackups)) {
        await BackupModel.deleteMany({ guildId, backupId: stale.backupId });
    }
}

async function logBackupAction(guild, title, backupId, actor, automatic = false) {
    const channel = getLogChannel(guild, config.Backup?.LogsChannelID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(config.SuccessEmbedColor)
        .setAuthor({ name: guild.name, ...(guild.iconURL() ? { iconURL: guild.iconURL({ size: 64 }) } : {}) })
        .setTitle(title)
        .setDescription('De back-up is opgeslagen en kan worden teruggezet via `/backup load`.')
        .addFields(
            { name: 'Back-up-ID', value: `\`${backupId}\``, inline: true },
            { name: 'Type', value: automatic ? 'Automatisch' : 'Handmatig', inline: true },
            { name: 'Uitgevoerd door', value: actor ? `${actor.tag || actor.username} (${actor.id})` : 'Planning', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'DragonHosting | Back-up logs' });

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(error => {
        console.error('[Backup] Could not write backup action to log channel:', error.message);
    });
}

function getBackupOptions(guild) {
    const content = config.Backup?.Content || {};
    const messages = config.Backup?.Messages || {};
    const exclude = config.Backup?.Exclude || {};
    const include = config.Backup?.Include || {};

    const doNotBackup = new Set(exclude.Channels || []);

    const excludeCategories = exclude.Categories || [];
    if (excludeCategories.length > 0 && guild) {
        guild.channels.cache.forEach(ch => {
            if (excludeCategories.includes(ch.parentId) || excludeCategories.includes(ch.id)) {
                doNotBackup.add(ch.id);
            }
        });
    }

    const includeChannels = include.Channels || [];
    const includeCategories = include.Categories || [];

    if ((includeChannels.length > 0 || includeCategories.length > 0) && guild) {
        const allowedChannels = new Set(includeChannels);

        if (includeCategories.length > 0) {
            guild.channels.cache.forEach(ch => {
                if (includeCategories.includes(ch.parentId) || includeCategories.includes(ch.id)) {
                    allowedChannels.add(ch.id);
                }
            });
        }

        guild.channels.cache.forEach(ch => {
            if (!allowedChannels.has(ch.id)) {
                doNotBackup.add(ch.id);
            }
        });
    }

    return {
        maxMessagesPerChannel: messages.Enabled !== false ? (messages.MaxPerChannel ?? 50) : 0,
        jsonSave: false,
        jsonBeautify: false,
        saveImages: messages.SaveImages ?? false,
        doNotBackup: [...doNotBackup],
        doNotSave: [],
        getMembers: content.Members !== false,
        getRoles: content.Roles !== false,
        saveRolePermissions: content.RolePermissions !== false,
        backupEmojis: content.Emojis !== false,
        backupBans: content.Bans !== false,
        backupChannels: content.Channels !== false,
        saveServerSettings: content.ServerSettings !== false,
        backupMembers: {
            enabled: content.Members !== false,
            roles: content.MemberRoles !== false,
            nickname: content.MemberNicknames !== false
        }
    };
}

async function createAutoBackup(guild, client) {
    try {
        const backupData = await backup.create(guild, getBackupOptions(guild));
        
        await persistBackup(guild, backupData, true);

        backupData.channels = null;
        backupData.roles = null;
        backupData.bans = null;
        backupData.members = null;

        await pruneAutomaticBackups(guild.id);

        await logBackupAction(guild, 'Automatische back-up voltooid', backupData.id, null, true);

        return backupData.id;
    } catch (err) {
        console.error('Error creating automatic backup:', err);
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Manage server backups')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a backup of this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all backups for this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('load')
                .setDescription('Load a backup (WARNING: This will overwrite the current server)')
                .addStringOption(option =>
                    option.setName('backup_id')
                        .setDescription('The ID of the backup to load')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a backup')
                .addStringOption(option =>
                    option.setName('backup_id')
                        .setDescription('The ID of the backup to delete')
                        .setRequired(true))),

                        category: 'Utility',

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await createBackup(interaction);
                break;
            case 'list':
                await listBackups(interaction);
                break;
            case 'load':
                await loadBackup(interaction);
                break;
            case 'delete':
                await deleteBackup(interaction);
                break;
            default:
                await interaction.reply({ content: 'Invalid subcommand.', flags: MessageFlags.Ephemeral });
        }
    },
    createAutoBackup
};

async function createBackup(interaction) {
    const loadingEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Creating Backup...', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
        .setColor(config.EmbedColors)
        .setDescription('Please wait while the backup is being created...')
        .setTimestamp();

    await interaction.reply({ embeds: [loadingEmbed], flags: MessageFlags.Ephemeral });
    
    try {
        const backupData = await backup.create(interaction.guild, getBackupOptions(interaction.guild));
        
        await persistBackup(interaction.guild, backupData, false);
        
        backupData.channels = null;
        backupData.roles = null;
        backupData.bans = null;
        backupData.members = null;

        const successEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Backup Created!', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.SuccessEmbedColor)
            .setDescription(`Backup created successfully!\nBackup ID: ${backupData.id}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });
        await logBackupAction(interaction.guild, 'Handmatige back-up gemaakt', backupData.id, interaction.user);
    } catch (err) {
        console.error('Error creating backup:', err);
        const errorEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Error', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.ErrorEmbedColor)
            .setDescription('There was an error creating the backup. Please try again later.')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function listBackups(interaction) {
    try {
        const records = await BackupModel.find({ guildId: interaction.guild.id })
            .sort({ createdAt: -1 })
            .limit(1000);
        const backups = [...groupBackups(records).entries()]
            .map(([backupId, docs]) => ({ backupId, createdAt: docs[0]?.createdAt || new Date(0) }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        if (backups.length === 0) {
            const noBackupsEmbed = new EmbedBuilder()
                .setAuthor({ name: 'No Backups Found', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
                .setColor(config.ErrorEmbedColor)
                .setDescription('No backups found for this server.')
                .setTimestamp();

            return await interaction.reply({ embeds: [noBackupsEmbed], flags: MessageFlags.Ephemeral });
        }

        let description = '';
        for (const backup of backups) {
            description += `**ID:** ${backup.backupId}\n**Created:** <t:${Math.floor(backup.createdAt.getTime() / 1000)}:R>\n\n`;
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: 'Server Backups', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.EmbedColors)
            .setDescription(description)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
        console.error('Error listing backups:', err);
        const errorEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Error', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.ErrorEmbedColor)
            .setDescription('There was an error retrieving the backups.')
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}

async function loadBackup(interaction) {
    const backupId = interaction.options.getString('backup_id');
    
    const loadingEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Loading Backup...', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
        .setColor(config.EmbedColors)
        .setDescription('Please wait while the backup is being loaded...\nâš ï¸ This will overwrite your current server!')
        .setTimestamp();

    await interaction.reply({ embeds: [loadingEmbed], flags: MessageFlags.Ephemeral });

    try {
        const backupDocs = await BackupModel.find({ 
            guildId: interaction.guild.id,
            $or: [
                { backupId: backupId },
                { backupId: { $regex: `^${backupId}_\\d+$` } }
            ]
        }).sort({ chunkIndex: 1, backupId: 1 });

        if (backupDocs.length === 0) {
            const notFoundEmbed = new EmbedBuilder()
                .setAuthor({ name: 'Backup Not Found', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
                .setColor(config.ErrorEmbedColor)
                .setDescription('No backup found with that ID.')
                .setTimestamp();

            return await interaction.editReply({ embeds: [notFoundEmbed] });
        }

        const backupData = assembleBackup(backupDocs);
        if (!backupData?.id) throw new Error('The saved backup is incomplete or invalid');

        const confirmationId = `backup-restore:${interaction.id}`;
        const confirmationEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Herstel bevestigen', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(0xD83C3E)
            .setDescription(`Je staat op het punt back-up **${backupId}** terug te zetten. Dit verwijdert eerst de huidige kanalen, rollen en instellingen van deze server. Bevestig alleen als je dit zeker weet.`)
            .setTimestamp();
        const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`${confirmationId}:confirm`).setLabel('Herstel uitvoeren').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`${confirmationId}:cancel`).setLabel('Annuleren').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [confirmationEmbed], components: [confirmationRow] });

        let confirmation;
        try {
            const response = await interaction.fetchReply();
            confirmation = await response.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: component => component.user.id === interaction.user.id && component.customId.startsWith(confirmationId),
                time: 60_000
            });
        } catch {
            await interaction.editReply({ content: 'Herstel geannuleerd: er is niet op tijd bevestigd.', embeds: [], components: [] }).catch(() => {});
            return;
        }

        if (confirmation.customId.endsWith(':cancel')) {
            await confirmation.update({ content: 'Herstel geannuleerd; de server is niet gewijzigd.', embeds: [], components: [] });
            return;
        }

        await confirmation.update({
            embeds: [new EmbedBuilder().setColor(config.EmbedColors).setDescription('Back-up wordt teruggezet; dit kan even duren...').setTimestamp()],
            components: []
        });

        await backup.load(backupData, interaction.guild, {
            clearGuildBeforeRestore: true
        });
        await logBackupAction(interaction.guild, 'Serverback-up teruggezet', backupId, interaction.user);

        const successEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Backup Loaded!', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.SuccessEmbedColor)
            .setDescription(`Successfully loaded backup: ${backupId}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] }).catch(() => {});
    } catch (err) {
        console.error('Error loading backup:', err);
        const errorEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Error', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.ErrorEmbedColor)
            .setDescription('There was an error loading the backup. Please try again later.')
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
    }
}

async function deleteBackup(interaction) {
    const backupId = interaction.options.getString('backup_id');
    
    try {
        const result = await BackupModel.deleteMany({ 
            guildId: interaction.guild.id, 
            $or: [
                { backupId: backupId },
                { backupId: { $regex: `^${backupId}_\\d+$` } }
            ]
        });

        if (result.deletedCount === 0) {
            const notFoundEmbed = new EmbedBuilder()
                .setAuthor({ name: 'Backup Not Found', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
                .setColor(config.ErrorEmbedColor)
                .setDescription('No backup found with that ID.')
                .setTimestamp();

            return await interaction.reply({ embeds: [notFoundEmbed], flags: MessageFlags.Ephemeral });
        }

        const successEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Backup Deleted', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.SuccessEmbedColor)
            .setDescription(`Successfully deleted backup: ${backupId}`)
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
        await logBackupAction(interaction.guild, 'Serverback-up verwijderd', backupId, interaction.user);
    } catch (err) {
        console.error('Error deleting backup:', err);
        const errorEmbed = new EmbedBuilder()
            .setAuthor({ name: 'Error', iconURL: 'https://i.imgur.com/7SlmRRa.png' })
            .setColor(config.ErrorEmbedColor)
            .setDescription('There was an error deleting the backup.')
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
}


