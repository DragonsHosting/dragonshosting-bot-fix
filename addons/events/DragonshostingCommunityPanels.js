const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const GUILD_ID = '0';
const STAFF_ROLE_IDS = new Set([
  '0', // All Perms
  '0', // CEO
  '0', // Eigenaar Perms
  '0', // Admin Perms
  '0', // Admin
  '0', // Staff Manager
  '0', // Teamleider Perms
  '0', // Staff-team
]);

const STAFF_MELDINGEN_CHANNEL_ID = '0';

const ROLE_BUTTONS = {
  dhost_rr_giveaway: { roleId: '0', label: 'Giveaway Ping' },
  dhost_rr_info: { roleId: '0', label: 'Informatie Ping' },
  dhost_rr_apply: { roleId: '0', label: 'Sollicitatie Ping' },
  dhost_rr_qa: { roleId: '0', label: 'Q&A Ping' },
  dhost_rr_event: { roleId: '0', label: 'Event Ping' },
  dhost_rr_update: { roleId: '0', label: 'Update Ping' },
  dhost_rr_sneakpeek: { roleId: '0', label: 'SneakPeek Ping' },
};

function isStaffMember(member) {
  if (!member) return false;
  if (member.permissions?.has('Administrator')) return true;
  return member.roles?.cache?.some(role => STAFF_ROLE_IDS.has(role.id));
}

async function handleRoleButton(interaction) {
  const config = ROLE_BUTTONS[interaction.customId];
  if (!config) return false;

  const role = interaction.guild.roles.cache.get(config.roleId);
  if (!role) {
    await interaction.reply({
      content: `Deze rol bestaat niet meer. Meld dit bij staff: ${config.label}.`,
      ephemeral: true,
    });
    return true;
  }

  const hasRole = interaction.member.roles.cache.has(config.roleId);
  if (hasRole) {
    await interaction.member.roles.remove(role, 'Dragonshosting reaction role toggle');
    await interaction.reply({ content: `Rol verwijderd: ${role.name}`, ephemeral: true });
  } else {
    await interaction.member.roles.add(role, 'Dragonshosting reaction role toggle');
    await interaction.reply({ content: `Rol toegevoegd: ${role.name}`, ephemeral: true });
  }
  return true;
}

function buildAbsenceModal(kind) {
  const isBack = kind === 'back';
  const isShort = kind === 'short';
  const modal = new ModalBuilder()
    .setCustomId(`dhost_attendance_${kind}`)
    .setTitle(isBack ? 'Aanmelden / terug' : isShort ? 'Korte afwezigheid' : 'Afmelden');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('period')
        .setLabel(isBack ? 'Sinds wanneer ben je terug?' : 'Periode / tijd')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(isBack ? 'Bijv. vandaag 19:00' : 'Bijv. 25-07 t/m 28-07 of 19:00-21:00')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel(isBack ? 'Opmerking' : 'Reden')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(!isBack)
        .setPlaceholder(isBack ? 'Optioneel: korte toelichting.' : 'Beschrijf kort waarom je afwezig bent.')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('handover')
        .setLabel('Overdracht / open taken')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Welke tickets, taken of afspraken moeten staff weten?')
    )
  );

  return modal;
}

async function handleAttendanceButton(interaction) {
  if (!['dhost_absence_report', 'dhost_presence_back', 'dhost_absence_short'].includes(interaction.customId)) return false;

  if (!isStaffMember(interaction.member)) {
    await interaction.reply({ content: 'Dit paneel is alleen voor staff.', ephemeral: true });
    return true;
  }

  if (interaction.customId === 'dhost_presence_back') return interaction.showModal(buildAbsenceModal('back'));
  if (interaction.customId === 'dhost_absence_short') return interaction.showModal(buildAbsenceModal('short'));
  return interaction.showModal(buildAbsenceModal('absent'));
}

async function handleAttendanceSubmit(interaction) {
  if (!interaction.customId?.startsWith('dhost_attendance_')) return false;

  if (!isStaffMember(interaction.member)) {
    await interaction.reply({ content: 'Dit formulier is alleen voor staff.', ephemeral: true });
    return true;
  }

  const kind = interaction.customId.replace('dhost_attendance_', '');
  const period = interaction.fields.getTextInputValue('period');
  const reason = interaction.fields.getTextInputValue('reason') || 'Geen opmerking opgegeven.';
  const handover = interaction.fields.getTextInputValue('handover') || 'Geen overdracht opgegeven.';

  const titles = {
    absent: '📕 Staff afmelding',
    short: '🟠 Korte afwezigheid',
    back: '📗 Staff terugmelding',
  };

  const colors = {
    absent: 0xed4245,
    short: 0xfee75c,
    back: 0x57f287,
  };

  const embed = new EmbedBuilder()
    .setTitle(titles[kind] || 'Staff melding')
    .setColor(colors[kind] || 0x00b7ff)
    .addFields(
      { name: 'Stafflid', value: `${interaction.user} (${interaction.user.id})`, inline: false },
      { name: kind === 'back' ? 'Terug sinds' : 'Periode / tijd', value: period, inline: false },
      { name: kind === 'back' ? 'Opmerking' : 'Reden', value: reason, inline: false },
      { name: 'Overdracht / open taken', value: handover, inline: false },
    )
    .setFooter({ text: 'Dragonshosting • Aan-/afmeld panel' })
    .setTimestamp();

  const target = interaction.guild.channels.cache.get(STAFF_MELDINGEN_CHANNEL_ID);
  if (target?.isTextBased()) {
    await target.send({ embeds: [embed] });
    await interaction.reply({ content: `Je melding is geplaatst in ${target}.`, ephemeral: true });
  } else {
    await interaction.reply({ content: 'Staff-meldingen kanaal kon niet gevonden worden.', ephemeral: true });
  }

  return true;
}

module.exports = {
  name: 'DragonshostingCommunityPanels',
  version: '1.0.0',
  description: 'Dragonshosting reaction role buttons and staff attendance forms.',

  run: async (client) => {
    if (process.env.DRAGONSHOSTING_VERBOSE_STARTUP === 'true') {
      console.log(`[DragonshostingCommunityPanels] Loaded as ${client.user.tag}`);
    }
  },

  events: {
    'discord:interactionCreate': async ({ interaction }) => {
      if (!interaction?.guild || interaction.guild.id !== GUILD_ID) return;

      if (interaction.isButton()) {
        if (await handleRoleButton(interaction)) return;
        if (await handleAttendanceButton(interaction)) return;
      }

      if (interaction.isModalSubmit()) {
        if (await handleAttendanceSubmit(interaction)) return;
      }
    },
  },
};
