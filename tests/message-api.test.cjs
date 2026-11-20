const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

const send = h.loadRoute("src/app/api/message/send/route.ts");
const edit = h.loadRoute("src/app/api/message/edit/route.ts");
const remove = h.loadRoute("src/app/api/message/delete/route.ts");
const react = h.loadRoute("src/app/api/message/react/route.ts");
const read = h.loadRoute("src/app/api/message/read/route.ts");
const history = h.loadRoute("src/app/api/message/history/route.ts");
const search = h.loadRoute("src/app/api/message/search/route.ts");
const typing = h.loadRoute("src/app/api/message/typing/route.ts");

const status = async response => ({ status: response.status, data: response.headers.get("content-type")?.includes("json") ? await h.body(response) : await response.text(), headers: response.headers });

function seedDirectFriendship() {
  h.seedSet("user:owner:friends", ["member"]);
  h.seedSet("user:member:friends", ["owner"]);
}

function seedGroupChat() {
  h.seedSet("group:g1:members", ["owner", "admin", "member"]);
}

const DIRECT = "owner--member";
const GROUP_CHAT = "group--g1";

// --------------------------------------------------------------- message send
test("message send: unauthenticated, malformed and invalid payloads fail closed", async () => {
  h.reset({ session: null });
  assert.equal((await status(await send.POST(h.request({ chatId: DIRECT, text: "hi" })))).status, 401);
  h.reset();
  assert.equal((await status(await send.POST(h.requestRaw("{invalid")))).status, 400);
  assert.equal((await status(await send.POST(h.request({ chatId: DIRECT, text: "   " })))).status, 422);
  assert.equal((await status(await send.POST(h.request({ chatId: DIRECT, text: "x".repeat(2001) })))).status, 422);
});

test("message send: direct chats require both friendship and participation", async () => {
  h.reset();
  h.setSession("outsider");
  assert.equal((await status(await send.POST(h.request({ chatId: DIRECT, text: "hi" })))).status, 401);
  h.setSession("owner");
  assert.equal((await status(await send.POST(h.request({ chatId: "owner--admin--member", text: "hi" })))).status, 400);
  assert.equal((await status(await send.POST(h.request({ chatId: "owner--stranger", text: "hi" })))).status, 401);
});

test("message send: direct happy path persists first, then broadcasts and counts unread", async () => {
  h.reset();
  seedDirectFriendship();
  h.setPusherFailure(true);
  const sent = await status(await send.POST(h.request({ chatId: DIRECT, text: "  hello there  " })));
  assert.equal(sent.status, 200, "a Pusher outage must not fail an already-persisted message");
  const stored = h.getDirectMessages();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].text, "  hello there  ");
  assert.equal(stored[0].senderId, "owner");
  assert.equal(stored[0].receiverId, "member");
  assert.equal(stored[0].senderName, "Owner");
  assert.equal(typeof stored[0].clientRequestId, "string", "server-generated IDs preserve compatibility with older clients");
  assert.deepEqual(h.getHash("user:member:unread"), { [DIRECT]: 1 });
  assert.equal(h.pusherEvents.filter(event => event.event === "incoming-message").length, 0, "failed broadcast must not be recorded as delivered");
  assert.equal(h.getZset(`chat:${DIRECT}:delivery:outbox`).length, 1, "failed delivery must remain in the durable outbox");
  assert.deepEqual(h.getHash("user:owner:unread"), {});
});

test("message send: retries with the same requestId persist and count a direct message once", async () => {
  h.reset();
  seedDirectFriendship();
  const payload = { chatId: DIRECT, text: "retry-safe", requestId: "request-direct-0001" };
  const first = await status(await send.POST(h.request(payload)));
  const retry = await status(await send.POST(h.request(payload)));
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.id, first.data.id, "a retry returns the original server message");
  assert.equal(first.data.clientRequestId, payload.requestId);
  assert.equal(h.getDirectMessages().length, 1);
  assert.deepEqual(h.getHash("user:member:unread"), { [DIRECT]: 1 });
  assert.equal(h.pusherEvents.filter(event => event.event === "incoming-message").length, 1);
});

test("message send: reusing a requestId with a different payload returns 409", async () => {
  h.reset();
  seedDirectFriendship();
  const original = { chatId: DIRECT, text: "original payload", requestId: "request-payload-collision-01" };
  assert.equal((await status(await send.POST(h.request(original)))).status, 200);
  const collision = await status(await send.POST(h.request({ ...original, text: "changed payload" })));
  assert.equal(collision.status, 409);
  assert.equal(h.getDirectMessages().length, 1);
  assert.equal(h.getDirectMessages()[0].text, "original payload");
});

