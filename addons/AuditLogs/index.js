'use strict';

const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getLogChannel } = require('../../utils/handlers/messageUtils');

const COLOR = 0x1769ff;
const MAX_FIELD_LENGTH = 900;

function trim(value, limit = MAX_FIELD_LENGTH) {
    const text = String(value ?? '').trim();
    if (!text) return '-';
    return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function actorText(actor) {
    if (!actor) return 'Niet beschikbaar (controleer botpermissie View Audit Log)';
    return `${actor.tag || actor.username || actor.name || 'Onbekend'} (${actor.id})`;
}

function formatAuditChanges(changes) {
    if (!Array.isArray(changes) || changes.length === 0) return '';
    return changes.map(change => {
        const oldValue = change.old ?? '-';
        const newValue = change.new ?? '-';
        return `- **${change.key}**: ${trim(JSON.stringify(oldValue), 250)} -> ${trim(JSON.stringify(newValue), 250)}`;
    }).join('\n').slice(0, MAX_FIELD_LENGTH);
}

function makeEmbed(guild, title, description, fields = []) {
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(trim(title, 250))
        .setDescription(trim(description, 4000))
        .setTimestamp()
        .setFooter({ text: 'DragonHosting | Live logs' });
    const iconURL = guild?.iconURL?.({ size: 64 });
    embed.setAuthor({ name: trim(guild?.name || 'DragonHosting', 250), ...(iconURL ? { iconURL } : {}) });

    const validFields = fields
        .filter(field => field.value && field.value !== '-')
        .slice(0, 20)
        .map(field => ({ name: trim(field.name, 256), value: trim(field.value, 1024), inline: Boolean(field.inline) }));
    if (validFields.length) embed.addFields(validFields);
    return embed;
}

async function sendLog(guild, section, title, description, fields = []) {
    if (!guild || section?.Enabled === false) return;
    const channel = getLogChannel(guild, section?.LogsChannelID);
    if (!channel) return;
    try {
        await channel.send({ embeds: [makeEmbed(guild, title, description, fields)] });
    } catch (error) {
        console.error(`[AuditLogs] Could not send ${title} to guild ${guild.id}:`, error.message);
    }
}

async function sendToConfiguredGuilds(client, section, title, description) {
    if (section?.Enabled === false) return;
    await Promise.allSettled([...client.guilds.cache.values()].map(guild => sendLog(guild, section, title, description)));
}

function getAuditRoute(entry, AuditLogs) {
    const routes = new Map([
        [AuditLogEvent.RoleCreate, ['RoleEntityChanges', 'Rol aangemaakt']],
        [AuditLogEvent.RoleUpdate, ['RoleEntityChanges', 'Rol gewijzigd']],
        [AuditLogEvent.RoleDelete, ['RoleEntityChanges', 'Rol verwijderd']],
        [AuditLogEvent.ChannelUpdate, ['ChannelChanges', 'Kanaal bijgewerkt']],
        [AuditLogEvent.AutoModerationRuleCreate, ['AutoModeration', 'Automod-regel aangemaakt']],
        [AuditLogEvent.AutoModerationRuleUpdate, ['AutoModeration', 'Automod-regel bijgewerkt']],
        [AuditLogEvent.AutoModerationRuleDelete, ['AutoModeration', 'Automod-regel verwijderd']]
    ]);
    const route = routes.get(entry.action);
    return route && AuditLogs?.[route[0]]?.Enabled !== false ? route : null;
}

module.exports = {
    name: 'AuditLogs',
    version: '1.0.0',
    description: 'Additional audit, automod, forum and bot health logs for replacing Quark Logger',

    async run(client, _eventManager, api) {
        const settings = api.config.AuditLogs || {};
        if (settings.Enabled === false) return () => {};

        for (const key of ['AutoModeration', 'ForumThreads', 'BotHealth', 'Music']) {
            if (settings[key]?.Enabled !== false && (!Array.isArray(settings[key]?.LogsChannelID) || settings[key].LogsChannelID.length === 0)) {
                console.warn(`[AuditLogs] ${key} logs are enabled but no destination channel ID is configured.`);
            }
        }

        const listeners = [];
        const on = (eventName, handler) => {
            client.on(eventName, handler);
            listeners.push([eventName, handler]);
        };

        on('guildMemberAdd', member => sendLog(
            member.guild,
            settings.MemberJoin,
            'Lid toegetreden',
            `${member.user.tag} (${member.id}) is lid geworden.`,
            [{ name: 'Account aangemaakt', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }]
        ));

        on('guildMemberRemove', member => sendLog(
            member.guild,
            settings.MemberLeave,
            'Lid vertrokken',
            `${member.user?.tag || member.id} (${member.id}) heeft de server verlaten.`
        ));

        on('messageDeleteBulk', messages => {
            const first = messages.first();
            if (!first?.guild) return;
            const authors = new Set(messages.map(message => message.author?.id).filter(Boolean));
            return sendLog(first.guild, settings.MessageBulkDelete, 'Berichten in bulk verwijderd',
                `${messages.size} berichten verwijderd in <#${first.channelId}>.`, [
                    { name: 'Verschillende auteurs', value: String(authors.size), inline: true },
                    { name: 'Kanaal-ID', value: first.channelId, inline: true }
                ]);
        });

        const forumLog = (title, thread) => sendLog(thread.guild, settings.ForumThreads, title,
            `Forum-/threadkanaal: **${trim(thread.name, 180)}**\nID: ${thread.id}\nParent: ${thread.parentId ? `<#${thread.parentId}>` : '—'}`);
        on('threadCreate', thread => forumLog('Forumtopic of thread aangemaakt', thread));
        on('threadDelete', thread => forumLog('Forumtopic of thread verwijderd', thread));
        on('threadUpdate', (oldThread, newThread) => {
            if (oldThread.name === newThread.name && oldThread.archived === newThread.archived && oldThread.locked === newThread.locked) return;
            return forumLog('Forumtopic of thread bijgewerkt', newThread);
        });

        on('guildUpdate', (oldGuild, newGuild) => {
            const fields = [];
            if (oldGuild.icon !== newGuild.icon) fields.push({ name: 'Servericoon', value: 'Gewijzigd' });
            if (oldGuild.banner !== newGuild.banner) fields.push({ name: 'Banner', value: 'Gewijzigd' });
            if (oldGuild.description !== newGuild.description) fields.push({ name: 'Beschrijving', value: 'Gewijzigd' });
            if (oldGuild.verificationLevel !== newGuild.verificationLevel) fields.push({ name: 'Verificatieniveau', value: `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}` });
            if (fields.length) return sendLog(newGuild, settings.GuildSettings, 'Serverinstellingen gewijzigd', 'Een of meer serverinstellingen zijn aangepast.', fields);
        });

        for (const [eventName, title] of [
            ['emojiCreate', 'Emoji toegevoegd'], ['emojiUpdate', 'Emoji gewijzigd'], ['emojiDelete', 'Emoji verwijderd'],
            ['stickerCreate', 'Sticker toegevoegd'], ['stickerUpdate', 'Sticker gewijzigd'], ['stickerDelete', 'Sticker verwijderd']
        ]) {
            const isUpdate = eventName.endsWith('Update');
            on(eventName, (asset, updatedAsset) => {
                const target = isUpdate ? updatedAsset : asset;
                return sendLog(target.guild, settings.ServerAssets, title,
                    `**${trim(target.name || 'Onbekend', 180)}** (ID: ${target.id})`);
            });
        }

        on('autoModerationActionExecution', execution => {
            const userId = execution.userId || execution.member?.id;
            const channelId = execution.channelId;
            const fields = [
                { name: 'Regel', value: execution.ruleName || execution.ruleId },
                { name: 'Actie', value: execution.action?.type || execution.actionType },
                { name: 'Gebruiker', value: userId ? `<@${userId}> (${userId})` : 'Onbekend' },
                { name: 'Kanaal', value: channelId ? `<#${channelId}>` : 'Niet van toepassing' },
                { name: 'Match', value: execution.matchedContent || execution.matchedKeyword }
            ];
            return sendLog(execution.guild, settings.AutoModeration, 'Automod-actie uitgevoerd',
                'Discord heeft een AutoMod-regel uitgevoerd.', fields);
        });

        on('guildAuditLogEntryCreate', (entry, guild) => {
            const route = getAuditRoute(entry, settings);
            if (!route) return;
            const section = settings[route[0]];
            const fields = [
                { name: 'Uitgevoerd door', value: actorText(entry.executor) },
                { name: 'Doel', value: entry.target?.name || entry.target?.tag || entry.targetId || '—' },
                { name: 'Reden', value: entry.reason || 'Geen reden opgegeven' },
                { name: 'Wijzigingen', value: formatAuditChanges(entry.changes) }
            ];
            return sendLog(guild, section, route[1], `Auditlog-event **${entry.action}**`, fields);
        });

        on('shardDisconnect', (closeEvent, shardId) => sendToConfiguredGuilds(
            client, settings.BotHealth, 'Botverbinding verbroken',
            `Shard ${shardId} is losgekoppeld. Discord-code: ${closeEvent?.code ?? 'onbekend'}.`));
        on('shardReconnecting', shardId => sendToConfiguredGuilds(
            client, settings.BotHealth, 'Bot probeert opnieuw te verbinden', `Shard ${shardId}.`));
        on('shardResume', shardId => sendToConfiguredGuilds(
            client, settings.BotHealth, 'Botverbinding hersteld', `Shard ${shardId} is weer verbonden.`));

        const lastClientErrorByGuild = new Map();
        on('error', error => {
            const now = Date.now();
            for (const guild of client.guilds.cache.values()) {
                if (settings.BotHealth?.Enabled === false || !getLogChannel(guild, settings.BotHealth?.LogsChannelID)) continue;
                const lastSent = lastClientErrorByGuild.get(guild.id) || 0;
                if (now - lastSent < 60_000) continue;
                lastClientErrorByGuild.set(guild.id, now);
                void sendLog(guild, settings.BotHealth, 'Discord-clientfout',
                    trim(`${error?.name || 'Error'}: ${error?.message || error}`, 1500));
            }
        });

        api.on('music:trackStart', ({ track, guild, channel, requestedBy }) => sendLog(
            guild, settings.Music, 'Muziek gestart', `**${trim(track?.title || 'Onbekend nummer', 220)}**`, [
                { name: 'Gevraagd door', value: requestedBy?.tag || requestedBy?.username || 'Onbekend', inline: true },
                { name: 'Spraakkanaal', value: channel?.name || 'Onbekend', inline: true },
                { name: 'Link', value: track?.url || '—' }
            ]));
        api.on('music:trackAdded', ({ track, guild, channel, requestedBy }) => sendLog(
            guild, settings.Music, 'Nummer aan wachtrij toegevoegd', `**${trim(track?.title || 'Onbekend nummer', 220)}**`, [
                { name: 'Gevraagd door', value: requestedBy?.tag || requestedBy?.username || 'Onbekend', inline: true },
                { name: 'Spraakkanaal', value: channel?.name || 'Onbekend', inline: true },
                { name: 'Link', value: track?.url || '—' }
            ]));

        return () => {
            for (const [eventName, handler] of listeners) client.off(eventName, handler);
        };
    }
};
