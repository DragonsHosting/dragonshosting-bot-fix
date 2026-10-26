const {
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BRAND = {
  name: 'Dragonshosting',
  systemName: 'Dragonshosting Ticket Systeem',
  color: 0x00b7ff,
  dark: 0x2b2d31,
  danger: 0xed4245,
  success: 0x57f287,
  warning: 0xfee75c,
  guildId: '0',
  guildName: 'DragonsHosting Support',
};

const PANEL_CHANNEL_ID = '0';
const APPLICATION_PANEL_CHANNEL_ID = '0';
const LOG_CHANNEL_ID = '0';
const TRANSCRIPT_CHANNEL_ID = '0';

const GENERAL_SUPPORT_ROLES = ['0', '0', '0'];
const PAYMENT_SUPPORT_ROLES = ['0', '0', '0', '0'];
const BUG_SUPPORT_ROLES = ['0', '0', '0'];
const REPORT_SUPPORT_ROLES = ['0', '0', '0', '0'];
const APPLICATION_SUPPORT_ROLES = [
  '0',
  '0',
  '0',
  '0',
  '0',
  '0',
  '0',
  '0',
];

const ALL_STAFF_ROLE_IDS = Array.from(new Set([
  ...GENERAL_SUPPORT_ROLES,
  ...PAYMENT_SUPPORT_ROLES,
  ...BUG_SUPPORT_ROLES,
  ...REPORT_SUPPORT_ROLES,
  ...APPLICATION_SUPPORT_ROLES,
]));

function buildApplicationTemplate(roleName) {
  return [
    `Sollicitatie: ${roleName}`,
    '',
    'Kopieer deze template, vul hem volledig in en stuur hem daarna in dit ticket.',
    '',
    '1. Wat is je Discord naam en user ID?',
    '- Antwoord:',
    '',
    '2. Hoe oud ben je?',
    '- Antwoord:',
    '',
    '3. Voor welke functie solliciteer je?',
    `- Antwoord: ${roleName}`,
    '',
    '4. Waarom wil je deze functie bij Dragonshosting?',
    '- Antwoord:',
    '',
    '5. Welke ervaring heb je die past bij deze functie?',
    '- Antwoord:',
    '',
    '6. Wat zijn je sterkste punten?',
    '- Antwoord:',
    '',
    '7. Wat zijn je verbeterpunten?',
    '- Antwoord:',
    '',
    '8. Hoeveel tijd kun je gemiddeld per week besteden?',
    '- Antwoord:',
    '',
    '9. Op welke dagen/tijden ben je meestal beschikbaar?',
    '- Antwoord:',
    '',
    '10. Hoe ga je om met boze of ongeduldige leden/klanten?',
    '- Antwoord:',
    '',
    '11. Hoe ga je om met kritiek of feedback van staff?',
    '- Antwoord:',
    '',
    '12. Ben je eerder staff geweest? Zo ja, waar en wat waren je taken?',
    '- Antwoord:',
    '',
    '13. Heb je ervaring bij andere Discord servers, hostingprojecten of communities?',
    '- Antwoord:',
    '',
    '14. Waarom moeten wij jou kiezen boven een andere kandidaat?',
    '- Antwoord:',
    '',
    '15. Heb je voorbeelden van werk, projecten, posts, media of code die relevant zijn?',
    '- Antwoord:',
    '',
    '16. Is er nog iets dat staff moet weten voordat we je beoordelen?',
    '- Antwoord:',
  ].join('\n');
}

const TICKET_TYPES = {
  general: {
    buttonId: 'dticket_general',
    modalId: 'dticket_modal_general',
    label: 'Algemene Support',
    shortLabel: 'Support',
    categoryId: '0',
    supportRoles: GENERAL_SUPPORT_ROLES,
    question: 'Waar kunnen we je mee helpen?',
    placeholder: 'Beschrijf je vraag zo duidelijk mogelijk.',
  },
  payment: {
    buttonId: 'dticket_payment',
    modalId: 'dticket_modal_payment',
    label: 'Betaling / Credits',
    shortLabel: 'Betaling',
    categoryId: '0',
    supportRoles: PAYMENT_SUPPORT_ROLES,
    question: 'Waar gaat je betaling/credits vraag over?',
    placeholder: 'Vermeld ordernummer, betaalmethode, bedrag, datum en je accountnaam.',
  },
  bug: {
    buttonId: 'dticket_bug',
    modalId: 'dticket_modal_bug',
    label: 'Bug Report',
    shortLabel: 'Bug',
    categoryId: '0',
    supportRoles: BUG_SUPPORT_ROLES,
    question: 'Welke bug wil je melden?',
    placeholder: 'Beschrijf wat er fout gaat, waar het gebeurt en voeg bewijs/logs toe als je die hebt.',
  },
  report: {
    buttonId: 'dticket_report',
    modalId: 'dticket_modal_report',
    label: 'Player Report',
    shortLabel: 'Report',
    categoryId: '0',
    supportRoles: REPORT_SUPPORT_ROLES,
    question: 'Wie wil je reporten en waarom?',
    placeholder: 'Noem username, reden, datum/tijd en bewijs als je dat hebt.',
  },
  applyModerator: {
    buttonId: 'dticket_apply_moderator',
    label: 'Moderator Sollicitatie',
    shortLabel: 'Moderator',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Moderator'),
  },
  applyMarketing: {
    buttonId: 'dticket_apply_marketing',
    label: 'Marketing Sollicitatie',
    shortLabel: 'Marketing',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Marketing'),
  },
  applyDeveloper: {
    buttonId: 'dticket_apply_developer',
    label: 'Developer Sollicitatie',
    shortLabel: 'Developer',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Developer'),
  },
  applyMedia: {
    buttonId: 'dticket_apply_media',
    label: 'Media Sollicitatie',
    shortLabel: 'Media',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Media'),
  },
  applyManager: {
    buttonId: 'dticket_apply_manager',
    label: 'Manager Sollicitatie',
    shortLabel: 'Manager',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Manager'),
  },
  applyHelper: {
    buttonId: 'dticket_apply_helper',
    label: 'Helper Sollicitatie',
    shortLabel: 'Helper',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Helper'),
  },
  applyBugfix: {
    buttonId: 'dticket_apply_bugfix',
    label: 'Bug-fix Sollicitatie',
    shortLabel: 'Bug-fix',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Bug-fix'),
  },
  applyTicketSupport: {
    buttonId: 'dticket_apply_ticketsupport',
    label: 'Ticket Support Sollicitatie',
    shortLabel: 'Ticket Support',
    categoryId: '0',
    supportRoles: APPLICATION_SUPPORT_ROLES,
    question: 'Sollicitatie-template',
    noModal: true,
    defaultDescription: buildApplicationTemplate('Ticket Support'),
  },
};

const DATA_DIR = path.join(process.cwd(), 'data');
const TRANSCRIPTS_DIR = path.join(process.cwd(), 'transcripts', 'dragonshosting');
const DATA_FILE = path.join(DATA_DIR, 'dragonshosting-tickets.json');
const RUNTIME_FILE = path.join(DATA_DIR, 'dragonshosting-ticket-runtime.json');
const ERROR_FILE = path.join(DATA_DIR, 'dragonshosting-ticket-errors.json');
const UPLOAD_CONFIG_FILE = path.join(process.cwd(), 'config', 'dragonshosting-transcript-upload.json');
const DASHBOARD_SOURCE_FILE = path.join(process.cwd(), 'transcript-site-dashboard', 'index.html');
const SERVER_PORT = Number(process.env.TRANSCRIPT_PORT || process.env.SERVER_PORT || process.env.PORT || 7000);
const LOCAL_TRANSCRIPT_BASE_URL = (process.env.TRANSCRIPT_BASE_URL || `http://node.dragonshosting.nl:${SERVER_PORT}`).replace(/\/+$/, '');
const TRANSCRIPT_UPLOAD_CONFIG = loadTranscriptUploadConfig();
const PUBLIC_BASE_URL = (TRANSCRIPT_UPLOAD_CONFIG?.publicBaseUrl || LOCAL_TRANSCRIPT_BASE_URL).replace(/\/+$/, '');

let transcriptServer = null;
let startedPanelEnsure = false;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
}

