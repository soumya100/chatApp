const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

let session = null;
let idCounter = 0;
let forcedConflicts = 0;
const groups = new Map();
const users = new Map();
const features = new Map();
const pinned = new Map();
const preferences = new Map();
const communities = new Map();
const sets = new Map();
const hashes = new Map();
const kv = new Map();
const zsets = new Map();
// Redis-compatible key TTL registry (key -> expiry in epoch ms). The harness
// honors the same EXPIRE/SETEX/SET-clears-TTL semantics as real Redis so
// retention behavior is exercised, not silently ignored.
const ttl = new Map();
const pusherEvents = [];
const pusherAuthCalls = [];
const blobCalls = [];
const uploadConfigs = [];
let pusherFailure = false;
let blobFailure = false;

function asJson(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parse(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function zsetRows(key) {
  return (zsets.get(key) || []).slice().sort((a, b) => a.score - b.score);
}

function readRaw(key) {
  sweep(key);
  const groupMatch = key.match(/^group:([^:]+)$/);
  if (groupMatch) return groups.get(groupMatch[1]) ?? null;
  const userMatch = key.match(/^user:([^:]+)$/);
  if (userMatch) return users.get(userMatch[1]) ?? null;
  const featureMatch = key.match(/^group:([^:]+):features$/);
  if (featureMatch) return features.get(featureMatch[1]) ?? null;
  const preferenceMatch = key.match(/^user:([^:]+):group-preferences:([^:]+)$/);
  if (preferenceMatch) return preferences.get(preferenceMatch[1] + ":" + preferenceMatch[2]) ?? null;
  const communityMatch = key.match(/^community:([^:]+)$/);
  if (communityMatch) return communities.get(communityMatch[1]) ?? null;
  return kv.get(key) ?? null;
}

function writeRaw(key, value) {
  ttl.delete(key); // an overwrite clears any previously set TTL, like Redis SET
  const groupMatch = key.match(/^group:([^:]+)$/);
  if (groupMatch) { groups.set(groupMatch[1], value); return; }
  const userMatch = key.match(/^user:([^:]+)$/);
  if (userMatch) { users.set(userMatch[1], value); return; }
  const preferenceMatch = key.match(/^user:([^:]+):group-preferences:([^:]+)$/);
  if (preferenceMatch) { preferences.set(preferenceMatch[1] + ":" + preferenceMatch[2], value); return; }
  const communityMatch = key.match(/^community:([^:]+)$/);
  if (communityMatch) { communities.set(communityMatch[1], value); return; }
  kv.set(key, value);
}

function deleteRaw(key) {
  groups.delete(key.slice("group:".length));
  users.delete(key.slice("user:".length));
  communities.delete(key.slice("community:".length));
  kv.delete(key);
  zsets.delete(key);
  sets.delete(key);
  hashes.delete(key);
  ttl.delete(key);
}

// Removes a key from whichever typed store holds it. Redis keys share one
// keyspace regardless of type, so an expiry deletes the whole key.
function purgeKeyEverywhere(key) {
  const featureMatch = key.match(/^group:([^:]+):features$/);
  if (featureMatch) { features.delete(featureMatch[1]); return; }
  const preferenceMatch = key.match(/^user:([^:]+):group-preferences:([^:]+)$/);
  if (preferenceMatch) { preferences.delete(preferenceMatch[1] + ":" + preferenceMatch[2]); return; }
  const groupMatch = key.match(/^group:([^:]+)$/);
  if (groupMatch) { groups.delete(groupMatch[1]); return; }
  const userMatch = key.match(/^user:([^:]+)$/);
  if (userMatch) { users.delete(userMatch[1]); return; }
  const communityMatch = key.match(/^community:([^:]+)$/);
  if (communityMatch) { communities.delete(communityMatch[1]); return; }
  kv.delete(key);
  zsets.delete(key);
  sets.delete(key);
  hashes.delete(key);
}

// Lazily expires a key on first access, mirroring Redis's passive expiry.
function sweep(key) {
  const expiresAt = ttl.get(key);
  if (expiresAt === undefined) return;
  if (Date.now() >= expiresAt) {
    ttl.delete(key);
    purgeKeyEverywhere(key);
  }
}

function keyExists(key) {
  sweep(key);
  if (readRaw(key) !== null) return true;
  return sets.has(key) || zsets.has(key) || hashes.has(key);
}

// Redis EXPIRE semantics: the key must exist (return 0 otherwise) and a
// non-positive TTL deletes the key immediately.
function applyExpire(key, seconds) {
  if (!keyExists(key)) return 0;
  const window = Number(seconds);
  if (!Number.isFinite(window) || window <= 0) {
    ttl.delete(key);
    purgeKeyEverywhere(key);
    return 1;
  }
  ttl.set(key, Date.now() + window * 1000);
  return 1;
}

function sadd(key, value) {
  sweep(key);
  const values = sets.get(key) || new Set();
  values.add(value);
  sets.set(key, values);
  return values.size;
}

function srem(key, value) {
  sweep(key);
  const values = sets.get(key);
  if (!values) return 0;
  const had = values.delete(value);
  return had ? 1 : 0;
}

function sismember(key, value) {
  sweep(key);
  return (sets.get(key) || new Set()).has(value) ? 1 : 0;
}

function smembers(key) {
  sweep(key);
  return Array.from(sets.get(key) || []);
}

function hashFields(key) {
  sweep(key);
  return hashes.get(key) || {};
}

// ZADD stores {score, member}; members are serialized JSON rows or plain strings.
// Real Redis updates the score when the member already exists - no duplicates.
function zadd(key, value) {
  sweep(key);
  const rows = zsets.get(key) || [];
  const member = typeof value.member === "string" ? value.member : JSON.stringify(value.member);
  const existing = rows.find(row => row.member === member);
  if (existing) { existing.score = Number(value.score); return 0; }
  rows.push({ score: Number(value.score), member });
  zsets.set(key, rows);
  return 1;
}

function zrem(key, member) {
  sweep(key);
  const rows = zsets.get(key) || [];
  const next = rows.filter(row => row.member !== member);
  zsets.set(key, next);
  return rows.length - next.length;
}

function zremrangebyscore(key, min, max) {
  sweep(key);
  const rows = zsets.get(key) || [];
  const kept = rows.filter(row => !(row.score >= min && row.score <= max));
  zsets.set(key, kept);
  return rows.length - kept.length;
}

function zcard(key) {
  sweep(key);
  return (zsets.get(key) || []).length;
}

function zscore(key, member) {
  sweep(key);
  const row = (zsets.get(key) || []).find(row => row.member === member);
  return row ? row.score : null;
}

function parseBound(bound, fallback) {
  if (bound === undefined) return fallback;
  if (bound === "-inf") return -Infinity;
  if (bound === "+inf") return Infinity;
  if (typeof bound === "number") return bound;
  if (typeof bound === "string") {
    if (bound === "-inf") return -Infinity;
    if (bound === "+inf") return Infinity;
    if (bound.startsWith("(")) return { value: Number(bound.slice(1)), exclusive: true };
    return Number(bound);
  }
  return Number(bound);
}

// Supports the three ZRANGE shapes the app uses:
//   zrange(key, 0, -1)                        -> all members, score ascending
//   zrange(key, -limit, -1)                   -> rank slice (latest N)
//   zrange(key, "(x", "-inf", {byScore, rev, offset, count}) -> score window
function zrange(key, start, end, options) {
  sweep(key);
  const rows = zsetRows(key);
  if (options && options.byScore) {
    // Redis BYSCORE REV semantics: with rev=true the start argument is the
    // upper bound and the end argument is the lower bound.
    const minToken = options.rev ? end : start;
    const maxToken = options.rev ? start : end;
    const min = parseBound(minToken, -Infinity);
    const max = parseBound(maxToken, Infinity);
    const inRange = rows.filter(row => {
      const minOk = typeof min === "object" ? row.score > min.value : row.score >= min;
      const maxOk = typeof max === "object" ? row.score < max.value : row.score <= max;
      return minOk && maxOk;
    });
    const ordered = options.rev ? inRange.slice().reverse() : inRange;
    const offset = options.offset || 0;
    const count = options.count === undefined ? ordered.length : options.count;
    return ordered.slice(offset, offset + count).map(row => row.member);
  }
  const len = rows.length;
  let from = start < 0 ? Math.max(0, len + start) : start;
  let to = end < 0 ? len + end : Math.min(end, len - 1);
  if (len === 0 || from > to) return [];
  return rows.slice(from, to + 1).map(row => row.member);
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp("^" + escaped + "$");
}

// Lua script fingerprints the harness can be handed. They are hoisted into
// constants so the eval dispatch conditions contain no operator-bearing
// string literals (static analysis reads `local raw = redis.call(...)` inside
// an `if (...)` as an assignment-in-condition).
const LUA_FEATURES_SCRIPT_MARKER = 'local raw = redis.call("GET", KEYS[1])';
const LUA_GROUP_CAS_SCRIPT_MARKER = 'local current = redis.call("GET"';

// Optional race-window hook: invoked at the start of every scripted commit so
// a test can mutate Redis state between the route's read phase and the atomic
// commit, simulating a concurrent writer without forced CAS conflicts.
let scriptRaceHook = null;

// Locates a message row by id while keeping malformed rows observable: a
// corrupt stored row is counted and reported instead of being silently
// skipped by an invisible catch.
let skippedMalformedMessageRows = 0;
function findMessageRowIndex(rows, messageId) {
  let malformed = 0;
  const index = rows.findIndex(row => {
    try {
      return parse(row.member).id === messageId;
    } catch {
      malformed += 1;
      return false;
    }
  });
  if (malformed > 0) {
    skippedMalformedMessageRows += malformed;
    console.warn(`Harness skipped ${malformed} malformed message row(s) while locating a message`);
  }
  return index;
}

function isInvalidPollSelection(poll, optionIds) {
  const unknownOption = optionIds.some(id => !poll.options.some(option => option.id === id));
  return unknownOption || (!poll.multiple && optionIds.length !== 1);
}

const db = {
  async get(key) {
    return readRaw(key);
  },
  async set(key, value) {
    writeRaw(key, value);
    return "OK";
  },
  async del(key) {
    return deleteRaw(key), 1;
  },
  async keys(pattern) {
    const regexp = globToRegExp(pattern);
    const all = new Set();
    for (const id of groups.keys()) all.add(`group:${id}`);
    for (const id of users.keys()) all.add(`user:${id}`);
    for (const id of communities.keys()) all.add(`community:${id}`);
    for (const id of features.keys()) all.add(`group:${id}:features`);
    for (const key of kv.keys()) all.add(key);
    for (const key of zsets.keys()) all.add(key);
    for (const key of sets.keys()) all.add(key);
    for (const key of hashes.keys()) all.add(key);
    for (const key of ttl.keys()) all.add(key);
    return Array.from(all).filter(key => {
      sweep(key); // expired keys are invisible to KEYS, like real Redis
      return keyExists(key) && regexp.test(key);
    });
  },
  pipeline() {
    const commands = [];
    const pipeline = {
      get(key) { commands.push(() => db.get(key)); return pipeline; },
      set(key, value) { commands.push(() => db.set(key, value)); return pipeline; },
      del(key) { commands.push(() => db.del(key)); return pipeline; },
      sadd(key, value) { commands.push(() => sadd(key, value)); return pipeline; },
      srem(key, value) { commands.push(() => srem(key, value)); return pipeline; },
      sismember(key, value) { commands.push(() => sismember(key, value)); return pipeline; },
      zadd(key, value) { commands.push(() => zadd(key, value)); return pipeline; },
      zrem(key, member) { commands.push(() => zrem(key, member)); return pipeline; },
      zremrangebyscore(key, min, max) { commands.push(() => zremrangebyscore(key, min, max)); return pipeline; },
      zcard(key) { commands.push(() => zcard(key)); return pipeline; },
      expire(key, seconds) { commands.push(() => applyExpire(key, seconds)); return pipeline; },
      setex(key, seconds, value) { commands.push(() => { writeRaw(key, value); applyExpire(key, seconds); return "OK"; }); return pipeline; },
      hincrby(key, field, delta) { commands.push(() => db.hincrby(key, field, delta)); return pipeline; },
      async exec() { return Promise.all(commands.map(command => command())); },
    };
    return pipeline;
  },
  async sadd(key, value) { return sadd(key, value); },
  async srem(key, value) { return srem(key, value); },
  async sismember(key, value) { return sismember(key, value); },
  async smembers(key) { return smembers(key); },
  async hincrby(key, field, delta) {
    const fields = hashFields(key);
    const next = (Number(fields[field]) || 0) + Number(delta);
    fields[field] = next;
    hashes.set(key, fields);
    return next;
  },
  async hdel(key, field) {
    const fields = hashFields(key);
    const had = field in fields;
    delete fields[field];
    hashes.set(key, fields);
    return had ? 1 : 0;
  },
  async hgetall(key) {
    return { ...hashFields(key) };
  },
  async expire(key, seconds) { return applyExpire(key, seconds); },
  async setex(key, seconds, value) { writeRaw(key, value); applyExpire(key, seconds); return "OK"; },
  async ttl(key) {
    if (!keyExists(key)) return -2;
    const expiresAt = ttl.get(key);
    if (expiresAt === undefined) return -1;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  },
  async zadd(key, value) { return zadd(key, value); },
  async zrem(key, member) { return zrem(key, member); },
  async zremrangebyscore(key, min, max) { return zremrangebyscore(key, min, max); },
  async zcard(key) { return zcard(key); },
  async zscore(key, member) { return zscore(key, member); },
  async zrange(key, start, end, options) { return zrange(key, start, end, options); },
  async eval(script, keys, args) {
    if (scriptRaceHook) scriptRaceHook(script, keys, args);
    if (script.includes(LUA_FEATURES_SCRIPT_MARKER)) {
      const groupId = keys[0].slice("group:".length, -":features".length);
      const userId = args[0];
      const action = args[1];
      const payload = JSON.parse(args[2]);
      const state = parse(features.get(groupId)) || { polls: [], events: [], announcements: [] };
      state.polls ||= [];
      state.events ||= [];
      state.announcements ||= [];
      let result;

      if (action === "createPoll") {
        state.polls.unshift(payload);
        state.polls = state.polls.slice(0, 100);
        result = payload;
      } else if (action === "votePoll") {
        const poll = state.polls.find(item => item.id === payload.pollId);
        if (!poll || poll.closed) return JSON.stringify({ error: "Poll is unavailable" });
        const selected = [...new Set(payload.optionIds)];
        if (isInvalidPollSelection(poll, selected)) {
          return JSON.stringify({ error: "Invalid poll selection" });
        }
        for (const option of poll.options) {
          option.votes = (option.votes || []).filter(id => id !== userId);
          if (selected.includes(option.id)) option.votes.push(userId);
        }
        result = poll;
      } else if (action === "createEvent") {
        state.events.unshift(payload);
        state.events = state.events.slice(0, 100);
        result = payload;
      } else if (action === "respondEvent") {
        const event = state.events.find(item => item.id === payload.eventId);
        if (!event) return JSON.stringify({ error: "Event not found" });
        event.responses ||= { going: [], maybe: [], "not-going": [] };
        for (const status of ["going", "maybe", "not-going"]) {
          event.responses[status] = (event.responses[status] || []).filter(id => id !== userId);
        }
        event.responses[payload.response].push(userId);
        result = event;
      } else if (action === "announce") {
        state.announcements.unshift(payload);
        state.announcements = state.announcements.slice(0, 100);
        result = payload;
      } else {
        return JSON.stringify({ error: "Unsupported action" });
      }

      features.set(groupId, JSON.stringify(state));
      return JSON.stringify({ features: state, result });
    }

    // Community mutations use a generic CAS + operations list script.
    if (script.includes('"casSet"')) {
      if (forcedConflicts > 0) { forcedConflicts -= 1; return 0; }
      const [expectedRaw, nextValue, operationsJson] = args;
      const operations = JSON.parse(operationsJson);
      if (readRaw(keys[0]) !== expectedRaw) return 0;
      for (const operation of operations) {
        if (operation.type === "casSet" && readRaw(keys[operation.keyIndex - 1]) !== operation.expected) return 0;
      }
      if (nextValue === "__DELETE__") deleteRaw(keys[0]); else writeRaw(keys[0], nextValue);
      for (const operation of operations) {
        if (operation.type === "casSet" || operation.type === "set") writeRaw(keys[operation.keyIndex - 1], operation.value);
        else if (operation.type === "del") deleteRaw(keys[operation.keyIndex - 1]);
        else if (operation.type === "sadd") sadd(keys[operation.keyIndex - 1], operation.value);
        else if (operation.type === "srem") srem(keys[operation.keyIndex - 1], operation.value);
      }
      return 1;
    }

    if (script.includes("Message text cannot be empty")) {
      const rows = zsets.get(keys[0]) || [];
      const index = findMessageRowIndex(rows, args[0]);
      if (index < 0) return JSON.stringify({ error: "Message not found" });
      const message = parse(rows[index].member);
      if (message.senderId === "system" || message.isDeleted) return JSON.stringify({ error: "Message cannot be edited" });
      if (message.senderId !== args[1]) return JSON.stringify({ error: "Forbidden" });
      if (!message.mediaUrl && args[2].trim().length === 0) return JSON.stringify({ error: "Message text cannot be empty" });
      message.text = args[2];
      message.isEdited = true;
      rows[index] = { score: rows[index].score, member: JSON.stringify(message) };
      zsets.set(keys[0], rows);
      return JSON.stringify({ message });
    }

    if (script.includes("This message was deleted")) {
      const rows = zsets.get(keys[0]) || [];
      const index = findMessageRowIndex(rows, args[0]);
      if (index < 0) return JSON.stringify({ error: "Message not found" });
      const message = parse(rows[index].member);
      if (message.senderId === "system" || message.isDeleted) return JSON.stringify({ error: "Message cannot be deleted" });
      if (message.senderId !== args[1]) return JSON.stringify({ error: "Forbidden" });
      message.text = "This message was deleted";
      message.isDeleted = true;
      delete message.mediaUrl;
      delete message.mediaType;
      delete message.fileName;
      delete message.fileSize;
      delete message.duration;
      delete message.senderImg;
      rows[index] = { score: rows[index].score, member: JSON.stringify(message) };
      zsets.set(keys[0], rows);
      return JSON.stringify({ message });
    }

    if (script.includes("Message cannot be reacted to")) {
      const rows = zsets.get(keys[0]) || [];
      const index = findMessageRowIndex(rows, args[0]);
      if (index < 0) return JSON.stringify({ error: "Message not found" });
      const message = parse(rows[index].member);
      if (message.senderId === "system" || message.isDeleted) return JSON.stringify({ error: "Message cannot be reacted to" });
      const reactions = message.reactions || {};
      const users2 = reactions[args[1]] || [];
      const found = users2.includes(args[2]);
      const nextUsers = found ? users2.filter(id => id !== args[2]) : [...users2, args[2]];
      if (nextUsers.length === 0) delete reactions[args[1]]; else reactions[args[1]] = nextUsers;
      message.reactions = reactions;
      rows[index] = { score: rows[index].score, member: JSON.stringify(message) };
      zsets.set(keys[0], rows);
      return JSON.stringify({ message, reactions });
    }

    if (script.includes("Message cannot be pinned")) {
      const rows = zsets.get(keys[0]) || [];
      const index = findMessageRowIndex(rows, args[0]);
      if (index < 0) return null;
      const message = parse(rows[index].member);
      if (message.senderId === "system" || message.isDeleted) {
        return JSON.stringify({ error: "Message cannot be pinned" });
      }
      const shouldPin = args[1] === "true";
      message.isPinned = shouldPin;
      if (shouldPin) {
        message.pinnedAt = Number(args[2]);
        message.pinnedBy = args[3];
      } else {
        delete message.pinnedAt;
        delete message.pinnedBy;
      }
      rows[index] = { score: rows[index].score, member: JSON.stringify(message) };
      zsets.set(keys[0], rows);
      return rows[index].member;
    }

    if (script.includes(LUA_GROUP_CAS_SCRIPT_MARKER)) {
      if (forcedConflicts > 0) { forcedConflicts -= 1; return 0; }
      const groupId = keys[0].slice("group:".length);
      const current = groups.get(groupId);
      if (current !== args[0]) return 0;
      const action = args[1];
      if (action === "addMembers") {
        // The community document is compare-and-set checked inside the same
        // script (ARGV[12] carries the raw value the route read). A concurrent
        // community update makes the script return 2 so the route retries on
        // freshly read documents instead of dropping the concurrent change.
        if (args[8] && readRaw(args[8]) !== args[11]) return 2;
        groups.set(groupId, args[2]);
        const addedIds = JSON.parse(args[5]);
        for (const memberId of addedIds) {
          sadd(`group:${groupId}:members`, memberId);
          sadd(`user:${memberId}:groups`, groupId);
        }
        if (args[6]) {
          const message = parse(args[6]);
          const rows = zsets.get(keys[2]) || [];
          rows.push({ score: message.timestamp, member: args[6] });
          zsets.set(keys[2], rows);
        }
        if (args[8]) writeRaw(args[8], args[9]);
        for (const memberId of addedIds) sadd(`user:${memberId}:communities`, args[10]);
        return 1;
      }
      const deleteGroup = args[7] === "true";
      if (deleteGroup) {
        groups.delete(groupId);
        features.delete(groupId);
        zsets.delete(`chat:group--${groupId}:messages`);
        return 1;
      }
      groups.set(groupId, args[2]);
      const removedIds = JSON.parse(args[5]);
      if (removedIds.length && args[6]) {
        const messagesKey = keys[3];
        const rows = zsets.get(messagesKey) || [];
        rows.push({ score: 1234, member: args[6] });
        zsets.set(messagesKey, rows);
      }
      return 1;
    }
    throw new Error("Unexpected Redis script supplied to test harness");
  },
};

const pusherServer = {
  async trigger(channel, event, payload) {
    if (pusherFailure) throw new Error("Pusher is unavailable in this test");
    pusherEvents.push({ channel, event, payload });
    return [];
  },
  authorizeChannel(socketId, channelName, presenceData) {
    pusherAuthCalls.push({ socketId, channelName, presenceData });
    return { auth: `test:${socketId}:${channelName}`, socket_id: socketId, channel_name: channelName };
  },
};

const blob = {
  async del(url) {
    blobCalls.push(url);
    if (blobFailure) throw new Error("Blob storage is unavailable in this test");
    return {};
  },
};

const blobClient = {
  async handleUpload({ body, request, onBeforeGenerateToken }) {
    if (!body || typeof body !== "object" || !body.type) {
      throw new Error("Invalid upload payload");
    }
    const config = await onBeforeGenerateToken();
    uploadConfigs.push(config);
    return { type: body.type, token: "test-upload-token", ...config };
  },
};

const fetchRedisMock = async (command, ...args) => {
  if (command === "get") return readRaw(args[0]);
  if (command === "smembers") return smembers(args[0]);
  if (command === "sismember") return sismember(args[0], args[1]);
  throw new Error(`fetchRedis command ${command} is not mocked in the test harness`);
};

const mocks = {
  "@/lib/auth": { authOptions: {} },
  "@/lib/db": { db },
  "./db": { db },
  "@/lib/pusher": { pusherServer },
  "@/lib/utils": { toPusherKey: value => value },
  "@/helpers/redis": { fetchRedis: fetchRedisMock },
  "next-auth": { getServerSession: async () => session },
  "next-auth/jwt": { getToken: async () => null },
  "@vercel/blob": blob,
  "@vercel/blob/client": blobClient,
  nanoid: { nanoid: () => `test-id-${++idCounter}` },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (typeof request === "string") {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    // Resolve the app's "@/..." path alias to real source files so routes run
    // against the actual validators/helpers instead of mocked copies.
    if (request.startsWith("@/")) {
      return originalLoad.call(this, path.join(root, "src", request.slice(2)), parent, isMain);
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

const originalTsLoader = require.extensions[".ts"];
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const root = path.resolve(__dirname, "../..");
function loadRoute(relativePath) {
  return require(path.join(root, relativePath));
}

function reset(overrides = {}) {
  session = overrides.session === undefined ? { user: { id: "owner", name: "Owner" } } : overrides.session;
  idCounter = 0;
  forcedConflicts = 0;
  groups.clear();
  users.clear();
  features.clear();
  pinned.clear();
  preferences.clear();
  communities.clear();
  sets.clear();
  hashes.clear();
  kv.clear();
  zsets.clear();
  ttl.clear();
  skippedMalformedMessageRows = 0;
  scriptRaceHook = null;
  pusherFailure = false;
  blobFailure = false;
  pusherEvents.length = 0;
  pusherAuthCalls.length = 0;
  blobCalls.length = 0;
  uploadConfigs.length = 0;
  const group = {
    id: "g1",
    name: "Project room",
    description: "A test group",
    image: "",
    creatorId: "owner",
    memberIds: ["owner", "admin", "member", "other"],
    adminIds: ["owner", "admin"],
    settings: {},
    ...overrides.group,
  };
  if (overrides.group !== null) groups.set("g1", JSON.stringify(group));
  for (const [id, user] of Object.entries({
    owner: { id: "owner", name: "Owner", image: "/owner.png", email: "private-owner@example.test" },
    admin: { id: "admin", name: "Admin", image: "/admin.png", email: "private-admin@example.test" },
    member: { id: "member", name: "Member", image: "/member.png", email: "private-member@example.test" },
    other: { id: "other", name: "Other", image: "/other.png", email: "private-other@example.test" },
  })) users.set(id, JSON.stringify(user));
  return group;
}

function setUser(userId, user) { users.set(userId, JSON.stringify({ id: userId, ...user })); }
function setSession(userId, name = "Test user", extra = {}) {
  session = userId ? { user: { id: userId, name, ...extra } } : null;
}
function setGroup(group, groupId = "g1") { groups.set(groupId, JSON.stringify(group)); }
function getGroup(groupId = "g1") { return parse(groups.get(groupId)); }
function setFeatures(value, groupId = "g1") { features.set(groupId, JSON.stringify(value)); }
function getFeatures(groupId = "g1") { return parse(features.get(groupId)); }
function setMessages(value, groupId = "g1") {
  zsets.set(`chat:group--${groupId}:messages`, value.map(message => ({ score: Number(message.timestamp) || 0, member: asJson(message) })));
}
function getMessages(groupId = "g1") {
  return (zsets.get(`chat:group--${groupId}:messages`) || []).map(row => parse(row.member));
}
function setDirectMessages(value, userA = "owner", userB = "member") {
  const chatId = `${userA}--${userB}`;
  zsets.set(`chat:${chatId}:messages`, value.map(message => ({ score: Number(message.timestamp) || 0, member: asJson(message) })));
  return chatId;
}
function getDirectMessages(userA = "owner", userB = "member") {
  return (zsets.get(`chat:${userA}--${userB}:messages`) || []).map(row => parse(row.member));
}
function seedSet(key, values) { sets.set(key, new Set(values)); }
function seedZsetEntry(key, score, member) {
  const rows = zsets.get(key) || [];
  rows.push({ score: Number(score), member: typeof member === "string" ? member : JSON.stringify(member) });
  zsets.set(key, rows);
}
function seedKv(key, value, options = {}) { 
  writeRaw(key, typeof value === "string" ? value : JSON.stringify(value));
  if (options.ttlSeconds !== undefined) applyExpire(key, options.ttlSeconds);
}
function getKv(key) { return readRaw(key); }
function seedHash(key, fields) { hashes.set(key, { ...fields }); }
function getHash(key) { return { ...hashFields(key) }; }
function getZset(key) { return (zsets.get(key) || []).map(row => ({ score: row.score, value: parse(row.member) })); }
function forceRedisConflicts(count) { forcedConflicts = count; }
function setScriptRaceHook(hook) { scriptRaceHook = typeof hook === "function" ? hook : null; }
function setPusherFailure(enabled) { pusherFailure = enabled; }
function setBlobFailure(enabled) { blobFailure = enabled; }
function getSetMembers(key) { return Array.from(sets.get(key) || []); }
function requestRaw(body, method = "POST", url = "http://localhost/api/test", headers = {}) {
  return new Request(url, { method, headers: { "content-type": "application/json", ...headers }, body });
}
function request(body, method = "POST", url = "http://localhost/api/test") {
  return new Request(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function body(response) { return response.json(); }

module.exports = {
  reset, setUser, setSession, setGroup, getGroup, setFeatures, getFeatures,
  setMessages, getMessages, setDirectMessages, getDirectMessages, seedSet, seedZsetEntry, seedKv,
  seedHash, getKv, getHash, getZset, forceRedisConflicts, setScriptRaceHook, setPusherFailure, setBlobFailure,
  blobCalls, uploadConfigs, pusherAuthCalls, getSetMembers, request, requestRaw, body, loadRoute, pusherEvents,
  db,
};
