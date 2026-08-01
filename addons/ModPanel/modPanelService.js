const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const ACTIONS = new Set(['kick', 'ban', 'timeout', 'warn', 'softban', 'unban', 'userinfo']);
const BUTTON_PREFIXES = ['persistent_mod_', 'modpanel_', 'mod_'];
const MODAL_PREFIXES = ['persistent_mod_modal_', 'modpanel_modal_', 'mod_modal_'];
const dataDir = path.join(__dirname, 'data');
const configFile = path.join(dataDir, 'modpanel-config.json');

const defaultConfig = {
  guilds: {},
};

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
  }
}

function readConfig() {
  ensureStore();
  try {
    const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return {
      ...defaultConfig,
      ...stored,
      guilds: {
        ...defaultConfig.guilds,
        ...(stored.guilds || {}),
      },
    };
  } catch {
    return { ...defaultConfig };
  }
}

function writeConfig(config) {
  ensureStore();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function getGuildConfig(guildId) {
  return readConfig().guilds[guildId] || {};
}

function setGuildConfig(guildId, patch) {
  const config = readConfig();
  config.guilds[guildId] = {
    ...(config.guilds[guildId] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeConfig(config);
  return config.guilds[guildId];
}

function envStaffRoleIds() {
  return String(process.env.DRAGONSHOSTING_STAFF_ROLE_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean).map(String))];
}

function getStaffRoleIds(guild, extraRoleId = null) {
  const stored = getGuildConfig(guild.id).staffRoleIds || [];
  return uniqueIds([extraRoleId, ...stored, ...envStaffRoleIds()])
    .filter(roleId => guild.roles.cache.has(roleId));
}

function hasModPermission(member) {
  if (!member) return false;
  const guildConfig = getGuildConfig(member.guild.id);
  const allowedRoles = uniqueIds([...(guildConfig.staffRoleIds || []), ...envStaffRoleIds()]);

  return member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
    member.permissions?.has?.(PermissionFlagsBits.ModerateMembers) ||
    member.permissions?.has?.(PermissionFlagsBits.KickMembers) ||
    member.permissions?.has?.(PermissionFlagsBits.BanMembers) ||
    allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

function buildChannelOverwrites(guild, staffRoleIds) {
  return [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...staffRoleIds.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];
}

function findCategory(guild, name) {
  const wanted = name.toLowerCase();
  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory &&
    String(channel.name || '').toLowerCase() === wanted
  ) || null;
}

function findTextChannel(guild, names) {
  const wanted = new Set(names.map(name => name.toLowerCase()));
  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    wanted.has(String(channel.name || '').toLowerCase())
  ) || null;
}

async function ensureCategory(guild, name, overwrites) {
  const existing = findCategory(guild, name);
  if (existing) {
    await existing.permissionOverwrites.set(overwrites, 'ModPanel setup').catch(() => null);
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: 'ModPanel setup',
  });
}

async function prepareTextChannel(channel, category, topic, overwrites) {
  if (channel.parentId !== category.id) {
    await channel.setParent(category.id, { reason: 'ModPanel setup' }).catch(() => null);
  }
  await channel.setTopic(topic).catch(() => null);
  await channel.permissionOverwrites.set(overwrites, 'ModPanel setup').catch(() => null);
  return channel;
}

async function ensureTextChannel(guild, category, name, aliases, topic, overwrites) {
  const existing = findTextChannel(guild, [name, ...aliases]);
  if (existing) return prepareTextChannel(existing, category, topic, overwrites);

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: overwrites,
    reason: 'ModPanel setup',
  });
}

