const { URL } = require('url');

let mongoConnectionPromise = null;
let mongoDisabledLogged = false;

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function wantsMongoTranscripts() {
  const storage = String(env('TRANSCRIPT_STORAGE')).trim().toLowerCase();
  return storage === 'mongo' ||
    storage === 'mongodb' ||
    Boolean(env('MONGODB_URI')) ||
    Boolean(env('MONGO_URI'));
}

function getDatabaseName() {
  if (env('MONGO_DATABASE')) return env('MONGO_DATABASE');
  if (env('MONGODB_DATABASE')) return env('MONGODB_DATABASE');

  const uri = env('MONGODB_URI') || env('MONGO_URI');
  if (uri) {
    try {
      const parsed = new URL(uri);
      const dbName = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (dbName) return dbName;
    } catch {}
  }

  return 's3_DragonsHosting';
}

function getCollectionName() {
  return env('MONGO_TRANSCRIPT_COLLECTION', 'transcripts');
}

function buildMongoUri() {
  const directUri = env('MONGODB_URI') || env('MONGO_URI');
  if (directUri) return directUri;

  const host = env('MONGO_HOST') || env('MONGODB_HOST');
  const port = env('MONGO_PORT') || env('MONGODB_PORT') || '27017';
  const database = getDatabaseName();
  const user = env('MONGO_USER') || env('MONGODB_USER');
  const password = env('MONGO_PASSWORD') || env('MONGODB_PASSWORD');
  const authSource = env('MONGO_AUTH_SOURCE') || env('MONGODB_AUTH_SOURCE') || database;

  if (!host) return null;

  const auth = user
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
    : '';

  const query = authSource ? `?authSource=${encodeURIComponent(authSource)}` : '';
  return `mongodb://${auth}${host}:${port}/${encodeURIComponent(database)}${query}`;
}

function requireMongoDriver() {
  try {
    const { MongoClient } = require('mongodb');
    return { type: 'mongodb', MongoClient };
  } catch (mongodbError) {
    try {
      const mongoose = require('mongoose');
      return { type: 'mongoose', mongoose };
    } catch (mongooseError) {
      const err = new Error('MongoDB driver is not installed. Install package "mongodb" or "mongoose", or keep TRANSCRIPT_STORAGE=file.');
      err.cause = mongodbError || mongooseError;
      throw err;
    }
  }
}

async function getMongoConnection() {
  if (!wantsMongoTranscripts()) return null;

  const uri = buildMongoUri();
  if (!uri) {
    if (!mongoDisabledLogged) {
      mongoDisabledLogged = true;
      console.log('[Transcript DB] MongoDB is enabled but MONGO_HOST/MONGODB_URI is missing.');
    }
    return null;
  }

  if (!mongoConnectionPromise) {
    const driver = requireMongoDriver();
    const timeoutMS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000);
    const serverSelectionTimeoutMS = Number.isFinite(timeoutMS) ? timeoutMS : 5000;

    if (driver.type === 'mongodb') {
      const client = new driver.MongoClient(uri, { serverSelectionTimeoutMS });
      mongoConnectionPromise = client.connect().then(() => ({ type: 'mongodb', client }));
    } else {
      mongoConnectionPromise = driver.mongoose
        .connect(uri, { serverSelectionTimeoutMS })
        .then(() => ({ type: 'mongoose', mongoose: driver.mongoose }));
    }
  }

  return mongoConnectionPromise;
}

