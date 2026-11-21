const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

process.env.CRON_SECRET = "test-cron-secret";

const groupCreate = h.loadRoute("src/app/api/group/create/route.ts");
const groupList = h.loadRoute("src/app/api/group/list/route.ts");
const cron = h.loadRoute("src/app/api/cron/cleanup-expired-messages/route.ts");
const communityCreate = h.loadRoute("src/app/api/community/route.ts");
const communityMutate = h.loadRoute("src/app/api/community/[communityId]/route.ts");

const status = async response => ({ status: response.status, data: response.headers.get("content-type")?.includes("json") ? await h.body(response) : await response.text(), headers: response.headers });
const call = async (route, payload, url = "http://localhost/api/test") =>
  status(await route.POST(h.request(payload, "POST", url)));
const cronRun = async () => status(await cron.GET(new Request("http://localhost/api/cron/cleanup-expired-messages", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })));

// ------------------------------------------------------------- group create
test("group create: registers the group, member indexes and notifies everyone", async () => {
  h.reset({ session: null });
  assert.equal((await call(groupCreate, { name: "Team" })).status, 401);
  h.reset();
  assert.equal((await call(groupCreate, { name: "x" })).status, 400, "name below 2 characters");
  assert.equal((await call(groupCreate, { name: "Team", memberIds: Array.from({ length: 256 }, () => "u") })).status, 400, "member list above 255");

  const created = await call(groupCreate, { name: "  Product team  ", description: "Roadmap", memberIds: ["member", "member", "admin"] });
  assert.equal(created.status, 201);
  const group = created.data.group;
  assert.equal(group.name, "Product team");
  assert.deepEqual(group.memberIds.sort(), ["admin", "member", "owner"]);
  assert.deepEqual(group.adminIds, ["owner"]);
  const members = h.getSetMembers(`group:${group.id}:members`);
  assert.ok(members.includes("owner") && members.includes("member"));
  assert.ok(h.getSetMembers("user:admin:groups").includes(group.id));
  assert.equal(h.pusherEvents.filter(event => event.event === "new_group").length, 3, "every member is notified");
});

// --------------------------------------------------------------- group list
test("group list: returns the caller's groups and skips missing records", async () => {
  h.reset({ session: null });
  assert.equal((await status(await groupList.GET())).status, 401);
  h.reset();
  assert.deepEqual(await h.body(await groupList.GET()), []);
  h.reset();
  h.seedSet("user:owner:groups", ["g1", "g2", "ghost"]);
  h.setGroup({ id: "g2", name: "Second", creatorId: "owner", memberIds: ["owner"], adminIds: ["owner"], settings: {} }, "g2");
  const groups = await h.body(await groupList.GET());
  assert.deepEqual(groups.map(group => group.id).sort(), ["g1", "g2"]);
});

// -------------------------------------------------------------- cron cleanup
test("cron cleanup: fails closed without or with a wrong secret", async () => {
  h.reset();
  const noSecret = await status(await cron.GET(new Request("http://localhost/api/cron/cleanup-expired-messages")));
  assert.equal(noSecret.status, 401, "missing secret must not run cleanup");
  const wrongSecret = await status(await cron.GET(new Request("http://localhost/api/cron/cleanup-expired-messages", { headers: { authorization: "Bearer wrong-secret" } })));
  assert.equal(wrongSecret.status, 401);
});

test("cron cleanup: removes expired messages and their owned attachments", async () => {
  h.reset();
  const live = { id: "keep-me", senderId: "owner", text: "still fresh", timestamp: Date.now(), receiverId: "member" };
  const expired = { id: "kill-me", senderId: "owner", text: "gone soon", timestamp: Date.now() - 7200_000, receiverId: "member", expiresAt: Date.now() - 1000 };
  const blobUrl = "https://bucket.public.blob.vercel-storage.com/expired.png";
  const expiredWithMedia = { ...expired, mediaUrl: blobUrl, mediaType: "image" };
  h.setDirectMessages([live, expiredWithMedia], "owner", "member");
  h.seedZsetEntry("chat:expiring", expired.expiresAt, JSON.stringify({ chatKey: "chat:owner--member:messages", messageId: expired.id, raw: JSON.stringify(expiredWithMedia) }));

  const result = await cronRun();
  assert.equal(result.status, 200);
  assert.equal(result.data.deleted, 1);
  assert.deepEqual(h.blobCalls, [blobUrl], "owned attachments are deleted from Blob");
  assert.deepEqual(h.getDirectMessages().map(message => message.id), ["keep-me"], "only the expired message is removed");
  assert.deepEqual(h.getZset("chat:expiring"), [], "expiry index entry is consumed");
});

