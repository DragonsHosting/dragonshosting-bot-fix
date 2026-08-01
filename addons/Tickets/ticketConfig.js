const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, 'data');
const dataFile = path.join(dataDir, 'ticket-system-config.json');

const LEGACY = {
  guildId: process.env.DISCORD_GUILD_ID || '1482512038788993034',
  guildName: process.env.DRAGONSHOSTING_GUILD_NAME || 'DragonsHosting community (Beta opening)',
  botAvatar: 'https://cdn.discordapp.com/avatars/1498232361899397161/b256d652c8838a4d918b2f48913a1bb8.png',
  staffRoleIds: [
    '1506340973029101679',
    '1505816343406968903'
  ],
  logChannelId: '1509216507375128728',
  transcriptChannelId: '1498272317007204456',
  categoryIds: {
    ticket_general_questions: '1498280273098313808',
    ticket_player_report: '1498280276319535134',
    ticket_bug_support: '1498280275178950880',
    ticket_unban_request: '1498280274252005486'
  }
};

const DEFAULT_TICKET_TYPES = {
  ticket_general_questions: {
    enabled: true,
    label: 'Algemene support',
    shortLabel: 'Algemeen',
    slug: 'support',
    emoji: '💬',
    style: 'Primary',
    categoryName: '🎫 Tickets - Algemeen',
    question: 'Waarmee kunnen wij je helpen?',
    placeholder: 'Leg je vraag duidelijk uit. Voeg waar mogelijk screenshots, namen, tijden of foutmeldingen toe.',
    intro: 'Bedankt voor het openen van een support ticket. Ons team helpt je zo snel mogelijk.',
    expectedResponse: 'Binnen 24 uur'
  },
  ticket_payment_support: {
    enabled: true,
    label: 'Betaling / Credits',
    shortLabel: 'Betaling',
    slug: 'betaling',
    emoji: '💳',
    style: 'Success',
    categoryName: '💳 Tickets - Betaling',
    question: 'Waar gaat je betaling, order of credits-probleem over?',
    placeholder: 'Vermeld ordernummer, betaalmethode (Wero/Tikkie/bank), bedrag, datum en je gebruikersnaam/e-mail.',
    intro: 'Voor betalingen controleren wij handmatig of de betaling echt binnen is. Zet altijd je ordernummer in je bericht.',
    expectedResponse: 'Zo snel mogelijk na betaalcontrole'
  },
  ticket_order_credits: {
    enabled: true,
    label: 'Credit order check',
    shortLabel: 'Credits',
    slug: 'credits',
    emoji: '🧾',
    style: 'Success',
    categoryName: '💳 Tickets - Betaling',
    question: 'Welk credit ordernummer moeten wij controleren?',
    placeholder: 'Bijvoorbeeld DH-260725-ABC123 + betaalmethode + bedrag.',
    intro: 'Gebruik dit ticket als je een credit order hebt betaald en wacht op handmatige goedkeuring.',
    expectedResponse: 'Na betaalcontrole'
  },
  ticket_technical_support: {
    enabled: true,
    label: 'Technische support',
    shortLabel: 'Technisch',
    slug: 'tech',
    emoji: '🛠️',
    style: 'Primary',
    categoryName: '🛠️ Tickets - Technisch',
    question: 'Welke technische hulp heb je nodig?',
    placeholder: 'Beschrijf servernaam, foutmelding, stappen om het probleem te reproduceren en wat je al geprobeerd hebt.',
    intro: 'Ons technische team kijkt mee. Hoe concreter de informatie, hoe sneller we kunnen helpen.',
    expectedResponse: 'Binnen 24 uur'
  },
  ticket_bug_support: {
    enabled: true,
    label: 'Bug support',
    shortLabel: 'Bug',
    slug: 'bug',
    emoji: '🐛',
    style: 'Primary',
    categoryName: '🐛 Tickets - Bugs',
    question: 'Welke bug ben je tegengekomen?',
    placeholder: 'Beschrijf wat er gebeurt, wat je verwachtte, waar het gebeurde en voeg screenshots/logs toe.',
    intro: 'Dank voor je bug report. Staff controleert de melding en vraagt extra info als dat nodig is.',
    expectedResponse: 'Binnen 24 uur'
  },
  ticket_player_report: {
    enabled: true,
    label: 'Speler report',
    shortLabel: 'Report',
    slug: 'report',
    emoji: '🚨',
    style: 'Danger',
    categoryName: '🚨 Tickets - Reports',
    question: 'Wie rapporteer je en wat is er gebeurd?',
    placeholder: 'Vermeld spelernaam, datum/tijd, server, reden en bewijs zoals screenshots/video.',
    intro: 'Reports worden vertrouwelijk behandeld door staff.',
    expectedResponse: 'Binnen 24 uur'
  },
  ticket_unban_request: {
    enabled: true,
    label: 'Unban aanvraag',
    shortLabel: 'Unban',
    slug: 'unban',
    emoji: '🔨',
    style: 'Danger',
    categoryName: '🔨 Tickets - Unban',
    question: 'Waarom zou je unban moeten krijgen?',
    placeholder: 'Vermeld je Minecraft/Discord naam, reden van ban, datum en waarom staff dit opnieuw moet bekijken.',
    intro: 'Unban-aanvragen worden door staff beoordeeld. Wees eerlijk en volledig.',
    expectedResponse: 'Binnen 48 uur'
  },
  ticket_application: {
    enabled: true,
    label: 'Sollicitatie',
    shortLabel: 'Sollicitatie',
    slug: 'sollicitatie',
    emoji: '📝',
    style: 'Secondary',
    categoryName: '📝 Tickets - Sollicitaties',
    question: 'Waarvoor wil je solliciteren en waarom pas jij bij het team?',
    placeholder: 'Vertel je leeftijd, ervaring, beschikbaarheid, motivatie en Discord/Minecraft naam.',
    intro: 'Bedankt voor je sollicitatie. Teamleiding kijkt hiernaar wanneer er plek is.',
    expectedResponse: 'Afhankelijk van open plekken'
  }
};

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readAll() {
  if (!fs.existsSync(dataFile)) return { guilds: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      guilds: parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null ? parsed.guilds : {}
    };
  } catch (error) {
    console.log(`[Tickets] Failed to read ticket config: ${error.message}`);
    return { guilds: {} };
  }
}