function loadState() {
  ensureDirs();
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { openTickets: {}, panelMessages: {}, transcripts: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
    return {
      openTickets: parsed.openTickets || {},
      panelMessages: parsed.panelMessages || {},
      transcripts: parsed.transcripts || {},
    };
  } catch (error) {
    console.warn('[DragonshostingTickets] State file is invalid, using clean state:', error.message);
    return { openTickets: {}, panelMessages: {}, transcripts: {} };
  }
}

function saveState(state) {
  ensureDirs();
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tempFile, DATA_FILE);
}

function recordTicketError(error, context = {}) {
  ensureDirs();
  const entry = {
    at: new Date().toISOString(),
    context,
    message: error?.message || String(error),
    code: error?.code || null,
    status: error?.status || error?.rawError?.status || null,
    method: error?.method || null,
    url: error?.url || null,
    discordCode: error?.rawError?.code || null,
    discordMessage: error?.rawError?.message || null,
  };

  try {
    const current = fs.existsSync(ERROR_FILE)
      ? JSON.parse(fs.readFileSync(ERROR_FILE, 'utf8') || '[]')
      : [];
    const next = Array.isArray(current) ? current.slice(-24) : [];
    next.push(entry);
    fs.writeFileSync(ERROR_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    try { fs.writeFileSync(ERROR_FILE, JSON.stringify([entry], null, 2), 'utf8'); } catch {}
  }
}

function writeRuntimeStatus(status) {
  ensureDirs();
  const payload = {
    service: 'DragonshostingTickets',
    publicBaseUrl: PUBLIC_BASE_URL,
    localTranscriptBaseUrl: LOCAL_TRANSCRIPT_BASE_URL,
    configuredPort: SERVER_PORT,
    webUpload: TRANSCRIPT_UPLOAD_CONFIG ? {
      enabled: true,
      directAdminUrl: TRANSCRIPT_UPLOAD_CONFIG.directAdminUrl,
      destinationDir: TRANSCRIPT_UPLOAD_CONFIG.destinationDir,
      publicBaseUrl: TRANSCRIPT_UPLOAD_CONFIG.publicBaseUrl,
      usernameConfigured: Boolean(TRANSCRIPT_UPLOAD_CONFIG.username),
      loginKeyConfigured: Boolean(TRANSCRIPT_UPLOAD_CONFIG.loginKey),
    } : {
      enabled: false,
    },
    env: {
      TRANSCRIPT_PORT: process.env.TRANSCRIPT_PORT || null,
      SERVER_PORT: process.env.SERVER_PORT || null,
      PORT: process.env.PORT || null,
      TRANSCRIPT_BASE_URL: process.env.TRANSCRIPT_BASE_URL || null,
    },
    updatedAt: new Date().toISOString(),
    ...status,
  };
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return false;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function loadJsonFile(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch (error) {
    console.warn('[DragonshostingTickets] Transcript upload config is invalid:', error.message);
    return {};
  }
}

function loadTranscriptUploadConfig() {
  const fileConfig = loadJsonFile(UPLOAD_CONFIG_FILE);
  const enabled = asBoolean(fileConfig.enabled ?? process.env.TRANSCRIPT_UPLOAD_ENABLED);
  const directAdminUrl = String(fileConfig.directAdminUrl || process.env.DA_URL || '').replace(/\/+$/, '');
  const username = String(fileConfig.username || process.env.DA_USERNAME || '');
  const loginKey = String(fileConfig.loginKey || process.env.DA_LOGIN_KEY || '');
  const destinationDir = String(fileConfig.destinationDir || process.env.DA_TRANSCRIPT_PATH || '');
  const publicBaseUrl = String(fileConfig.publicBaseUrl || process.env.PUBLIC_TRANSCRIPT_BASE_URL || '').replace(/\/+$/, '');

  if (!enabled) return null;
  const missing = [
    ['directAdminUrl', directAdminUrl],
    ['username', username],
    ['loginKey', loginKey],
    ['destinationDir', destinationDir],
    ['publicBaseUrl', publicBaseUrl],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    console.warn(`[DragonshostingTickets] Transcript upload disabled, missing: ${missing.join(', ')}`);
    return null;
  }

  return {
    directAdminUrl,
    username,
    loginKey,
    destinationDir,
    publicBaseUrl,
  };
}

function safeUsername(username, fallbackId) {
  const cleaned = String(username || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || `user-${String(fallbackId || '0000').slice(-6)}`;
}

function getTicketTypeByButtonId(customId) {
  return Object.values(TICKET_TYPES).find(type => type.buttonId === customId) || null;
}

function getTicketTypeByModalId(customId) {
  return Object.values(TICKET_TYPES).find(type => type.modalId === customId) || null;
}

function isDragonshostingTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  return channel.name?.startsWith('ticket-') && Object.values(TICKET_TYPES).some(type => type.categoryId === channel.parentId);
}

function getBotAvatarUrl(guildOrClient) {
  const client = guildOrClient?.client || guildOrClient || global.client;
  return client?.user?.displayAvatarURL?.({ size: 256, extension: 'png' }) || undefined;
}

function recoverOpenTicketFromChannel(state, channel, user = null) {
  if (!isDragonshostingTicketChannel(channel)) return null;
  if (state.openTickets[channel.id]) return state.openTickets[channel.id];

  const typeKey = Object.keys(TICKET_TYPES).find(key => TICKET_TYPES[key].categoryId === channel.parentId) || 'general';
  const ticketType = TICKET_TYPES[typeKey];
  const recovered = {
    channelId: channel.id,
    channelName: channel.name,
    userId: user?.id || null,
    username: channel.name?.replace(/^ticket-\d+-[^-]+-?/, '').replace(/^ticket-/, '') || user?.username || 'Unknown',
    type: ticketType?.label || 'Support',
    typeKey,
    status: 'open',
    claimedBy: null,
    createdAt: channel.createdAt?.toISOString?.() || new Date().toISOString(),
    recovered: true,
  };
  state.openTickets[channel.id] = recovered;
  saveState(state);
  return recovered;
}

function existingRoleIds(guild, roleIds) {
  return (roleIds || []).filter(roleId => guild.roles.cache.has(roleId));
}

function hasTicketStaffRole(member, ticketType = null) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const roles = ticketType?.supportRoles?.length ? ticketType.supportRoles : ALL_STAFF_ROLE_IDS;
  return member.roles.cache.some(role => roles.includes(role.id));
}

async function replyEphemeral(interaction, contentOrOptions) {
  const payload = typeof contentOrOptions === 'string'
    ? { content: contentOrOptions, flags: MessageFlags.Ephemeral }
    : { ...contentOrOptions, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => null);
  }
  return interaction.reply(payload).catch(() => null);
}

function buildPanelOne() {
  const botAvatar = getBotAvatarUrl(global.client);
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${BRAND.name} - Tickets Systeem`, iconURL: botAvatar })
    .setTitle('Dragonshosting Tickets')
    .setDescription([
      'Open hieronder een ticket voor hulp van het Dragonshosting team.',
      '',
      'Kies de categorie die het beste past. Geef direct duidelijke informatie, zodat staff je sneller kan helpen.',
      '',
      '**Betaling / Credits:** vermeld altijd je ordernummer, betaalmethode, bedrag, datum en accountnaam. Credits worden pas toegevoegd nadat betaling echt is gecontroleerd.',
    ].join('\n'))
    .setColor(BRAND.color)
    .setThumbnail(botAvatar)
    .setFooter({ text: `${BRAND.name} | Ticket Systeem` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_TYPES.general.buttonId).setLabel(TICKET_TYPES.general.label).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.payment.buttonId).setLabel(TICKET_TYPES.payment.label).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(TICKET_TYPES.bug.buttonId).setLabel(TICKET_TYPES.bug.label).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.report.buttonId).setLabel(TICKET_TYPES.report.label).setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

function buildPanelTwo() {
  const botAvatar = getBotAvatarUrl(global.client);
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${BRAND.name} - Sollicitaties`, iconURL: botAvatar })
    .setTitle('Dragonshosting Sollicitaties')
    .setDescription([
      'Wil je solliciteren voor het Dragonshosting staffteam?',
      '',
      'Kies hieronder de functie waarvoor je wilt solliciteren.',
      'De bot maakt direct een ticket aan en zet automatisch de volledige sollicitatie-template in het ticket.',
      '',
      'Vul de template volledig en serieus in. Onvolledige sollicitaties kunnen worden afgewezen.',
    ].join('\n'))
    .setColor(BRAND.color)
    .setThumbnail(botAvatar)
    .setFooter({ text: `${BRAND.name} | Sollicitatie Tickets` });

  const rowOne = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyModerator.buttonId).setLabel('Moderator').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyMarketing.buttonId).setLabel('Marketing').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyDeveloper.buttonId).setLabel('Developer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyMedia.buttonId).setLabel('Media').setStyle(ButtonStyle.Secondary),
  );

  const rowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyManager.buttonId).setLabel('Manager').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyHelper.buttonId).setLabel('Helper').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyBugfix.buttonId).setLabel('Bug-fix').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TYPES.applyTicketSupport.buttonId).setLabel('Ticket Support').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [rowOne, rowTwo] };
}

