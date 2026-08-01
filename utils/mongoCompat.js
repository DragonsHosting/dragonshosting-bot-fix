const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data', 'localdb');

function ensureDbDir() {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function collectionFile(name) {
  return path.join(DB_DIR, `${String(name || 'collection').replace(/[^a-z0-9_.-]/gi, '_')}.json`);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readCollection(name) {
  ensureDbDir();
  const file = collectionFile(name);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCollection(name, data) {
  ensureDbDir();
  const file = collectionFile(name);
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, file);
}

function getByPath(obj, key) {
  return String(key).split('.').reduce((current, part) => current == null ? undefined : current[part], obj);
}

function setByPath(obj, key, value) {
  const parts = String(key).split('.');
  let current = obj;
  while (parts.length > 1) {
    const part = parts.shift();
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[0]] = value;
}

function valueMatches(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$in' in expected) return Array.isArray(expected.$in) && expected.$in.includes(actual);
    if ('$ne' in expected) return actual !== expected.$ne;
  }
  return actual === expected;
}

function matchesQuery(doc, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => valueMatches(getByPath(doc, key), expected));
}

function buildId(data = {}) {
  return String(
    data._id ||
    data.id ||
    data.ticketId ||
    data.userId ||
    data.guildId ||
    `${Date.now()}:${Math.random().toString(36).slice(2)}`
  );
}

function applyUpdate(doc, update = {}) {
  const next = clone(doc || {});
  const hasOperator = Object.keys(update || {}).some(key => key.startsWith('$'));
  if (!hasOperator) return { ...next, ...clone(update) };

  for (const [key, value] of Object.entries(update.$set || {})) setByPath(next, key, clone(value));
  for (const [key, value] of Object.entries(update.$inc || {})) setByPath(next, key, Number(getByPath(next, key) || 0) + Number(value));
  for (const [key, value] of Object.entries(update.$push || {})) {
    const current = Array.isArray(getByPath(next, key)) ? getByPath(next, key) : [];
    current.push(clone(value));
    setByPath(next, key, current);
  }
  return next;
}

function makeQuery(executor) {
  return {
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    populate() { return this; },
    lean() { return this; },
    exec: executor,
    then(resolve, reject) { return executor().then(resolve, reject); },
    catch(reject) { return executor().catch(reject); },
  };
}

function makeModel(name) {
  return class CompatModel {
    constructor(data = {}) {
      Object.assign(this, clone(data));
      this._id = this._id || buildId(this);
    }

    static find(query = {}) {
      return makeQuery(async () => Object.values(readCollection(name)).filter(doc => matchesQuery(doc, query)).map(clone));
    }

    static findOne(query = {}) {
      return makeQuery(async () => clone(Object.values(readCollection(name)).find(doc => matchesQuery(doc, query)) || null));
    }

    static async create(data = {}) {
      const doc = new this(data);
      await doc.save();
      return doc;
    }

    static async updateOne(query = {}, update = {}, options = {}) {
      const collection = readCollection(name);
      const entry = Object.entries(collection).find(([, doc]) => matchesQuery(doc, query));
      if (!entry && !options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

      const key = entry?.[0] || buildId({ ...query, ...update.$set });
      const current = entry?.[1] || query;
      collection[key] = applyUpdate(current, update);
      collection[key]._id = collection[key]._id || key;
      writeCollection(name, collection);
      return { acknowledged: true, matchedCount: entry ? 1 : 0, modifiedCount: 1, upsertedCount: entry ? 0 : 1 };
    }

    static async deleteOne(query = {}) {
      const collection = readCollection(name);
      const entry = Object.entries(collection).find(([, doc]) => matchesQuery(doc, query));
      if (entry) {
        delete collection[entry[0]];
        writeCollection(name, collection);
      }
      return { acknowledged: true, deletedCount: entry ? 1 : 0 };
    }

    async save() {
      const collection = readCollection(name);
      this._id = this._id || buildId(this);
      collection[buildId(this)] = clone(this);
      writeCollection(name, collection);
      return this;
    }

    toJSON() {
      return clone({ ...this });
    }
  };
}

module.exports = { makeModel, DB_DIR };