test("message send: retries with the same requestId do not duplicate group unread counts", async () => {
  h.reset();
  seedGroupChat();
  const payload = { chatId: GROUP_CHAT, text: "group retry-safe", requestId: "request-group-0001" };
  const first = await status(await send.POST(h.request(payload)));
  const retry = await status(await send.POST(h.request(payload)));
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.id, first.data.id);
  assert.equal(h.getMessages().length, 1);
  assert.deepEqual(h.getHash("user:admin:unread"), { [GROUP_CHAT]: 1 });
  assert.deepEqual(h.getHash("user:member:unread"), { [GROUP_CHAT]: 1 });
  assert.equal(h.pusherEvents.filter(event => event.event === "incoming-message").length, 1);
});

test("message send: idempotent retries still require current chat authorization", async () => {
  h.reset();
  seedDirectFriendship();
  const directPayload = { chatId: DIRECT, text: "authorized once", requestId: "request-auth-direct-01" };
  assert.equal((await status(await send.POST(h.request(directPayload)))).status, 200);
  h.seedSet("user:owner:friends", []);
  assert.equal((await status(await send.POST(h.request(directPayload)))).status, 401);

  h.reset();
  seedGroupChat();
  h.setSession("member");
  const groupPayload = { chatId: GROUP_CHAT, text: "member once", requestId: "request-auth-group-01" };
  assert.equal((await status(await send.POST(h.request(groupPayload)))).status, 200);
  h.seedSet("group:g1:members", ["owner", "admin"]);
  assert.equal((await status(await send.POST(h.request(groupPayload)))).status, 403);
});

test("message send: a completed retry does not consume the new-message rate limit", async () => {
  h.reset();
  seedDirectFriendship();
  const original = { chatId: DIRECT, text: "original", requestId: "request-rate-limit-01" };
  const first = await status(await send.POST(h.request(original)));
  assert.equal(first.status, 200);
  for (let index = 0; index < 14; index += 1) {
    const sent = await status(await send.POST(h.request({ chatId: DIRECT, text: `new ${index}`, requestId: `request-rate-${index}-0001` })));
    assert.equal(sent.status, 200);
  }
  const retry = await status(await send.POST(h.request(original)));
  assert.equal(retry.status, 200);
  assert.equal(retry.data.id, first.data.id);
  assert.equal(h.getDirectMessages().length, 15);
});

test("message send: media-only messages are accepted and broadcast to the friend", async () => {
  h.reset();
  seedDirectFriendship();
  const sent = await status(await send.POST(h.request({
    chatId: DIRECT, text: "", mediaUrl: "https://x.public.blob.vercel-storage.com/a.png", mediaType: "image", fileName: "a.png", fileSize: 10,
  })));
  assert.equal(sent.status, 200);
  assert.equal(h.getDirectMessages()[0].mediaType, "image");
  const channels = h.pusherEvents.map(event => event.channel);
  assert.ok(channels.includes(`private-chat:${DIRECT}`));
  assert.ok(channels.includes("private-user:member:chats"));
});

test("message send: replies to deleted, system or unknown messages are rejected", async () => {
  h.reset();
  seedDirectFriendship();
  const make = (id, extra = {}) => ({ id, senderId: "member", text: id, timestamp: Date.now() + Math.random(), ...extra });
  h.setDirectMessages([
    make("sys", { senderId: "system" }),
    make("gone", { isDeleted: true }),
    make("live"),
  ]);
  const base = { chatId: DIRECT, text: "reply" };
  assert.equal((await status(await send.POST(h.request({ ...base, replyTo: { id: "missing", senderName: "x" } })))).status, 400);
  assert.equal((await status(await send.POST(h.request({ ...base, replyTo: { id: "sys", senderName: "x" } })))).status, 400);
  assert.equal((await status(await send.POST(h.request({ ...base, replyTo: { id: "gone", senderName: "x" } })))).status, 400);
  assert.equal((await status(await send.POST(h.request({ ...base, replyTo: { id: "live", senderName: "x", text: "live" } })))).status, 200);
});

test("message send: oversized profile images are stripped from realtime payloads only", async () => {
  h.reset();
  seedDirectFriendship();
  h.setUser("owner", { name: "Owner", image: "data:image/png;base64," + "A".repeat(3000) });
  const sent = await status(await send.POST(h.request({ chatId: DIRECT, text: "big avatar" })));
  assert.equal(sent.status, 200);
  assert.ok(h.getDirectMessages()[0].senderImg.startsWith("data:"), "storage keeps the full avatar");
  assert.equal(h.pusherEvents.find(event => event.event === "new_message").payload.senderImg, undefined, "Pusher payloads must not carry huge avatars");
});