function messageHasCustomId(message, prefix) {
  return message.components?.some(row => row.components?.some(component => {
    const id = component.customId || component.data?.custom_id;
    return typeof id === 'string' && id.startsWith(prefix);
  }));
}

async function fetchRecentPanelMessages(channel, client, maxMessages = 500) {
  const messages = [];
  let before;

  while (messages.length < maxMessages) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, maxMessages - messages.length),
      ...(before ? { before } : {}),
    }).catch(() => null);

    if (!batch?.size) break;

    for (const message of batch.values()) {
      if (message.author?.id === client.user.id) messages.push(message);
    }

    before = batch.last()?.id;
    if (!before || batch.size < 100) break;
  }

  return messages;
}

async function ensurePanels(client) {
  if (startedPanelEnsure) return;
  startedPanelEnsure = true;

  const state = loadState();
  const panelTargets = [
    { key: 'panelOne', channelId: PANEL_CHANNEL_ID, payload: buildPanelOne(), title: 'dragonshosting tickets' },
    { key: 'panelTwo', channelId: APPLICATION_PANEL_CHANNEL_ID, payload: buildPanelTwo(), title: 'dragonshosting sollicitaties' },
  ];

  for (const { key, channelId, payload, title } of panelTargets) {
    if (!payload) continue;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
      console.warn(`[DragonshostingTickets] Panel channel not found: ${channelId}`);
      continue;
    }

    const recentPanelMessages = await fetchRecentPanelMessages(channel, client);

    if (key === 'panelOne') {
      for (const message of recentPanelMessages) {
        const isLegacyTicketPanel =
          messageHasCustomId(message, 'ticketcreate-') ||
          messageHasCustomId(message, 'createTicket-') ||
          messageHasCustomId(message, 't:');
        if (isLegacyTicketPanel) {
          await message.delete().catch(() => null);
        }
      }
    }

    const existingId = state.panelMessages[key];
    let existing = existingId ? await channel.messages.fetch(existingId).catch(() => null) : null;

    const matchingPanels = recentPanelMessages.filter(message => (
        messageHasCustomId(message, 'dticket_') ||
        message.embeds?.some(embed => String(embed.title || '').toLowerCase().includes(title))
    ));

    if (!existing) {
      existing = matchingPanels[0] || null;
    }

    for (const duplicate of matchingPanels) {
      if (existing && duplicate.id !== existing.id) {
        await duplicate.delete().catch(() => null);
      }
    }

    if (existing) {
      await existing.edit(payload).catch(async () => {
        const sent = await channel.send(payload);
        state.panelMessages[key] = sent.id;
      });
      state.panelMessages[key] = existing.id;
    } else {
      const sent = await channel.send(payload);
      state.panelMessages[key] = sent.id;
    }
  }

  saveState(state);
  if (process.env.DRAGONSHOSTING_VERBOSE_STARTUP === 'true') {
    console.log('[DragonshostingTickets] Panels are ready.');
  }
}

async function openTicket(interaction, ticketType, description) {
  const guild = interaction.guild;
  const member = interaction.member;
  const username = safeUsername(member.user.username, member.id);
  const channelName = `ticket-${username}`;
  const state = loadState();

  const existingByState = Object.values(state.openTickets).find(ticket =>
    ticket.userId === member.id && ticket.status === 'open'
  );
  if (existingByState) {
    const existingChannel = guild.channels.cache.get(existingByState.channelId) ||
      await guild.channels.fetch(existingByState.channelId).catch(() => null);
    if (existingChannel) {
      return interaction.editReply({ content: `Je hebt al een open ticket: ${existingChannel}. Sluit deze eerst.` });
    }
    delete state.openTickets[existingByState.channelId];
    saveState(state);
  }

  const existingByName = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText && channel.name === channelName && isDragonshostingTicketChannel(channel)
  );
  if (existingByName) {
    return interaction.editReply({ content: `Je hebt al een open ticket: ${existingByName}. Sluit deze eerst.` });
  }

  const category = guild.channels.cache.get(ticketType.categoryId);
  if (!category) {
    return interaction.editReply({ content: 'Deze ticketcategorie bestaat niet meer. Neem contact op met een admin.' });
  }

  const supportRoles = existingRoleIds(guild, ticketType.supportRoles);
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...supportRoles.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    })),
  ];

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: ticketType.categoryId,
    topic: `${BRAND.name} ticket | Type: ${ticketType.label} | User: ${member.id} | Username: ${member.user.username}`,
    permissionOverwrites: overwrites,
  });

  const createdAt = new Date();
  const ticketRecord = {
    channelId: channel.id,
    channelName: channel.name,
    userId: member.id,
    username: member.user.username,
    type: ticketType.label,
    typeKey: Object.keys(TICKET_TYPES).find(key => TICKET_TYPES[key] === ticketType),
    description,
    status: 'open',
    claimedBy: null,
    createdAt: createdAt.toISOString(),
  };

  state.openTickets[channel.id] = ticketRecord;
  saveState(state);

  const firstMessage = await sendTicketIntroMessage({
    guild,
    channel,
    member,
    ticketType,
    description,
    supportRoles,
    createdAt,
  });

  state.openTickets[channel.id].firstMessageId = firstMessage.id;
  saveState(state);

  if (ticketType.noModal && ticketType.defaultDescription) {
    await channel.send({
      content: `\`\`\`md\n${ticketType.defaultDescription.replace(/```/g, "'''")}\n\`\`\``,
      allowedMentions: { parse: [] },
    }).catch(error => recordTicketError(error, {
      stage: 'openTicket.sendApplicationTemplate',
      channelId: channel.id,
      type: ticketType.label,
    }));
  }

  await interaction.editReply({ content: `Je ticket is aangemaakt: ${channel}` });

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel?.isTextBased?.()) {
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle('Ticket aangemaakt')
        .setColor(BRAND.success)
        .addFields(
          { name: 'Gebruiker', value: `${member.user.tag || member.user.username}`, inline: true },
          { name: 'Type', value: ticketType.label, inline: true },
          { name: 'Kanaal', value: `<#${channel.id}>`, inline: true },
        )
        .setTimestamp()],
    }).catch(() => null);
  }
}

async function sendTicketIntroMessage({ guild, channel, member, ticketType, description, supportRoles, createdAt }) {
  const supportMentions = supportRoles.map(id => `<@&${id}>`).join(' ');
  const content = `${member}${supportMentions ? ` ${supportMentions}` : ''}`;
  const allowedMentions = { users: [member.id], roles: supportRoles };
  const createdLabel = formatDate(createdAt);
  const safeDescription = String(description || 'Geen beschrijving opgegeven.').slice(0, 1000).replace(/```/g, "'''");
  const botAvatar = getBotAvatarUrl(guild);

  try {
    const ticketEmbed = new EmbedBuilder()
      .setAuthor({ name: `${BRAND.systemName} - Ticket`, iconURL: botAvatar })
      .setDescription('Bedankt voor het openen van een ticket. Het Dragonshosting team helpt je zo snel mogelijk.')
      .addFields({
        name: '__Ticket Information:__',
        value: [
          `- Ticket Category: \`${ticketType.label}\``,
          `- Ticket Creator: ${member}`,
          `- Username: \`${member.user.username}\``,
          `- Date: \`${createdLabel}\``,
          '- Claimed By: `Niemand`',
        ].join('\n'),
      })
      .setColor(BRAND.color);

    if (botAvatar) ticketEmbed.setThumbnail(botAvatar);

    const descEmbed = ticketType.noModal ? null : new EmbedBuilder()
      .setTitle(ticketType.question)
      .setDescription(`\`\`\`${safeDescription}\`\`\``)
      .setColor(BRAND.dark);

    return await channel.send({
      content,
      embeds: descEmbed ? [ticketEmbed, descEmbed] : [ticketEmbed],
      components: [buildTicketButtons(false)],
      allowedMentions,
    });
  } catch (error) {
    recordTicketError(error, {
      stage: 'sendTicketIntroMessage.full',
      channelId: channel.id,
      channelName: channel.name,
      type: ticketType.label,
    });

    return channel.send({
      content,
      embeds: [new EmbedBuilder()
        .setTitle(`${BRAND.name} ticket aangemaakt`)
        .setDescription([
          'Het ticketkanaal is aangemaakt.',
          '',
          `Categorie: \`${ticketType.label}\``,
          `Gebruiker: ${member}`,
          '',
          'Let op: het uitgebreide ticketpaneel kon niet worden geladen. Staff kan dit ticket nog wel behandelen.',
        ].join('\n'))
        .setColor(BRAND.warning)],
      allowedMentions,
    }).catch(fallbackError => {
      recordTicketError(fallbackError, {
        stage: 'sendTicketIntroMessage.fallback',
        channelId: channel.id,
        channelName: channel.name,
        type: ticketType.label,
      });
      throw fallbackError;
    });
  }
}