async function getTranscriptCollection() {
  const connection = await getMongoConnection();
  if (!connection) return null;

  if (connection.type === 'mongodb') {
    return connection.client.db(getDatabaseName()).collection(getCollectionName());
  }

  return connection.mongoose.connection.collection(getCollectionName());
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summarizeTranscript(id, data = {}, url = `/t/${id}`) {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const lastMessage = messages[messages.length - 1];
  const closedAt = data.closedAt || lastMessage?.timestamp || new Date().toISOString();

  return {
    id,
    status: 'closed',
    channelId: data.channelId || null,
    channelName: data.channelName || `ticket-${String(id).slice(0, 6)}`,
    ticketType: data.ticketType || 'Support',
    createdBy: data.createdBy || 'Unknown',
    closedBy: data.closedBy || 'Unknown',
    createdAt: data.createdAt || null,
    closedAt,
    messageCount: messages.length,
    url,
  };
}

async function ensureTranscriptCollections() {
  const collection = await getTranscriptCollection();
  if (!collection) return { enabled: false };

  await collection.createIndex({ id: 1 }, { unique: true, name: 'transcript_id_unique' });
  await collection.createIndex({ guildId: 1, closedAt: -1 }, { name: 'guild_closed_at' });
  await collection.createIndex({ channelId: 1 }, { name: 'channel_id' });
  return { enabled: true, database: getDatabaseName(), collection: getCollectionName() };
}

async function saveTranscriptDocument(id, data, url) {
  const collection = await getTranscriptCollection();
  if (!collection) return { skipped: true };

  const now = new Date();
  const summary = summarizeTranscript(id, data, url);
  const document = {
    _id: id,
    id,
    url,
    guildId: data.guildId || null,
    guildName: data.guildName || null,
    channelId: data.channelId || null,
    channelName: summary.channelName,
    ticketType: summary.ticketType,
    createdBy: summary.createdBy,
    closedBy: summary.closedBy,
    createdAt: toDateOrNull(summary.createdAt),
    closedAt: toDateOrNull(summary.closedAt) || now,
    messageCount: summary.messageCount,
    messages: Array.isArray(data.messages) ? data.messages : [],
    transcript: data,
    createdAtRaw: summary.createdAt || null,
    closedAtRaw: summary.closedAt || now.toISOString(),
    updatedAt: now,
  };

  await collection.updateOne(
    { _id: id },
    {
      $set: document,
      $setOnInsert: { insertedAt: now },
    },
    { upsert: true }
  );

  return { saved: true, id };
}

async function getTranscriptDocument(id) {
  const collection = await getTranscriptCollection();
  if (!collection) return null;

  const document = await collection.findOne({ $or: [{ _id: id }, { id }] });
  if (!document) return null;

  return {
    ...(document.transcript || {}),
    transcriptId: document.id || document._id,
    url: document.url,
    guildName: document.guildName || document.transcript?.guildName,
    channelName: document.channelName || document.transcript?.channelName,
    ticketType: document.ticketType || document.transcript?.ticketType,
    createdBy: document.createdBy || document.transcript?.createdBy,
    closedBy: document.closedBy || document.transcript?.closedBy,
    createdAt: document.createdAtRaw || document.createdAt || document.transcript?.createdAt,
    closedAt: document.closedAtRaw || document.closedAt || document.transcript?.closedAt,
    messages: document.messages || document.transcript?.messages || [],
  };
}

async function listMongoTranscriptSummaries() {
  const collection = await getTranscriptCollection();
  if (!collection) return [];

  const docs = await collection
    .find({}, {
      projection: {
        transcript: 0,
        messages: 0,
      },
    })
    .sort({ closedAt: -1 })
    .limit(Number(process.env.TRANSCRIPT_DASHBOARD_LIMIT || 250))
    .toArray();

  return docs.map(doc => ({
    id: doc.id || doc._id,
    status: 'closed',
    channelId: doc.channelId || null,
    channelName: doc.channelName || `ticket-${String(doc.id || doc._id).slice(0, 6)}`,
    ticketType: doc.ticketType || 'Support',
    createdBy: doc.createdBy || 'Unknown',
    closedBy: doc.closedBy || 'Unknown',
    createdAt: doc.createdAtRaw || doc.createdAt || null,
    closedAt: doc.closedAtRaw || doc.closedAt || null,
    messageCount: doc.messageCount || 0,
    url: doc.url || `/t/${doc.id || doc._id}`,
  }));
}

module.exports = {
  ensureTranscriptCollections,
  getTranscriptDocument,
  listMongoTranscriptSummaries,
  saveTranscriptDocument,
  wantsMongoTranscripts,
};
