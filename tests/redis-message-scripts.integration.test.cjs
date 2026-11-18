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

function seedMessage(id, overrides = {}) {
  return JSON.stringify({
    id,
    senderId: "owner",
    text: "hello " + id,
    timestamp: 1000,
    receiverId: "member",
    ...overrides,
  });
}

async function rows(key) {
  const raw = await redis(["ZRANGE", key, "0", "-1"]);
  return raw ? raw.split("\n").map(row => JSON.parse(row)) : [];
}

const CHAT = "chat:test-direct:messages";

test("Redis Lua integration: message edit rejects stale senders and applies only owned edits", { skip: !enabled }, async () => {
  const script = lua("src/app/api/message/edit/route.ts", "atomicEdit");
  await redis(["FLUSHDB"]);
  await redis(["ZADD", CHAT, "1000", seedMessage("m1")]);
  await redis(["ZADD", CHAT, "2000", seedMessage("m2", { senderId: "member" })]);
  await redis(["ZADD", CHAT, "3000", seedMessage("sys", { senderId: "system" })]);
  await redis(["ZADD", CHAT, "4000", seedMessage("gone", { isDeleted: true })]);

  const decode = value => JSON.parse(value);

  assert.deepEqual(decode(await evalLua(script, [CHAT], ["missing", "owner", "x"])), { error: "Message not found" });
  assert.deepEqual(decode(await evalLua(script, [CHAT], ["m1", "attacker", "hacked"])), { error: "Forbidden" }, "non-senders must not edit");
  assert.deepEqual(decode(await evalLua(script, [CHAT], ["sys", "owner", "hacked"])), { error: "Message cannot be edited" });
  assert.deepEqual(decode(await evalLua(script, [CHAT], ["gone", "owner", "hacked"])), { error: "Message cannot be edited" });
  assert.deepEqual(decode(await evalLua(script, [CHAT], ["m1", "owner", "   "])), { error: "Message text cannot be empty" });

  const edited = decode(await evalLua(script, [CHAT], ["m1", "owner", "hello edited"]));
  assert.equal(edited.message.text, "hello edited");
  assert.equal(edited.message.isEdited, true);

  const after = await rows(CHAT);
  assert.equal(after.length, 4, "ZREM+ZADD must replace in place, not grow the set");
  const stored = after.find(message => message.id === "m1");
  assert.equal(stored.text, "hello edited");
  assert.equal(stored.isEdited, true);
});

test("Redis Lua integration: message delete strips media fields atomically", { skip: !enabled }, async () => {
  const script = lua("src/app/api/message/delete/route.ts", "atomicDelete");
  await redis(["FLUSHDB"]);
  await redis(["ZADD", CHAT, "1000", seedMessage("m1", { mediaUrl: "https://bucket.public.blob.vercel-storage.com/a.png", mediaType: "image", fileName: "a.png", fileSize: 5, senderImg: "/owner.png" })]);

  assert.deepEqual(JSON.parse(await evalLua(script, [CHAT], ["m1", "attacker"])), { error: "Forbidden" });
  const deleted = JSON.parse(await evalLua(script, [CHAT], ["m1", "owner"]));
  assert.equal(deleted.message.isDeleted, true);
  assert.equal(deleted.message.text, "This message was deleted");
  assert.equal(deleted.message.mediaUrl, undefined);
  assert.equal(deleted.message.fileName, undefined);
  assert.equal(deleted.message.senderImg, undefined);
  assert.equal(await rows(CHAT).length, 1, "the row is replaced, not duplicated");
});

test("Redis Lua integration: message react toggles per-user without losing other reactions", { skip: !enabled }, async () => {
  const script = lua("src/app/api/message/react/route.ts", "atomicReact");
  await redis(["FLUSHDB"]);
  await redis(["ZADD", CHAT, "1000", seedMessage("m1", { reactions: { "👍": ["member"] } })]);

  const added = JSON.parse(await evalLua(script, [CHAT], ["m1", "🔥", "owner"]));
  assert.deepEqual(added.reactions, { "👍": ["member"], "🔥": ["owner"] });

  const selfToggle = JSON.parse(await evalLua(script, [CHAT], ["m1", "🔥", "owner"]));
  assert.deepEqual(selfToggle.reactions, { "👍": ["member"] }, "toggling removes only the caller");

  const join = JSON.parse(await evalLua(script, [CHAT], ["m1", "👍", "owner"]));
  assert.deepEqual(join.reactions, { "👍": ["member", "owner"] }, "existing reactions are preserved");

  const removed = JSON.parse(await evalLua(script, [CHAT], ["m1", "👍", "owner"]));
  assert.deepEqual(removed.reactions, { "👍": ["member"] });
});