function buildTicketButtons(claimed, claimerLabel = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dticket_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('dticket_claim')
      .setLabel(claimed ? `Unclaim (${claimerLabel || 'claimed'})` : 'Claim')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function handleOpenButton(interaction, ticketType) {
  if (ticketType.noModal) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({ content: 'Ticket wordt aangemaakt, een moment...' }).catch(() => null);
    await openTicket(interaction, ticketType, ticketType.defaultDescription || 'Sollicitatie-template wordt geladen.');
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(ticketType.modalId)
    .setTitle(`${ticketType.shortLabel} Ticket`);

  const input = new TextInputBuilder()
    .setCustomId('description')
    .setLabel(ticketType.question)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(ticketType.placeholder)
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction, ticketType) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply({ content: 'Ticket wordt aangemaakt, een moment...' }).catch(() => null);

  try {
    const description = interaction.fields.getTextInputValue('description');
    await openTicket(interaction, ticketType, description);
  } catch (error) {
    recordTicketError(error, {
      stage: 'handleModalSubmit.openTicket',
      userId: interaction.user?.id,
      type: ticketType?.label,
    });
    console.error('[DragonshostingTickets] Ticket creation failed:', {
      userId: interaction.user?.id,
      type: ticketType?.label,
      message: error.message,
      code: error.code || null,
      status: error.status || null,
    });

    const errorMessage = [
      'Ticket kon niet worden aangemaakt.',
      'Controleer of de bot `Manage Channels`, `View Channel`, `Send Messages` en `Manage Permissions` heeft in de ticketcategorie.',
      'Probeer het daarna opnieuw.',
    ].join('\n');

    await interaction.editReply({ content: errorMessage }).catch(() => null);
  }
}

async function handleClaim(interaction) {
  const state = loadState();
  const ticket = state.openTickets[interaction.channelId] || recoverOpenTicketFromChannel(state, interaction.channel, interaction.user);
  const ticketType = ticket ? TICKET_TYPES[ticket.typeKey] : Object.values(TICKET_TYPES).find(type => type.categoryId === interaction.channel?.parentId);

  if (!ticket || !ticketType) {
    return replyEphemeral(interaction, 'Dit kanaal is niet bekend als Dragonshosting ticket.');
  }

  if (!hasTicketStaffRole(interaction.member, ticketType)) {
    return replyEphemeral(interaction, 'Je hebt geen toestemming om dit ticket te claimen.');
  }

  await interaction.deferUpdate();

  const stateAfterDefer = loadState();
  const currentTicket = stateAfterDefer.openTickets[interaction.channelId] || ticket;

  if (currentTicket.claimedBy && currentTicket.claimedBy !== interaction.user.id) {
    return interaction.followUp({
      content: `Dit ticket is al geclaimed door <@${currentTicket.claimedBy}>.`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  }

  const unclaiming = currentTicket.claimedBy === interaction.user.id;
  currentTicket.claimedBy = unclaiming ? null : interaction.user.id;
  stateAfterDefer.openTickets[interaction.channelId] = currentTicket;
  saveState(stateAfterDefer);

  const firstEmbed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder().setColor(BRAND.color);

  const baseDescription = 'Bedankt voor het openen van een ticket. Het Dragonshosting team helpt je zo snel mogelijk.';
  firstEmbed
    .setColor(unclaiming ? BRAND.color : BRAND.warning)
    .setDescription(baseDescription);

  if (unclaiming) {
    firstEmbed.clearFooter();
  } else {
    firstEmbed.setFooter({ text: `Geclaimed door ${interaction.user.tag || interaction.user.username}` });
  }

  const updatedEmbeds = interaction.message.embeds.map((embed, index) => index === 0 ? firstEmbed : EmbedBuilder.from(embed));
  if (!updatedEmbeds.length) updatedEmbeds.push(firstEmbed);

  await interaction.message.edit({
    embeds: updatedEmbeds,
    components: [buildTicketButtons(!unclaiming, interaction.user.username)],
  }).catch(() => null);

  await interaction.channel.send({
    content: unclaiming
      ? `${interaction.user} heeft dit ticket ge-unclaimed.`
      : `${interaction.user} heeft dit ticket geclaimed.`,
  }).catch(() => null);
}

async function handleClose(interaction) {
  const state = loadState();
  const ticket = state.openTickets[interaction.channelId] || recoverOpenTicketFromChannel(state, interaction.channel, interaction.user);
  const ticketType = ticket ? TICKET_TYPES[ticket.typeKey] : Object.values(TICKET_TYPES).find(type => type.categoryId === interaction.channel?.parentId);
  const isOwner = ticket?.userId === interaction.user.id ||
    interaction.channel?.name === `ticket-${safeUsername(interaction.user.username, interaction.user.id)}`;
  const isStaff = hasTicketStaffRole(interaction.member, ticketType);

  if (!isOwner && !isStaff) {
    return replyEphemeral(interaction, 'Je hebt geen toestemming om dit ticket te sluiten.');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dticket_confirm_close').setLabel('Bevestig sluiten').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dticket_cancel_close').setLabel('Annuleer').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: 'Weet je zeker dat je dit ticket wilt sluiten?',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCancelClose(interaction) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: 'Ticket sluiten geannuleerd.', components: [] }).catch(() => null);
  }
  return interaction.update({ content: 'Ticket sluiten geannuleerd.', components: [] }).catch(() => null);
}

