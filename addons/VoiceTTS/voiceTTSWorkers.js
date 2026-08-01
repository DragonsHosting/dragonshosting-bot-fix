const https = require('https');
const { Client, Events, GatewayIntentBits } = require('discord.js');

const WORKER_TOKEN_KEYS = [
  ['VOICE_TTS_WORKER_TOKEN_1', 'VOICE_TTS_WORKER_1_TOKEN'],
  ['VOICE_TTS_WORKER_TOKEN_2', 'VOICE_TTS_WORKER_2_TOKEN'],
  ['VOICE_TTS_WORKER_TOKEN_3', 'VOICE_TTS_WORKER_3_TOKEN'],
  ['VOICE_TTS_WORKER_TOKEN_4', 'VOICE_TTS_WORKER_4_TOKEN']
];

let voiceLib = null;
let googleTts = null;
let voiceLoadError = null;
let ttsLoadError = null;
let started = false;
let primaryWorker = null;
const workers = [];

function optionalRequire(name) {
  try {
    return { module: require(name), error: null };
  } catch (err) {
    return { module: null, error: err.message };
  }
}

function loadOptionalAudioPackages() {
  const voice = optionalRequire('@discordjs/voice');
  const tts = optionalRequire('google-tts-api');
  voiceLib = voice.module;
  googleTts = tts.module;
  voiceLoadError = voice.error;
  ttsLoadError = tts.error;
}

function getWorkerTokens() {
  return WORKER_TOKEN_KEYS.map(keys => keys.map(key => process.env[key]).find(Boolean) || null);
}

function createWorker(id, token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  const worker = {
    id,
    tokenConfigured: Boolean(token),
    ready: false,
    client,
    guilds: new Map()
  };

  client.once(Events.ClientReady, () => {
    worker.ready = true;
    console.log(`[VoiceTTS] Worker ${id} logged in as ${client.user.tag}`);
  });

  client.on('error', err => {
    console.log(`[VoiceTTS] Worker ${id} error: ${err.message}`);
  });

  client.login(token).catch(err => {
    worker.ready = false;
    console.log(`[VoiceTTS] Worker ${id} login failed: ${err.message}`);
  });

  return worker;
}

function registerPrimaryWorker(client) {
  if (!client) return;

  if (primaryWorker) {
    primaryWorker.ready = Boolean(client.user);
    primaryWorker.client = client;
    return;
  }

  primaryWorker = {
    id: 'main',
    tokenConfigured: false,
    ready: Boolean(client.user),
    client,
    guilds: new Map(),
    primary: true
  };
}

function getOnlineWorkers(guildId = null) {
  const online = workers.filter(worker => {
    if (!worker.ready) return false;
    if (!guildId) return true;
    return worker.client.guilds.cache.has(guildId);
  });

  if (online.length > 0) return online;
  return primaryWorker?.ready ? [primaryWorker] : [];
}

function startWorkerClients(primaryClient = null) {
  registerPrimaryWorker(primaryClient);
  if (started) return getStatus();
  started = true;
  loadOptionalAudioPackages();

  const tokens = getWorkerTokens();
  tokens.forEach((token, index) => {
    if (!token) return;
    workers.push(createWorker(index + 1, token));
  });

  if (workers.length === 0) {
    console.log('[VoiceTTS] No worker tokens configured. Using the main bot as a single-channel TTS worker.');
  }

  if (!voiceLib) {
    console.log(`[VoiceTTS] Voice playback disabled. Missing @discordjs/voice: ${voiceLoadError}`);
  }

  if (!googleTts) {
    console.log(`[VoiceTTS] TTS audio disabled. Missing google-tts-api: ${ttsLoadError}`);
  }

  return getStatus();
}

function getStatus() {
  const tokens = getWorkerTokens();
  const onlineWorkers = getOnlineWorkers();
  return {
    slots: 4,
    configuredTokens: tokens.filter(Boolean).length,
    onlineWorkers: onlineWorkers.length,
    mainBotFallback: Boolean(primaryWorker?.ready && workers.length === 0),
    voicePackageReady: Boolean(voiceLib),
    ttsPackageReady: Boolean(googleTts),
    missingVoicePackage: voiceLib ? null : voiceLoadError,
    missingTtsPackage: googleTts ? null : ttsLoadError,
    workers: tokens.map((token, index) => {
      const worker = workers.find(item => item.id === index + 1);
      return {
        id: index + 1,
        tokenConfigured: Boolean(token),
        online: Boolean(worker?.ready),
        activeGuildConnections: worker ? worker.guilds.size : 0
      };
    })
  };
}

function getGuildAssignment(worker, guildId) {
  return worker.guilds.get(guildId) || null;
}

function getWorkerForVoice(guildId, voiceChannelId) {
  const online = getOnlineWorkers(guildId);

  for (const worker of online) {
    const assignment = getGuildAssignment(worker, guildId);
    if (assignment?.voiceChannelId === voiceChannelId) return { worker, assignment };
  }

  for (const worker of online) {
    if (!getGuildAssignment(worker, guildId)) return { worker, assignment: null };
  }

  return { worker: null, assignment: null };
}