function writeAll(data) {
  ensureDataDir();
  fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function getGuildConfig(guildId) {
  return readAll().guilds[guildId] || {};
}

function saveGuildConfig(guildId, patch) {
  const all = readAll();
  const existing = all.guilds[guildId] || {};
  all.guilds[guildId] = {
    ...existing,
    ...patch,
    categoryIds: {
      ...(existing.categoryIds || {}),
      ...(patch.categoryIds || {})
    },
    ticketTypes: {
      ...(existing.ticketTypes || {}),
      ...(patch.ticketTypes || {})
    },
    updatedAt: new Date().toISOString()
  };
  writeAll(all);
  return all.guilds[guildId];
}

function splitIds(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function getStaffRoleIds(guild) {
  const runtime = getGuildConfig(guild.id);
  const configured = [
    ...(runtime.staffRoleIds || []),
    ...splitIds(process.env.DRAGONSHOSTING_STAFF_ROLE_IDS),
    ...LEGACY.staffRoleIds
  ];
  return [...new Set(configured)].filter(roleId => guild.roles.cache.has(roleId));
}

function getLogChannelId(guild) {
  const runtime = getGuildConfig(guild.id);
  return runtime.logChannelId || process.env.DRAGONSHOSTING_TICKET_LOG_CHANNEL_ID || LEGACY.logChannelId;
}

function getTranscriptChannelId(guild) {
  const runtime = getGuildConfig(guild.id);
  return runtime.transcriptChannelId || process.env.DRAGONSHOSTING_TRANSCRIPT_CHANNEL_ID || LEGACY.transcriptChannelId;
}

function getPanelChannelId(guild) {
  const runtime = getGuildConfig(guild.id);
  return runtime.panelChannelId || process.env.DRAGONSHOSTING_TICKET_PANEL_CHANNEL_ID || null;
}

function getGuildBrand(guild) {
  const runtime = getGuildConfig(guild.id);
  return {
    guildId: guild.id,
    guildName: runtime.guildName || process.env.DRAGONSHOSTING_GUILD_NAME || guild.name || LEGACY.guildName,
    guildIcon: guild.iconURL({ size: 128 }) || `https://cdn.discordapp.com/icons/${LEGACY.guildId}/a_61adfd830170b05c1b49a85a69e326bb.gif`,
    botAvatar: runtime.botAvatar || LEGACY.botAvatar
  };
}

function getTicketTypes(guild) {
  const runtime = getGuildConfig(guild.id);
  const categoryIds = {
    ...LEGACY.categoryIds,
    ...(runtime.categoryIds || {})
  };
  const overrides = runtime.ticketTypes || {};
  const result = {};

  for (const [id, ticketType] of Object.entries(DEFAULT_TICKET_TYPES)) {
    result[id] = {
      ...ticketType,
      ...(overrides[id] || {}),
      id,
      categoryId: categoryIds[id] || ticketType.categoryId || null
    };
  }

  return result;
}

function getTicketType(guild, id) {
  return getTicketTypes(guild)[id] || null;
}

function getTicketTypeByCategoryId(guild, categoryId) {
  return Object.values(getTicketTypes(guild)).find(ticketType => ticketType.categoryId === categoryId) || null;
}

module.exports = {
  dataFile,
  DEFAULT_TICKET_TYPES,
  getGuildBrand,
  getGuildConfig,
  getLogChannelId,
  getPanelChannelId,
  getStaffRoleIds,
  getTicketType,
  getTicketTypeByCategoryId,
  getTicketTypes,
  getTranscriptChannelId,
  saveGuildConfig
};
