const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DB_DIR = path.join(__dirname, '..', '..', 'data', 'localdb');
const modelCache = new Map();
const writeQueues = new Map();
let installed = false;
let localMode = false;
let originalModel = null;
let originalConnect = null;
let originalSet = null;

function clone(value) {
  if (value == null) return value;
  return reviveDates(JSON.parse(JSON.stringify(value)));
}

function reviveDates(value) {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) value[key] = reviveDates(child);
    return value;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return value;
}

function sanitizeName(name) {
  return String(name || 'collection').replace(/[^a-z0-9_.-]/gi, '_');
}

function collectionFile(collectionName) {
  return path.join(DB_DIR, `${sanitizeName(collectionName)}.json`);
}

function ensureDbDir() {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function readCollection(collectionName) {
  ensureDbDir();
  const file = collectionFile(collectionName);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return reviveDates(parsed && typeof parsed === 'object' ? parsed : {});
  } catch {
    const backup = `${file}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(file, backup); } catch {}
    return {};
  }
}

async function withCollectionLock(collectionName, work) {
  const previous = writeQueues.get(collectionName) || Promise.resolve();
  const next = previous.then(work, work);
  writeQueues.set(collectionName, next.catch(() => {}));
  return next;
}

async function writeCollection(collectionName, data) {
  ensureDbDir();
  const file = collectionFile(collectionName);
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, file);
}

function getByPath(obj, pathName) {
  if (!pathName) return obj;
  return String(pathName).split('.').reduce((current, part) => current == null ? undefined : current[part], obj);
}

function setByPath(obj, pathName, value) {
  const parts = String(pathName).split('.');
  let current = obj;
  while (parts.length > 1) {
    const part = parts.shift();
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts[0]] = value;
}

function unsetByPath(obj, pathName) {
  const parts = String(pathName).split('.');
  let current = obj;
  while (parts.length > 1) {
    current = current?.[parts.shift()];
    if (!current) return;
  }
  delete current[parts[0]];
}

function isOperatorObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).some((key) => key.startsWith('$'));
}

function normalizeComparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }
  return value;
}

function equalValues(actual, expected) {
  if (actual instanceof Date || expected instanceof Date) return normalizeComparable(actual) === normalizeComparable(expected);
  if (actual && typeof actual === 'object' && expected && typeof expected === 'object') return JSON.stringify(actual) === JSON.stringify(expected);
  return actual === expected;
}

function valueMatches(actual, expected) {
  if (isOperatorObject(expected)) {
    if ('$in' in expected) return Array.isArray(expected.$in) && expected.$in.some((item) => equalValues(actual, item));
    if ('$nin' in expected) return Array.isArray(expected.$nin) && !expected.$nin.some((item) => equalValues(actual, item));
    if ('$ne' in expected) return !equalValues(actual, expected.$ne);
    if ('$exists' in expected) return expected.$exists ? actual !== undefined : actual === undefined;
    if ('$regex' in expected) {
      const flags = expected.$options || '';
      const regex = expected.$regex instanceof RegExp ? expected.$regex : new RegExp(String(expected.$regex), flags);
      return regex.test(String(actual || ''));
    }
    const actualComparable = normalizeComparable(actual);
    if ('$gt' in expected && !(actualComparable > normalizeComparable(expected.$gt))) return false;
    if ('$gte' in expected && !(actualComparable >= normalizeComparable(expected.$gte))) return false;
    if ('$lt' in expected && !(actualComparable < normalizeComparable(expected.$lt))) return false;
    if ('$lte' in expected && !(actualComparable <= normalizeComparable(expected.$lte))) return false;
    return true;
  }
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (Array.isArray(actual)) return actual.some((item) => valueMatches(item, expected));
  return equalValues(actual, expected);
}

function matchesQuery(doc, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => {
    if (key === '$or') return Array.isArray(expected) && expected.some((part) => matchesQuery(doc, part));
    if (key === '$and') return Array.isArray(expected) && expected.every((part) => matchesQuery(doc, part));
    return valueMatches(getByPath(doc, key), expected);
  });
}

function buildKey(data = {}) {
  if (data._key) return String(data._key);
  if (data._id) return String(data._id);
  if (data.id) return String(data.id);
  if (data.key) return String(data.key);
  if (data.guildId && data.userId) return `${data.guildId}:${data.userId}`;
  if (data.guildID) return String(data.guildID);
  if (data.guildId && data.channelId) return `${data.guildId}:${data.channelId}`;
  if (data.guildId && data.messageId) return `${data.guildId}:${data.messageId}`;
  if (data.guildId && data.name) return `${data.guildId}:${data.name}`;
  if (data.userId) return String(data.userId);
  if (data.uniqueId) return String(data.uniqueId);
  if (data.ticketId != null) return String(data.ticketId);
  if (data.giveawayId) return String(data.giveawayId);
  if (data.reminderId) return String(data.reminderId);
  if (data.backupId) return String(data.backupId);
  if (data.channelId) return String(data.channelId);
  if (data.messageId) return String(data.messageId);
  if (data.name) return String(data.name);
  if (data.guildId) return String(data.guildId);
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function defaultForSchemaType(schemaType) {
  if (!schemaType) return undefined;
  let value;
  if (schemaType.defaultValue !== undefined) {
    value = typeof schemaType.defaultValue === 'function' ? schemaType.defaultValue.call({}) : schemaType.defaultValue;
  } else if (schemaType.instance === 'Array') {
    value = [];
  } else {
    return undefined;
  }
  if (schemaType.instance === 'Date' && typeof value === 'number') value = new Date(value);
  return clone(value);
}

function applyDefaults(schema, doc) {
  const next = clone(doc || {});
  if (!next._id) next._id = buildKey(next);
  if (schema && typeof schema.eachPath === 'function') {
    schema.eachPath((pathName, schemaType) => {
      if (pathName === '_id' || pathName === '__v') return;
      if (getByPath(next, pathName) !== undefined) return;
      const value = defaultForSchemaType(schemaType);
      if (value !== undefined) setByPath(next, pathName, value);
    });
  }
  return next;
}

function normalizeUpdate(update = {}, inserting = false) {
  const hasOperator = Object.keys(update || {}).some((key) => key.startsWith('$'));
  if (!hasOperator) return clone(update || {});
  const patch = {};
  if (update.$set) Object.assign(patch, clone(update.$set));
  if (inserting && update.$setOnInsert) Object.assign(patch, clone(update.$setOnInsert));
  return patch;
}

function applyUpdate(doc, update = {}, inserting = false) {
  const next = clone(doc || {});
  const hasOperator = Object.keys(update || {}).some((key) => key.startsWith('$'));
  if (!hasOperator) {
    Object.assign(next, clone(update || {}));
    return next;
  }
  for (const [key, value] of Object.entries(update.$set || {})) setByPath(next, key, clone(value));
  if (inserting) {
    for (const [key, value] of Object.entries(update.$setOnInsert || {})) {
      if (getByPath(next, key) === undefined) setByPath(next, key, clone(value));
    }
  }
  for (const [key, value] of Object.entries(update.$inc || {})) setByPath(next, key, Number(getByPath(next, key) || 0) + Number(value));
  for (const [key] of Object.entries(update.$unset || {})) unsetByPath(next, key);
  for (const [key, value] of Object.entries(update.$push || {})) {
    const arr = Array.isArray(getByPath(next, key)) ? getByPath(next, key) : [];
    if (value && typeof value === 'object' && Array.isArray(value.$each)) arr.push(...clone(value.$each));
    else arr.push(clone(value));
    setByPath(next, key, arr);
  }
  for (const [key, value] of Object.entries(update.$addToSet || {})) {
    const arr = Array.isArray(getByPath(next, key)) ? getByPath(next, key) : [];
    const values = value && typeof value === 'object' && Array.isArray(value.$each) ? value.$each : [value];
    for (const item of values) if (!arr.some((existing) => equalValues(existing, item))) arr.push(clone(item));
    setByPath(next, key, arr);
  }
  for (const [key, value] of Object.entries(update.$pull || {})) {
    const arr = Array.isArray(getByPath(next, key)) ? getByPath(next, key) : [];
    setByPath(next, key, arr.filter((item) => !(valueMatches(item, value) || (value && typeof value === 'object' && matchesQuery(item, value)))));
  }
  return next;
}

function sortDocs(docs, spec) {
  const entries = typeof spec === 'string'
    ? spec.split(/\s+/).filter(Boolean).map((field) => [field.replace(/^-/, ''), field.startsWith('-') ? -1 : 1])
    : Object.entries(spec || {});
  return [...docs].sort((a, b) => {
    for (const [field, direction] of entries) {
      const dir = Number(direction) < 0 ? -1 : 1;
      const av = normalizeComparable(getByPath(a, field));
      const bv = normalizeComparable(getByPath(b, field));
      if (av == null && bv != null) return -1 * dir;
      if (av != null && bv == null) return 1 * dir;
      if (av > bv) return 1 * dir;
      if (av < bv) return -1 * dir;
    }
    return 0;
  });
}

function project(doc, fields) {
  if (!fields) return doc;
  const names = Array.isArray(fields) ? fields : String(fields).split(/\s+/).filter(Boolean);
  if (!names.length) return doc;
  const include = names.filter((name) => !name.startsWith('-'));
  const exclude = names.filter((name) => name.startsWith('-')).map((name) => name.slice(1));
  if (include.length) {
    const out = {};
    for (const name of include) {
      const value = getByPath(doc, name);
      if (value !== undefined) setByPath(out, name, value);
    }
    if (doc._id !== undefined && out._id === undefined) out._id = doc._id;
    return out;
  }
  const out = clone(doc);
  for (const name of exclude) unsetByPath(out, name);
  return out;
}

function evaluateExpression(doc, expr) {
  if (typeof expr === 'string' && expr.startsWith('$')) return getByPath(doc, expr.slice(1));
  if (Array.isArray(expr)) return expr.map((item) => evaluateExpression(doc, item));
  if (!expr || typeof expr !== 'object') return expr;
  if ('$ifNull' in expr) {
    const values = expr.$ifNull || [];
    const first = evaluateExpression(doc, values[0]);
    return first == null ? evaluateExpression(doc, values[1]) : first;
  }
  if ('$size' in expr) {
    const value = evaluateExpression(doc, expr.$size);
    return Array.isArray(value) ? value.length : 0;
  }
  if ('$add' in expr) return (expr.$add || []).reduce((sum, item) => sum + Number(evaluateExpression(doc, item) || 0), 0);
  const out = {};
  for (const [key, value] of Object.entries(expr)) out[key] = evaluateExpression(doc, value);
  return out;
}

function aggregateDocs(docs, pipeline = []) {
  let result = docs.map(clone);
  for (const stage of pipeline || []) {
    if (stage.$match) result = result.filter((doc) => matchesQuery(doc, stage.$match));
    else if (stage.$sort) result = sortDocs(result, stage.$sort);
    else if (stage.$skip) result = result.slice(Number(stage.$skip));
    else if (stage.$limit) result = result.slice(0, Number(stage.$limit));
    else if (stage.$project) {
      result = result.map((doc) => {
        const out = {};
        for (const [key, expr] of Object.entries(stage.$project)) {
          if (expr === 0 || expr === false) continue;
          if (expr === 1 || expr === true) out[key] = getByPath(doc, key);
          else out[key] = evaluateExpression(doc, expr);
        }
        return out;
      });
    } else if (stage.$group) {
      const groups = new Map();
      for (const doc of result) {
        const rawId = evaluateExpression(doc, stage.$group._id);
        const idKey = JSON.stringify(rawId);
        if (!groups.has(idKey)) groups.set(idKey, { _id: rawId });
        const group = groups.get(idKey);
        for (const [field, expr] of Object.entries(stage.$group)) {
          if (field === '_id') continue;
          if (expr && typeof expr === 'object' && '$sum' in expr) {
            group[field] = Number(group[field] || 0) + Number(evaluateExpression(doc, expr.$sum) || 0);
          }
        }
      }
      result = Array.from(groups.values());
    } else if (stage.$unwind) {
      const field = String(stage.$unwind.path || stage.$unwind).replace(/^\$/, '');
      const unwound = [];
      for (const doc of result) {
        const arr = getByPath(doc, field);
        if (Array.isArray(arr) && arr.length) {
          for (const item of arr) {
            const copy = clone(doc);
            setByPath(copy, field, item);
            unwound.push(copy);
          }
        } else if (stage.$unwind.preserveNullAndEmptyArrays) {
          unwound.push(doc);
        }
      }
      result = unwound;
    }
  }
  return result;
}

class CompatQuery {
  constructor(executor, ModelClass) {
    this.executor = executor;
    this.ModelClass = ModelClass;
    this.selection = null;
    this.sortSpec = null;
    this.limitCount = null;
    this.skipCount = 0;
    this.leanMode = false;
  }
  select(fields) { this.selection = fields; return this; }
  lean(value = true) { this.leanMode = value !== false; return this; }
  sort(spec) { this.sortSpec = spec; return this; }
  limit(count) { this.limitCount = Number(count); return this; }
  skip(count) { this.skipCount = Number(count); return this; }
  populate() { return this; }
  allowDiskUse() { return this; }
  async exec() {
    let result = await this.executor();
    if (Array.isArray(result)) {
      if (this.sortSpec) result = sortDocs(result, this.sortSpec);
      if (this.skipCount) result = result.slice(this.skipCount);
      if (this.limitCount != null) result = result.slice(0, this.limitCount);
      return result.map((doc) => this.format(doc));
    }
    return result ? this.format(result) : null;
  }
  format(doc) {
    const selected = project(clone(doc), this.selection);
    return this.leanMode ? selected : new this.ModelClass(selected, true);
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
  finally(handler) { return this.exec().finally(handler); }
}

function runKnownPreSave(modelName, doc) {
  if (modelName === 'WordSeek') doc.lastActivity = new Date();
  if (modelName === 'CustomCommand') doc.updatedAt = new Date();
  if (modelName === 'UserSettings') doc.updatedAt = new Date();
  if (modelName === 'UserData') {
    if (Array.isArray(doc.transactionLogs) && doc.transactionLogs.length > 100) doc.transactionLogs = doc.transactionLogs.slice(-100);
    if (Array.isArray(doc.messages) && doc.messages.length > 50) doc.messages = doc.messages.slice(-50);
    if (Array.isArray(doc.warnings) && doc.warnings.length > 50) doc.warnings = doc.warnings.slice(-50);
    if (Array.isArray(doc.tempBans) && doc.tempBans.length > 20) doc.tempBans = doc.tempBans.filter((ban) => !ban.lifted).slice(-20);
  }
}

function indexName(spec = {}, options = {}) {
  if (options?.name) return String(options.name);
  const parts = Object.entries(spec || {}).map(([key, value]) => `${key}_${value}`);
  return parts.length ? parts.join('_') : 'local_index';
}

function makeLocalCollection(collectionName) {
  return {
    name: collectionName,
    collectionName,
    namespace: collectionName,
    async createIndex(spec = {}, options = {}) {
      return indexName(spec, options);
    },
    async createIndexes(indexes = []) {
      return indexes.map((item) => indexName(item.key || item, item.options || {}));
    },
    async dropIndex() {
      return { acknowledged: true, ok: 1 };
    },
    async indexes() {
      return [];
    },
    listIndexes() {
      return { toArray: async () => [] };
    },
    find(query = {}) {
      const docs = Object.values(readCollection(collectionName)).filter((doc) => matchesQuery(doc, query));
      return { toArray: async () => clone(docs) };
    },
    async findOne(query = {}) {
      const doc = Object.values(readCollection(collectionName)).find((item) => matchesQuery(item, query));
      return doc ? clone(doc) : null;
    },
    async insertOne(doc = {}) {
      const data = clone(doc);
      data._id = data._id || buildKey(data);
      await withCollectionLock(collectionName, async () => {
        const collection = readCollection(collectionName);
        collection[buildKey(data)] = data;
        await writeCollection(collectionName, collection);
      });
      return { acknowledged: true, insertedId: data._id };
    },
    async insertMany(docs = []) {
      const insertedIds = {};
      for (const [index, doc] of docs.entries()) {
        const result = await this.insertOne(doc);
        insertedIds[index] = result.insertedId;
      }
      return { acknowledged: true, insertedCount: docs.length, insertedIds };
    },
    async deleteOne(query = {}) {
      const Model = makeModel(collectionName, null);
      return Model.deleteOne(query);
    },
    async deleteMany(query = {}) {
      const Model = makeModel(collectionName, null);
      return Model.deleteMany(query);
    },
    async countDocuments(query = {}) {
      return Object.values(readCollection(collectionName)).filter((doc) => matchesQuery(doc, query)).length;
    },
  };
}

function makeModel(modelName, schema) {
  if (modelCache.has(modelName)) return modelCache.get(modelName);
  const collectionName = modelName;
  class LocalModel {
    constructor(data = {}, fromDb = false) {
      Object.assign(this, applyDefaults(schema, data));
      if (!this._id) this._id = buildKey(this);
      Object.defineProperty(this, '__isLocalModel', { value: true, enumerable: false });
      Object.defineProperty(this, '__fromDb', { value: fromDb, enumerable: false, writable: true });
    }
    static get modelName() { return modelName; }
    static get collection() { return makeLocalCollection(collectionName); }
    static async createIndex(spec = {}, options = {}) { return this.collection.createIndex(spec, options); }
    static async createIndexes() { return []; }
    static async syncIndexes() { return []; }
    static async ensureIndexes() { return []; }
    static async create(data = {}) {
      if (Array.isArray(data)) return Promise.all(data.map((item) => this.create(item)));
      const doc = new this(data);
      await doc.save();
      return doc;
    }
    static find(query = {}) {
      return new CompatQuery(async () => Object.values(readCollection(collectionName)).filter((doc) => matchesQuery(doc, query)), this);
    }
    static findOne(query = {}) {
      return new CompatQuery(async () => Object.values(readCollection(collectionName)).find((doc) => matchesQuery(doc, query)) || null, this);
    }
    static findById(id) { return this.findOne({ _id: String(id) }); }
    static async findOneAndUpdate(query = {}, update = {}, options = {}) {
      return withCollectionLock(collectionName, async () => {
        const collection = readCollection(collectionName);
        const docs = Object.values(collection);
        const existing = docs.find((doc) => matchesQuery(doc, query));
        if (!existing && !options.upsert) return null;
        const base = existing || { ...clone(query), ...normalizeUpdate(update, true) };
        const next = applyDefaults(schema, applyUpdate(base, update, !existing));
        next._id = next._id || buildKey(next);
        runKnownPreSave(modelName, next);
        collection[buildKey(existing || next)] = next;
        await writeCollection(collectionName, collection);
        return options.lean ? clone(next) : new this(next, true);
      });
    }
    static async findByIdAndUpdate(id, update = {}, options = {}) { return this.findOneAndUpdate({ _id: String(id) }, update, options); }
    static async findOneAndDelete(query = {}, options = {}) {
      return withCollectionLock(collectionName, async () => {
        const collection = readCollection(collectionName);
        const doc = Object.values(collection).find((item) => matchesQuery(item, query));
        if (!doc) return null;
        delete collection[buildKey(doc)];
        await writeCollection(collectionName, collection);
        return options.lean ? clone(doc) : new this(doc, true);
      });
    }
    static async findByIdAndDelete(id, options = {}) { return this.findOneAndDelete({ _id: String(id) }, options); }
    static async updateOne(query = {}, update = {}, options = {}) {
      const before = await this.findOne(query).lean();
      const updated = await this.findOneAndUpdate(query, update, { ...options, lean: true });
      return { acknowledged: true, matchedCount: before ? 1 : 0, modifiedCount: updated ? 1 : 0, upsertedCount: !before && updated ? 1 : 0 };
    }
    static async updateMany(query = {}, update = {}) {
      return withCollectionLock(collectionName, async () => {
        const collection = readCollection(collectionName);
        let count = 0;
        for (const [key, doc] of Object.entries(collection)) {
          if (!matchesQuery(doc, query)) continue;
          const next = applyDefaults(schema, applyUpdate(doc, update, false));
          runKnownPreSave(modelName, next);
          collection[key] = next;
          count++;
        }
        await writeCollection(collectionName, collection);
        return { acknowledged: true, matchedCount: count, modifiedCount: count };
      });
    }
    static async deleteOne(query = {}) {
      const deleted = await this.findOneAndDelete(query, { lean: true });
      return { acknowledged: true, deletedCount: deleted ? 1 : 0 };
    }
    static async deleteMany(query = {}) {
      return withCollectionLock(collectionName, async () => {
        const collection = readCollection(collectionName);
        let count = 0;
        for (const [key, doc] of Object.entries(collection)) {
          if (matchesQuery(doc, query)) { delete collection[key]; count++; }
        }
        await writeCollection(collectionName, collection);
        return { acknowledged: true, deletedCount: count };
      });
    }
    static async countDocuments(query = {}) { return Object.values(readCollection(collectionName)).filter((doc) => matchesQuery(doc, query)).length; }
    static async estimatedDocumentCount() { return Object.values(readCollection(collectionName)).length; }
    static async exists(query = {}) {
      const doc = Object.values(readCollection(collectionName)).find((item) => matchesQuery(item, query));
      return doc ? { _id: doc._id || buildKey(doc) } : null;
    }
    static async aggregate(pipeline = []) { return aggregateDocs(Object.values(readCollection(collectionName)), pipeline); }
    static async insertMany(items = []) { return Promise.all(items.map((item) => this.create(item))); }
    static async bulkWrite(operations = []) {
      let modified = 0;
      let inserted = 0;
      let deleted = 0;
      for (const operation of operations) {
        if (operation.updateOne) {
          const res = await this.updateOne(operation.updateOne.filter, operation.updateOne.update, { upsert: operation.updateOne.upsert });
          modified += res.modifiedCount || 0;
          inserted += res.upsertedCount || 0;
        } else if (operation.deleteOne) {
          const res = await this.deleteOne(operation.deleteOne.filter);
          deleted += res.deletedCount || 0;
        } else if (operation.insertOne) {
          await this.create(operation.insertOne.document);
          inserted++;
        }
      }
      return { acknowledged: true, modifiedCount: modified, insertedCount: inserted, deletedCount: deleted };
    }
    async save() {
      const data = applyDefaults(schema, { ...this });
      runKnownPreSave(modelName, data);
      await withCollectionLock(collectionName, async () => {
        const collection = readCollection(collectionName);
        data._id = data._id || buildKey(data);
        collection[buildKey(data)] = data;
        await writeCollection(collectionName, collection);
      });
      Object.assign(this, data);
      return this;
    }
    async deleteOne() { return this.constructor.deleteOne({ _id: this._id }); }
    toJSON() { return clone({ ...this }); }
    toObject() { return clone({ ...this }); }
  }
  modelCache.set(modelName, LocalModel);
  mongoose.models[modelName] = LocalModel;
  return LocalModel;
}

function install(options = {}) {
  if (installed) return mongoose;
  installed = true;
  localMode = options.force !== false;
  originalModel = mongoose.model.bind(mongoose);
  originalConnect = mongoose.connect.bind(mongoose);
  originalSet = mongoose.set.bind(mongoose);

  mongoose.model = function patchedModel(name, schema, collection, opts) {
    if (localMode) {
      if (!schema) {
        if (modelCache.has(name)) return modelCache.get(name);
        return originalModel(name, schema, collection, opts);
      }
      return makeModel(name, schema);
    }
    return originalModel(name, schema, collection, opts);
  };

  mongoose.connect = async function patchedConnect(uri, options) {
    if (localMode || String(uri || '').startsWith('local://')) {
      localMode = true;
      ensureDbDir();
      mongoose.__localDatabase = true;
      try { Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true }); } catch {}
      mongoose.connection.collection = function localConnectionCollection(name) {
        return makeLocalCollection(name);
      };
      process.nextTick(() => mongoose.connection.emit?.('connected'));
      return mongoose;
    }
    return originalConnect(uri, options);
  };

  mongoose.set = function patchedSet(key, value) {
    try { return originalSet(key, value); } catch { return mongoose; }
  };

  mongoose.connection.collection = function localConnectionCollection(name) {
    return makeLocalCollection(name);
  };
  mongoose.__localDatabase = true;
  return mongoose;
}

module.exports = { install, makeModel, DB_DIR };