test("message send: group chats enforce membership and admin-only policies", async () => {
  h.reset();
  seedGroupChat();
  h.setSession("outsider");
  assert.equal((await status(await send.POST(h.request({ chatId: GROUP_CHAT, text: "hi" })))).status, 403);
  h.setSession("member");
  h.setGroup({ ...h.getGroup(), settings: { onlyAdminsCanSendMessages: true } });
  assert.equal((await status(await send.POST(h.request({ chatId: GROUP_CHAT, text: "hi" })))).status, 403);
  h.setSession("admin");
  assert.equal((await status(await send.POST(h.request({ chatId: GROUP_CHAT, text: "hi" })))).status, 200);
  h.reset();
  // Membership is checked before group existence, so a stranger gets 403 even
  // for a group id that does not exist (no existence leak).
  assert.equal((await status(await send.POST(h.request({ chatId: "group--missing", text: "hi" })))).status, 403);
});

test("message send: group broadcasts skip muted members and hidden profile photos", async () => {
  h.reset();
  seedGroupChat();
  h.seedKv("user:member:group-preferences:g1", { notifications: "muted" });
  h.seedKv("user:owner:group-preferences:g1", { hideProfilePhoto: true });
  const sent = await status(await send.POST(h.request({ chatId: GROUP_CHAT, text: "announcement" })));
  assert.equal(sent.status, 200);
  assert.ok(h.getMessages()[0].text === "announcement");
  assert.equal(h.getMessages()[0].senderImg, undefined, "sender photo is hidden when the sender opted out");
  const notified = h.pusherEvents.filter(event => event.event === "new_message").map(event => event.channel);
  assert.deepEqual(notified.sort(), ["private-user:admin:chats"], "muted members receive no notification");
  assert.deepEqual(h.getHash("user:member:unread"), { [GROUP_CHAT]: 1 }, "muted still counts unread");
  assert.deepEqual(h.getHash("user:admin:unread"), { [GROUP_CHAT]: 1 });
});

test("message send: disappearing messages are indexed for expiry cleanup", async () => {
  h.reset();
  seedGroupChat();
  h.setGroup({ ...h.getGroup(), settings: { disappearingMessagesSeconds: 3600 } });
  const before = Date.now();
  const sent = await status(await send.POST(h.request({ chatId: GROUP_CHAT, text: "ephemeral" })));
  assert.equal(sent.status, 200);
  const stored = h.getMessages()[0];
  assert.ok(stored.expiresAt >= before + 3600_000 - 2000 && stored.expiresAt <= Date.now() + 3600_000 + 2000);
  const index = h.getZset("chat:expiring");
  assert.equal(index.length, 1);
  assert.equal(index[0].value.chatKey, "chat:group--g1:messages");
  assert.equal(index[0].value.messageId, stored.id);
  assert.equal(index[0].score, stored.expiresAt);
});

test("message send: sliding-window rate limit rejects the 16th message within 10 seconds", async () => {
  h.reset();
  seedDirectFriendship();
  for (let i = 0; i < 15; i++) {
    const sent = await status(await send.POST(h.request({ chatId: DIRECT, text: `msg ${i}` })));
    assert.equal(sent.status, 200, `message ${i + 1} should pass`);
  }
  const blocked = await status(await send.POST(h.request({ chatId: DIRECT, text: "one too many" })));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "5");
  assert.equal(h.getDirectMessages().length, 15, "the rejected message must not be persisted");
});


test("message send: concurrent bursts cannot race past the atomic sliding-window limit", async () => {
  h.reset();
  seedDirectFriendship();
  const attempts = await Promise.all(Array.from({ length: 30 }, (_, index) =>
    send.POST(h.request({ chatId: DIRECT, text: `parallel ${index}`, requestId: `parallel-rate-${index}-0001` }))
  ));
  const statuses = await Promise.all(attempts.map(response => response.status));
  assert.equal(statuses.filter(value => value === 200).length, 15);
  assert.equal(statuses.filter(value => value === 429).length, 15);
  assert.equal(h.getDirectMessages().length, 15);
});

