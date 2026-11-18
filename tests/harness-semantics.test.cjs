// Semantics contracts for the in-memory Redis harness itself. The harness is
// the shared fixture for every API regression suite, so its Redis behaviors
// (TTL/expiry, overwrite-clears-TTL, KEYS visibility, malformed-row
// observability) are pinned here the same way real Redis would behave.
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

const status = async response => ({
  status: response.status,
  data: response.headers.get("content-type")?.includes("json") ? await h.body(response) : await response.text(),
});

test("harness: seeded kv entries honor a TTL and vanish once it lapses", async () => {
  h.reset();
  h.seedKv("retention:ephemeral", { blob: "user-data" }, { ttlSeconds: 0 });
  assert.equal(h.getKv("retention:ephemeral"), null, "a non-positive TTL expires the key immediately");

  h.seedKv("retention:sticky", { blob: "user-data" }, { ttlSeconds: 3600 });
  assert.ok(h.getKv("retention:sticky"), "a live TTL keeps the key readable");
  const remaining = await h.db.ttl("retention:sticky");
  assert.ok(remaining > 3500 && remaining <= 3600, `TTL readback must reflect the remaining window, got ${remaining}`);
  assert.equal(await h.db.ttl("retention:missing"), -2, "TTL of a missing key is -2, like Redis");
  h.seedKv("retention:persistent", "keep");
  assert.equal(await h.db.ttl("retention:persistent"), -1, "a key without expiry reports -1, like Redis");
});

test("harness: SETEX and EXPIRE follow Redis semantics including overwrite-clears-TTL", async () => {
  h.reset();
  assert.equal(await h.db.setex("limit:counter", 30, "1"), "OK");
  assert.ok(await h.db.ttl("limit:counter") > 0, "SETEX installs a live TTL");
  assert.equal(await h.db.set("limit:counter", "2"), "OK");
  assert.equal(await h.db.ttl("limit:counter"), -1, "a plain SET clears the TTL, like Redis");
  assert.equal(h.getKv("limit:counter"), "2");

  assert.equal(await h.db.expire("limit:counter", 0), 1, "EXPIRE with a non-positive TTL deletes the key");
  assert.equal(h.getKv("limit:counter"), null);
  assert.equal(await h.db.expire("limit:missing", 60), 0, "EXPIRE on a missing key returns 0");
});

test("harness: expired keys are invisible to KEYS and lazy expiry purges typed stores", async () => {
  h.reset();
  h.seedKv("gone:kv", "value", { ttlSeconds: 0 });
  h.seedSet("gone:set", ["a"]);
  assert.equal(await h.db.expire("gone:set", 0), 1);
  const keys = await h.db.keys("gone:*");
  assert.deepEqual(keys, [], "expired keys must not be listed by KEYS");
  assert.deepEqual(h.getSetMembers("gone:set"), [], "lazy expiry purges set members too");
});

test("harness: pipeline expire gives the rate limiter real retention semantics", async () => {
  h.reset();
  const key = "ratelimit:owner:send_message";
  const pipeline = h.db.pipeline();
  pipeline.zremrangebyscore(key, 0, 0);
  pipeline.zadd(key, { score: 1, member: "row-1" });
  pipeline.zcard(key);
  pipeline.expire(key, 20);
  const results = await pipeline.exec();
  assert.equal(results[2], 1, "zcard counts the freshly added row");
  assert.equal(results[3], 1, "pipeline expire reports the key existed");
  const remaining = await h.db.ttl(key);
  assert.ok(remaining > 0 && remaining <= 20, `the expiry must be readable back, got ${remaining}`);
});

test("harness: message lookup reports malformed stored rows instead of skipping silently", async () => {
  h.reset();
  h.seedSet("group:g1:members", ["owner"]);
  // Inject the corrupt row BEFORE the target so the lookup actually examines
  // it (findIndex stops at the first match, exactly like the Lua ZRANGE scan).
  await h.db.zadd("chat:group--g1:messages", { score: 0, member: "{corrupt-row-not-json" });
  await h.db.zadd("chat:group--g1:messages", {
    score: 1,
    member: JSON.stringify({ id: "good", senderId: "owner", text: "hello", timestamp: 1 }),
  });

  const edit = h.loadRoute("src/app/api/message/edit/route.ts");
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const result = await status(await edit.POST(h.request({ messageId: "good", chatId: "group--g1", newText: "edited" })));
    assert.equal(result.status, 200, "the target message stays editable next to a corrupt row");
    assert.equal(result.data, "OK");
    const storedRows = await h.db.zrange("chat:group--g1:messages", 0, -1);
    const goodMessage = storedRows
      .map(row => { try { return JSON.parse(row); } catch { return null; } })
      .filter(Boolean)
      .find(message => message.id === "good");
    assert.deepEqual(goodMessage?.text, "edited", "the edit lands on the correct row despite the corrupt neighbor");
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(
    warnings.some(line => line.includes("malformed message row")),
    "the corrupt row must be surfaced in a warning, never dropped silently"
  );
});
