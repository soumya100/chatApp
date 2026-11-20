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

test("Redis Lua integration: event time-slot voting is atomic, member-isolated, deduplicated and fail-closed", { skip: !enabled }, async () => {
  const script = lua("src/app/api/group/[groupId]/features/route.ts", "atomicFeatureUpdate");
  await redis(["FLUSHDB"]);
  const key = "group:g1:features";
  await redis(["SET", key, JSON.stringify({
    polls: [],
    events: [{ id: "event-1", timeOptions: [
      { id: "slot-a", startsAt: 1000, votes: [] },
      { id: "slot-b", startsAt: 2000, votes: [] },
      { id: "slot-c", startsAt: 3000, votes: [] }
    ], responses: { going: [], maybe: [], "not-going": [] } }],
    announcements: []
  })]);

  const vote = (userId, optionIds) => evalLua(script, [key], [
    userId, "voteEvent", JSON.stringify({ eventId: "event-1", optionIds })
  ]);

  const [memberA, memberB] = await Promise.all([
    vote("member-a", ["slot-a", "slot-a", "slot-b"]),
    vote("member-b", ["slot-c"])
  ]);
  assert.equal(JSON.parse(memberA).error, undefined);
  assert.equal(JSON.parse(memberB).error, undefined);

  let stored = JSON.parse(await redis(["GET", key]));
  assert.deepEqual(stored.events[0].timeOptions.map(option => option.votes), [
    ["member-a"], ["member-a"], ["member-b"]
  ], "concurrent votes from different users must not overwrite one another");

  await vote("member-a", ["slot-b"]);
  stored = JSON.parse(await redis(["GET", key]));
  assert.deepEqual(stored.events[0].timeOptions.map(option => option.votes), [
    [], ["member-a"], ["member-b"]
  ], "a member's replacement vote must remove all of their prior selections only");

  const beforeInvalid = await redis(["GET", key]);
  const invalid = JSON.parse(await vote("attacker", ["not-a-real-slot"]));
  assert.equal(invalid.error, "Invalid event time selection");
  assert.equal(await redis(["GET", key]), beforeInvalid, "invalid votes must not mutate persisted event data");

  const missing = JSON.parse(await evalLua(script, [key], [
    "member-a", "voteEvent", JSON.stringify({ eventId: "missing", optionIds: ["slot-a"] })
  ]));
  assert.equal(missing.error, "Event not found");
  assert.equal(await redis(["GET", key]), beforeInvalid, "unknown events must not mutate persisted data");
});

test("Redis Lua integration: creating a group feature atomically writes its inbox message and expiry index", { skip: !enabled }, async () => {
  const script = lua("src/app/api/group/[groupId]/features/route.ts", "atomicFeatureUpdate");
  await redis(["FLUSHDB"]);
  const featureKey = "group:g1:features";
  const messageKey = "chat:group--g1:messages";
  const expiryKey = "chat:expiring";
  const payload = JSON.stringify({
    id: "poll-1",
    question: "Which roadmap?",
    options: [{ id: "a", label: "A", votes: [] }, { id: "b", label: "B", votes: [] }],
    multiple: false,
    createdBy: "owner",
    createdAt: 100,
    closed: false
  });
  const message = JSON.stringify({
    id: "message-1",
    receiverId: "group--g1",
    senderId: "owner",
    text: "Poll: Which roadmap?",
    timestamp: 100,
    expiresAt: 500,
    featureType: "poll",
    featureId: "poll-1"
  });

  const result = JSON.parse(await evalLua(script, [featureKey, messageKey, expiryKey], ["owner", "createPoll", payload, message]));
  assert.equal(result.result.id, "poll-1");
  assert.equal(await redis(["ZRANGE", messageKey, "0", "-1"]), message, "inbox message is committed with the feature");
  const expiryRows = JSON.parse(await redis(["ZRANGE", expiryKey, "0", "-1"]));
  assert.equal(expiryRows.chatKey, messageKey);
  assert.equal(expiryRows.messageId, "message-1");
  assert.equal(expiryRows.raw, message);
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

test("Redis Lua integration: member add compare-and-sets both the group and the community documents", { skip: !enabled }, async () => {
  const script = lua("src/lib/group-atomic-commit.ts", "atomicGroupMemberAdd");
  await redis(["FLUSHDB"]);

  const groupKey = "group:g-add";
  const members = "group:g-add:members";
  const messages = "chat:group--g-add:messages";
  const communityKey = "community:c-add";
  const before = JSON.stringify({ id: "g-add", memberIds: ["owner"], creatorId: "owner" });
  const after = JSON.stringify({ id: "g-add", memberIds: ["owner", "new-member"], creatorId: "owner" });
  const systemMessage = JSON.stringify({ id: "m-add", senderId: "system", timestamp: 42, text: "Added new-member" });
  const communityBefore = JSON.stringify({ id: "c-add", memberIds: ["owner"] });
  const communityAfter = JSON.stringify({ id: "c-add", memberIds: ["owner", "new-member"] });

  await redis(["SET", groupKey, before]);
  await redis(["SET", communityKey, communityBefore]);
  await redis(["SADD", "user:owner:groups", "g-add"]);

  // A stale group document returns 0 and must not commit anything.
  const staleGroup = await evalLua(script, [groupKey, members, messages],
    [JSON.stringify({ stale: true }), "addMembers", after, "owner", "g-add", '["new-member"]',
      systemMessage, "false", communityKey, communityAfter, "c-add", communityBefore]);
  assert.equal(staleGroup, "0");
  assert.equal(await redis(["GET", groupKey]), before, "a stale group must not commit");

  // A stale community document returns 2 and must not commit the group either.
  const staleCommunity = await evalLua(script, [groupKey, members, messages],
    [before, "addMembers", after, "owner", "g-add", '["new-member"]',
      systemMessage, "false", communityKey, communityAfter, "c-add", JSON.stringify({ id: "c-add", memberIds: ["stale"] })]);
  assert.equal(staleCommunity, "2");
  assert.equal(await redis(["GET", groupKey]), before, "a stale community must not commit the group either");
  assert.equal(await redis(["GET", communityKey]), communityBefore, "a stale community must not commit itself");
  assert.equal(await redis(["SISMEMBER", members, "new-member"]), "0");

  // Fresh documents return 1 and commit every write atomically.
  const committed = await evalLua(script, [groupKey, members, messages],
    [before, "addMembers", after, "owner", "g-add", '["new-member"]',
      systemMessage, "false", communityKey, communityAfter, "c-add", communityBefore]);
  assert.equal(committed, "1");
  assert.equal(await redis(["GET", groupKey]), after);
  assert.equal(await redis(["SISMEMBER", members, "new-member"]), "1");
  assert.equal(await redis(["SISMEMBER", "user:new-member:groups", "g-add"]), "1");
  assert.equal(await redis(["SISMEMBER", "user:new-member:communities", "c-add"]), "1");
  assert.notEqual(await redis(["ZSCORE", messages, systemMessage]), "");
  assert.equal(await redis(["GET", communityKey]), communityAfter);
});