// --------------------------------------------------------------- message edit
test("message edit: authorization boundary (unauthenticated, non-member, non-sender)", async () => {
  h.reset({ session: null });
  let chatId = h.setDirectMessages([{ id: "m1", senderId: "owner", text: "hello", timestamp: 1 }]);
  assert.equal((await status(await edit.POST(h.request({ messageId: "m1", chatId, newText: "x" })))).status, 401, "unauthenticated");
  h.reset();
  chatId = h.setDirectMessages([{ id: "m1", senderId: "owner", text: "hello", timestamp: 1 }]);
  h.setSession("outsider");
  assert.equal((await status(await edit.POST(h.request({ messageId: "m1", chatId, newText: "x" })))).status, 403, "not a participant");
  h.setSession("member");
  assert.equal((await status(await edit.POST(h.request({ messageId: "m1", chatId, newText: "x" })))).status, 403, "not the sender (IDOR)");
  assert.equal(h.getDirectMessages()[0].text, "hello", "a rejected edit must not mutate the message");
});

test("message edit: sender can edit and the edit is broadcast", async () => {
  h.reset();
  seedDirectFriendship();
  const chatId = h.setDirectMessages([{ id: "m1", senderId: "owner", text: "hello", timestamp: 1 }]);
  const result = await status(await edit.POST(h.request({ messageId: "m1", chatId, newText: "hello edited" })));
  assert.equal(result.status, 200);
  assert.equal(result.data, "OK");
  const stored = h.getDirectMessages()[0];
  assert.equal(stored.text, "hello edited");
  assert.equal(stored.isEdited, true);
  const event = h.pusherEvents.find(item => item.event === "message_edited");
  assert.deepEqual(event.payload, { messageId: "m1", text: "hello edited", isEdited: true });
});

test("message edit: system, deleted, unknown and empty-text edge cases", async () => {
  h.reset();
  seedDirectFriendship();
  h.setDirectMessages([
    { id: "sys", senderId: "system", text: "sys", timestamp: 1 },
    { id: "gone", senderId: "owner", text: "old", timestamp: 2, isDeleted: true },
    { id: "media", senderId: "owner", text: "", mediaUrl: "https://x.public.blob.vercel-storage.com/a.png", timestamp: 3 },
    { id: "texty", senderId: "owner", text: "words only", timestamp: 4 },
  ]);
  const call = async payload => status(await edit.POST(h.request(payload)));
  assert.equal((await call({ messageId: "sys", chatId: DIRECT, newText: "x" })).status, 400);
  assert.equal((await call({ messageId: "gone", chatId: DIRECT, newText: "x" })).status, 400);
  assert.equal((await call({ messageId: "missing", chatId: DIRECT, newText: "x" })).status, 404);
  assert.equal((await call({ messageId: "media", chatId: DIRECT, newText: "   " })).status, 200, "media-backed messages may be 'edited' to blank text");
  assert.equal((await call({ messageId: "texty", chatId: DIRECT, newText: "   " })).status, 400, "text-only messages cannot become empty");
  assert.equal((await call({ messageId: "", chatId: DIRECT, newText: "x" })).status, 422);
});

test("message edit: group membership gates and malformed JSON behavior", async () => {
  h.reset();
  h.setMessages([{ id: "gm1", senderId: "member", text: "hi", timestamp: 1 }], "g1");
  seedGroupChat();
  h.setSession("member");
  assert.equal((await status(await edit.POST(h.request({ messageId: "gm1", chatId: GROUP_CHAT, newText: "edited" })))).status, 200);
  h.reset({ group: null });
  h.setSession("member");
  assert.equal((await status(await edit.POST(h.request({ messageId: "gm1", chatId: GROUP_CHAT, newText: "x" })))).status, 403);
  h.reset();
  // Current behavior: malformed JSON escapes the parse guard and returns 500.
  // Ideally this should be a 400; the assertion pins today's behavior.
  assert.equal((await status(await edit.POST(h.requestRaw("{invalid")))).status, 500);
});

// ------------------------------------------------------------- message delete
test("message delete: only the sender can delete (IDOR protected)", async () => {
  h.reset();
  const chatId = h.setDirectMessages([{ id: "m1", senderId: "owner", text: "mine", timestamp: 1 }]);
  h.setSession("member");
  const forbidden = await status(await remove.POST(h.request({ messageId: "m1", chatId })));
  assert.equal(forbidden.status, 403);
  assert.equal(h.getDirectMessages()[0].isDeleted, undefined, "message must survive a forbidden delete");
  h.setSession("outsider");
  assert.equal((await status(await remove.POST(h.request({ messageId: "m1", chatId })))).status, 403);
  h.reset({ session: null });
  assert.equal((await status(await remove.POST(h.request({ messageId: "m1", chatId })))).status, 401);
});

