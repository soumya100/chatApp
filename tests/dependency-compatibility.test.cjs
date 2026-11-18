const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = require(path.join(root, "package.json"));
const lockfile = fs.readFileSync(path.join(root, "yarn.lock"), "utf8");

test("UUID 11 loads and generates valid UUIDs", () => {
  const uuid = require("uuid");

  assert.match(uuid.VERSION, /^11\\./);
  const id = uuid.v4();
  assert.equal(uuid.validate(id), true);
  assert.equal(uuid.version(id), 4);
});

test("Upstash NextAuth adapter loads with the resolved UUID version", () => {
  const adapterModule = require("@next-auth/upstash-redis-adapter");
  const createAdapter =
    adapterModule.UpstashRedisAdapter || adapterModule.default;

  assert.equal(typeof createAdapter, "function");

  // Adapter construction must remain compatible with UUID 11. No Redis
  // network access is made by this test.
  const redisStub = {
    get: async () => null,
    set: async () => "OK",
    del: async () => 1,
    sadd: async () => 1,
    smembers: async () => [],
    srem: async () => 1,
  };
  const adapter = createAdapter(redisStub);

  assert.ok(adapter && typeof adapter === "object");
  assert.equal(typeof adapter.createUser, "function");
  assert.equal(typeof adapter.getUser, "function");
  assert.equal(typeof adapter.getUserByEmail, "function");
});

test("Zod 4.6.6 loads and enforces constrained collection limits", () => {
  const { z } = require("zod");

  assert.match(require("zod/package.json").version, /^4\\.6\\.6$/);
  const boundedCollection = z.array(z.string()).max(3);

  assert.deepEqual(boundedCollection.parse(["one", "two"]), ["one", "two"]);
  assert.equal(boundedCollection.safeParse(["one", "two", "three", "four"]).success, false);
});

test("security resolutions and lockfile do not restore reported vulnerable versions", () => {
  assert.equal(packageJson.resolutions.uuid, "11.1.1");
  assert.equal(packageJson.resolutions.zod, "4.6.6");

  assert.match(lockfile, /uuid@[^\\n]*:\\n  version "11\\.1\\.1"/);
  assert.match(lockfile, /zod@[^\\n]*:\\n  version "4\\.6\\.6"/);

  // The lockfile must not contain the exact vulnerable releases called out
  // in the dependency review.
  for (const vulnerableTarball of [
    "uuid-8.3.2.tgz",
    "glob-10.3.10.tgz",
    "minimatch-9.0.9.tgz",
  ]) {
    assert.equal(lockfile.includes(vulnerableTarball), false, vulnerableTarball);
  }
});