async function handleConfirmClose(interaction) {
  await interaction.deferUpdate();

  const guild = interaction.guild;
  const channel = interaction.channel;
  const state = loadState();
  const ticket = state.openTickets[channel.id] || {
    channelId: channel.id,
    channelName: channel.name,
    userId: null,
    username: channel.name?.replace(/^ticket-/, '') || 'Unknown',
    type: Object.values(TICKET_TYPES).find(type => type.categoryId === channel.parentId)?.label || 'Support',
    typeKey: Object.keys(TICKET_TYPES).find(key => TICKET_TYPES[key].categoryId === channel.parentId) || null,
    status: 'open',
    claimedBy: null,
    createdAt: channel.createdAt?.toISOString?.() || new Date().toISOString(),
  };
  const ticketType = ticket.typeKey ? TICKET_TYPES[ticket.typeKey] : null;

  const isOwner = ticket.userId === interaction.user.id ||
    channel.name === `ticket-${safeUsername(interaction.user.username, interaction.user.id)}`;
  const isStaff = hasTicketStaffRole(interaction.member, ticketType);
  if (!isOwner && !isStaff) {
    return interaction.followUp({ content: 'Je hebt geen toestemming om dit ticket te sluiten.', flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const sortedMessages = fetched ? [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp) : [];
  const transcriptData = buildTranscriptData(guild, channel, ticket, interaction.user, sortedMessages);
  const transcriptId = saveTranscript(transcriptData);
  const transcriptHtml = renderTranscript(transcriptData);
  const uploadResult = await uploadTranscriptHtml(transcriptId, transcriptHtml);
  if (!uploadResult.ok && TRANSCRIPT_UPLOAD_CONFIG) {
    console.warn(`[DragonshostingTickets] DirectAdmin transcript upload failed for ${transcriptId}: ${uploadResult.reason || uploadResult.statusCode || 'unknown error'}`);
  }
  let visibleTranscriptUrl = uploadResult.ok ? uploadResult.url : null;

  ticket.status = 'closed';
  ticket.closedAt = new Date().toISOString();
  ticket.closedBy = interaction.user.id;
  ticket.transcriptId = transcriptId;
  state.transcripts[transcriptId] = {
    channelName: channel.name,
    type: ticket.type,
    userId: ticket.userId,
    username: ticket.username,
    closedAt: ticket.closedAt,
    closedBy: interaction.user.id,
    url: visibleTranscriptUrl || `${LOCAL_TRANSCRIPT_BASE_URL}/t/${transcriptId}`,
    webUploaded: uploadResult.ok,
  };
  delete state.openTickets[channel.id];
  saveState(state);
  await uploadTranscriptDashboardData(state).catch(error => {
    console.warn(`[DragonshostingTickets] Transcript dashboard refresh failed: ${error.message}`);
  });

  const closeEmbed = new EmbedBuilder()
    .setTitle('Ticket wordt gesloten')
    .setDescription('Dit kanaal wordt over 5 seconden verwijderd.')
    .setColor(BRAND.danger)
    .addFields({
      name: 'Transcript',
      value: transcriptFieldValue(uploadResult, 'Transcript wordt opgeslagen in het logkanaal als HTML-bestand.'),
    })
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] }).catch(() => null);

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel?.isTextBased?.()) {
    const buildLogEmbed = transcriptValue => new EmbedBuilder()
      .setTitle('Ticket gesloten')
      .setColor(BRAND.danger)
      .addFields(
        { name: 'Kanaal', value: `#${channel.name}`, inline: true },
        { name: 'Type', value: ticket.type || 'Support', inline: true },
        { name: 'Gesloten door', value: interaction.user.tag || interaction.user.username, inline: true },
        { name: 'Transcript', value: transcriptValue },
      )
      .setTimestamp();

    const logEmbed = new EmbedBuilder()
      .setTitle('Ticket gesloten')
      .setColor(BRAND.danger)
      .addFields(
        { name: 'Kanaal', value: `#${channel.name}`, inline: true },
        { name: 'Type', value: ticket.type || 'Support', inline: true },
        { name: 'Gesloten door', value: interaction.user.tag || interaction.user.username, inline: true },
        { name: 'Transcript', value: transcriptFieldValue(uploadResult) },
      )
      .setTimestamp();
    const sentLogMessage = await logChannel.send({
      embeds: [logEmbed],
      files: [buildTranscriptAttachment(transcriptHtml, channel.name)],
    }).catch(() => null);

    if (!visibleTranscriptUrl) {
      const attachmentUrl = sentLogMessage?.attachments?.first?.()?.url;
      if (attachmentUrl) {
        visibleTranscriptUrl = attachmentUrl;
        state.transcripts[transcriptId].url = visibleTranscriptUrl;
        saveState(state);
        await sentLogMessage.edit({
          embeds: [buildLogEmbed(`[Bekijk transcript HTML](${visibleTranscriptUrl})`)],
        }).catch(() => null);
      }
    }
  }

  const transcriptChannel = guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
  if (transcriptChannel?.isTextBased?.() && transcriptChannel.id !== LOG_CHANNEL_ID) {
    const transcriptEmbed = new EmbedBuilder()
        .setTitle('Ticket Transcript')
        .setColor(BRAND.color)
        .addFields(
          { name: 'Kanaal', value: `#${channel.name}`, inline: true },
          { name: 'Type', value: ticket.type || 'Support', inline: true },
          { name: 'Aangemaakt door', value: ticket.username || 'Onbekend', inline: true },
          { name: 'Gesloten door', value: interaction.user.tag || interaction.user.username, inline: true },
          {
            name: 'Transcript Link',
            value: visibleTranscriptUrl
              ? `[Klik hier om het transcript te bekijken](${visibleTranscriptUrl})`
              : 'HTML-bestand is toegevoegd als bijlage.',
          },
        )
        .setTimestamp();
    await transcriptChannel.send({
      embeds: [transcriptEmbed],
      files: [buildTranscriptAttachment(transcriptHtml, channel.name)],
    }).catch(() => null);
  }

  setTimeout(() => {
    channel.delete('Dragonshosting ticket closed').catch(error => {
      console.error('[DragonshostingTickets] Could not delete ticket channel:', error.message);
    });
  }, 5000);
}

function buildTranscriptData(guild, channel, ticket, closedByUser, messages) {
  const mentions = buildMentionLookup(guild, channel, ticket, closedByUser, messages);

  return {
    guildName: guild.name || BRAND.guildName,
    guildIcon: guild.iconURL({ size: 128 }) || null,
    channelName: channel.name,
    ticketType: ticket.type || 'Support',
    createdBy: ticket.username || ticket.userId || channel.name.replace(/^ticket-/, ''),
    createdById: ticket.userId || null,
    closedBy: closedByUser.tag || closedByUser.username,
    closedById: closedByUser.id,
    createdAt: ticket.createdAt || channel.createdAt?.toISOString?.() || null,
    closedAt: new Date().toISOString(),
    mentions,
    messages: messages.map(message => ({
      authorId: message.author.id,
      authorName: message.member?.displayName || message.author.globalName || message.author.username,
      username: message.author.username,
      authorColor: message.member?.displayHexColor && message.member.displayHexColor !== '#000000' ? message.member.displayHexColor : '#ffffff',
      avatarUrl: message.author.displayAvatarURL({ size: 64 }),
      isBot: message.author.bot,
      content: message.content || '',
      timestamp: message.createdAt?.toISOString?.() || new Date(message.createdTimestamp || Date.now()).toISOString(),
      embeds: message.embeds.map(embed => ({
        title: embed.title,
        description: embed.description,
        color: embed.color,
        author: embed.author,
        fields: embed.fields,
        footer: embed.footer,
        image: embed.image,
        thumbnail: embed.thumbnail,
      })),
      attachments: [...message.attachments.values()].map(attachment => ({
        name: attachment.name,
        url: attachment.url,
        contentType: attachment.contentType,
      })),
      mentions: {
        users: Object.fromEntries([...message.mentions.users.values()].map(user => [
          user.id,
          message.mentions.members?.get(user.id)?.displayName || user.globalName || user.username,
        ])),
        roles: Object.fromEntries([...message.mentions.roles.values()].map(role => [role.id, role.name])),
        channels: Object.fromEntries([...message.mentions.channels.values()].map(mentionedChannel => [mentionedChannel.id, mentionedChannel.name])),
      },
    })),
  };
}

function addLookupValue(bucket, id, value) {
  if (!id || !value) return;
  bucket[String(id)] = String(value);
}