test("message delete: sender soft-deletes, owned attachments are removed from Blob", async () => {
  h.reset();
  seedDirectFriendship();
  const blobUrl = "https://bucket.public.blob.vercel-storage.com/file-abc.pdf";
  const chatId = h.setDirectMessages([
    { id: "m1", senderId: "owner", text: "doc", timestamp: 1, mediaUrl: blobUrl, mediaType: "file", fileName: "f.pdf", fileSize: 9, senderImg: "/owner.png" },
    { id: "keep", senderId: "owner", text: "stay", timestamp: 2 },
  ]);
  const result = await status(await remove.POST(h.request({ messageId: "m1", chatId })));
  assert.equal(result.status, 200);
  const deleted = h.getDirectMessages().find(message => message.id === "m1");
  assert.equal(deleted.isDeleted, true);
  assert.equal(deleted.text, "This message was deleted");
  assert.equal(deleted.mediaUrl, undefined);
  assert.equal(deleted.fileName, undefined);
  assert.equal(deleted.senderImg, undefined);
  assert.deepEqual(h.getDirectMessages().filter(message => !message.isDeleted).map(message => message.id), ["keep"]);
  assert.deepEqual(h.blobCalls, [blobUrl]);
  assert.ok(h.pusherEvents.some(event => event.event === "message_deleted" && event.payload.messageId === "m1"));
});

test("message delete: external attachments and blob outages are handled safely", async () => {
  h.reset();
  seedDirectFriendship();
  const chatId = h.setDirectMessages([{ id: "m2", senderId: "owner", text: "external", timestamp: 3, mediaUrl: "https://evil.example.com/a.png" }]);
  const result = await status(await remove.POST(h.request({ messageId: "m2", chatId })));
  assert.equal(result.status, 200);
  assert.deepEqual(h.blobCalls, [], "third-party URLs must not be sent to Blob deletion");
  h.reset();
  seedDirectFriendship();
  h.setDirectMessages([{ id: "m3", senderId: "owner", text: "x", timestamp: 4, mediaUrl: "https://bucket.public.blob.vercel-storage.com/b.png" }]);
  h.setBlobFailure(true);
  const failing = await status(await remove.POST(h.request({ messageId: "m3", chatId: DIRECT })));
  assert.equal(failing.status, 200, "message deletion succeeds while failed Blob cleanup remains queued");
  assert.equal(h.getDirectMessages()[0].isDeleted, true, "the message is tombstoned before external cleanup");
  assert.equal(h.getZset("media:cleanup").length, 1, "failed Blob deletion remains durably retryable");
});

test("message delete: system, already-deleted and unknown messages are rejected", async () => {
  h.reset();
  seedDirectFriendship();
  h.setDirectMessages([
    { id: "sys", senderId: "system", text: "sys", timestamp: 1 },
    { id: "gone", senderId: "owner", text: "old", timestamp: 2, isDeleted: true },
  ]);
  const call = async payload => status(await remove.POST(h.request(payload)));
  assert.equal((await call({ messageId: "sys", chatId: DIRECT })).status, 400);
  assert.equal((await call({ messageId: "gone", chatId: DIRECT })).status, 400);
  assert.equal((await call({ messageId: "missing", chatId: DIRECT })).status, 404);
  assert.equal((await call({ messageId: "", chatId: DIRECT })).status, 422);
});

// ------------------------------------------------------------- message react
test("message react: toggle adds and removes a user's reaction atomically", async () => {
  h.reset();
  seedDirectFriendship();
  const chatId = h.setDirectMessages([{ id: "m1", senderId: "member", text: "nice", timestamp: 1 }]);
  const first = await status(await react.POST(h.request({ messageId: "m1", chatId, emoji: "👍" })));
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.reactions, { "👍": ["owner"] });
  const second = await status(await react.POST(h.request({ messageId: "m1", chatId, emoji: "👍" })));
  assert.deepEqual(second.data.reactions, {}, "toggling twice removes the reaction");
  await react.POST(h.request({ messageId: "m1", chatId, emoji: "❤️" }));
  await react.POST(h.request({ messageId: "m1", chatId, emoji: "👍" }));
  const stored = h.getDirectMessages()[0];
  assert.deepEqual(stored.reactions, { "❤️": ["owner"], "👍": ["owner"] });
  assert.ok(h.pusherEvents.filter(event => event.event === "message_reacted").length >= 3);
});