function buildModPanelPayload(guildConfig = {}) {
  const embed = new EmbedBuilder()
    .setTitle('🛠 DragonsHosting ModPanel')
    .setDescription([
      'Gebruik deze knoppen voor snelle staff-acties.',
      '',
      'Vul altijd een User ID of mention in. De bot moet hoger staan dan de target role in de Discord role hierarchy.',
      guildConfig.logChannelId ? `\nLogs: <#${guildConfig.logChannelId}>` : '',
    ].filter(Boolean).join('\n'))
    .setColor(0xed4245)
    .setFooter({ text: 'DragonsHosting | Moderatie' })
    .setTimestamp();

  const rowOne = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('persistent_mod_userinfo').setLabel('User Info').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('persistent_mod_warn').setLabel('Warn').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('persistent_mod_timeout').setLabel('Timeout').setStyle(ButtonStyle.Primary),
  );

  const rowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('persistent_mod_kick').setLabel('Kick').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_ban').setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_softban').setLabel('Softban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_unban').setLabel('Unban').setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [rowOne, rowTwo] };
}

function hasModPanelButton(message) {
  return message.components?.some(row => row.components?.some(component => {
    const id = component.customId || component.data?.custom_id;
    return typeof id === 'string' && BUTTON_PREFIXES.some(prefix => id.startsWith(prefix));
  }));
}

async function sendOrUpdatePanel(channel, payload) {
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = recent?.find(message => message.author?.id === channel.client.user.id && hasModPanelButton(message));

  if (existing) {
    await existing.edit(payload);
    return existing;
  }

  return channel.send(payload);
}

async function setupModPanel(interaction, options = {}) {
  const guild = interaction.guild;
  const staffRoleId = options.staffRole?.id || null;
  const staffRoleIds = getStaffRoleIds(guild, staffRoleId);
  const overwrites = buildChannelOverwrites(guild, staffRoleIds);

  const category = await ensureCategory(guild, '🛠 Staff Tools', overwrites);
  const panelChannel = options.panelChannel
    ? await prepareTextChannel(options.panelChannel, category, 'DragonsHosting ModPanel controls', overwrites)
    : await ensureTextChannel(
      guild,
      category,
      '🧰・mod-panel',
      ['mod-panel', 'modpanel'],
      'DragonsHosting ModPanel controls',
      overwrites
    );
  const logChannel = options.logChannel
    ? await prepareTextChannel(options.logChannel, category, 'DragonsHosting moderation action logs', overwrites)
    : await ensureTextChannel(
      guild,
      category,
      '📜・mod-logs',
      ['mod-logs', 'moderation-logs'],
      'DragonsHosting moderation action logs',
      overwrites
    );

  const guildConfig = setGuildConfig(guild.id, {
    categoryId: category.id,
    panelChannelId: panelChannel.id,
    logChannelId: logChannel.id,
    staffRoleIds,
  });

  await sendOrUpdatePanel(panelChannel, buildModPanelPayload(guildConfig));

  return { category, panelChannel, logChannel, staffRoleIds };
}

function actionFromCustomId(customId, prefixes) {
  for (const prefix of prefixes) {
    if (!String(customId || '').startsWith(prefix)) continue;
    const action = String(customId).slice(prefix.length);
    return ACTIONS.has(action) ? action : null;
  }
  return null;
}

function parseUserId(value) {
  return String(value || '').replace(/[<@!>]/g, '').trim();
}

