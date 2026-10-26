'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');

const styles = {
    PRIMARY: ButtonStyle.Primary,
    SECONDARY: ButtonStyle.Secondary,
    SUCCESS: ButtonStyle.Success,
    DANGER: ButtonStyle.Danger
};

function firstExisting(cache, configured) {
    const ids = Array.isArray(configured) ? configured : [configured];
    return ids.map(id => cache.get(id)).find(Boolean) || null;
}

function panelEmbed(panel) {
    const data = panel.Embed || {};
    const embed = new EmbedBuilder().setColor(data.Color || '#5865F2');
    if (data.Title) embed.setTitle(data.Title);
    if (data.Description) embed.setDescription(Array.isArray(data.Description) ? data.Description.join('\n') : data.Description);
    if (data.Footer?.Text) embed.setFooter({ text: data.Footer.Text, iconURL: data.Footer.Icon || undefined });
    if (data.Author?.Text) embed.setAuthor({ name: data.Author.Text, iconURL: data.Author.Icon || undefined });
    if (data.Image) embed.setImage(data.Image);
    if (data.Thumbnail) embed.setThumbnail(data.Thumbnail);
    return embed;
}

async function toggleRole(interaction, panel, reaction) {
    const role = firstExisting(interaction.guild.roles.cache, reaction.RoleID);
    if (!role) return interaction.reply({ content: 'Deze rol bestaat niet meer.', flags: MessageFlags.Ephemeral });
    const member = interaction.member;
    if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Reaction role removed');
        return interaction.reply({ content: `${role} verwijderd.`, flags: MessageFlags.Ephemeral });
    }

    const required = (panel.RequiredRoles || []).filter(id => !member.roles.cache.has(id));
    const blocked = [...(reaction.Conditions?.ExcludedRoles || []), ...(reaction.Conditions?.ForbiddenRoles || [])]
        .some(id => member.roles.cache.has(id));
    if (required.length || blocked) {
        return interaction.reply({ content: 'Je voldoet niet aan de voorwaarden voor deze rol.', flags: MessageFlags.Ephemeral });
    }

    for (const removeId of reaction.RemoveRoles || []) {
        if (member.roles.cache.has(removeId)) await member.roles.remove(removeId).catch(() => {});
    }
    await member.roles.add(role, 'Reaction role selected');
    for (const grantId of reaction.GrantRoles || []) {
        if (!member.roles.cache.has(grantId)) await member.roles.add(grantId).catch(() => {});
    }
    return interaction.reply({ content: `${role} toegevoegd.`, flags: MessageFlags.Ephemeral });
}

module.exports = {
    name: 'ReactionRoles',
    version: '1.0.0',
    description: 'Button, menu and emoji reaction role panels',
    async run(client, eventManager, api) {
        const config = api.config.ReactionRoles;
        const Model = require('./models/ReactionRole');
        api.registerModel('ReactionRole', Model);
        if (!config?.Enabled) return () => {};

        const panels = Object.entries(config).filter(([name, value]) => name !== 'Enabled' && value?.Reactions);
        api.onDiscord('interactionCreate', async ({ interaction }) => {
            if (!interaction?.customId?.startsWith('reaction_role_')) return false;
            const parts = interaction.customId.split('_');
            const panel = config[parts[2]];
            if (!panel) return false;
            const indexes = interaction.isStringSelectMenu?.() ? interaction.values.map(Number) : [Number(parts[3])];
            for (const index of indexes) {
                const reaction = panel.Reactions[index];
                if (reaction) await toggleRole(interaction, panel, reaction);
            }
            return true;
        }, { priority: 80 });

        const handleEmoji = async (reaction, user, add) => {
            if (user.bot) return;
            if (reaction.partial) await reaction.fetch().catch(() => null);
            const stored = await Model.findOne({ messageID: reaction.message.id }).lean();
            const panel = stored && config[stored.panelName];
            if (!panel) return;
            const option = panel.Reactions.find(item => item.Emoji === reaction.emoji.name || item.Emoji === reaction.emoji.id);
            const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
            const role = option && firstExisting(reaction.message.guild.roles.cache, option.RoleID);
            if (!member || !role) return;
            if (add) await member.roles.add(role, 'Reaction role selected').catch(() => {});
            else await member.roles.remove(role, 'Reaction role removed').catch(() => {});
            if (panel.resetReacts && add) await reaction.users.remove(user.id).catch(() => {});
        };
        const reactionAdd = (reaction, user) => handleEmoji(reaction, user, true);
        const reactionRemove = (reaction, user) => handleEmoji(reaction, user, false);
        client.on('messageReactionAdd', reactionAdd);
        client.on('messageReactionRemove', reactionRemove);

        const setupPanels = async () => {
            for (const [name, panel] of panels) {
                const channel = firstExisting(client.channels.cache, panel.ChannelID);
                if (!channel?.isTextBased()) continue;
                const stored = await Model.findOne({ panelName: name });
                if (stored && await channel.messages.fetch(stored.messageID).catch(() => null)) continue;

                const payload = { embeds: [panelEmbed(panel)], components: [] };
                if (panel.type === 'BUTTON') {
                    for (let offset = 0; offset < panel.Reactions.length; offset += 5) {
                        payload.components.push(new ActionRowBuilder().addComponents(
                            panel.Reactions.slice(offset, offset + 5).map((item, index) =>
                                new ButtonBuilder()
                                    .setCustomId(`reaction_role_${name}_${offset + index}`)
                                    .setLabel(item.Name || `Role ${offset + index + 1}`)
                                    .setEmoji(item.Emoji || undefined)
                                    .setStyle(styles[String(item.Style || 'SECONDARY').toUpperCase()] || ButtonStyle.Secondary)
                            )
                        ));
                    }
                } else if (panel.type === 'SELECT') {
                    payload.components.push(new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`reaction_role_${name}`)
                            .setPlaceholder(panel.Placeholder || 'Choose your roles')
                            .setMinValues(1)
                            .setMaxValues(Math.min(25, panel.MaxSelections || panel.Reactions.length))
                            .addOptions(panel.Reactions.map((item, index) => ({
                                label: item.Name || `Role ${index + 1}`,
                                value: String(index),
                                description: item.Description?.slice(0, 100),
                                emoji: item.Emoji || undefined
                            })))
                    ));
                }
                const message = await channel.send(payload);
                if (panel.type === 'REACT') {
                    for (const item of panel.Reactions) await message.react(item.Emoji).catch(() => {});
                }
                await Model.findOneAndUpdate(
                    { panelName: name },
                    { panelName: name, channelID: channel.id, messageID: message.id },
                    { upsert: true, new: true }
                );
            }
        };
        if (client.isReady()) await setupPanels();
        else client.once('clientReady', setupPanels);

        return () => {
            client.off('messageReactionAdd', reactionAdd);
            client.off('messageReactionRemove', reactionRemove);
        };
    }
};