function extractMentionIdsFromText(text, lookup) {
  const value = String(text || '');
  for (const match of value.matchAll(/<@!?(\d+)>/g)) lookup.userIds.add(match[1]);
  for (const match of value.matchAll(/<@&(\d+)>/g)) lookup.roleIds.add(match[1]);
  for (const match of value.matchAll(/<#(\d+)>/g)) lookup.channelIds.add(match[1]);
}

function buildMentionLookup(guild, channel, ticket, closedByUser, messages) {
  const lookup = {
    users: {},
    roles: {},
    channels: {},
  };
  const ids = {
    userIds: new Set(),
    roleIds: new Set(),
    channelIds: new Set(),
  };

  addLookupValue(lookup.channels, channel.id, channel.name);
  addLookupValue(lookup.users, ticket.userId, ticket.username);
  addLookupValue(lookup.users, closedByUser.id, closedByUser.globalName || closedByUser.username || closedByUser.tag);

  for (const role of guild.roles.cache.values()) addLookupValue(lookup.roles, role.id, role.name);
  for (const guildChannel of guild.channels.cache.values()) addLookupValue(lookup.channels, guildChannel.id, guildChannel.name);

  for (const message of messages) {
    addLookupValue(lookup.users, message.author.id, message.member?.displayName || message.author.globalName || message.author.username);

    for (const user of message.mentions.users.values()) {
      addLookupValue(lookup.users, user.id, message.mentions.members?.get(user.id)?.displayName || user.globalName || user.username);
    }

    for (const member of message.mentions.members?.values?.() || []) {
      addLookupValue(lookup.users, member.id, member.displayName || member.user?.globalName || member.user?.username);
    }

    for (const role of message.mentions.roles.values()) addLookupValue(lookup.roles, role.id, role.name);
    for (const mentionedChannel of message.mentions.channels.values()) addLookupValue(lookup.channels, mentionedChannel.id, mentionedChannel.name);

    extractMentionIdsFromText(message.content, ids);
    for (const embed of message.embeds || []) {
      extractMentionIdsFromText(embed.title, ids);
      extractMentionIdsFromText(embed.description, ids);
      extractMentionIdsFromText(embed.author?.name, ids);
      extractMentionIdsFromText(embed.footer?.text, ids);
      for (const field of embed.fields || []) {
        extractMentionIdsFromText(field.name, ids);
        extractMentionIdsFromText(field.value, ids);
      }
    }
  }

  for (const userId of ids.userIds) {
    const member = guild.members.cache.get(userId);
    const user = guild.client?.users?.cache?.get(userId);
    const fallbackName = ticket.userId === userId ? ticket.username : null;
    addLookupValue(lookup.users, userId, member?.displayName || user?.globalName || user?.username || fallbackName);
  }
  for (const roleId of ids.roleIds) addLookupValue(lookup.roles, roleId, guild.roles.cache.get(roleId)?.name);
  for (const channelId of ids.channelIds) addLookupValue(lookup.channels, channelId, guild.channels.cache.get(channelId)?.name);

  return lookup;
}

function saveTranscript(data) {
  ensureDirs();
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
  const filePath = path.join(TRANSCRIPTS_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return id;
}

function safeFileName(value) {
  return String(value || 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ticket';
}

function buildTranscriptAttachment(transcriptHtml, channelName) {
  return new AttachmentBuilder(Buffer.from(transcriptHtml, 'utf8'), {
    name: `dragonshosting-transcript-${safeFileName(channelName)}.html`,
  });
}

function buildMultipartUploadBody(filename, content, contentType = 'text/html; charset=utf-8') {
  const boundary = `----DragonshostingTranscript${crypto.randomBytes(12).toString('hex')}`;
  const fileBuffer = Buffer.from(content, 'utf8');
  const header = Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    '',
    '',
  ].join('\r\n'), 'utf8');
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    boundary,
    body: Buffer.concat([header, fileBuffer, footer]),
  };
}

async function uploadTranscriptHtml(transcriptId, transcriptHtml) {
  if (!TRANSCRIPT_UPLOAD_CONFIG) {
    return { ok: false, reason: 'disabled' };
  }

  const safeTranscriptId = safeFileName(transcriptId);
  const filename = 'index.html';
  const uploadDir = `${TRANSCRIPT_UPLOAD_CONFIG.destinationDir}/t/${safeTranscriptId}`;
  const targetUrl = `${TRANSCRIPT_UPLOAD_CONFIG.publicBaseUrl}/t/${safeTranscriptId}`;
  const mkdirResult = await directAdminJsonRequest('/api/filemanager-actions/mkdir', {
    path: uploadDir,
  });

  if (!mkdirResult.ok && mkdirResult.statusCode !== 409) {
    return {
      ok: false,
      statusCode: mkdirResult.statusCode,
      reason: mkdirResult.reason || 'Could not create transcript directory',
    };
  }

  const uploadResult = await uploadDirectAdminFile(uploadDir, filename, transcriptHtml, 'text/html; charset=utf-8');
  return uploadResult.ok
    ? { ...uploadResult, url: targetUrl, filename, uploadDir }
    : uploadResult;
}

async function uploadDirectAdminFile(uploadDir, filename, content, contentType) {
  const url = new URL('/api/filemanager-actions/upload', TRANSCRIPT_UPLOAD_CONFIG.directAdminUrl);
  url.searchParams.set('dir', uploadDir);
  url.searchParams.set('name', filename);
  url.searchParams.set('overwrite', 'true');
  url.searchParams.set('perm', '0644');

  const { boundary, body } = buildMultipartUploadBody(filename, content, contentType);
  const auth = Buffer.from(`${TRANSCRIPT_UPLOAD_CONFIG.username}:${TRANSCRIPT_UPLOAD_CONFIG.loginKey}`, 'utf8').toString('base64');
  const transport = url.protocol === 'http:' ? http : https;

  return new Promise(resolve => {
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        if (responseBody.length < 1000) responseBody += chunk;
      });
      res.on('end', () => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve({ ok: true, statusCode });
          return;
        }
        resolve({
          ok: false,
          statusCode,
          reason: `HTTP ${statusCode}`,
        });
      });
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('DirectAdmin upload timeout'));
    });
    req.on('error', error => {
      resolve({ ok: false, reason: error.message });
    });
    req.end(body);
  });
}

async function directAdminJsonRequest(endpoint, payload) {
  if (!TRANSCRIPT_UPLOAD_CONFIG) {
    return { ok: false, reason: 'disabled' };
  }

  const url = new URL(endpoint, TRANSCRIPT_UPLOAD_CONFIG.directAdminUrl);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const auth = Buffer.from(`${TRANSCRIPT_UPLOAD_CONFIG.username}:${TRANSCRIPT_UPLOAD_CONFIG.loginKey}`, 'utf8').toString('base64');
  const transport = url.protocol === 'http:' ? http : https;

  return new Promise(resolve => {
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    }, res => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        if (responseBody.length < 1000) responseBody += chunk;
      });
      res.on('end', () => {
        const statusCode = res.statusCode || 0;
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          statusCode,
          reason: responseBody.slice(0, 300) || null,
        });
      });
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('DirectAdmin request timeout'));
    });
    req.on('error', error => {
      resolve({ ok: false, reason: error.message });
    });
    req.end(body);
  });
}

function buildTranscriptDashboardItems(state) {
  const transcriptIds = new Set(Object.keys(state?.transcripts || {}));
  try {
    for (const filename of fs.readdirSync(TRANSCRIPTS_DIR)) {
      const match = filename.match(/^([a-z0-9-]+)\.json$/i);
      if (match) transcriptIds.add(match[1]);
    }
  } catch {}

  return [...transcriptIds]
    .filter(id => /^[a-z0-9-]{5,96}$/i.test(id))
    .map(id => {
      const metadata = state?.transcripts?.[id] || {};
      const transcript = readTranscript(id) || {};
      const webUrl = `${PUBLIC_BASE_URL}/t/${id}`;
      return {
        id,
        channelName: transcript.channelName || metadata.channelName || 'Ticket',
        type: transcript.ticketType || metadata.type || 'Support',
        username: transcript.createdBy || metadata.username || 'Onbekend',
        closedBy: transcript.closedBy || 'Onbekend',
        createdAt: transcript.createdAt || null,
        closedAt: transcript.closedAt || metadata.closedAt || null,
        messageCount: Array.isArray(transcript.messages) ? transcript.messages.length : null,
        url: metadata.webUploaded === false ? metadata.url || webUrl : webUrl,
      };
    })
    .sort((a, b) => Date.parse(b.closedAt || '') - Date.parse(a.closedAt || ''));
}

async function uploadTranscriptDashboardFile(filename, content, contentType) {
  if (!TRANSCRIPT_UPLOAD_CONFIG) return { ok: false, reason: 'disabled' };
  const uploadDir = TRANSCRIPT_UPLOAD_CONFIG.destinationDir;
  const mkdirResult = await directAdminJsonRequest('/api/filemanager-actions/mkdir', { path: uploadDir });
  if (!mkdirResult.ok && mkdirResult.statusCode !== 409) {
    return { ok: false, statusCode: mkdirResult.statusCode, reason: 'Could not create dashboard directory' };
  }
  return uploadDirectAdminFile(uploadDir, filename, content, contentType);
}

async function uploadTranscriptDashboardData(state) {
  const payload = {
    updatedAt: new Date().toISOString(),
    items: buildTranscriptDashboardItems(state),
  };
  const result = await uploadTranscriptDashboardFile(
    'transcripts.json',
    JSON.stringify(payload, null, 2),
    'application/json; charset=utf-8',
  );
  if (!result.ok) throw new Error(result.reason || `HTTP ${result.statusCode || 'unknown'}`);
  return payload.items.length;
}