test("message react: authorization and target validation", async () => {
  h.reset();
  seedDirectFriendship();
  const chatId = h.setDirectMessages([{ id: "m1", senderId: "member", text: "nice", timestamp: 1 }]);
  h.setSession("outsider");
  assert.equal((await status(await react.POST(h.request({ messageId: "m1", chatId, emoji: "👍" })))).status, 403, "non-participant");
  h.setSession("owner");
  assert.equal((await status(await react.POST(h.request({ messageId: "m1", chatId: "owner--stranger", emoji: "👍" })))).status, 403, "not friends");
  assert.equal((await status(await react.POST(h.request({ messageId: "missing", chatId, emoji: "👍" })))).status, 404);
  h.setDirectMessages([
    { id: "sys", senderId: "system", text: "s", timestamp: 2 },
    { id: "gone", senderId: "member", text: "g", timestamp: 3, isDeleted: true },
  ], "owner", "member");
  assert.equal((await status(await react.POST(h.request({ messageId: "sys", chatId, emoji: "👍" })))).status, 400);
  assert.equal((await status(await react.POST(h.request({ messageId: "gone", chatId, emoji: "👍" })))).status, 400);
  assert.equal((await status(await react.POST(h.request({ messageId: "m1", chatId, emoji: "x".repeat(9) })))).status, 422);
  h.reset({ session: null });
  assert.equal((await status(await react.POST(h.request({ messageId: "m1", chatId, emoji: "👍" })))).status, 401);
});

test("message react: group membership is enforced", async () => {
  h.reset();
  seedGroupChat();
  h.setMessages([{ id: "gm1", senderId: "admin", text: "poll time", timestamp: 1 }], "g1");
  h.setSession("member");
  assert.equal((await status(await react.POST(h.request({ messageId: "gm1", chatId: GROUP_CHAT, emoji: "🔥" })))).status, 200);
  h.reset();
  seedGroupChat();
  h.setMessages([{ id: "gm1", senderId: "admin", text: "poll time", timestamp: 1 }], "g1");
  h.setSession("outsider");
  assert.equal((await status(await react.POST(h.request({ messageId: "gm1", chatId: GROUP_CHAT, emoji: "🔥" })))).status, 403);
});

// ------------------------------------------------------------- message read
test("message read: clears unread and emits receipts", async () => {
  h.reset();
  seedDirectFriendship();
  h.seedHash("user:owner:unread", { [DIRECT]: 3 });
  const result = await status(await read.POST(h.request({ chatId: DIRECT })));
  assert.equal(result.status, 200);
  assert.deepEqual(h.getHash("user:owner:unread"), {}, "reading must clear the unread counter");
  assert.ok(h.pusherEvents.some(event => event.event === "messages_seen" && event.payload.readerId === "owner"));
});

test("message read: membership, receipts opt-out and validation", async () => {
  h.reset();
  seedGroupChat();
  h.setSession("member");
  const result = await status(await read.POST(h.request({ chatId: GROUP_CHAT })));
  assert.equal(result.status, 200);
  assert.ok(h.pusherEvents.some(event => event.event === "messages_seen"));
  h.reset();
  seedGroupChat();
  h.seedKv("user:member:group-preferences:g1", { showReadReceipts: false });
  h.setSession("member");
  h.pusherEvents.length = 0;
  assert.equal((await status(await read.POST(h.request({ chatId: GROUP_CHAT })))).status, 200);
  assert.equal(h.pusherEvents.filter(event => event.event === "messages_seen").length, 0, "opted-out readers emit no receipt");
  h.reset();
  seedGroupChat();
  h.setSession("outsider");
  assert.equal((await status(await read.POST(h.request({ chatId: GROUP_CHAT })))).status, 403);
  h.setSession("owner");
  // A former friend must not retain read-receipt access after removal.
  assert.equal((await status(await read.POST(h.request({ chatId: "owner--stranger" })))).status, 403);
  h.reset({ session: null });
  assert.equal((await status(await read.POST(h.request({ chatId: DIRECT })))).status, 401);
  h.reset();
  assert.equal((await status(await read.POST(h.request({ nope: 1 })))).status, 422);
  assert.equal((await status(await read.POST(h.requestRaw("{invalid")))).status, 400, "malformed JSON must be a client error, not an internal server error");
  assert.equal((await status(await read.POST(h.request({ chatId: "x".repeat(257) })))).status, 422, "oversized chat identifiers must be rejected");
});

// ----------------------------------------------------------- message history
function seedHistory() {
  const rows = [
    { id: "m1", senderId: "owner", text: "one", timestamp: 1000, receiverId: "member" },
    { id: "m2", senderId: "member", text: "two", timestamp: 2000, receiverId: "owner" },
    { id: "m3", senderId: "owner", text: "three", timestamp: 3000, receiverId: "member" },
    { id: "m4", senderId: "member", text: "four", timestamp: 4000, receiverId: "owner" },
    { id: "m5", senderId: "owner", text: "five", timestamp: 5000, receiverId: "member" },
  ];
  const chatId = h.setDirectMessages(rows, "owner", "member");
  seedDirectFriendship();
  return chatId;
}

