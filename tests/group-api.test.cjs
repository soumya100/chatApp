const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

const manage = h.loadRoute("src/app/api/group/[groupId]/manage/route.ts");
const members = h.loadRoute("src/app/api/group/[groupId]/members/route.ts");
const features = h.loadRoute("src/app/api/group/[groupId]/features/route.ts");
const pins = h.loadRoute("src/app/api/group/[groupId]/pin/route.ts");
const preferences = h.loadRoute("src/app/api/user/group-preferences/route.ts");
const addMembers = h.loadRoute("src/app/api/group/members/add/route.ts");

const context = { params: Promise.resolve({ groupId: "g1" }) };
const post = (route, payload) => route.POST(h.request(payload), context);
const get = (route, url = "http://localhost/api/test") => route.GET(h.request(undefined, "GET", url), context);
const read = async response => ({ status: response.status, data: await h.body(response) });

test("group member listing: unauthenticated access is rejected", async () => {
  h.reset({ session: null });
  const result = await read(await get(members));
  assert.equal(result.status, 401);
  assert.equal(result.data.message, "Unauthorized");
});

test("group member listing: malformed group ids are rejected before any Redis access", async () => {
  h.reset();
  for (const badId of ["", "x".repeat(129)]) {
    const result = await read(await members.GET(h.request(undefined, "GET"), { params: Promise.resolve({ groupId: badId }) }));
    assert.equal(result.status, 400, `a group id of length ${badId.length} must be rejected with a deterministic 400`);
    assert.equal(result.data.message, "Invalid group id");
  }
});

test("group member listing: non-members cannot enumerate profiles", async () => {
  const group = h.reset({ group: { memberIds: ["owner", "admin"] } });
  h.setSession("outsider");
  const result = await read(await get(members));
  assert.equal(result.status, 403);
  assert.match(result.data.message, /not a member/i);
  assert.equal(group.memberIds.includes("outsider"), false);
});

test("group member listing: deduplicates IDs and returns only safe profile fields", async () => {
  h.reset({ group: { memberIds: ["owner", "member", "member"] } });
  const result = await read(await get(members));
  assert.equal(result.status, 200);
  assert.equal(result.data.memberCount, 2);
  assert.deepEqual(Object.keys(result.data.members[0]).sort(), ["id", "image", "name"]);
  assert.equal(JSON.stringify(result.data).includes("private-owner@example.test"), false);
});

test("group member listing: missing/corrupt user records fall back safely", async () => {
  h.reset({ group: { memberIds: ["owner", "missing"] } });
  const result = await read(await get(members));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.members[1], { id: "missing", name: "Group member", image: "" });
});

test("group member listing: members who hide their profile photo never expose it", async () => {
  h.reset({ group: { memberIds: ["owner", "member"] } });
  h.seedKv("user:member:group-preferences:g1", { notifications: "all", showReadReceipts: true, hideProfilePhoto: true });
  const result = await read(await get(members));
  assert.equal(result.status, 200);
  const byId = Object.fromEntries(result.data.members.map(member => [member.id, member]));
  assert.equal(byId.member.image, "", "hideProfilePhoto members must not leak their photo");
  assert.equal(byId.member.name, "Member", "name stays visible; only the photo is private");
  assert.equal(byId.owner.image, "/owner.png", "other members keep their photos");
});

test("group member listing: unreadable preference records fail closed and are surfaced", async () => {
  h.reset({ group: { memberIds: ["owner", "member"] } });
  h.seedKv("user:member:group-preferences:g1", "corrupt-not-json{{{");
  const result = await read(await get(members));
  assert.equal(result.status, 200);
  const byId = Object.fromEntries(result.data.members.map(member => [member.id, member]));
  assert.equal(byId.member.name, "Member", "the name stays visible; only the photo is private");
  assert.equal(byId.member.image, "", "an undecodable preference must hide the photo, not expose it");
  assert.equal(byId.owner.image, "/owner.png", "readable records keep the normal behavior");
  assert.equal(result.data.degraded.unreadablePreferences, 1, "degraded records are surfaced to the caller");
  assert.equal(result.data.degraded.unreadableProfiles, 0);
});