async function syncTranscriptDashboard(state) {
  const markerFile = path.join(DATA_DIR, 'dragonshosting-transcript-dashboard-sync.json');
  let archiveAlreadySynced = false;
  try {
    archiveAlreadySynced = JSON.parse(fs.readFileSync(markerFile, 'utf8')).version === 1;
  } catch {}

  let dashboardPageUploaded = false;
  try {
    const html = fs.readFileSync(DASHBOARD_SOURCE_FILE, 'utf8');
    const result = await uploadTranscriptDashboardFile('index.html', html, 'text/html; charset=utf-8');
    if (!result.ok) throw new Error(result.reason || `HTTP ${result.statusCode || 'unknown'}`);
    dashboardPageUploaded = true;
  } catch (error) {
    console.warn(`[DragonshostingTickets] Transcript dashboard page upload failed: ${error.message}`);
  }

  let pagesFailed = false;
  let pagesUploaded = 0;
  for (const filename of fs.readdirSync(TRANSCRIPTS_DIR).filter(name => /^[a-z0-9-]+\.json$/i.test(name))) {
    const id = filename.slice(0, -5);
    const transcript = readTranscript(id);
    if (!transcript) continue;
    const metadata = state.transcripts[id] || {};
    if (archiveAlreadySynced && metadata.webUploaded === true && metadata.url === `${PUBLIC_BASE_URL}/t/${id}`) continue;
    const result = await uploadTranscriptHtml(id, renderTranscript(transcript));
    if (!result.ok) {
      pagesFailed = true;
      continue;
    }
    state.transcripts[id] = {
      ...metadata,
      channelName: metadata.channelName || transcript.channelName,
      type: metadata.type || transcript.ticketType,
      username: metadata.username || transcript.createdBy,
      closedAt: metadata.closedAt || transcript.closedAt,
      url: result.url,
      webUploaded: true,
    };
    pagesUploaded += 1;
  }

  saveState(state);
  const count = await uploadTranscriptDashboardData(state);
  if (dashboardPageUploaded && !pagesFailed) {
    fs.writeFileSync(markerFile, JSON.stringify({ version: 1, syncedAt: new Date().toISOString() }), 'utf8');
  }
  console.log(`[DragonshostingTickets] Transcript dashboard synchronized (${count} records, ${pagesUploaded} pages restored).`);
}

function transcriptFieldValue(uploadResult, fallbackText = 'HTML-bestand is toegevoegd als bijlage.') {
  return uploadResult?.ok && uploadResult.url
    ? `[Bekijk transcript op de website](${uploadResult.url})`
    : fallbackText;
}