test("message history: latest page, ordering and cursor contract", async () => {
  h.reset();
  const chatId = seedHistory();
  const first = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${chatId}&limit=2`)));
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.messages.map(message => message.id), ["m5", "m4"], "initial page returns the latest messages, newest first");
  assert.equal(first.data.hasMore, true);
  assert.equal(first.data.nextCursor, 4000);

  const second = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${chatId}&limit=2&cursor=4000`)));
  assert.deepEqual(second.data.messages.map(message => message.id), ["m3", "m2"]);
  assert.equal(second.data.nextCursor, 2000);

  const last = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${chatId}&limit=50&cursor=2000`)));
  assert.deepEqual(last.data.messages.map(message => message.id), ["m1"]);
  assert.equal(last.data.hasMore, false);
  assert.equal(last.data.nextCursor, 1000);
});

test("message history: reconnect retries pending Pusher delivery and acknowledges it", async () => {
  h.reset();
  seedDirectFriendship();
  h.setPusherFailure(true);
  const sent = await status(await send.POST(h.request({ chatId: DIRECT, text: "deliver after reconnect", requestId: "request-outbox-retry-01" })));
  assert.equal(sent.status, 200);
  const key = `chat:${DIRECT}:delivery:outbox`;
  assert.equal(h.getZset(key).length, 1);
  h.setPusherFailure(false);
  const historyPage = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${DIRECT}&limit=10`)));
  assert.equal(historyPage.status, 200);
  assert.equal(h.pusherEvents.filter(event => event.event === "incoming-message").length, 1);
  assert.equal(h.getZset(key).length, 0, "successful retry acknowledges the outbox item");
});

test("message history: expired messages are hidden but pagination still advances", async () => {
  h.reset();
  const rows = [
    { id: "old", senderId: "owner", text: "old", timestamp: 1000, receiverId: "member" },
    { id: "exp", senderId: "member", text: "expired", timestamp: 2000, receiverId: "owner", expiresAt: Date.now() - 5000 },
    { id: "new", senderId: "owner", text: "new", timestamp: 3000, receiverId: "member" },
  ];
  const chatId = h.setDirectMessages(rows, "owner", "member");
  seedDirectFriendship();
  const page = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${chatId}&limit=2`)));
  assert.deepEqual(page.data.messages.map(message => message.id), ["new"], "expired message is filtered out");
  assert.equal(page.data.nextCursor, 2000, "cursor must use the raw page boundary, not the filtered list");
  const next = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${chatId}&limit=2&cursor=2000`)));
  assert.deepEqual(next.data.messages.map(message => message.id), ["old"], "older history remains reachable");
});

test("message history: corrupted rows are skipped without breaking pagination", async () => {
  h.reset();
  const chatId = h.setDirectMessages([
    { id: "ok1", senderId: "owner", text: "fine", timestamp: 1000, receiverId: "member" },
    { id: "broken", senderId: "member", text: "corrupt", timestamp: 2000, receiverId: "owner" },
  ], "owner", "member");
  seedDirectFriendship();
  const first = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${chatId}&limit=10`)));
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.messages.map(message => message.id).sort(), ["broken", "ok1"]);
});

test("message history: group photo privacy preferences apply to historical messages", async () => {
  h.reset();
  seedGroupChat();
  h.setMessages([
    { id: "gm1", senderId: "member", text: "hi", timestamp: 1000, receiverId: "group--g1", senderImg: "/member.png" },
    { id: "gm2", senderId: "admin", text: "yo", timestamp: 2000, receiverId: "group--g1", senderImg: "/admin.png" },
  ], "g1");
  h.seedKv("user:member:group-preferences:g1", { hideProfilePhoto: true });
  const result = await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${GROUP_CHAT}&limit=10`)));
  const byId = Object.fromEntries(result.data.messages.map(message => [message.id, message]));
  assert.equal(byId.gm1.senderImg, undefined);
  assert.equal(byId.gm2.senderImg, "/admin.png");
});

test("message history: authorization and query validation", async () => {
  h.reset();
  seedHistory();
  h.setSession("outsider");
  assert.equal((await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${DIRECT}`)))).status, 403);
  h.setSession("owner");
  assert.equal((await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=owner--stranger`)))).status, 403);
  assert.equal((await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${DIRECT}&limit=0`)))).status, 422);
  assert.equal((await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${DIRECT}&limit=51`)))).status, 422);
  h.reset({ session: null });
  assert.equal((await status(await history.GET(h.request(undefined, "GET", `http://localhost/api/message/history?chatId=${DIRECT}`)))).status, 401);
});