test("cron cleanup: reconciles entries whose message was edited to expire later", async () => {
  h.reset();
  const live = { id: "resched", senderId: "owner", text: "extended", timestamp: 1000, receiverId: "member", expiresAt: Date.now() + 3600_000 };
  h.setDirectMessages([live], "owner", "member");
  const staleEntry = JSON.stringify({ chatKey: "chat:owner--member:messages", messageId: "resched", raw: JSON.stringify({ ...live, text: "old", expiresAt: Date.now() - 1000 }) });
  h.seedZsetEntry("chat:expiring", Date.now() - 1000, staleEntry);

  const result = await cronRun();
  assert.equal(result.status, 200);
  assert.equal(result.data.deleted, 0);
  assert.deepEqual(h.getDirectMessages().map(message => message.id), ["resched"], "live message must survive");
  const index = h.getZset("chat:expiring");
  assert.equal(index.length, 1);
  assert.ok(index[0].score > Date.now(), "entry rescheduled to the message's current expiry");
});

test("cron cleanup: corrupt entries are pruned and blob failures return 503", async () => {
  h.reset();
  h.seedZsetEntry("chat:expiring", 1, "not-json-at-all");
  const first = await cronRun();
  assert.equal(first.status, 200);
  assert.deepEqual(h.getZset("chat:expiring"), []);

  h.reset();
  const expired = { id: "blob-fail", senderId: "owner", text: "x", timestamp: 1, receiverId: "member", expiresAt: Date.now() - 10, mediaUrl: "https://bucket.public.blob.vercel-storage.com/z.png" };
  h.setDirectMessages([expired], "owner", "member");
  h.seedZsetEntry("chat:expiring", expired.expiresAt, JSON.stringify({ chatKey: "chat:owner--member:messages", messageId: "blob-fail", raw: JSON.stringify(expired) }));
  h.setBlobFailure(true);
  const failing = await cronRun();
  assert.equal(failing.status, 503);
  assert.equal(failing.data.blobFailures, 1);
  assert.deepEqual(h.getDirectMessages().map(message => message.id), ["blob-fail"], "message retained so cleanup can retry");
});

// ---------------------------------------------------------------- community
test("community create: unions group members and rejects non-admins and already-linked groups", async () => {
  h.reset({ session: null });
  assert.equal((await call(communityCreate, { name: "Org" })).status, 401);
  h.reset();
  assert.equal((await call(communityCreate, { name: "x" })).status, 400, "name below 2 characters");
  assert.equal((await call(communityCreate, { name: "Org", groupIds: ["missing"] })).status, 404);
  h.setGroup({ ...h.getGroup(), memberIds: ["owner", "member"], adminIds: ["admin"], creatorId: "admin" });
  assert.equal((await call(communityCreate, { name: "Org", groupIds: ["g1"] })).status, 403, "caller must administer the group");
  h.reset();
  h.setGroup({ ...h.getGroup(), communityId: "other-community" });
  assert.equal((await call(communityCreate, { name: "Org", groupIds: ["g1"] })).status, 409, "group already belongs to a community");
  h.reset();

  const created = await call(communityCreate, { name: "Org", description: "All teams", groupIds: ["g1"] });
  assert.equal(created.status, 201);
  const community = created.data.community;
  assert.ok(community.memberIds.includes("owner") && community.memberIds.includes("member"), "group members join the community");
  assert.equal(h.getGroup().communityId, community.id);
  assert.ok(h.getSetMembers("user:member:communities").includes(community.id));
});

test("community mutations: invite, accept, decline, remove and owner protection", async () => {
  h.reset();
  const created = await call(communityCreate, { name: "Org" });
  const communityId = created.data.community.id;
  const ctx = { params: Promise.resolve({ communityId }) };
  const post = async payload => status(await communityMutate.POST(h.request(payload), ctx));

  assert.equal((await post({ action: "inviteMember", memberId: "ghost" })).status, 404, "unknown invitee");
  assert.equal((await post({ action: "inviteMember", memberId: "member" })).status, 200);
  assert.ok(h.getSetMembers(`community:${communityId}:invites`).includes("member"));
  assert.ok(h.getSetMembers("user:member:community-invites").includes(communityId));

  h.setSession("member");
  assert.equal((await post({ action: "addGroup", groupId: "g1" })).status, 403, "plain members cannot administer");
  assert.equal((await post({ action: "acceptInvite" })).status, 200);
  assert.equal((await post({ action: "acceptInvite" })).status, 404, "accepting twice finds no pending invite");

  h.setSession("owner");
  assert.equal((await post({ action: "removeMember", memberId: "owner" })).status, 400, "owner cannot be removed directly");
  assert.equal((await post({ action: "removeMember", memberId: "member" })).status, 200);
  assert.ok(!h.getSetMembers("user:member:communities").includes(communityId));
});