test("group management: unauthenticated and malformed requests fail closed", async () => {
  h.reset({ session: null });
  assert.equal((await read(await post(manage, { action: "leave" }))).status, 401);
  h.reset();
  assert.equal((await read(await post(manage, { action: "unknown" }))).status, 400);
  assert.equal((await read(await post(manage, { action: "update", name: "x".repeat(51) }))).status, 400);
  assert.equal((await read(await post(manage, { action: "update", settings: { announcementsOnly: "yes" } }))).status, 400);
});

test("group management: missing groups and non-members are rejected", async () => {
  h.reset({ group: null });
  assert.equal((await read(await post(manage, { action: "leave" }))).status, 404);
  h.reset();
  h.setSession("outsider");
  assert.equal((await read(await post(manage, { action: "leave" }))).status, 403);
});

test("group management: admins can update details and settings atomically", async () => {
  h.reset();
  const result = await read(await post(manage, {
    action: "update",
    name: "  Product team  ",
    description: " New description ",
    settings: { onlyAdminsCanPinMessages: true, disappearingMessagesSeconds: 3600 },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.data.group.name, "Product team");
  assert.equal(result.data.group.description, "New description");
  assert.equal(result.data.group.settings.onlyAdminsCanPinMessages, true);
  assert.equal(result.data.group.settings.disappearingMessagesSeconds, 3600);
  assert.ok(h.pusherEvents.some(event => event.event === "group_updated"));
});

test("group management: ordinary members cannot change group settings", async () => {
  h.reset();
  h.setSession("member");
  const result = await read(await post(manage, { action: "update", settings: { announcementsOnly: true } }));
  assert.equal(result.status, 403);
});

test("group management: restricted group information cannot be edited by members", async () => {
  h.reset({ group: { settings: { onlyAdminsCanEditInfo: true } } });
  h.setSession("member");
  const result = await read(await post(manage, { action: "update", name: "Changed name" }));
  assert.equal(result.status, 403);
});

test("group management: creator can promote a member and promotion is idempotent", async () => {
  h.reset();
  let result = await read(await post(manage, { action: "promote", memberId: "member" }));
  assert.equal(result.status, 200);
  assert.ok(result.data.group.adminIds.includes("member"));
  result = await read(await post(manage, { action: "promote", memberId: "member" }));
  assert.equal(result.status, 200);
  assert.equal(result.data.group.adminIds.filter(id => id === "member").length, 1);
});

test("group management: non-creator admins cannot promote or demote", async () => {
  h.reset();
  h.setSession("admin");
  assert.equal((await read(await post(manage, { action: "promote", memberId: "member" }))).status, 403);
  assert.equal((await read(await post(manage, { action: "demote", memberId: "admin" }))).status, 403);
});

test("group management: the creator cannot lose their own admin role", async () => {
  h.reset();
  const promoteSelf = await read(await post(manage, { action: "promote", memberId: "owner" }));
  const demoteSelf = await read(await post(manage, { action: "demote", memberId: "owner" }));
  assert.equal(promoteSelf.status, 400);
  assert.equal(demoteSelf.status, 400);
});

test("group management: creator can demote another admin", async () => {
  h.reset();
  const result = await read(await post(manage, { action: "demote", memberId: "admin" }));
  assert.equal(result.status, 200);
  assert.equal(result.data.group.adminIds.includes("admin"), false);
});

test("group management: admins can remove non-creators but cannot remove the creator", async () => {
  h.reset();
  const removed = await read(await post(manage, { action: "remove", memberId: "member" }));
  assert.equal(removed.status, 200);
  assert.equal(removed.data.group.memberIds.includes("member"), false);
  assert.deepEqual(removed.data.removed, ["member"]);
  const ownerRemoval = await read(await post(manage, { action: "remove", memberId: "owner" }));
  assert.equal(ownerRemoval.status, 400);
});

test("group management: non-admins cannot remove members and unknown targets return 404", async () => {
  h.reset();
  h.setSession("member");
  assert.equal((await read(await post(manage, { action: "remove", memberId: "other" }))).status, 403);
  h.reset();
  assert.equal((await read(await post(manage, { action: "remove", memberId: "absent" }))).status, 404);
});

test("group management: creator leaving transfers ownership to a remaining admin", async () => {
  h.reset();
  const result = await read(await post(manage, { action: "leave" }));
  assert.equal(result.status, 200);
  assert.equal(result.data.group.creatorId, "admin");
  assert.equal(result.data.group.memberIds.includes("owner"), false);
  assert.ok(result.data.group.adminIds.includes("admin"));
  assert.ok(h.pusherEvents.some(event => event.event === "group_removed"));
});

test("group management: the final member leaving deletes the group", async () => {
  h.reset({ group: { creatorId: "owner", memberIds: ["owner"], adminIds: ["owner"] } });
  const result = await read(await post(manage, { action: "leave" }));
  assert.equal(result.status, 200);
  assert.equal(result.data.deleted, true);
  assert.equal(h.getGroup(), undefined);
  assert.ok(h.pusherEvents.some(event => event.event === "group_deleted"));
});

test("group management: compare-and-set retries are bounded and return 409 on contention", async () => {
  h.reset();
  h.forceRedisConflicts(4);
  const result = await read(await post(manage, { action: "update", name: "Retry group" }));
  assert.equal(result.status, 409);
  assert.match(result.data.message, /concurrently/i);
});

test("group features: authentication, membership and payload validation are enforced", async () => {
  h.reset({ session: null });
  assert.equal((await read(await post(features, { action: "createPoll", question: "Roadmap?", options: ["A", "B"] }))).status, 401);
  h.reset();
  h.setSession("outsider");
  assert.equal((await read(await post(features, { action: "announce", text: "Hello" }))).status, 403);
  h.setSession("owner");
  assert.equal((await read(await post(features, { action: "createPoll", question: "x", options: ["A", "B"] }))).status, 400);
  assert.equal((await read(await post(features, { action: "createPoll", question: "Valid?", options: ["Only one"] }))).status, 400);
});

test("group features: members can create valid polls unless admin-only mode is enabled", async () => {
  h.reset();
  h.setSession("member");
  let result = await read(await post(features, { action: "createPoll", question: "Choose a plan?", options: ["Basic", "Pro"] }));
  assert.equal(result.status, 200);
  assert.equal(result.data.features.polls.length, 1);
  h.reset({ group: { settings: { onlyAdminsCanCreatePolls: true } } });
  h.setSession("member");
  result = await read(await post(features, { action: "createPoll", question: "Choose a plan?", options: ["Basic", "Pro"] }));
  assert.equal(result.status, 403);
});

test("group features: poll votes deduplicate selections and replace a user's previous vote", async () => {
  h.reset();
  h.setSession("member");
  h.setFeatures({ polls: [{ id: "poll-1", multiple: false, closed: false, options: [
    { id: "a", label: "A", votes: [] }, { id: "b", label: "B", votes: [] },
  ] }], events: [], announcements: [] });
  let result = await read(await post(features, { action: "votePoll", pollId: "poll-1", optionIds: ["a", "a"] }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.result.options[0].votes, ["member"]);
  result = await read(await post(features, { action: "votePoll", pollId: "poll-1", optionIds: ["b"] }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.result.options.map(option => option.votes), [[], ["member"]]);
});

test("group features: closed polls and invalid option selections are rejected", async () => {
  h.reset();
  h.setFeatures({ polls: [{ id: "closed", closed: true, multiple: false, options: [{ id: "a", votes: [] }] }], events: [], announcements: [] });
  assert.equal((await read(await post(features, { action: "votePoll", pollId: "closed", optionIds: ["a"] }))).status, 404);
  h.setFeatures({ polls: [{ id: "open", closed: false, multiple: false, options: [{ id: "a", votes: [] }] }], events: [], announcements: [] });
  assert.equal((await read(await post(features, { action: "votePoll", pollId: "open", optionIds: ["unknown"] }))).status, 400);
  assert.equal((await read(await post(features, { action: "votePoll", pollId: "open", optionIds: ["a", "a", "a"] }))).status, 200);
});

test("group features: event creation rejects past dates and accepts future events", async () => {
  h.reset();
  assert.equal((await read(await post(features, { action: "createEvent", title: "Past event", startsAt: Date.now() - 1000 }))).status, 400);
  const result = await read(await post(features, { action: "createEvent", title: "Planning session", startsAt: Date.now() + 60_000 }));
  assert.equal(result.status, 200);
  assert.equal(result.data.result.title, "Planning session");
  assert.deepEqual(result.data.result.responses, { going: [], maybe: [], "not-going": [] });
});

test("group features: event responses move a user between RSVP states", async () => {
  h.reset();
  h.setSession("member");
  h.setFeatures({ polls: [], announcements: [], events: [{ id: "event-1", responses: { going: [], maybe: [], "not-going": [] } }] });
  assert.equal((await read(await post(features, { action: "respondEvent", eventId: "event-1", response: "maybe" }))).status, 200);
  const result = await read(await post(features, { action: "respondEvent", eventId: "event-1", response: "going" }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.result.responses, { going: ["member"], maybe: [], "not-going": [] });
  assert.equal((await read(await post(features, { action: "respondEvent", eventId: "missing", response: "going" }))).status, 404);
});

test("group features: announcement permissions are enforced and admins can publish", async () => {
  h.reset({ group: { settings: { announcementsOnly: true } } });
  h.setSession("member");
  assert.equal((await read(await post(features, { action: "announce", text: "Notice" }))).status, 403);
  h.setSession("owner");
  const result = await read(await post(features, { action: "announce", text: "  Notice  " }));
  assert.equal(result.status, 200);
  assert.equal(result.data.result.text, "Notice");
});

test("group features: GET returns member-specific poll selections only to group members", async () => {
  h.reset();
  h.setFeatures({ polls: [{ id: "poll-1", options: [{ id: "a", votes: ["member"] }, { id: "b", votes: [] }] }], events: [], announcements: [] });
  h.setSession("member");
  const result = await read(await get(features));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.features.polls[0].myOptionIds, ["a"]);
  h.setSession("outsider");
  assert.equal((await read(await get(features))).status, 403);
});

test("group pins: authentication, membership and request validation are enforced", async () => {
  h.reset({ session: null });
  assert.equal((await read(await post(pins, { messageId: "m1", pinned: true }))).status, 401);
  h.reset();
  assert.equal((await read(await post(pins, { messageId: "", pinned: true }))).status, 400);
  h.setSession("outsider");
  assert.equal((await read(await post(pins, { messageId: "m1", pinned: true }))).status, 403);
});

test("group pins: admin-only policy blocks members while admins can pin and unpin", async () => {
  h.reset({ group: { settings: { onlyAdminsCanPinMessages: true } } });
  h.setMessages([{ id: "m1", senderId: "member", timestamp: 10, text: "Hello" }]);
  h.setSession("member");
  assert.equal((await read(await post(pins, { messageId: "m1", pinned: true }))).status, 403);
  h.setSession("owner");
  let result = await read(await post(pins, { messageId: "m1", pinned: true }));
  assert.equal(result.status, 200);
  assert.equal(result.data.message.isPinned, true);
  result = await read(await post(pins, { messageId: "m1", pinned: false }));
  assert.equal(result.status, 200);
  assert.equal(result.data.message.isPinned, false);
});

test("group pins: system and deleted messages cannot be pinned", async () => {
  h.reset();
  h.setMessages([
    { id: "system", senderId: "system", timestamp: 10, text: "System" },
    { id: "deleted", senderId: "member", isDeleted: true, timestamp: 11, text: "Deleted" },
  ]);
  assert.equal((await read(await post(pins, { messageId: "system", pinned: true }))).status, 404);
  assert.equal((await read(await post(pins, { messageId: "deleted", pinned: true }))).status, 404);
  assert.equal((await read(await post(pins, { messageId: "missing", pinned: true }))).status, 404);
});

test("group pins: list excludes expired/deleted messages and is newest-pin first", async () => {
  h.reset();
  h.setMessages([
    { id: "old", senderId: "member", isPinned: true, timestamp: 10, pinnedAt: 10 },
    { id: "new", senderId: "member", isPinned: true, timestamp: 20, pinnedAt: 20 },
    { id: "deleted", senderId: "member", isPinned: true, isDeleted: true, timestamp: 30, pinnedAt: 30 },
    { id: "expired", senderId: "member", isPinned: true, expiresAt: Date.now() - 1, timestamp: 40, pinnedAt: 40 },
  ]);
  const result = await read(await get(pins));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.messages.map(message => message.id), ["new", "old"]);
});

test("group preferences: authentication, group membership and query validation are enforced", async () => {
  h.reset({ session: null });
  assert.equal((await read(await get(preferences, "http://localhost/api/user/group-preferences?groupId=g1"))).status, 401);
  h.reset();
  assert.equal((await read(await get(preferences, "http://localhost/api/user/group-preferences"))).status, 400);
  h.setSession("outsider");
  assert.equal((await read(await get(preferences, "http://localhost/api/user/group-preferences?groupId=g1"))).status, 403);
});

test("group preferences: invalid and empty patches are rejected", async () => {
  h.reset();
  assert.equal((await read(await preferences.PUT(h.request({ groupId: "g1", notifications: "sometimes" })))).status, 400);
  assert.equal((await read(await preferences.PUT(h.request({ groupId: "g1" })))).status, 400);
});

test("group preferences: updates persist per user and GET returns defaults for another user", async () => {
  h.reset();
  let result = await read(await preferences.PUT(h.request({
    groupId: "g1", notifications: "muted", showReadReceipts: false, hideProfilePhoto: true,
  })));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.preferences.notifications, "muted");
  assert.equal(result.data.preferences.showReadReceipts, false);
  assert.equal(result.data.preferences.hideProfilePhoto, true);

  result = await read(await get(preferences, "http://localhost/api/user/group-preferences?groupId=g1"));
  assert.equal(result.status, 200);
  assert.equal(result.data.preferences.notifications, "muted");
  h.setSession("member");
  result = await read(await get(preferences, "http://localhost/api/user/group-preferences?groupId=g1"));
  assert.deepEqual(result.data.preferences, { notifications: "all", showReadReceipts: true, hideProfilePhoto: false });
});


test("group management: every boolean permission flag can be enabled and remains boolean", async () => {
  const flags = [
    "onlyAdminsCanEditInfo",
    "onlyAdminsCanAddMembers",
    "onlyAdminsCanSendMessages",
    "approvalRequired",
    "onlyAdminsCanPinMessages",
    "onlyAdminsCanCreatePolls",
    "onlyAdminsCanCreateEvents",
    "announcementsOnly",
    "allowMemberInvites",
  ];
  for (const flag of flags) {
    h.reset();
    const result = await read(await post(manage, { action: "update", settings: { [flag]: false } }));
    assert.equal(result.status, 200, flag);
    assert.equal(typeof result.data.group.settings[flag], "boolean", flag);
    assert.equal(result.data.group.settings[flag], false, flag);
  }
});

test("group management: disappearing-message retention accepts its supported boundaries", async () => {
  for (const seconds of [0, 86400, 604800, 7776000, 31536000]) {
    h.reset();
    const result = await read(await post(manage, { action: "update", settings: { disappearingMessagesSeconds: seconds } }));
    assert.equal(result.status, 200, String(seconds));
    assert.equal(result.data.group.settings.disappearingMessagesSeconds, seconds);
  }
  h.reset();
  assert.equal((await read(await post(manage, { action: "update", settings: { disappearingMessagesSeconds: 31536001 } }))).status, 400);
  h.reset();
  assert.equal((await read(await post(manage, { action: "update", settings: { disappearingMessagesSeconds: -1 } }))).status, 400);
});

test("legacy group with an empty adminIds array still treats its creator as admin", async () => {
  h.reset({ group: { adminIds: [] } });
  const updateResult = await read(await post(manage, { action: "update", settings: { announcementsOnly: true } }));
  assert.equal(updateResult.status, 200);
  assert.deepEqual(updateResult.data.group.adminIds, []);
  h.setFeatures({ polls: [], events: [], announcements: [] });
  const featureResult = await read(await post(features, { action: "createEvent", title: "Creator event", startsAt: Date.now() + 60_000 }));
  assert.equal(featureResult.status, 200);
});

test("group features: admin-only event creation and message announcements are enforced", async () => {
  h.reset({ group: { settings: { onlyAdminsCanCreateEvents: true, onlyAdminsCanSendMessages: true } } });
  h.setSession("member");
  const eventDenied = await read(await post(features, { action: "createEvent", title: "Member event", startsAt: Date.now() + 60_000 }));
  assert.equal(eventDenied.status, 403);
  const announcementDenied = await read(await post(features, { action: "announce", text: "Member announcement" }));
  assert.equal(announcementDenied.status, 403);
  h.setSession("owner");
  const eventAllowed = await read(await post(features, { action: "createEvent", title: "Admin event", startsAt: Date.now() + 60_000 }));
  assert.equal(eventAllowed.status, 200);
});

test("group routes reject malformed JSON with 400, not an internal server error", async () => {
  h.reset();
  const invalid = () => h.requestRaw("{invalid");
  assert.equal((await read(await manage.POST(invalid(), context))).status, 400);
  assert.equal((await read(await features.POST(invalid(), context))).status, 400);
  assert.equal((await read(await pins.POST(invalid(), context))).status, 400);
  assert.equal((await read(await preferences.PUT(invalid()))).status, 400);
  assert.equal((await read(await addMembers.POST(invalid()))).status, 400);
});

test("group and activity mutations remain successful when Pusher is unavailable", async () => {
  h.reset();
  h.setPusherFailure(true);
  const groupUpdate = await read(await post(manage, { action: "update", name: "Pusher down" }));
  assert.equal(groupUpdate.status, 200);
  const activityUpdate = await read(await post(features, { action: "createPoll", question: "Ship this?", options: ["Yes", "No"] }));
  assert.equal(activityUpdate.status, 200);
  const pinTestMessage = { id: "pusher-pin", senderId: "member", text: "Hello", timestamp: Date.now() };
  h.setMessages([pinTestMessage]);
  const pinUpdate = await read(await post(pins, { messageId: "pusher-pin", pinned: true }));
  assert.equal(pinUpdate.status, 200);
});

test("member invitations enforce admin policy and update both membership indexes", async () => {
  h.reset();
  h.setUser("new-user", { name: "New User", image: "/new-user.png" });
  h.setSession("member");
  h.setGroup({ ...h.getGroup(), settings: { onlyAdminsCanAddMembers: true } });
  const denied = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(denied.status, 403);

  h.setGroup({ ...h.getGroup(), settings: { allowMemberInvites: false } });
  const invitesDisabled = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(invitesDisabled.status, 403);
  // Machine-readable policy codes let the UI distinguish the two 403 shapes
  // and explain the group's rule instead of a generic failure.
  assert.equal(invitesDisabled.data.code, "MEMBER_ADD_ADMIN_ONLY");
  assert.equal(invitesDisabled.data.message, "Only group admins can add members");

  h.setGroup({ ...h.getGroup(), settings: { approvalRequired: true } });
  const approvalRequired = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(approvalRequired.status, 403);
  assert.equal(approvalRequired.data.code, "ADMIN_APPROVAL_REQUIRED");
  assert.equal(approvalRequired.data.message, "A group admin must approve new members");

  h.setGroup({ ...h.getGroup(), settings: { approvalRequired: true } });
  h.setSession("owner");
  const adminApproved = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(adminApproved.status, 200);

  h.reset();
  h.setUser("new-user", { name: "New User", image: "/new-user.png" });
  const result = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user", "new-user", "member", "missing"] })));
  assert.equal(result.status, 200);
  assert.equal(result.data.addedCount, 1);
  assert.ok(result.data.group.memberIds.includes("new-user"));
  assert.ok(h.getSetMembers("group:g1:members").includes("new-user"));
  assert.ok(h.getSetMembers("user:new-user:groups").includes("g1"));
  assert.ok(h.getMessages().some(message => message.senderId === "system" && message.text.includes("New User")));
});

test("member invitation returns 409 for existing members and 404 for unknown users", async () => {
  h.reset();
  const duplicate = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["member", "member"] })));
  assert.equal(duplicate.status, 409);
  const missing = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["missing"] })));
  assert.equal(missing.status, 404);
});

test("member invitation commits successfully even if realtime delivery fails", async () => {
  h.reset();
  h.setUser("new-user", { name: "New User" });
  h.setPusherFailure(true);
  const result = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(result.status, 200);
  assert.ok(result.data.group.memberIds.includes("new-user"));
});

test("member invitation retries when the group document changes concurrently and still commits", async () => {
  h.reset();
  h.setUser("new-user", { name: "New User" });
  h.forceRedisConflicts(2);
  const result = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(result.status, 200, "bounded CAS retries must absorb concurrent updates");
  assert.ok(result.data.group.memberIds.includes("new-user"));
  assert.ok(h.getSetMembers("group:g1:members").includes("new-user"));
});

test("member invitation gives up with 409 when conflicts never resolve", async () => {
  h.reset();
  h.setUser("new-user", { name: "New User" });
  h.forceRedisConflicts(10);
  const result = await read(await addMembers.POST(h.request({ groupId: "g1", memberIds: ["new-user"] })));
  assert.equal(result.status, 409);
  assert.match(result.data.message, /concurrently/i);
  assert.equal(h.getGroup().memberIds.includes("new-user"), false, "no partial membership may be committed");
  assert.equal(h.getSetMembers("group:g1:members").includes("new-user"), false);
});
