const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const enabled = Boolean(process.env.REDIS_HOST || process.env.REDIS_URL);
const host = process.env.REDIS_HOST || "127.0.0.1";
const port = process.env.REDIS_PORT || "6379";

function redis(args) {
  const result = spawnSync("redis-cli", ["--raw", "-h", host, "-p", port, ...args], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "redis-cli failed");
  return result.stdout.trim();
}

function lua(relativePath, constantName) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const match = source.match(new RegExp("const\\s+" + constantName + "\\s*=\\s*\\x60([\\s\\S]*?)\\x60"));
  assert.ok(match, "Could not find Lua constant " + constantName + " in " + relativePath);
  return match[1];
}

function evalLua(script, keys, args) {
  return redis(["EVAL", script, String(keys.length), ...keys, ...args]);
}

test("Redis Lua integration: group mutation checks CAS and atomically updates member indexes", { skip: !enabled }, () => {
  const script = lua("src/app/api/group/[groupId]/manage/route.ts", "atomicGroupMutation");
  redis(["FLUSHDB"]);

  const groupKey = "group:g1";
  const memberSet = "group:g1:members";
  const actorGroups = "user:owner:groups";
  const messages = "chat:group--g1:messages";
  const features = "group:g1:features";
  const removedUserGroups = "user:member:groups";
  const before = JSON.stringify({ id: "g1", memberIds: ["owner", "member"], adminIds: ["owner"] });
  const after = JSON.stringify({ id: "g1", memberIds: ["owner"], adminIds: ["owner"] });
  const event = JSON.stringify({ id: "removed", timestamp: 1234, senderId: "system", text: "Removed" });

  redis(["SET", groupKey, before]);
  redis(["SADD", memberSet, "owner", "member"]);
  redis(["SADD", actorGroups, "g1"]);
  redis(["SADD", removedUserGroups, "g1"]);
  redis(["SET", features, "{}"]);

  const stale = evalLua(script, [groupKey, memberSet, actorGroups, messages, features, removedUserGroups],
    [JSON.stringify({ old: true }), "remove", after, "owner", "g1", '["member"]', event, "false"]);
  assert.equal(stale, "0", "stale writers must not commit");

  const committed = evalLua(script, [groupKey, memberSet, actorGroups, messages, features, removedUserGroups],
    [before, "remove", after, "owner", "g1", '["member"]', event, "false"]);
  assert.equal(committed, "1");
  assert.equal(redis(["GET", groupKey]), after);
  assert.equal(redis(["SISMEMBER", memberSet, "member"]), "0");
  assert.equal(redis(["SISMEMBER", removedUserGroups, "g1"]), "0");
  assert.notEqual(redis(["ZSCORE", messages, event]), "");
});

test("Redis Lua integration: final-member deletion removes group, feature, message and user indexes", { skip: !enabled }, () => {
  const script = lua("src/app/api/group/[groupId]/manage/route.ts", "atomicGroupMutation");
  redis(["FLUSHDB"]);
  const groupKey = "group:g-empty";
  const members = "group:g-empty:members";
  const userGroups = "user:owner:groups";
  const messages = "chat:group--g-empty:messages";
  const features = "group:g-empty:features";

  redis(["SET", groupKey, '{"id":"g-empty","memberIds":["owner"]}']);
  redis(["SADD", members, "owner"]);
  redis(["SADD", userGroups, "g-empty"]);
  redis(["SET", features, '{"polls":[]}']);
  redis(["ZADD", messages, "1", '{"id":"m1"}']);

  const result = evalLua(script, [groupKey, members, userGroups, messages, features],
    ['{"id":"g-empty","memberIds":["owner"]}', "leave", "", "owner", "g-empty", '["owner"]', "", "true"]);
  assert.equal(result, "1");
  assert.equal(redis(["EXISTS", groupKey]), "0");
  assert.equal(redis(["EXISTS", members]), "0");
  assert.equal(redis(["EXISTS", features]), "0");
  assert.equal(redis(["EXISTS", messages]), "0");
  assert.equal(redis(["SISMEMBER", userGroups, "g-empty"]), "0");
});

test("Redis Lua integration: poll voting atomically replaces a prior choice and rejects invalid options", { skip: !enabled }, () => {
  const script = lua("src/app/api/group/[groupId]/features/route.ts", "atomicFeatureUpdate");
  redis(["FLUSHDB"]);
  const key = "group:g1:features";
  const initial = {
    polls: [{ id: "p1", closed: false, multiple: false, options: [
      { id: "a", votes: ["member"] }, { id: "b", votes: [] }
    ] }],
    events: [],
    announcements: []
  };
  redis(["SET", key, JSON.stringify(initial)]);

  const vote = evalLua(script, [key], ["member", "votePoll", '{"pollId":"p1","optionIds":["b","b"]}']);
  const parsed = JSON.parse(vote);
  assert.deepEqual(parsed.result.options.map(option => option.votes), [[], ["member"]]);

  const unchanged = redis(["GET", key]);
  const invalid = JSON.parse(evalLua(script, [key], ["outsider", "votePoll", '{"pollId":"p1","optionIds":["not-an-option"]}']));
  assert.equal(invalid.error, "Invalid poll selection");
  assert.equal(redis(["GET", key]), unchanged, "invalid vote must not mutate stored feature data");
});

test("Redis Lua integration: pinning rejects system/deleted messages and updates valid sorted-set entries", { skip: !enabled }, () => {
  const script = lua("src/app/api/group/[groupId]/pin/route.ts", "atomicPinUpdate");
  redis(["FLUSHDB"]);
  const key = "chat:group--g1:messages";
  const normal = JSON.stringify({ id: "m1", senderId: "member", timestamp: 42, text: "hello" });
  const system = JSON.stringify({ id: "sys", senderId: "system", timestamp: 43, text: "join" });
  const deleted = JSON.stringify({ id: "gone", senderId: "member", timestamp: 44, isDeleted: true, text: "gone" });
  redis(["ZADD", key, "42", normal, "43", system, "44", deleted]);

  const pinned = JSON.parse(evalLua(script, [key], ["m1", "true", "100", "owner"]));
  assert.equal(pinned.isPinned, true);
  assert.equal(pinned.pinnedAt, 100);
  assert.equal(pinned.pinnedBy, "owner");

  const systemResult = JSON.parse(evalLua(script, [key], ["sys", "true", "101", "owner"]));
  const deletedResult = JSON.parse(evalLua(script, [key], ["gone", "true", "102", "owner"]));
  assert.equal(systemResult.error, "Message cannot be pinned");
  assert.equal(deletedResult.error, "Message cannot be pinned");

  const unpinned = JSON.parse(evalLua(script, [key], ["m1", "false", "103", "owner"]));
  assert.equal(unpinned.isPinned, false);
  assert.equal(unpinned.pinnedAt, undefined);
});
