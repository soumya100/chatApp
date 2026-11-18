// NOTE: these integration suites share one disposable Redis database and call
// FLUSHDB per test, so they must never execute concurrently with each other.
// `yarn test:redis` therefore runs node --test with --test-concurrency=1.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
// These integration tests use FLUSHDB, so they only run against an explicitly
// opted-in disposable Redis instance. Never point this at shared/production Redis.
const enabled = Boolean(process.env.REDIS_HOST && process.env.REDIS_INTEGRATION_ALLOW_FLUSHDB === "1");
const host = process.env.REDIS_HOST || "127.0.0.1";
const port = process.env.REDIS_PORT || "6379";

// redis-cli replacement: a minimal in-repo RESP2 client (tests/helpers/
// resp-redis-client.cjs) so the suite needs no OS-provided redis-tools.
const { callRedis } = require("./helpers/resp-redis-client.cjs");

function redis(args) {
  return callRedis(host, Number(port), args, 10_000);
}

function lua(relativePath, constantName) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const match = source.match(new RegExp("const\\s+" + constantName + "\\s*=\\s*\\x60([\\s\\S]*?)\\x60"));
  assert.ok(match, "Could not find Lua constant " + constantName + " in " + relativePath);
  return match[1];
}

async function evalLua(script, keys, args) {
  return await redis(["EVAL", script, String(keys.length), ...keys, ...args]);
}

test("Redis Lua integration: group mutation checks CAS and atomically updates member indexes", { skip: !enabled }, async () => {
  const script = lua("src/app/api/group/[groupId]/manage/route.ts", "atomicGroupMutation");
  await redis(["FLUSHDB"]);

  const groupKey = "group:g1";
  const memberSet = "group:g1:members";
  const actorGroups = "user:owner:groups";
  const messages = "chat:group--g1:messages";
  const features = "group:g1:features";
  const removedUserGroups = "user:member:groups";
  const before = JSON.stringify({ id: "g1", memberIds: ["owner", "member"], adminIds: ["owner"] });
  const after = JSON.stringify({ id: "g1", memberIds: ["owner"], adminIds: ["owner"] });
  const event = JSON.stringify({ id: "removed", timestamp: 1234, senderId: "system", text: "Removed" });

  await redis(["SET", groupKey, before]);
  await redis(["SADD", memberSet, "owner", "member"]);
  await redis(["SADD", actorGroups, "g1"]);
  await redis(["SADD", removedUserGroups, "g1"]);
  await redis(["SET", features, "{}"]);

  const stale = await evalLua(script, [groupKey, memberSet, actorGroups, messages, features, removedUserGroups],
    [JSON.stringify({ old: true }), "remove", after, "owner", "g1", '["member"]', event, "false"]);
  assert.equal(stale, "0", "stale writers must not commit");

  const committed = await evalLua(script, [groupKey, memberSet, actorGroups, messages, features, removedUserGroups],
    [before, "remove", after, "owner", "g1", '["member"]', event, "false"]);
  assert.equal(committed, "1");
  assert.equal(await redis(["GET", groupKey]), after);
  assert.equal(await redis(["SISMEMBER", memberSet, "member"]), "0");
  assert.equal(await redis(["SISMEMBER", removedUserGroups, "g1"]), "0");
  assert.notEqual(await redis(["ZSCORE", messages, event]), "");
});

