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
const pusherEvents = [];
let pusherFailure = false;

function asJson(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parse(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

const db = {
  async get(key) {
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
    return null;
  },
  pipeline() {
    const commands = [];
    const pipeline = {
      get(key) { commands.push(() => db.get(key)); return pipeline; },
      set(key, value) { commands.push(() => db.set(key, value)); return pipeline; },
      sadd(key, value) { commands.push(() => db.sadd(key, value)); return pipeline; },
      zadd(key, value) { commands.push(() => db.zadd(key, value)); return pipeline; },
      async exec() { return Promise.all(commands.map(command => command())); },
    };
    return pipeline;
  },
  async set(key, value) {
    const match = key.match(/^user:([^:]+):group-preferences:([^:]+)$/);
    if (match) preferences.set(match[1] + ":" + match[2], value);
    const groupMatch = key.match(/^group:([^:]+)$/);
    if (groupMatch) groups.set(groupMatch[1], value);
    const communityMatch = key.match(/^community:([^:]+)$/);
    if (communityMatch) communities.set(communityMatch[1], value);
    return "OK";
  },
  async sadd(key, value) {
    const values = sets.get(key) || new Set();
    values.add(value);
    sets.set(key, values);
    return values.size;
  },
  async zadd(key, value) {
    const match = key.match(/^chat:group--([^:]+):messages$/);
    if (match) {
      const rows = pinned.get(match[1]) || [];
      rows.push(value.member);
      pinned.set(match[1], rows);
    }
    return 1;
  },
  async zrange(key) {
    const match = key.match(/^chat:group--([^:]+):messages$/);
    return match ? (pinned.get(match[1]) || []) : [];
  },
  async eval(script, keys, args) {
    if (script.includes('local current = redis.call("GET"')) {
      if (forcedConflicts > 0) { forcedConflicts -= 1; return 0; }
      const groupId = keys[0].slice("group:".length);
      const current = groups.get(groupId);
      if (current !== args[0]) return 0;
      const action = args[1];
      const deleteGroup = args[7] === "true";
      if (deleteGroup) {
        groups.delete(groupId);
        features.delete(groupId);
        pinned.delete(groupId);
        return 1;
      }
      groups.set(groupId, args[2]);
      const removedIds = JSON.parse(args[5]);
      if (removedIds.length && args[6]) {
        const rows = pinned.get(groupId) || [];
        rows.push(args[6]);
        pinned.set(groupId, rows);
      }
      return 1;
    }

    if (script.includes('local raw = redis.call("GET", KEYS[1])')) {
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
        if (selected.some(id => !poll.options.some(option => option.id === id)) || (!poll.multiple && selected.length !== 1)) {
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

    if (script.includes('local rows = redis.call("ZRANGE"')) {
      const groupId = keys[0].replace(/^chat:group--/, "").replace(/:messages$/, "");
      const rows = pinned.get(groupId) || [];
      const index = rows.findIndex(raw => {
        try { return parse(raw).id === args[0]; } catch { return false; }
      });
      if (index < 0) return null;
      const message = parse(rows[index]);
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
      rows[index] = JSON.stringify(message);
      pinned.set(groupId, rows);
      return rows[index];
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
};

const mocks = {
  "@/lib/auth": { authOptions: {} },
  "@/lib/db": { db },
  "@/lib/pusher": { pusherServer },
  "@/lib/utils": { toPusherKey: value => value },
  "next-auth": { getServerSession: async () => session },
  nanoid: { nanoid: () => `test-id-${++idCounter}` },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
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
  pusherFailure = false;
  pusherEvents.length = 0;
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
    owner: { name: "Owner", image: "/owner.png", email: "private-owner@example.test" },
    admin: { name: "Admin", image: "/admin.png", email: "private-admin@example.test" },
    member: { name: "Member", image: "/member.png", email: "private-member@example.test" },
    other: { name: "Other", image: "/other.png", email: "private-other@example.test" },
  })) users.set(id, JSON.stringify(user));
  return group;
}

function setUser(userId, user) { users.set(userId, JSON.stringify({ id: userId, ...user })); }
function setSession(userId, name = "Test user") {
  session = userId ? { user: { id: userId, name } } : null;
}
function setGroup(group, groupId = "g1") { groups.set(groupId, JSON.stringify(group)); }
function getGroup(groupId = "g1") { return parse(groups.get(groupId)); }
function setFeatures(value, groupId = "g1") { features.set(groupId, JSON.stringify(value)); }
function getFeatures(groupId = "g1") { return parse(features.get(groupId)); }
function setMessages(value, groupId = "g1") { pinned.set(groupId, value.map(asJson)); }
function getMessages(groupId = "g1") { return (pinned.get(groupId) || []).map(parse); }
function forceRedisConflicts(count) { forcedConflicts = count; }
function setPusherFailure(enabled) { pusherFailure = enabled; }
function getSetMembers(key) { return Array.from(sets.get(key) || []); }
function requestRaw(body, method = "POST", url = "http://localhost/api/test") {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body });
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
  setMessages, getMessages, forceRedisConflicts, setPusherFailure, getSetMembers, request, requestRaw, body, loadRoute, pusherEvents,
};
