const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const ACTIONS = new Set(['kick', 'ban', 'timeout', 'warn', 'softban', 'unban', 'userinfo']);
const BUTTON_PREFIXES = ['persistent_mod_', 'modpanel_', 'mod_'];
const MODAL_PREFIXES = ['persistent_mod_modal_', 'modpanel_modal_', 'mod_modal_'];
const MOD_PANEL_CHANNEL_ID = '0';
let panelEnsured = false;

function hasModPermission(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ModerateMembers) ||
    member?.permissions?.has(PermissionFlagsBits.KickMembers) ||
    member?.permissions?.has(PermissionFlagsBits.BanMembers);
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

function buildModPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle('Dragonshosting Mod Menu')
    .setDescription([
      'Gebruik deze knoppen voor snelle staff-acties.',
      '',
      'Vul altijd een User ID of mention in. Acties worden alleen uitgevoerd als je voldoende moderatiepermissies hebt.',
    ].join('\n'))
    .setColor(0x1769ff)
    .setFooter({ text: 'Dragonshosting | Moderatie' });

  const rowOne = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('persistent_mod_userinfo').setLabel('User Info').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('persistent_mod_warn').setLabel('Warn').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('persistent_mod_timeout').setLabel('Timeout').setStyle(ButtonStyle.Secondary),
  );

  const rowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('persistent_mod_kick').setLabel('Kick').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_ban').setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_softban').setLabel('Softban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_unban').setLabel('Unban').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [rowOne, rowTwo] };
}

function hasModPanelButton(message) {
  return message.components?.some(row => row.components?.some(component => {
    const id = component.customId || component.data?.custom_id;
    return typeof id === 'string' && id.startsWith('persistent_mod_');
  }));
}

async function ensureModPanel(client) {
  if (panelEnsured) return;
  panelEnsured = true;

  const channel = await client.channels.fetch(MOD_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    return;
  }

  const payload = buildModPanelPayload();
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const existing = recent?.find(message => message.author?.id === client.user.id && hasModPanelButton(message));

  if (existing) {
    await existing.edit(payload).catch(error => console.error('[ModPanel] Could not edit panel:', error.message));
  } else {
    await channel.send(payload).catch(error => console.error('[ModPanel] Could not send panel:', error.message));
  }
}

function parseUserId(value) {
  return String(value || '').replace(/[<@!>]/g, '').trim();
}

function actionFromCustomId(customId, prefixes) {
  for (const prefix of prefixes) {
    if (!String(customId || '').startsWith(prefix)) continue;
    const action = String(customId).slice(prefix.length);
    return ACTIONS.has(action) ? action : null;
  }
  return null;
}

async function reply(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleModal(interaction) {
  const action = actionFromCustomId(interaction.customId, MODAL_PREFIXES);
  if (!ACTIONS.has(action)) return;

  if (!hasModPermission(interaction.member)) {
    return reply(interaction, 'Je hebt geen moderatie permissies.');
  }

  const targetId = parseUserId(interaction.fields.getTextInputValue('target'));
  const reason = interaction.fields.fields.has('reason')
    ? interaction.fields.getTextInputValue('reason') || 'No reason provided'
    : 'No reason provided';

  if (!targetId) return reply(interaction, 'Geen geldige User ID opgegeven.');

  if (action === 'userinfo') {
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    const user = member?.user || await interaction.client.users.fetch(targetId).catch(() => null);
    if (!user) return reply(interaction, 'Gebruiker niet gevonden.');

    const embed = new EmbedBuilder()
      .setTitle('User Info')
      .setColor(0x3498db)
      .addFields(
        { name: 'User', value: `${user.tag || user.username} (${user.id})`, inline: false },
        { name: 'Joined', value: member?.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Not in guild', inline: true },
        { name: 'Created', value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true }
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (action === 'unban') {
    await interaction.guild.bans.remove(targetId, reason);
    return reply(interaction, `Unbanned <@${targetId}>.`);
  }

  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) return reply(interaction, 'Gebruiker zit niet in deze server of kon niet worden opgehaald.');

  if (action === 'kick') {
    await member.kick(reason);
    return reply(interaction, `Kicked ${member.user.tag}.`);
  }

  if (action === 'ban') {
    await member.ban({ reason, deleteMessageSeconds: 0 });
    return reply(interaction, `Banned ${member.user.tag}.`);
  }

  if (action === 'softban') {
    await member.ban({ reason: `Softban: ${reason}`, deleteMessageSeconds: 86400 });
    await interaction.guild.bans.remove(member.id, 'Softban unban');
    return reply(interaction, `Softbanned ${member.user.tag}.`);
  }

  if (action === 'timeout') {
    const rawMinutes = interaction.fields.getTextInputValue('minutes') || '60';
    const minutes = Math.max(1, Math.min(10080, Number.parseInt(rawMinutes, 10) || 60));
    await member.timeout(minutes * 60 * 1000, reason);
    return reply(interaction, `Timed out ${member.user.tag} for ${minutes} minutes.`);
  }

  if (action === 'warn') {
    await member.send(`Je hebt een waarschuwing ontvangen in ${interaction.guild.name}: ${reason}`).catch(() => null);
    return reply(interaction, `Warned ${member.user.tag}.`);
  }
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      const action = actionFromCustomId(interaction.customId, BUTTON_PREFIXES);
      if (!action) return;
      if (!hasModPermission(interaction.member)) {
        return reply(interaction, 'Je hebt geen moderatie permissies.');
      }
      return interaction.showModal(makeModal(action));
    }

    if (interaction.isModalSubmit()) {
      const action = actionFromCustomId(interaction.customId, MODAL_PREFIXES);
      if (!action) return;
      return handleModal(interaction);
    }
  } catch (error) {
    console.error('[ModPanel] Interaction failed:', {
      customId: interaction?.customId,
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    });
    return reply(interaction, 'ModPanel actie is mislukt. Controleer bot permissies en role hierarchy.').catch(() => null);
  }
}

module.exports = {
  name: 'ModPanel',
  version: '1.0.0',
  description: 'Persistent moderation panel button handlers.',
  handleInteraction,

  async run(client) {
    setTimeout(() => ensureModPanel(client).catch(error => {
      console.error('[ModPanel] Panel setup failed:', error.message);
    }), 5000);
    if (process.env.DRAGONSHOSTING_VERBOSE_STARTUP === 'true') {
        console.log('[ModPanel] Addon loaded');
    }
  },

  events: {
    'discord:ready': async ({ client }) => ensureModPanel(client),
    'discord:interactionCreate': async ({ interaction }) => handleInteraction(interaction),
  },
};