test("Redis Lua integration: final-member deletion removes group, feature, message and user indexes", { skip: !enabled }, async () => {
  const script = lua("src/app/api/group/[groupId]/manage/route.ts", "atomicGroupMutation");
  await redis(["FLUSHDB"]);
  const groupKey = "group:g-empty";
  const members = "group:g-empty:members";
  const userGroups = "user:owner:groups";
  const messages = "chat:group--g-empty:messages";
  const features = "group:g-empty:features";

  await redis(["SET", groupKey, '{"id":"g-empty","memberIds":["owner"]}']);
  await redis(["SADD", members, "owner"]);
  await redis(["SADD", userGroups, "g-empty"]);
  await redis(["SET", features, '{"polls":[]}']);
  await redis(["ZADD", messages, "1", '{"id":"m1"}']);

  const result = await evalLua(script, [groupKey, members, userGroups, messages, features],
    ['{"id":"g-empty","memberIds":["owner"]}', "leave", "", "owner", "g-empty", '["owner"]', "", "true"]);
  assert.equal(result, "1");
  assert.equal(await redis(["EXISTS", groupKey]), "0");
  assert.equal(await redis(["EXISTS", members]), "0");
  assert.equal(await redis(["EXISTS", features]), "0");
  assert.equal(await redis(["EXISTS", messages]), "0");
  assert.equal(await redis(["SISMEMBER", userGroups, "g-empty"]), "0");
});

test("Redis Lua integration: poll voting atomically replaces a prior choice and rejects invalid options", { skip: !enabled }, async () => {
  const script = lua("src/app/api/group/[groupId]/features/route.ts", "atomicFeatureUpdate");
  await redis(["FLUSHDB"]);
  const key = "group:g1:features";
  const initial = {
    polls: [{ id: "p1", closed: false, multiple: false, options: [
      { id: "a", votes: ["member"] }, { id: "b", votes: [] }
    ] }],
    events: [],
    announcements: []
  };
  await redis(["SET", key, JSON.stringify(initial)]);

  const vote = await evalLua(script, [key], ["member", "votePoll", '{"pollId":"p1","optionIds":["b","b"]}']);
  const parsed = JSON.parse(vote);
  assert.deepEqual(parsed.result.options.map(option => option.votes), [[], ["member"]]);
  const storedAfterVote = JSON.parse(await redis(["GET", key]));
  assert.deepEqual(storedAfterVote.polls[0].options.map(option => option.votes), [[], ["member"]]);
  assert.deepEqual(storedAfterVote.events, []);
  assert.deepEqual(storedAfterVote.announcements, []);

  const unchanged = await redis(["GET", key]);
  const invalid = JSON.parse(await evalLua(script, [key], ["outsider", "votePoll", '{"pollId":"p1","optionIds":["not-an-option"]}']));
  assert.equal(invalid.error, "Invalid poll selection");
  assert.equal(await redis(["GET", key]), unchanged, "invalid vote must not mutate stored feature data");
});

test("Redis Lua integration: pinning rejects system/deleted messages and updates valid sorted-set entries", { skip: !enabled }, async () => {
  const script = lua("src/app/api/group/[groupId]/pin/route.ts", "atomicPinUpdate");
  await redis(["FLUSHDB"]);
  const key = "chat:group--g1:messages";
  const normal = JSON.stringify({ id: "m1", senderId: "member", timestamp: 42, text: "hello" });
  const system = JSON.stringify({ id: "sys", senderId: "system", timestamp: 43, text: "join" });
  const deleted = JSON.stringify({ id: "gone", senderId: "member", timestamp: 44, isDeleted: true, text: "gone" });
  await redis(["ZADD", key, "42", normal, "43", system, "44", deleted]);

  const pinned = JSON.parse(await evalLua(script, [key], ["m1", "true", "100", "owner"]));
  assert.equal(pinned.isPinned, true);
  assert.equal(pinned.pinnedAt, 100);
  assert.equal(pinned.pinnedBy, "owner");

  const systemResult = JSON.parse(await evalLua(script, [key], ["sys", "true", "101", "owner"]));
  const deletedResult = JSON.parse(await evalLua(script, [key], ["gone", "true", "102", "owner"]));
  assert.equal(systemResult.error, "Message cannot be pinned");
  assert.equal(deletedResult.error, "Message cannot be pinned");

  const unpinned = JSON.parse(await evalLua(script, [key], ["m1", "false", "103", "owner"]));
  assert.equal(unpinned.isPinned, false);
  assert.equal(unpinned.pinnedAt, undefined);
});