async function createConnection(worker, guildId, voiceChannelId) {
  if (!voiceLib) throw new Error('Missing @discordjs/voice package.');

  const guild = worker.client.guilds.cache.get(guildId) || await worker.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error(`Worker ${worker.id} is not in guild ${guildId}. Invite this worker bot to the server.`);

  const player = voiceLib.createAudioPlayer({
    behaviors: {
      noSubscriber: voiceLib.NoSubscriberBehavior.Play
    }
  });

  const connection = voiceLib.joinVoiceChannel({
    channelId: voiceChannelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false
  });

  connection.subscribe(player);

  const assignment = {
    voiceChannelId,
    connection,
    player,
    queue: [],
    processing: false,
    sessions: new Set()
  };

  worker.guilds.set(guildId, assignment);
  return assignment;
}

async function assignSession(guild, voiceChannelId, session) {
  startWorkerClients(guild.client);
  const guildId = guild.id;
  const { worker, assignment } = getWorkerForVoice(guildId, voiceChannelId);
  if (!worker) {
    throw new Error('No online Voice TTS worker is available for this guild.');
  }

  let activeAssignment = assignment;
  if (!activeAssignment) {
    activeAssignment = await createConnection(worker, guildId, voiceChannelId);
  }

  activeAssignment.sessions.add(session.userId);
  return { workerId: worker.id, voiceChannelId };
}

function releaseSession(guildId, voiceChannelId, userId) {
  for (const worker of getOnlineWorkers(guildId)) {
    const assignment = getGuildAssignment(worker, guildId);
    if (!assignment || assignment.voiceChannelId !== voiceChannelId) continue;

    assignment.sessions.delete(userId);
    if (assignment.sessions.size === 0) {
      assignment.connection.destroy();
      worker.guilds.delete(guildId);
    }
    return true;
  }
  return false;
}

function fetchStream(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 DragonsHosting-VoiceTTS'
      }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 4) {
        res.resume();
        return resolve(fetchStream(res.headers.location, redirectCount + 1));
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`TTS audio request failed with HTTP ${res.statusCode}`));
      }

      resolve(res);
    });

    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy(new Error('TTS audio request timed out'));
    });
  });
}

async function createTtsResource(text, language) {
  if (!voiceLib) throw new Error('Missing @discordjs/voice package.');
  if (!googleTts) throw new Error('Missing google-tts-api package.');

  const url = googleTts.getAudioUrl(text, {
    lang: language || 'en',
    slow: false,
    host: 'https://translate.google.com'
  });
  const stream = await fetchStream(url);
  return voiceLib.createAudioResource(stream, {
    inputType: voiceLib.StreamType.Arbitrary
  });
}

function playResource(player, resource) {
  return new Promise((resolve, reject) => {
    const onIdle = () => cleanup(resolve);
    const onError = error => cleanup(() => reject(error));
    const cleanup = done => {
      player.off(voiceLib.AudioPlayerStatus.Idle, onIdle);
      player.off('error', onError);
      done();
    };

    player.once(voiceLib.AudioPlayerStatus.Idle, onIdle);
    player.once('error', onError);
    player.play(resource);
  });
}

async function processQueue(assignment) {
  if (assignment.processing) return;
  assignment.processing = true;

  try {
    while (assignment.queue.length > 0) {
      const item = assignment.queue.shift();
      try {
        const resource = await createTtsResource(item.text, item.language);
        await playResource(assignment.player, resource);
      } catch (err) {
        console.log(`[VoiceTTS] Playback failed: ${err.message}`);
        if (item.textChannel?.isTextBased?.()) {
          await item.textChannel.send({
            content: `TTS playback failed: ${err.message}`
          }).then(msg => setTimeout(() => msg.delete().catch(() => null), 9000)).catch(() => null);
        }
      }
    }
  } finally {
    assignment.processing = false;
  }
}

async function speak(guild, voiceChannelId, session, text, options = {}) {
  startWorkerClients(guild.client);

  if (!text || !String(text).trim()) {
    return { ok: false, reason: 'empty' };
  }

  const { worker, assignment } = getWorkerForVoice(guild.id, voiceChannelId);
  if (!worker && !assignment) {
    return { ok: false, reason: 'no_worker', status: getStatus() };
  }

  let activeAssignment = assignment;
  if (!activeAssignment) {
    activeAssignment = await createConnection(worker, guild.id, voiceChannelId);
  }

  activeAssignment.sessions.add(session.userId);
  activeAssignment.queue.push({
    text: String(text).trim(),
    language: options.language || 'en',
    textChannel: options.textChannel || null
  });
  processQueue(activeAssignment).catch(err => console.log(`[VoiceTTS] Queue failed: ${err.message}`));

  return { ok: true };
}

module.exports = {
  assignSession,
  getStatus,
  releaseSession,
  speak,
  startWorkerClients
};
