'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel
} = require('@discordjs/voice');

const CONFIG_PATH = path.resolve(__dirname, '../data/radio24x7.json');
const PANEL_STATE_PATH = path.resolve(__dirname, '../../data/dragonshosting-radio-panel.json');
const API_VERSION = '1.16.1';
const API_CLIENT = 'DragonsHostingRadio';
const WATCHDOG_INTERVAL_MS = 15_000;
const TRACK_RETRY_MIN_MS = 3_000;
const TRACK_RETRY_MAX_MS = 60_000;
const SWITCH_COOLDOWN_MS = 10_000;
const RADIO_PANEL_CUSTOM_ID = 'dragonshosting_radio_station';
const RADIO_PAGE_PREFIX = 'dragonshosting_radio_page_';
const RADIO_CONTROL_PREFIX = 'dragonshosting_radio_control_';
const RADIO_NL_CATALOG_URL = 'https://www.radio.nl/radionl.js';
const STATIONS_PER_PAGE = 25;
const RADIO_NL_NAME_OVERRIDES = Object.freeze({ 'q-music': 'Qmusic' });

const FALLBACK_RADIO_STATIONS = Object.freeze([
  {
    id: 'dragonsmusic',
    name: 'DragonsMusic',
    description: 'Muziek uit de eigen DragonsHosting-bibliotheek',
    homepage: 'https://dragonshosting.nl/music/'
  },
  {
    id: '100nl',
    name: '100% NL',
    description: 'De muziek van Nederland',
    streamUrl: 'https://stream.100p.nl/100pctnl.mp3',
    homepage: 'https://www.100p.nl/'
  },
  {
    id: 'radio538',
    name: 'Radio 538',
    description: 'Hits, dance en entertainment',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO538.mp3',
    homepage: 'https://www.538.nl/'
  },
  {
    id: 'qmusic',
    name: 'Qmusic',
    description: 'Q sounds better with you',
    streamUrl: 'https://stream.qmusic.nl/qmusic/mp3/',
    homepage: 'https://qmusic.nl/'
  },
  {
    id: 'skyradio',
    name: 'Sky Radio',
    description: 'Non-stop feel good hits',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SKYRADIO.mp3',
    homepage: 'https://www.skyradio.nl/'
  },
  {
    id: 'radio10',
    name: 'Radio 10',
    description: 'De grootste hits aller tijden',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO10.mp3',
    homepage: 'https://www.radio10.nl/'
  },
  {
    id: 'nporadio1',
    name: 'NPO Radio 1',
    description: 'Nieuws en sport',
    streamUrl: 'https://icecast.omroep.nl/radio1-bb-mp3',
    homepage: 'https://www.nporadio1.nl/'
  },
  {
    id: 'nporadio2',
    name: 'NPO Radio 2',
    description: 'Muziek en verhalen',
    streamUrl: 'https://icecast.omroep.nl/radio2-bb-mp3',
    homepage: 'https://www.nporadio2.nl/'
  },
  {
    id: 'npo3fm',
    name: 'NPO 3FM',
    description: 'Nieuwe muziek en festivals',
    streamUrl: 'https://icecast.omroep.nl/3fm-bb-mp3',
    homepage: 'https://www.npo3fm.nl/'
  },
  {
    id: 'bnr',
    name: 'BNR Nieuwsradio',
    description: 'Zakelijk nieuws en achtergronden',
    streamUrl: 'https://stream.bnr.nl/bnr_mp3_128_05',
    homepage: 'https://www.bnr.nl/'
  },
  {
    id: 'slam',
    name: 'SLAM!',
    description: 'Dance en pop',
    streamUrl: 'https://stream.slam.nl/slam',
    homepage: 'https://www.slam.nl/'
  },
  {
    id: 'veronica',
    name: 'Radio Veronica',
    description: 'Rock en popklassiekers',
    streamUrl: 'https://stream.radioveronica.nl/veronica',
    homepage: 'https://www.radioveronica.nl/'
  },
  {
    id: 'kink',
    name: 'KINK',
    description: 'Alternative rock',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/KINK.mp3',
    homepage: 'https://kink.nl/'
  }
]);