function readTranscript(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) return null;
  const filePath = path.join(TRANSCRIPTS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function escHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mergeMentionLookups(...lookups) {
  return lookups.reduce((merged, lookup) => ({
    users: { ...merged.users, ...(lookup?.users || {}) },
    roles: { ...merged.roles, ...(lookup?.roles || {}) },
    channels: { ...merged.channels, ...(lookup?.channels || {}) },
  }), { users: {}, roles: {}, channels: {} });
}

function formatDiscordTimestamp(seconds, style = 'f') {
  const date = new Date(Number(seconds) * 1000);
  if (Number.isNaN(date.getTime())) return `<t:${seconds}:${style}>`;

  const locale = 'nl-NL';
  const optionsByStyle = {
    t: { hour: '2-digit', minute: '2-digit' },
    T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
    d: { day: '2-digit', month: '2-digit', year: 'numeric' },
    D: { day: '2-digit', month: 'long', year: 'numeric' },
    f: { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    F: { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    R: { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  };

  return new Intl.DateTimeFormat(locale, optionsByStyle[style] || optionsByStyle.f).format(date);
}

function formatContent(content, mentions = {}) {
  let html = escHtml(content);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  html = html.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (_match, seconds, style) => (
    `<span class="timestamp-inline">${escHtml(formatDiscordTimestamp(seconds, style || 'f'))}</span>`
  ));
  html = html.replace(/&lt;@!?(\d+)&gt;/g, (_match, id) => (
    `<span class="mention">@${escHtml(mentions.users?.[id] || id)}</span>`
  ));
  html = html.replace(/&lt;@&amp;(\d+)&gt;/g, (_match, id) => (
    `<span class="mention">@${escHtml(mentions.roles?.[id] || id)}</span>`
  ));
  html = html.replace(/&lt;#(\d+)&gt;/g, (_match, id) => (
    `<span class="mention">#${escHtml(mentions.channels?.[id] || id)}</span>`
  ));
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function formatDate(value, locale = 'nl-NL') {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Onbekend';
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderTranscript(data) {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const transcriptMentions = data.mentions || {};
  const guildIcon = data.guildIcon
    ? `<img class="guild-icon" src="${escHtml(data.guildIcon)}" alt="${escHtml(data.guildName)}">`
    : `<div class="guild-icon-placeholder">B</div>`;

  const messagesHtml = messages.map(message => {
    const messageMentions = mergeMentionLookups(transcriptMentions, message.mentions);
    const embedsHtml = (message.embeds || []).map(embed => {
      const color = embed.color ? `#${Number(embed.color).toString(16).padStart(6, '0')}` : '#1769ff';
      const fields = (embed.fields || []).map(field => `
        <div class="embed-field ${field.inline ? 'inline' : ''}">
          <div class="field-name">${escHtml(field.name)}</div>
          <div class="field-value">${formatContent(field.value, messageMentions)}</div>
        </div>`).join('');
      return `<div class="embed" style="border-left-color:${color}">
        ${embed.author?.name ? `<div class="embed-author">${escHtml(embed.author.name)}</div>` : ''}
        ${embed.title ? `<div class="embed-title">${escHtml(embed.title)}</div>` : ''}
        ${embed.description ? `<div class="embed-desc">${formatContent(embed.description, messageMentions)}</div>` : ''}
        ${fields ? `<div class="embed-fields">${fields}</div>` : ''}
        ${embed.thumbnail?.url ? `<img class="embed-thumb" src="${escHtml(embed.thumbnail.url)}" alt="thumbnail">` : ''}
        ${embed.image?.url ? `<img class="embed-img" src="${escHtml(embed.image.url)}" alt="image">` : ''}
        ${embed.footer?.text ? `<div class="embed-footer">${escHtml(embed.footer.text)}</div>` : ''}
      </div>`;
    }).join('');

    const attachmentsHtml = (message.attachments || []).map(attachment => {
      if (attachment.contentType?.startsWith('image/')) {
        return `<a href="${escHtml(attachment.url)}" target="_blank" rel="noopener noreferrer"><img class="attachment-img" src="${escHtml(attachment.url)}" alt="${escHtml(attachment.name)}"></a>`;
      }
      return `<a class="attachment-file" href="${escHtml(attachment.url)}" target="_blank" rel="noopener noreferrer">Bijlage: ${escHtml(attachment.name)}</a>`;
    }).join('');

    return `<article class="message">
      <img class="avatar" src="${escHtml(message.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="${escHtml(message.authorName)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
      <div class="message-body">
        <div class="message-header">
          <span class="author" style="color:${escHtml(message.authorColor || '#ffffff')}">${escHtml(message.authorName || message.username || 'Unknown')}</span>
          ${message.isBot ? '<span class="bot-badge">BOT</span>' : ''}
          <span class="timestamp">${formatDate(message.timestamp)}</span>
        </div>
        ${message.content ? `<div class="message-content">${formatContent(message.content, messageMentions)}</div>` : ''}
        ${embedsHtml}
        ${attachmentsHtml}
      </div>
    </article>`;
  }).join('');

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(BRAND.name)} Transcript - #${escHtml(data.channelName)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#111318;color:#dcddde;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}
    a{color:#57a8ff;text-decoration:none}a:hover{text-decoration:underline}
    .topbar{position:sticky;top:0;z-index:10;background:rgba(17,19,24,.92);backdrop-filter:blur(14px);border-bottom:1px solid #252a33;padding:18px 24px;display:flex;align-items:center;gap:16px}
    .guild-icon,.guild-icon-placeholder{width:58px;height:58px;border-radius:16px;object-fit:cover;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .guild-icon-placeholder{display:grid;place-items:center;background:#1769ff;color:white;font-weight:800;font-size:24px}
    .brand-title{font-size:20px;font-weight:800;color:#fff}.brand-sub{font-size:14px;color:#9aa4b2;margin-top:3px}.closed{display:inline-flex;margin-top:7px;padding:3px 9px;border-radius:999px;background:rgba(237,66,69,.15);color:#ff8b90;font-size:12px;font-weight:700}
    .meta{display:flex;gap:14px;flex-wrap:wrap;background:#171a21;border-bottom:1px solid #252a33;padding:12px 24px}
    .meta-item{background:#1d222b;border:1px solid #2b3340;border-radius:12px;padding:9px 12px;font-size:13px}.meta-label{color:#8892a0;margin-right:6px}.meta-value{color:#fff;font-weight:700}
    .wrap{max-width:1040px;margin:0 auto;padding:24px 14px 48px}.intro{background:linear-gradient(135deg,rgba(23,105,255,.18),rgba(23,105,255,.04));border:1px solid rgba(23,105,255,.25);border-radius:18px;padding:18px 20px;margin-bottom:18px}
    .intro h1{margin:0 0 6px;font-size:22px;color:#fff}.intro p{margin:0;color:#aab3c2}
    .message{display:flex;gap:14px;padding:10px 12px;border-radius:12px}.message:hover{background:#171b22}.avatar{width:42px;height:42px;border-radius:50%;flex:0 0 auto}.message-body{min-width:0;flex:1}.message-header{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}.author{font-weight:700}.timestamp{font-size:12px;color:#8892a0}.bot-badge{background:#1769ff;color:#fff;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:800}
    .message-content{white-space:pre-wrap;word-break:break-word;color:#e5e7eb}.mention{color:#cdd7ff;background:rgba(23,105,255,.18);border-radius:4px;padding:0 4px}.timestamp-inline{color:#d7dae0;background:#0c0f14;border:1px solid #252a33;border-radius:4px;padding:1px 5px}code{background:#0c0f14;border:1px solid #252a33;border-radius:4px;padding:1px 5px}
    .embed{background:#1c2028;border-left:4px solid #1769ff;border-radius:8px;padding:12px 14px;margin-top:8px;max-width:620px;overflow:hidden}.embed-author,.field-name{font-weight:800;color:#fff;font-size:13px}.embed-title{font-weight:800;color:#57a8ff;margin-top:4px}.embed-desc,.field-value{color:#d5d9e2;white-space:pre-wrap}.embed-fields{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}.embed-field{min-width:180px}.embed-field.inline{flex:1 1 42%}.embed-img,.attachment-img{display:block;max-width:min(520px,100%);max-height:360px;border-radius:10px;margin-top:8px}.embed-thumb{float:right;width:84px;height:84px;object-fit:cover;border-radius:8px;margin-left:12px}.embed-footer{clear:both;color:#8892a0;font-size:12px;margin-top:8px;border-top:1px solid #2b3340;padding-top:8px}.attachment-file{display:inline-flex;margin-top:8px;background:#1d222b;border:1px solid #2b3340;border-radius:10px;padding:8px 10px}
    .footer{border-top:1px solid #252a33;text-align:center;color:#8892a0;padding:22px;font-size:12px}.footer strong{color:#fff}
    @media(max-width:720px){.topbar{padding:14px}.meta{padding:10px 14px}.wrap{padding:16px 8px}.message{padding:9px 6px}.guild-icon,.guild-icon-placeholder{width:48px;height:48px;border-radius:14px}}
  </style>
</head>
<body>
  <header class="topbar">${guildIcon}<div><div class="brand-title">${escHtml(BRAND.name)} Ticket Transcript</div><div class="brand-sub">#${escHtml(data.channelName)} ${escHtml(data.guildName || BRAND.guildName)}</div><span class="closed">Ticket Closed</span></div></header>
  <section class="meta">
    <div class="meta-item"><span class="meta-label">Type</span><span class="meta-value">${escHtml(data.ticketType || 'Support')}</span></div>
    <div class="meta-item"><span class="meta-label">Aangemaakt door</span><span class="meta-value">${escHtml(data.createdBy || 'Onbekend')}</span></div>
    <div class="meta-item"><span class="meta-label">Gesloten door</span><span class="meta-value">${escHtml(data.closedBy || 'Onbekend')}</span></div>
    <div class="meta-item"><span class="meta-label">Berichten</span><span class="meta-value">${messages.length}</span></div>
    <div class="meta-item"><span class="meta-label">Gesloten</span><span class="meta-value">${formatDate(data.closedAt)}</span></div>
  </section>
  <main class="wrap">
    <section class="intro"><h1>Transcript opgeslagen</h1><p>Deze pagina bevat de ticketgeschiedenis van Dragonshosting. Bewaar de link voor bewijs of administratie.</p></section>
    ${messagesHtml || '<p>Geen berichten gevonden in dit ticket.</p>'}
  </main>
  <footer class="footer">Transcript generated by <strong>${escHtml(BRAND.systemName)}</strong></footer>
</body>
</html>`;
}

function renderNotFound() {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Transcript niet gevonden</title><style>body{margin:0;background:#111318;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh}.box{text-align:center;background:#171a21;border:1px solid #252a33;border-radius:18px;padding:30px}.sub{color:#9aa4b2}</style></head><body><div class="box"><h1>Transcript niet gevonden</h1><p class="sub">De link klopt niet of het transcript bestaat niet meer.</p></div></body></html>`;
}

function startTranscriptServer() {
  if (transcriptServer) return;
  if (TRANSCRIPT_UPLOAD_CONFIG) {
    writeRuntimeStatus({ status: 'directadmin-upload', publicBaseUrl: PUBLIC_BASE_URL });
    console.log(`[DragonshostingTickets] Transcript website upload enabled: ${PUBLIC_BASE_URL}`);
    return;
  }
  writeRuntimeStatus({ status: 'starting' });

  transcriptServer = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, PUBLIC_BASE_URL);
      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' });
        return res.end(JSON.stringify({ ok: true, service: 'dragonshosting-transcripts' }));
      }

      const match = url.pathname.match(/^\/t\/([a-z0-9-]+)$/i);
      if (!match) {
        res.writeHead(200, { 'content-type': 'text/plain;charset=utf-8' });
        return res.end(`${BRAND.systemName} transcript server`);
      }

      const data = readTranscript(match[1]);
      res.writeHead(data ? 200 : 404, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' });
      return res.end(data ? renderTranscript(data) : renderNotFound());
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain;charset=utf-8' });
      return res.end('Transcript server error');
    }
  });

  transcriptServer.on('error', error => {
    writeRuntimeStatus({ status: 'error', errorCode: error.code || null, errorMessage: error.message });
    if (error.code === 'EADDRINUSE') {
      console.warn(`[DragonshostingTickets] Transcript server port ${SERVER_PORT} is already in use. Transcript pages may need dashboard hosting.`);
    } else {
      console.error('[DragonshostingTickets] Transcript server error:', error);
    }
  });

  transcriptServer.listen(SERVER_PORT, '0.0.0.0', () => {
    writeRuntimeStatus({ status: 'listening' });
    if (process.env.DRAGONSHOSTING_VERBOSE_STARTUP === 'true') {
      console.log(`[DragonshostingTickets] Transcript server listening on ${PUBLIC_BASE_URL}`);
    }
  });
}

module.exports = {
  name: 'DragonshostingTickets',
  version: '1.0.0',
  description: 'Complete Dragonshosting ticket system with panels, claim/close, username channels and web transcripts.',

  run: async (client) => {
    global.client = client;
    ensureDirs();
    startTranscriptServer();
    if (TRANSCRIPT_UPLOAD_CONFIG) {
      setTimeout(() => syncTranscriptDashboard(loadState()).catch(error => {
        console.warn(`[DragonshostingTickets] Transcript dashboard sync failed: ${error.message}`);
      }), 12000);
    }
    setTimeout(() => ensurePanels(client).catch(error => {
      console.error('[DragonshostingTickets] Panel setup failed:', error);
    }), 5000);
    if (process.env.DRAGONSHOSTING_VERBOSE_STARTUP === 'true') {
      console.log(`[DragonshostingTickets] Loaded as ${client.user.tag}`);
    }
  },

  events: {
    'discord:ready': async ({ client }) => {
      global.client = client;
      await ensurePanels(client).catch(error => console.error('[DragonshostingTickets] Panel setup failed:', error));
    },

    'discord:interactionCreate': async ({ interaction }) => {
      if (!interaction?.guild || interaction.guild.id !== BRAND.guildId) return;

      if (interaction.isButton()) {
        const ticketType = getTicketTypeByButtonId(interaction.customId);
        if (ticketType) return handleOpenButton(interaction, ticketType);
        if (interaction.customId === 'dticket_claim') return handleClaim(interaction);
        if (interaction.customId === 'dticket_close') return handleClose(interaction);
        if (interaction.customId === 'dticket_confirm_close') return handleConfirmClose(interaction);
        if (interaction.customId === 'dticket_cancel_close') return handleCancelClose(interaction);
      }

      if (interaction.isModalSubmit()) {
        const ticketType = getTicketTypeByModalId(interaction.customId);
        if (ticketType) return handleModalSubmit(interaction, ticketType);
      }
    },
  },
};