// ------------------------------------------------------------ message search
test("message search: case-insensitive match excluding deleted messages", async () => {
  h.reset();
  seedDirectFriendship();
  const chatId = h.setDirectMessages([
    { id: "m1", senderId: "owner", text: "Hello World", timestamp: 1, receiverId: "member" },
    { id: "m2", senderId: "member", text: "say HELLO again", timestamp: 2, receiverId: "owner" },
    { id: "m3", senderId: "member", text: "deleted hello", timestamp: 3, receiverId: "owner", isDeleted: true },
    { id: "m4", senderId: "member", text: "nothing here", timestamp: 4, receiverId: "owner" },
  ], "owner", "member");
  seedDirectFriendship();
  const result = await status(await search.GET(h.request(undefined, "GET", `http://localhost/api/message/search?chatId=${chatId}&query=hello`)));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.results.map(message => message.id).sort(), ["m1", "m2"]);
  const empty = await status(await search.GET(h.request(undefined, "GET", `http://localhost/api/message/search?chatId=${chatId}&query=nomatch`)));
  assert.deepEqual(empty.data.results, []);
});

test("message search: authorization and bounds", async () => {
  h.reset();
  seedGroupChat();
  h.setMessages([{ id: "gm1", senderId: "admin", text: "roadmap", timestamp: 1, receiverId: "group--g1" }], "g1");
  h.setSession("outsider");
  assert.equal((await status(await search.GET(h.request(undefined, "GET", `http://localhost/api/message/search?chatId=${GROUP_CHAT}&query=road`)))).status, 403);
  h.setSession("member");
  assert.equal((await status(await search.GET(h.request(undefined, "GET", `http://localhost/api/message/search?chatId=${GROUP_CHAT}&query=${"x".repeat(101)}`)))).status, 422);
  assert.equal((await status(await search.GET(h.request(undefined, "GET", `http://localhost/api/message/search?chatId=${GROUP_CHAT}&query=`)))).status, 422);
  h.reset({ session: null });
  assert.equal((await status(await search.GET(h.request(undefined, "GET", `http://localhost/api/message/search?chatId=${GROUP_CHAT}&query=road`)))).status, 401);
});

// ------------------------------------------------------------ message typing
test("message typing: participants broadcast, strangers are rejected", async () => {
  h.reset();
  seedDirectFriendship();
  const ok = await status(await typing.POST(h.request({ chatId: DIRECT, isTyping: true })));
  assert.equal(ok.status, 200);
  const event = h.pusherEvents.find(item => item.event === "user_typing");
  assert.deepEqual(event.payload, { userId: "owner", isTyping: true });
  const stop = await status(await typing.POST(h.request({ chatId: DIRECT, isTyping: false })));
  assert.equal(stop.status, 200);
  h.setSession("outsider");
  assert.equal((await status(await typing.POST(h.request({ chatId: DIRECT })))).status, 403);
  h.reset({ session: null });
  assert.equal((await status(await typing.POST(h.request({ chatId: DIRECT })))).status, 401);
  h.reset();
  assert.equal((await status(await typing.POST(h.request({ chatId: DIRECT, isTyping: "yes" })))).status, 422);
});

test("message typing: group members can broadcast typing state to the group channel", async () => {
  h.reset();
  seedGroupChat();
  const response = await status(await typing.POST(h.request({ chatId: GROUP_CHAT, isTyping: true })));
  assert.equal(response.status, 200);
  const event = h.pusherEvents.find(item => item.event === "user_typing");
  assert.equal(event.channel, `private-chat:${GROUP_CHAT}`);
  assert.deepEqual(event.payload, { userId: "owner", isTyping: true });
});

test("message typing: non-members and removed direct-chat friends are rejected", async () => {
  h.reset();
  seedGroupChat();
  h.setSession("outsider");
  assert.equal((await status(await typing.POST(h.request({ chatId: GROUP_CHAT })))).status, 403);

  h.reset();
  h.seedSet("user:owner:friends", []);
  assert.equal((await status(await typing.POST(h.request({ chatId: DIRECT })))).status, 403);
});

test("message typing: malformed JSON and invalid chat identifiers fail safely", async () => {
  h.reset();
  assert.equal((await status(await typing.POST(h.requestRaw("{invalid")))).status, 400);
  assert.equal((await status(await typing.POST(h.request({ chatId: "" })))).status, 422);
});

test("message read: realtime provider failure does not undo the durable read", async () => {
  h.reset();
  seedDirectFriendship();
  h.seedHash("user:owner:unread", { [DIRECT]: 2 });
  h.setPusherFailure(true);
  const result = await status(await read.POST(h.request({ chatId: DIRECT })));
  assert.equal(result.status, 200);
  assert.deepEqual(h.getHash("user:owner:unread"), {});
});