const EXTRA_RADIO_STATIONS = Object.freeze([
  { id: '538nonstop', name: '538 Non-Stop', description: 'De grootste 538-hits zonder onderbrekingen', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR09.mp3', homepage: 'https://www.538.nl/zenders/non-stop' },
  { id: '538greatesthits', name: '538 Greatest Hits', description: 'De perfecte blend tussen toen en nu', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR08.mp3', homepage: 'https://www.538.nl/zenders/greatest-hits' },
  { id: '53890s', name: "538 90's", description: 'De grootste hits uit de jaren negentig', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR21.mp3', homepage: 'https://www.538.nl/zenders/90s-hits' },
  { id: '538ochtendshow', name: '538 Ochtendshow', description: 'Fragmenten en muziek uit de 538 Ochtendshow', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR29.mp3', homepage: 'https://www.538.nl/zenders/ochtendshow' },
  { id: '538ibiza', name: '538 Ibiza', description: 'Dance en zonnige Ibiza-vibes', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR19.mp3', homepage: 'https://www.538.nl/zenders/ibiza' },
  { id: '538dance', name: '538 Dance Department', description: 'Non-stop dance van bekende dj’s', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR01.mp3', homepage: 'https://www.538.nl/zenders/dance-department' },
  { id: '538party', name: '538 Party', description: 'Feestmuziek en meezingers', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR16.mp3', homepage: 'https://www.538.nl/zenders/party' },
  { id: '538hitzone', name: '538 Hitzone', description: 'Non-stop nieuwe releases en hits van morgen', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR11.mp3', homepage: 'https://www.538.nl/zenders/hitzone' },
  { id: '538top50', name: '538 Top 50', description: 'De vijftig grootste hits van dit moment', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR13.mp3', homepage: 'https://www.538.nl/zenders/top-50' },
  { id: '538zomer', name: '538 Zomer', description: 'Zomerse feel-good hits', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/TLPSTR06.mp3', homepage: 'https://www.538.nl/zenders/zomer' },
  { id: '538tomorrowland', name: '538 Tomorrowland', description: 'Tomorrowland One World Radio', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/OWR_world_radio_NL.mp3', homepage: 'https://www.538.nl/zenders' }
]);

// Mutated in place after the Radio.nl catalogue is refreshed so consumers of
// the exported array always see the current station list.
const RADIO_STATIONS = [...FALLBACK_RADIO_STATIONS, ...EXTRA_RADIO_STATIONS];

const RADIO_STATIONS_BY_ID = new Map(RADIO_STATIONS.map(station => [station.id, station]));

let singleton = null;

function cleanStationText(value, fallback) {
  const cleaned = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

async function refreshRadioNlCatalog() {
  const response = await fetch(RADIO_NL_CATALOG_URL, {
    headers: { 'User-Agent': 'DragonsHosting-Radio/2.0' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Radio.nl returned HTTP ${response.status}`);

  const source = await response.text();
  const assignment = source.match(/^\s*zenders\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!assignment) throw new Error('Radio.nl catalogue format was not recognised');

  const payload = JSON.parse(assignment[1]);
  const stations = (Array.isArray(payload.items) ? payload.items : [])
    .filter(item => item?.z && item?.o && /^https?:\/\//i.test(String(item.s || '')))
    .map(item => ({
      id: String(item.z).slice(0, 100),
      name: (RADIO_NL_NAME_OVERRIDES[item.z] || cleanStationText(item.o, String(item.z))).slice(0, 100),
      description: cleanStationText(item.a, 'Nederlandse online radio').slice(0, 100),
      streamUrl: String(item.s),
      homepage: /^https?:\/\//i.test(String(item.w || '')) ? String(item.w) : 'https://www.radio.nl/'
    }));

  if (stations.length < 10) throw new Error('Radio.nl catalogue contained too few playable stations');

  const ownMusic = FALLBACK_RADIO_STATIONS[0];
  const unique = [...new Map([...stations, ...EXTRA_RADIO_STATIONS].map(station => [station.id, station])).values()];
  RADIO_STATIONS.splice(0, RADIO_STATIONS.length, ownMusic, ...unique);
  RADIO_STATIONS_BY_ID.clear();
  RADIO_STATIONS.forEach(station => RADIO_STATIONS_BY_ID.set(station.id, station));
  return unique.length;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { enabled: false };
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    enabled: config.enabled !== false,
    channelId: String(config.channelId || '').trim(),
    panelChannelId: String(config.panelChannelId || '').trim(),
    server: String(config.server || '').replace(/\/+$/, ''),
    username: String(config.username || '').trim(),
    password: String(config.password || ''),
    volume: Math.min(1, Math.max(0.05, Number(config.volume) || 0.72)),
    opusBitrate: Math.min(256, Math.max(64, Number(config.opusBitrate) || 128)),
    stationId: String(config.stationId || 'dragonsmusic').trim()
  };
}

function createSubsonicParams(config, extra = {}) {
  const salt = crypto.randomBytes(12).toString('hex');
  const token = crypto.createHash('md5').update(`${config.password}${salt}`).digest('hex');

  return new URLSearchParams({
    u: config.username,
    t: token,
    s: salt,
    v: API_VERSION,
    c: API_CLIENT,
    f: 'json',
    ...extra
  });
}

function createApiUrl(config, method, extra = {}) {
  return `${config.server}/rest/${method}.view?${createSubsonicParams(config, extra)}`;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function resolveFfmpeg() {
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    return '/usr/bin/ffmpeg';
  }
  try {
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
}

class Radio24x7 {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play }
    });
    this.connection = null;
    this.ffmpeg = null;
    this.currentTrack = null;
    this.currentResource = null;
    this.tracks = [];
    this.nextTimer = null;
    this.watchdog = null;
    this.connecting = null;
    this.loadingTrack = false;
    this.stopped = false;
    this.retryDelay = TRACK_RETRY_MIN_MS;
    this.stationId = config.stationId;
    this.stationPage = 0;
    this.generation = 0;
    this.lastSwitchAt = 0;
    this.panelMessage = null;
    this.interactionHandler = interaction => {
      this.handleInteraction(interaction).catch(error => {
        console.error(`[Radio24x7] Panel interaction error: ${error.message}`);
      });
    };

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.stopFfmpeg();
      this.scheduleNext(750);
    });

    this.player.on('error', error => {
      console.error(`[Radio24x7] Audio player error: ${error.message}`);
      this.stopFfmpeg();
      this.scheduleNext(this.retryDelay);
    });

  }

  async start() {
    try {
      const stationCount = await refreshRadioNlCatalog();
      console.log(`[Radio24x7] ${stationCount} Radio.nl and 538 stations loaded.`);
    } catch (error) {
      console.error(`[Radio24x7] Radio.nl catalogue unavailable; using fallback stations: ${error.message}`);
    }
    if (!RADIO_STATIONS_BY_ID.has(this.stationId)) this.stationId = 'dragonsmusic';
    this.stationPage = Math.max(0, Math.floor(RADIO_STATIONS.findIndex(station => station.id === this.stationId) / STATIONS_PER_PAGE));
    this.validateConfig();
    await this.ensureConnection();
    await this.playNext();
    this.client.on('interactionCreate', this.interactionHandler);
    await this.ensurePanel().catch(error => {
      console.error(`[Radio24x7] Could not create radio panel: ${error.message}`);
    });

    this.watchdog = setInterval(() => {
      this.runWatchdog().catch(error => {
        console.error(`[Radio24x7] Watchdog error: ${error.message}`);
      });
    }, WATCHDOG_INTERVAL_MS);
    this.watchdog.unref?.();
  }

  getSelectedStation() {
    return RADIO_STATIONS_BY_ID.get(this.stationId) || RADIO_STATIONS[0];
  }

  persistState() {
    const storedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    storedConfig.stationId = this.stationId;
    storedConfig.volume = this.config.volume;
    const tempPath = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(storedConfig, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, CONFIG_PATH);
  }

  buildPanelPayload() {
    const selected = this.getSelectedStation();
    const pageCount = Math.max(1, Math.ceil(RADIO_STATIONS.length / STATIONS_PER_PAGE));
    this.stationPage = Math.min(Math.max(0, this.stationPage), pageCount - 1);
    const pageStart = this.stationPage * STATIONS_PER_PAGE;
    const pageStations = RADIO_STATIONS.slice(pageStart, pageStart + STATIONS_PER_PAGE);
    const isOwnMusic = selected.id === 'dragonsmusic';
    const isPaused = [AudioPlayerStatus.Paused, AudioPlayerStatus.AutoPaused].includes(this.player.state.status);
    const currentTitle = isOwnMusic && this.currentTrack
      ? `${this.currentTrack.title || 'Onbekend nummer'} - ${this.currentTrack.artist || 'Onbekende artiest'}`
      : selected.description;
    const embed = new EmbedBuilder()
      .setColor(0x29d884)
      .setTitle('🐉 DragonsHosting Radio')
      .setDescription([
        `Kies uit **${RADIO_STATIONS.length}** zenders van Radio.nl of speel de eigen DragonsMusic-bibliotheek.`,
        '',
        `**Nu geselecteerd:** [${selected.name}](${selected.homepage})`,
        `**Nu actief:** ${currentTitle}`,
        `**Volume:** ${Math.round(this.config.volume * 100)}%`,
        `**Zenderpagina:** ${this.stationPage + 1}/${pageCount}`,
        '',
        'Ga eerst in het radiokanaal. Beheerders kunnen altijd wisselen.',
        'Bij DragonsMusic kun je nummers overslaan en direct een nieuwe mix starten.'
      ].join('\n'))
      .setFooter({ text: 'DragonsHosting • 24/7 Radio' })
      .setTimestamp();

    const menu = new StringSelectMenuBuilder()
      .setCustomId(RADIO_PANEL_CUSTOM_ID)
      .setPlaceholder(`Pagina ${this.stationPage + 1}: kies een zender`)
      .addOptions(pageStations.map(station => ({
        label: station.name,
        value: station.id,
        description: station.description.slice(0, 100),
        default: station.id === selected.id
      })));

    const pageRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${RADIO_PAGE_PREFIX}previous`)
        .setLabel('Vorige')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.stationPage === 0),
      new ButtonBuilder()
        .setCustomId(`${RADIO_PAGE_PREFIX}indicator`)
        .setLabel(`${this.stationPage + 1} / ${pageCount}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${RADIO_PAGE_PREFIX}next`)
        .setLabel('Volgende')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.stationPage >= pageCount - 1),
      new ButtonBuilder()
        .setCustomId(`${RADIO_CONTROL_PREFIX}reconnect`)
        .setLabel('Herverbinden')
        .setStyle(ButtonStyle.Secondary)
    );

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${RADIO_CONTROL_PREFIX}playpause`)
        .setLabel(isPaused ? 'Verder' : 'Pauze')
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${RADIO_CONTROL_PREFIX}skip`)
        .setLabel('Skip')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!isOwnMusic),
      new ButtonBuilder()
        .setCustomId(`${RADIO_CONTROL_PREFIX}shuffle`)
        .setLabel('Nieuwe mix')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!isOwnMusic),
      new ButtonBuilder()
        .setCustomId(`${RADIO_CONTROL_PREFIX}volume_down`)
        .setLabel('Volume -')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${RADIO_CONTROL_PREFIX}volume_up`)
        .setLabel('Volume +')
        .setStyle(ButtonStyle.Secondary)
    );

    return {
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu), pageRow, controlRow]
    };
  }

  readPanelState() {
    try {
      return JSON.parse(fs.readFileSync(PANEL_STATE_PATH, 'utf8'));
    } catch {
      return null;
    }
  }

  writePanelState(message) {
    fs.mkdirSync(path.dirname(PANEL_STATE_PATH), { recursive: true });
    const tempPath = `${PANEL_STATE_PATH}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify({
      channelId: message.channelId,
      messageId: message.id
    }, null, 2)}\n`);
    fs.renameSync(tempPath, PANEL_STATE_PATH);
  }

  async ensurePanel() {
    const panelChannelId = this.config.panelChannelId || this.config.channelId;
    const channel = await this.client.channels.fetch(panelChannelId);
    if (!channel.isTextBased?.()) {
      throw new Error(`Radio panel channel ${panelChannelId} is not text based`);
    }

    const permissions = channel.permissionsFor?.(this.client.user);
    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks
    ];
    if (permissions && !permissions.has(required)) {
      throw new Error(`Missing View Channel, Send Messages or Embed Links permission in ${channel.name}`);
    }

    const state = this.readPanelState();
    if (state?.channelId === channel.id && state.messageId) {
      this.panelMessage = await channel.messages.fetch(state.messageId).catch(() => null);
    } else if (state?.channelId && state.messageId) {
      const previousChannel = await this.client.channels.fetch(state.channelId).catch(() => null);
      const previousMessage = await previousChannel?.messages?.fetch(state.messageId).catch(() => null);
      await previousMessage?.delete().catch(() => null);
    }

    const payload = this.buildPanelPayload();
    if (this.panelMessage) {
      await this.panelMessage.edit(payload);
    } else {
      this.panelMessage = await channel.send(payload);
      this.writePanelState(this.panelMessage);
    }
  }

  async refreshPanel() {
    if (!this.panelMessage) {
      await this.ensurePanel();
      return;
    }
    try {
      await this.panelMessage.edit(this.buildPanelPayload());
    } catch {
      this.panelMessage = null;
      await this.ensurePanel();
    }
  }

  async handleInteraction(interaction) {
    const isStationSelect = interaction.isStringSelectMenu?.() && interaction.customId === RADIO_PANEL_CUSTOM_ID;
    const isPageButton = interaction.isButton?.() && interaction.customId.startsWith(RADIO_PAGE_PREFIX);
    const isControlButton = interaction.isButton?.() && interaction.customId.startsWith(RADIO_CONTROL_PREFIX);
    if (!isStationSelect && !isPageButton && !isControlButton) return;

    const isManager = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    const memberVoiceChannelId = interaction.member?.voice?.channelId;
    if (!isManager && memberVoiceChannelId !== this.config.channelId) {
      await interaction.reply({
        content: 'Ga eerst in het DragonsHosting-radiokanaal om een zender te kiezen.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isPageButton) {
      const direction = interaction.customId.slice(RADIO_PAGE_PREFIX.length);
      const pageCount = Math.max(1, Math.ceil(RADIO_STATIONS.length / STATIONS_PER_PAGE));
      if (direction === 'previous') this.stationPage = Math.max(0, this.stationPage - 1);
      if (direction === 'next') this.stationPage = Math.min(pageCount - 1, this.stationPage + 1);
      await interaction.update(this.buildPanelPayload());
      return;
    }

    const remaining = SWITCH_COOLDOWN_MS - (Date.now() - this.lastSwitchAt);
    if (!isManager && remaining > 0) {
      await interaction.reply({
        content: `Wacht nog ${Math.ceil(remaining / 1000)} seconden voordat je opnieuw wisselt.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isControlButton) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = interaction.customId.slice(RADIO_CONTROL_PREFIX.length);
      const ownMusic = this.stationId === 'dragonsmusic';
      let responseText;

      if (action === 'playpause') {
        const paused = [AudioPlayerStatus.Paused, AudioPlayerStatus.AutoPaused].includes(this.player.state.status);
        if (paused) {
          this.player.unpause();
          responseText = 'De radio speelt weer verder.';
        } else {
          this.player.pause(true);
          responseText = 'De radio is gepauzeerd.';
        }
      } else if (action === 'skip' || action === 'shuffle') {
        if (!ownMusic) {
          responseText = 'Skip en Nieuwe mix zijn alleen beschikbaar voor DragonsMusic.';
        } else {
          if (action === 'shuffle') this.tracks = [];
          this.generation += 1;
          this.currentTrack = null;
          this.stopFfmpeg();
          this.player.stop(true);
          this.scheduleNext(100);
          responseText = action === 'shuffle' ? 'Een nieuwe willekeurige mix wordt gestart.' : 'Het nummer is overgeslagen.';
        }
      } else if (action === 'volume_down' || action === 'volume_up') {
        const difference = action === 'volume_up' ? 0.1 : -0.1;
        this.config.volume = Math.min(1, Math.max(0.05, Number((this.config.volume + difference).toFixed(2))));
        this.currentResource?.volume?.setVolume(this.config.volume);
        this.persistState();
        responseText = `Het radiovolume staat nu op ${Math.round(this.config.volume * 100)}%.`;
      } else if (action === 'reconnect') {
        this.generation += 1;
        this.stopFfmpeg();
        this.player.stop(true);
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
        this.connection = null;
        await this.ensureConnection();
        this.scheduleNext(100);
        responseText = 'De radioverbinding is opnieuw opgebouwd.';
      } else {
        responseText = 'Onbekende radiobediening.';
      }

      this.lastSwitchAt = Date.now();
      await this.refreshPanel();
      await interaction.editReply(responseText);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const station = await this.switchStation(interaction.values[0]);
    await this.refreshPanel();
    await interaction.editReply(`De radio is overgeschakeld naar **${station.name}**.`);
  }

  async switchStation(stationId) {
    const station = RADIO_STATIONS_BY_ID.get(stationId);
    if (!station) throw new Error('Unknown radio station');

    this.lastSwitchAt = Date.now();
    if (station.id === this.stationId) return station;

    this.stationId = station.id;
    this.config.stationId = station.id;
    this.stationPage = Math.max(0, Math.floor(RADIO_STATIONS.findIndex(item => item.id === station.id) / STATIONS_PER_PAGE));
    this.persistState();
    this.generation += 1;
    this.tracks = [];
    this.currentTrack = null;
    this.retryDelay = TRACK_RETRY_MIN_MS;
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    this.stopFfmpeg();
    this.player.stop(true);
    this.scheduleNext(250);
    console.log(`[Radio24x7] Station changed to ${station.name}.`);
    return station;
  }

  validateConfig() {
    const missing = ['channelId', 'server', 'username', 'password'].filter(key => !this.config[key]);
    if (missing.length > 0) {
      throw new Error(`Missing radio config: ${missing.join(', ')}`);
    }
  }

  async resolveChannel() {
    const channel = await this.client.channels.fetch(this.config.channelId);
    if (!channel?.isVoiceBased?.()) {
      throw new Error(`Channel ${this.config.channelId} is not a voice channel`);
    }

    const permissions = channel.permissionsFor(this.client.user);
    const required = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak];
    if (!permissions?.has(required)) {
      throw new Error(`Missing View Channel, Connect or Speak permission in ${channel.name}`);
    }

    return channel;
  }

  async ensureConnection() {
    if (this.stopped) return null;
    if (this.connecting) return this.connecting;

    const currentChannelId = this.client.guilds.cache
      .find(guild => guild.members.me?.voice?.channelId === this.config.channelId)
      ?.members.me?.voice?.channelId;

    if (this.connection?.state?.status === VoiceConnectionStatus.Ready && currentChannelId === this.config.channelId) {
      return this.connection;
    }

    this.connecting = (async () => {
      const channel = await this.resolveChannel();
      const existing = getVoiceConnection(channel.guild.id);
      if (existing && existing !== this.connection) {
        existing.destroy();
      }
      if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection.destroy();
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false
      });

      connection.on('error', error => {
        console.error(`[Radio24x7] Voice connection error: ${error.message}`);
      });
      connection.on(VoiceConnectionStatus.Disconnected, () => {
        this.scheduleReconnect(2_500);
      });
      connection.subscribe(this.player);
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      this.connection = connection;
      console.log(`[Radio24x7] Connected to ${channel.guild.name} / ${channel.name}.`);
      return connection;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  scheduleReconnect(delay) {
    if (this.stopped) return;
    setTimeout(() => {
      this.ensureConnection().catch(error => {
        console.error(`[Radio24x7] Reconnect failed: ${error.message}`);
      });
    }, delay).unref?.();
  }

  async fetchRandomTracks() {
    const url = createApiUrl(this.config, 'getRandomSongs', { size: '50' });
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DragonsHosting-Radio/1.0' },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new Error(`DragonsMusic returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const payload = data['subsonic-response'];
    if (!payload || payload.status !== 'ok') {
      throw new Error(payload?.error?.message || 'DragonsMusic authentication failed');
    }

    const songs = payload.randomSongs?.song || [];
    if (songs.length === 0) {
      throw new Error('DragonsMusic did not return any songs');
    }
    return shuffle(songs.filter(song => song?.id));
  }

  async takeTrack() {
    if (this.tracks.length === 0) {
      this.tracks = await this.fetchRandomTracks();
    }
    return this.tracks.shift();
  }

  createStreamUrl(track) {
    return createApiUrl(this.config, 'stream', {
      id: String(track.id),
      format: 'raw',
      estimateContentLength: 'true'
    });
  }

  async playNext() {
    if (this.stopped || this.loadingTrack || this.player.state.status !== AudioPlayerStatus.Idle) return;
    this.loadingTrack = true;
    const generation = this.generation;

    try {
      await this.ensureConnection();
      const station = this.getSelectedStation();
      const track = station.id === 'dragonsmusic'
        ? await this.takeTrack()
        : { title: station.name, artist: 'Live radio', stationId: station.id };
      const streamUrl = station.id === 'dragonsmusic'
        ? this.createStreamUrl(track)
        : station.streamUrl;

      if (generation !== this.generation) return;
      const ffmpeg = spawn(resolveFfmpeg(), [
        '-hide_banner',
        '-loglevel', 'error',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-re',
        '-i', streamUrl,
        '-vn',
        '-map_metadata', '-1',
        '-ac', '2',
        '-ar', '48000',
        '-acodec', 'pcm_s16le',
        '-f', 's16le',
        'pipe:1'
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      if (generation !== this.generation) {
        ffmpeg.kill('SIGTERM');
        return;
      }

      this.ffmpeg = ffmpeg;
      this.currentTrack = track;
      let stderr = '';
      ffmpeg.stderr.on('data', chunk => {
        if (stderr.length < 2_000) stderr += chunk.toString();
      });
      ffmpeg.once('error', error => {
        console.error(`[Radio24x7] FFmpeg failed to start: ${error.message}`);
      });
      ffmpeg.once('close', (code, signal) => {
        // A station change intentionally closes the previous FFmpeg pipe.
        // Only report failures belonging to the currently active generation.
        if (!this.stopped && generation === this.generation && (code || signal)) {
          const detail = stderr.trim().split('\n').slice(-1)[0] || `code=${code} signal=${signal || 'none'}`;
          console.error(`[Radio24x7] FFmpeg stopped unexpectedly: ${detail}`);
        }
      });

      const resource = createAudioResource(ffmpeg.stdout, {
        inputType: StreamType.Raw,
        metadata: track,
        inlineVolume: true
      });
      resource.volume?.setVolume(this.config.volume);
      this.currentResource = resource;
      this.player.play(resource);
      this.retryDelay = TRACK_RETRY_MIN_MS;

      const title = track.title || 'Onbekend nummer';
      const artist = track.artist || 'Onbekende artiest';
      console.log(`[Radio24x7] Now playing: ${title} - ${artist}`);
    } catch (error) {
      console.error(`[Radio24x7] Could not start track: ${error.message}`);
      this.scheduleNext(this.retryDelay);
      this.retryDelay = Math.min(TRACK_RETRY_MAX_MS, this.retryDelay * 2);
    } finally {
      this.loadingTrack = false;
      if (generation !== this.generation) this.scheduleNext(100);
    }
  }

  scheduleNext(delay) {
    if (this.stopped) return;
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      this.playNext().catch(error => {
        console.error(`[Radio24x7] Playback loop error: ${error.message}`);
      });
    }, delay);
    this.nextTimer.unref?.();
  }

  async runWatchdog() {
    if (this.stopped) return;
    const channel = await this.resolveChannel();
    const actualChannelId = channel.guild.members.me?.voice?.channelId;
    if (actualChannelId !== this.config.channelId || this.connection?.state?.status !== VoiceConnectionStatus.Ready) {
      await this.ensureConnection();
    }
    if (this.player.state.status === AudioPlayerStatus.Idle && !this.loadingTrack && !this.nextTimer) {
      await this.playNext();
    }
  }

  stopFfmpeg() {
    this.currentResource = null;
    if (!this.ffmpeg) return;
    const child = this.ffmpeg;
    this.ffmpeg = null;
    if (!child.killed) child.kill('SIGTERM');
  }

  stop() {
    this.stopped = true;
    if (this.nextTimer) clearTimeout(this.nextTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.stopFfmpeg();
    this.player.stop(true);
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    this.client.removeListener('interactionCreate', this.interactionHandler);
  }
}

async function startRadio24x7(client) {
  if (singleton) return singleton;

  const config = loadConfig();
  if (!config.enabled) {
    console.log('[Radio24x7] Disabled.');
    return null;
  }

  const radio = new Radio24x7(client, config);
  await radio.start();
  singleton = radio;
  return radio;
}

module.exports = {
  RADIO_PANEL_CUSTOM_ID,
  RADIO_STATIONS,
  Radio24x7,
  createApiUrl,
  loadConfig,
  refreshRadioNlCatalog,
  startRadio24x7
};