test("community admins can add a user directly and keep both membership indexes in sync", async () => {
  h.reset();
  const created = await call(communityCreate, { name: "Org" });
  const communityId = created.data.community.id;
  const ctx = { params: Promise.resolve({ communityId }) };
  const post = async payload => status(await communityMutate.POST(h.request(payload), ctx));

  const added = await post({ action: "addMember", memberId: "member" });
  assert.equal(added.status, 200);
  assert.ok(added.data.community.memberIds.includes("member"));
  assert.ok(h.getSetMembers("user:member:communities").includes(communityId));
  const ownerListing = await status(await communityCreate.GET());
  assert.equal(ownerListing.data.communities[0].isAdmin, true);
  h.setSession("member");
  const memberListing = await status(await communityCreate.GET());
  assert.equal(memberListing.data.communities[0].isAdmin, false);
  h.setSession("owner");

  assert.equal((await post({ action: "addMember", memberId: "member" })).status, 409);
  assert.equal((await post({ action: "addMember", memberId: "unknown-user" })).status, 404);

  await post({ action: "inviteMember", memberId: "other" });
  const addedInvitee = await post({ action: "addMember", memberId: "other" });
  assert.equal(addedInvitee.status, 200);
  assert.ok(!h.getSetMembers("community:" + communityId + ":invites").includes("other"));
  assert.ok(!h.getSetMembers("user:other:community-invites").includes(communityId));

  h.setSession("member");
  assert.equal((await post({ action: "addMember", memberId: "other" })).status, 403, "ordinary members cannot add community members");
});

test("community admins can add a member by case-insensitive email address", async () => {
  h.reset();
  h.setUser("email-member", { name: "Email Member", email: "admin@yopmail.com" });
  h.seedKv("user:email:admin@yopmail.com", "email-member");
  const created = await call(communityCreate, { name: "Email community" });
  const communityId = created.data.community.id;
  const ctx = { params: Promise.resolve({ communityId }) };
  const added = await status(await communityMutate.POST(h.request({
    action: "addMember",
    memberId: "ADMIN@YOPMAIL.COM",
  }), ctx));
  assert.equal(added.status, 200);
  assert.ok(added.data.community.memberIds.includes("email-member"));
  assert.ok(h.getSetMembers("user:email-member:communities").includes(communityId));
});

test("community mutations: declines are idempotent on both invitation indexes", async () => {
  h.reset();
  const created = await call(communityCreate, { name: "Org" });
  const ctx = { params: Promise.resolve({ communityId: created.data.community.id }) };
  const post = async payload => status(await communityMutate.POST(h.request(payload), ctx));
  await post({ action: "inviteMember", memberId: "member" });
  h.setSession("member");
  assert.equal((await post({ action: "declineInvite" })).status, 200);
  assert.deepEqual(h.getSetMembers(`community:${created.data.community.id}:invites`), []);
  assert.deepEqual(h.getSetMembers("user:member:community-invites"), []);
  // Current contract: declining without a pending invitation surfaces as 404,
  // even though the underlying index removal is idempotent.
  assert.equal((await post({ action: "declineInvite" })).status, 404);
});

test("community mutations: CAS conflicts surface as 409 and updates succeed when free", async () => {
  h.reset();
  const created = await call(communityCreate, { name: "Org" });
  const ctx = { params: Promise.resolve({ communityId: created.data.community.id }) };
  h.forceRedisConflicts(4);
  const conflict = await status(await communityMutate.POST(h.request({ action: "update", name: "Renamed" }), ctx));
  assert.equal(conflict.status, 409);
  h.forceRedisConflicts(0);
  const updated = await status(await communityMutate.POST(h.request({ action: "update", name: "Renamed", description: "New" }), ctx));
  assert.equal(updated.status, 200);
  assert.equal(updated.data.community.name, "Renamed");
});

test("community mutations: leaving as the last member deletes the community and unlinks groups", async () => {
  h.reset();
  // A community whose only member is the creator (no groups, so no member union).
  const solo = await call(communityCreate, { name: "Solo" });
  const soloCtx = { params: Promise.resolve({ communityId: solo.data.community.id }) };
  const soloLeave = await status(await communityMutate.POST(h.request({ action: "leave" }), soloCtx));
  assert.equal(soloLeave.status, 200);
  assert.equal(soloLeave.data.deleted, true);
  assert.equal(h.getKv(`community:${solo.data.community.id}`), null);
  assert.deepEqual(h.getSetMembers("user:owner:communities"), []);

  // With a group whose only member is the owner, leaving also unlinks the group.
  h.setGroup({ ...h.getGroup(), memberIds: ["owner"] });
  const linked = await call(communityCreate, { name: "Linked", groupIds: ["g1"] });
  const linkedCtx = { params: Promise.resolve({ communityId: linked.data.community.id }) };
  const linkedLeave = await status(await communityMutate.POST(h.request({ action: "leave" }), linkedCtx));
  assert.equal(linkedLeave.data.deleted, true);
  assert.equal(h.getGroup().communityId, undefined, "group link removed on delete");
});

test("community mutations: a non-final leave transfers ownership to the next member", async () => {
  h.reset();
  const created = await call(communityCreate, { name: "Org", groupIds: ["g1"] });
  const ctx = { params: Promise.resolve({ communityId: created.data.community.id }) };
  const leave = await status(await communityMutate.POST(h.request({ action: "leave" }), ctx));
  assert.equal(leave.status, 200);
  assert.equal(leave.data.deleted, false, "other members remain");
  assert.equal(leave.data.community.ownerId, "admin", "ownership moves to the next remaining member");
});