function makeModal(action) {
  const modal = new ModalBuilder()
    .setCustomId(`persistent_mod_modal_${action}`)
    .setTitle(`Moderation: ${action}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('target')
        .setLabel(action === 'unban' ? 'User ID' : 'User ID of mention')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  if (action !== 'userinfo') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
    );
  }

  if (action === 'timeout') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('Timeout minutes')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('60')
      )
    );
  }

  return modal;
}

async function reply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }
  return interaction.reply(payload);
}

async function logModAction(guild, details) {
  const guildConfig = getGuildConfig(guild.id);
  const logChannelId = guildConfig.logChannelId;
  if (!logChannelId) return;

  const channel = guild.channels.cache.get(logChannelId) ||
    await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setTitle(details.title || 'ModPanel Action')
    .setColor(details.color || 0x5865f2)
    .addFields(
      { name: 'Moderator', value: details.moderator || 'Unknown', inline: false },
      { name: 'Target', value: details.target || 'Unknown', inline: true },
      { name: 'Action', value: details.action || 'Unknown', inline: true },
      { name: 'Reason', value: details.reason || 'No reason provided', inline: false }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function handleModal(interaction) {
  const action = actionFromCustomId(interaction.customId, MODAL_PREFIXES);
  if (!action) return false;

  if (!hasModPermission(interaction.member)) {
    await reply(interaction, 'Je hebt geen moderatie permissies.');
    return true;
  }

  const targetId = parseUserId(interaction.fields.getTextInputValue('target'));
  const reason = interaction.fields.fields.has('reason')
    ? interaction.fields.getTextInputValue('reason') || 'No reason provided'
    : 'No reason provided';

  if (!targetId) {
    await reply(interaction, 'Geen geldige User ID opgegeven.');
    return true;
  }

  if (action === 'userinfo') {
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    const user = member?.user || await interaction.client.users.fetch(targetId).catch(() => null);
    if (!user) {
      await reply(interaction, 'Gebruiker niet gevonden.');
      return true;
    }

    const embed = new EmbedBuilder()
      .setTitle('User Info')
      .setColor(0x3498db)
      .addFields(
        { name: 'User', value: `${user.tag || user.username} (${user.id})`, inline: false },
        { name: 'Joined', value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Not in guild', inline: true },
        { name: 'Created', value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true }
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    await logModAction(interaction.guild, {
      moderator: `${interaction.user.tag} (${interaction.user.id})`,
      target: `${user.tag || user.username} (${user.id})`,
      action: 'userinfo',
      reason: 'Lookup',
    });
    return true;
  }

  if (action === 'unban') {
    await interaction.guild.bans.remove(targetId, reason);
    await reply(interaction, `Unbanned <@${targetId}>.`);
    await logModAction(interaction.guild, {
      moderator: `${interaction.user.tag} (${interaction.user.id})`,
      target: targetId,
      action,
      reason,
    });
    return true;
  }

  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) {
    await reply(interaction, 'Gebruiker zit niet in deze server of kon niet worden opgehaald.');
    return true;
  }

  if (action === 'kick') {
    await member.kick(reason);
    await reply(interaction, `Kicked ${member.user.tag}.`);
  } else if (action === 'ban') {
    await member.ban({ reason, deleteMessageSeconds: 0 });
    await reply(interaction, `Banned ${member.user.tag}.`);
  } else if (action === 'softban') {
    await member.ban({ reason: `Softban: ${reason}`, deleteMessageSeconds: 86400 });
    await interaction.guild.bans.remove(member.id, 'Softban unban');
    await reply(interaction, `Softbanned ${member.user.tag}.`);
  } else if (action === 'timeout') {
    const rawMinutes = interaction.fields.getTextInputValue('minutes') || '60';
    const minutes = Math.max(1, Math.min(10080, Number.parseInt(rawMinutes, 10) || 60));
    await member.timeout(minutes * 60 * 1000, reason);
    await reply(interaction, `Timed out ${member.user.tag} for ${minutes} minutes.`);
  } else if (action === 'warn') {
    await member.send(`Je hebt een waarschuwing ontvangen in ${interaction.guild.name}: ${reason}`).catch(() => null);
    await reply(interaction, `Warned ${member.user.tag}.`);
  }

  await logModAction(interaction.guild, {
    moderator: `${interaction.user.tag} (${interaction.user.id})`,
    target: `${member.user.tag} (${member.id})`,
    action,
    reason,
  });
  return true;
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      const action = actionFromCustomId(interaction.customId, BUTTON_PREFIXES);
      if (!action) return false;
      if (!hasModPermission(interaction.member)) {
        await reply(interaction, 'Je hebt geen moderatie permissies.');
        return true;
      }
      await interaction.showModal(makeModal(action));
      return true;
    }

    if (interaction.isModalSubmit()) {
      return handleModal(interaction);
    }
  } catch (error) {
    console.error('[ModPanel] Interaction failed:', {
      customId: interaction?.customId,
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    });
    await reply(interaction, 'ModPanel actie is mislukt. Controleer bot permissies en role hierarchy.').catch(() => null);
    return true;
  }

  return false;
}

module.exports = {
  buildModPanelPayload,
  getGuildConfig,
  handleInteraction,
  setupModPanel,
};
