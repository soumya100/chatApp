const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

const add = h.loadRoute("src/app/api/friends/add/route.ts");
const accept = h.loadRoute("src/app/api/friends/accept/route.ts");
const deny = h.loadRoute("src/app/api/friends/deny/route.ts");
const list = h.loadRoute("src/app/api/friends/list/route.ts");

const status = async response => ({ status: response.status, data: response.headers.get("content-type")?.includes("json") ? await h.body(response) : await response.text(), headers: response.headers });

test("friends add: unauthenticated, malformed and invalid payloads fail closed", async () => {
  h.reset({ session: null });
  assert.equal((await status(await add.POST(h.request({ email: "friend@example.test" })))).status, 401);
  h.reset();
  assert.equal((await status(await add.POST(h.requestRaw("{invalid")))).status, 400);
  assert.equal((await status(await add.POST(h.request({ email: "a" })))).status, 422, "identifier below 2 characters");
});

test("friends add: sliding-window limit of 5 requests per minute is enforced", async () => {
  h.reset();
  for (let i = 0; i < 5; i++) {
    const sent = await status(await add.POST(h.request({ email: `unknown-${i}@example.test` })));
    assert.equal(sent.status, 400, `attempt ${i + 1} should reach the lookup path`);
  }
  const blocked = await status(await add.POST(h.request({ email: "unknown-final@example.test" })));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
});

test("friends add: resolves targets by email index, username index and profile fallback", async () => {
  h.reset();
  h.setUser("member", { name: "Member", email: "private-member@example.test" });
  h.seedKv("user:email:by-email@example.test", "member");
  h.seedKv("user:name:member", "admin");

  const byEmail = await status(await add.POST(h.request({ email: "by-email@example.test" })));
  assert.equal(byEmail.status, 200);
  assert.ok(h.getSetMembers("user:member:incoming_friend_requests").includes("owner"));

  h.reset();
  h.seedKv("user:email:by-email@example.test", "member");
  h.seedKv("user:name:member", "admin");
  const byName = await status(await add.POST(h.request({ email: "MEMBER" })));
  assert.equal(byName.status, 200);
  assert.ok(h.getSetMembers("user:admin:incoming_friend_requests").includes("owner"));

  h.reset();
  h.seedSet("users", ["other"]);
  h.setUser("other", { name: "John Doe", email: "john@example.test" });
  const byProfile = await status(await add.POST(h.request({ email: "johndoe" })));
  assert.equal(byProfile.status, 200, "stripped full-name fallback matches");
  assert.ok(h.getSetMembers("user:other:incoming_friend_requests").includes("owner"));
});

test("friends add: unknown, self, duplicate and existing-friend requests are rejected", async () => {
  h.reset();
  h.setUser("member", { name: "Member", email: "private-member@example.test" });
  h.seedKv("user:email:private-member@example.test", "member");
  const unknown = await status(await add.POST(h.request({ email: "nobody@example.test" })));
  assert.equal(unknown.status, 400);
  assert.match(unknown.data, /not found/i);

  h.seedKv("user:email:private-owner@example.test", "owner");
  const self = await status(await add.POST(h.request({ email: "private-owner@example.test" })));
  assert.equal(self.status, 400);
  assert.match(self.data, /yourself/i);
  h.reset();

  h.setUser("member", { name: "Member", email: "private-member@example.test" });
  h.seedKv("user:email:private-member@example.test", "member");
  h.seedSet("user:member:incoming_friend_requests", ["owner"]);
  const duplicate = await status(await add.POST(h.request({ email: "private-member@example.test" })));
  assert.equal(duplicate.status, 400);
  h.reset();

  h.setUser("member", { name: "Member", email: "private-member@example.test" });
  h.seedKv("user:email:private-member@example.test", "member");
  h.seedSet("user:owner:friends", ["member"]);
  const alreadyFriends = await status(await add.POST(h.request({ email: "private-member@example.test" })));
  assert.equal(alreadyFriends.status, 400);
  h.reset();

  h.setUser("member", { name: "Member", email: "private-member@example.test" });
  h.seedKv("user:email:private-member@example.test", "member");
  const ok = await status(await add.POST(h.request({ email: "private-member@example.test" })));
  assert.equal(ok.status, 200);
  assert.ok(h.getSetMembers("user:member:incoming_friend_requests").includes("owner"));
  const event = h.pusherEvents.find(item => item.event === "incoming_friend_requests");
  assert.equal(event.channel, "private-user:member:incoming_friend_requests");
  assert.equal(event.payload.senderId, "owner");
});

test("friends accept: duplicates and missing requests are rejected, valid ones create a mutual friendship", async () => {
  h.reset({ session: null });
  assert.equal((await status(await accept.POST(h.request({ id: "member" })))).status, 401);
  h.reset();
  h.seedSet("user:owner:friends", ["member"]);
  assert.equal((await status(await accept.POST(h.request({ id: "member" })))).status, 400, "already friends");
  h.reset();
  assert.equal((await status(await accept.POST(h.request({ id: "member" })))).status, 400, "no pending request");
  h.reset();
  assert.equal((await status(await accept.POST(h.request({ wrong: 1 })))).status, 422);
  h.reset();
  h.seedSet("user:owner:incoming_friend_requests", ["member"]);
  const ok = await status(await accept.POST(h.request({ id: "member" })));
  assert.equal(ok.status, 200);
  assert.ok(h.getSetMembers("user:owner:friends").includes("member"));
  assert.ok(h.getSetMembers("user:member:friends").includes("owner"));
  assert.deepEqual(h.getSetMembers("user:owner:incoming_friend_requests"), [], "accepted request must be removed");
  assert.equal(h.pusherEvents.filter(event => event.event === "new_friend").length, 2, "both users are notified");
  h.reset();
  assert.equal((await status(await accept.POST(h.requestRaw("{invalid")))).status, 400);
});

test("friends deny: removes the pending request and notifies the session", async () => {
  h.reset({ session: null });
  assert.equal((await status(await deny.POST(h.request({ id: "member" })))).status, 401);
  h.reset();
  h.seedSet("user:owner:incoming_friend_requests", ["member", "other"]);
  const ok = await status(await deny.POST(h.request({ id: "member" })));
  assert.equal(ok.status, 200);
  assert.deepEqual(h.getSetMembers("user:owner:incoming_friend_requests").sort(), ["other"]);
  const event = h.pusherEvents.find(item => item.event === "friend_request_denied");
  assert.deepEqual(event.payload, { senderId: "member" });
  const second = await status(await deny.POST(h.request({ id: "member" })));
  assert.equal(second.status, 200, "denial is idempotent");
  assert.equal((await status(await deny.POST(h.request({ id: 42 })))).status, 422);
});

test("friends list: returns full profiles of current friends and skips unknown ids", async () => {
  h.reset({ session: null });
  assert.equal((await status(await list.GET())).status, 401);
  h.reset();
  assert.deepEqual(await h.body(await list.GET()), [], "no friends yet");
  h.reset();
  h.seedSet("user:owner:friends", ["member", "ghost"]);
  const friends = await h.body(await list.GET());
  assert.deepEqual(friends.map(friend => friend.id), ["member"], "missing profiles are skipped safely");
  assert.equal(friends[0].name, "Member");
});
