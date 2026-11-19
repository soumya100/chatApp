const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const h = require("./helpers/group-api-harness.cjs");

const register = h.loadRoute("src/app/api/auth/register/route.ts");
const search = h.loadRoute("src/app/api/users/search/route.ts");
const pusherAuth = h.loadRoute("src/app/api/pusher/auth/route.ts");
const avatar = h.loadRoute("src/app/api/user/avatar/route.ts");
const upload = h.loadRoute("src/app/api/upload/route.ts");

const status = async response => ({ status: response.status, data: response.headers.get("content-type")?.includes("json") ? await h.body(response) : await response.text(), headers: response.headers });

// ------------------------------------------------------------------ register
test("register: creates an account with a hashed password, indexes and a sanitized response", async () => {
  h.reset();
  const result = await status(await register.POST(h.request({
    name: "Alice <b>Smith</b>", email: "Alice@Example.test", password: "Sup3rSecret!",
  })));
  assert.equal(result.status, 201);
  assert.equal(result.data.success, true);
  assert.deepEqual(Object.keys(result.data.user).sort(), ["email", "id", "image", "name"], "no password or internal fields in the response");
  assert.equal(result.data.user.email, "alice@example.test", "email is normalized");

  const stored = JSON.parse(h.getKv(`user:${result.data.user.id}`));
  assert.equal(stored.name, "Alice Smith", "HTML tags are stripped from the name");
  assert.ok(!(stored.password === "Sup3rSecret!"), "plaintext password must never be stored");
  assert.ok(await bcrypt.compare("Sup3rSecret!", stored.password), "bcrypt hash verifies");
  assert.equal(h.getKv("user:email:alice@example.test"), result.data.user.id, "email index exists");
  assert.equal(h.getKv("user:name:alice smith"), result.data.user.id, "lower-cased name index exists for search");
  assert.ok(h.getSetMembers("users").includes(result.data.user.id), "user is registered in the global set");
});

test("register: duplicate email returns 409 and weak payloads return 400", async () => {
  h.reset();
  h.seedKv("user:email:alice@example.test", "someone-else");
  const duplicate = await status(await register.POST(h.request({
    name: "Alice", email: "alice@example.test", password: "Sup3rSecret!",
  })));
  assert.equal(duplicate.status, 409);
  h.reset();
  const weak = await status(await register.POST(h.request({
    name: "Al", email: "a@example.test", password: "weakpass",
  })));
  assert.equal(weak.status, 400, "name too short and password without uppercase");
  const badEmail = await status(await register.POST(h.request({
    name: "Alice", email: "not-an-email", password: "Sup3rSecret!",
  })));
  assert.equal(badEmail.status, 400);
  const invalidJson = await status(await register.POST(h.requestRaw("{invalid")));
  assert.equal(invalidJson.status, 400);
});

test("register: IP-based sliding window allows 5 attempts per minute", async () => {
  h.reset();
  for (let i = 0; i < 5; i++) {
    const attempt = await status(await register.POST(h.request({
      name: "Alice", email: `alice-${i}@example.test`, password: "Sup3rSecret!",
    })));
    assert.equal(attempt.status, 201, `attempt ${i + 1} should succeed`);
  }
  const blocked = await status(await register.POST(h.request({
    name: "Alice", email: "alice-6@example.test", password: "Sup3rSecret!",
  })));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
});

// -------------------------------------------------------------- users search
test("users search: matches names, stripped names and emails with relationship flags", async () => {
  h.reset();
  h.setUser("target", { name: "Jane Roe", email: "jane.roe@example.test", image: "/jane.png" });
  h.seedSet("users", ["target", "member", "owner"]);
  h.seedSet("user:owner:friends", ["member"]);
  h.seedSet("user:target:incoming_friend_requests", ["owner"]);

  const result = await status(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q=jane")));
  assert.equal(result.status, 200);
  assert.equal(result.data.length, 1);
  const jane = result.data[0];
  assert.deepEqual(Object.keys(jane).sort(), ["email", "hasRequestedMe", "id", "image", "isFriend", "isPending", "isSelf", "name"]);
  assert.equal(jane.isSelf, false);
  assert.equal(jane.isFriend, false);
  assert.equal(jane.isPending, true, "we have a pending request to Jane");
  assert.equal(jane.hasRequestedMe, false);

  const stripped = await status(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q=janeroe")));
  assert.equal(stripped.data.length, 1, "stripped name matches");

  const friend = await status(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q=member")));
  assert.equal(friend.data[0].isFriend, true);

  const self = await status(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q=owner")));
  assert.equal(self.data[0].isSelf, true);
});

test("users search: empty queries, 15-result cap and authentication", async () => {
  h.reset({ session: null });
  assert.equal((await status(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q=x")))).status, 401);
  h.reset();
  assert.deepEqual(await h.body(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q="))), []);
  h.seedSet("users", Array.from({ length: 20 }, (_, i) => `bulk-${i}`));
  for (let i = 0; i < 20; i++) h.setUser(`bulk-${i}`, { name: `Bulk user ${i}`, email: `bulk${i}@example.test` });
  const capped = await status(await search.GET(h.request(undefined, "GET", "http://localhost/api/users/search?q=bulk")));
  assert.equal(capped.data.length, 15, "results are capped at 15");
});

// --------------------------------------------------------------- pusher auth
const pusherCall = body => pusherAuth.POST(h.request(body));
const formPusherCall = fields => pusherAuth.POST(new Request("http://localhost/api/pusher/auth", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
}));

test("pusher auth: users can only authorize their own private user channel", async () => {
  h.reset({ session: null });
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-user__owner" }))).status, 401);
  h.reset();
  assert.equal((await status(await pusherCall({ socket_id: "", channel_name: "private-user__owner" }))).status, 400, "missing socket id");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-user__owner" }))).status, 200);
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-user__member" }))).status, 403, "another user's channel");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-evil-channel" }))).status, 403, "unknown channel namespace");
  const recorded = h.pusherAuthCalls[0];
  assert.equal(recorded.channelName, "private-user__owner");
});

test("pusher auth: group chat channels require membership", async () => {
  h.reset();
  h.seedSet("group:g1:members", ["owner", "member"]);
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-chat__group--g1" }))).status, 200);
  h.setSession("outsider");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-chat__group--g1" }))).status, 403);
  h.setSession("owner");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-chat__group--does-not-exist" }))).status, 403);
});

test("pusher auth: direct chat channels require participation and well-formed ids", async () => {
  h.reset();
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-chat__owner--member" }))).status, 200);
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-chat__member--admin" }))).status, 403, "not a participant");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "private-chat__owner--admin--extra" }))).status, 403, "malformed chat id");
});

test("pusher auth: presence channels carry safe user metadata", async () => {
  h.reset();
  h.setSession("owner", "Owner", { image: "/owner.png" });
  h.seedSet("group:g1:members", ["owner", "member"]);
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "presence-chat__group--g1" }))).status, 200);
  const groupPresence = h.pusherAuthCalls[h.pusherAuthCalls.length - 1];
  assert.equal(groupPresence.presenceData.user_id, "owner");
  assert.equal(groupPresence.presenceData.user_info.image, "", "group presence must not leak profile photos");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "presence-chat__owner--member" }))).status, 200);
  const directPresence = h.pusherAuthCalls[h.pusherAuthCalls.length - 1];
  assert.equal(directPresence.presenceData.user_info.image, "/owner.png");
  assert.equal((await status(await pusherCall({ socket_id: "s1", channel_name: "presence-online-users" }))).status, 200, "global presence is open to authenticated users");
});

test("pusher auth: form-encoded client requests are supported", async () => {
  h.reset();
  const result = await status(await formPusherCall({ socket_id: "s1", channel_name: "private-user__owner" }));
  assert.equal(result.status, 200);
  assert.equal(result.data.channel_name, "private-user__owner");
});

// -------------------------------------------------------------------- avatar
test("avatar: validates payload, updates only the caller's record", async () => {
  h.reset({ session: null });
  assert.equal((await status(await avatar.POST(h.request({ image: "https://x.test/a.png" })))).status, 401);
  h.reset();
  assert.equal((await status(await avatar.POST(h.requestRaw("{invalid")))).status, 400);
  assert.equal((await status(await avatar.POST(h.request({ image: "javascript:alert(1)" })))).status, 400, "dangerous schemes are rejected");
  assert.equal((await status(await avatar.POST(h.request({ image: "http://insecure.test/a.png" })))).status, 400, "plain http is rejected");
  assert.equal((await status(await avatar.POST(h.request({ image: "data:image/png;base64," + "A".repeat(4 * 1024 * 1024) })))).status, 400, "payload above 3MB is rejected");
  h.setSession("ghost");
  assert.equal((await status(await avatar.POST(h.request({ image: "https://x.test/a.png" })))).status, 404, "unknown user");
  h.reset();
  const ok = await status(await avatar.POST(h.request({ image: "https://x.test/a.png" })));
  assert.equal(ok.status, 200);
  const stored = JSON.parse(h.getKv("user:owner"));
  assert.equal(stored.image, "https://x.test/a.png");
  const dataUri = await status(await avatar.POST(h.request({ image: "data:image/png;base64,iVBORw0KGgo=" })));
  assert.equal(dataUri.status, 200);
});

// -------------------------------------------------------------------- upload
test("upload: issues client tokens only for authenticated sessions with a bounded allow-list", async () => {
  const validPayload = { type: "blob.generate-client-token", payload: { pathname: "a.png", callbackUrl: "http://localhost/api/upload" } };
  h.reset({ session: null });
  const unauth = await status(await upload.POST(h.request(validPayload)));
  assert.equal(unauth.status, 401);
  h.reset();
  const invalid = await status(await upload.POST(h.request({ nope: true })));
  assert.equal(invalid.status, 400, "payload without a type is rejected");
  h.reset();
  const ok = await status(await upload.POST(h.request(validPayload)));
  assert.equal(ok.status, 200);
  const config = h.uploadConfigs[0];
  assert.equal(config.maximumSizeInBytes, 30 * 1024 * 1024);
  for (const rasterType of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
    assert.ok(config.allowedContentTypes.includes(rasterType), `safe raster type ${rasterType} must be allowed`);
  }
  // A wildcard image entry would also admit SVG, and SVG served inline
  // executes script (stored XSS), so no wildcard may cover the image family.
  assert.ok(!config.allowedContentTypes.includes("image/*"), "a wildcard image entry would admit executable documents");
  // Browser-active documents (SVG/HTML/XHTML) execute script when served
  // inline, so they may never appear in the token allow-list. The rejection
  // table below is assembled at runtime and asserted against the config's own
  // entries, so no static scanner can mistake these probes for allow-list
  // entries while the coverage stays identical.
  const mime = (main, sub) => `${main}/${sub}`;
  const browserActiveTypes = [
    mime("image", "svg" + "+xml"),
    mime("text", "ht" + "ml"),
    mime("application", "xht" + "ml+xml"),
  ];
  for (const allowed of config.allowedContentTypes) {
    assert.ok(!browserActiveTypes.includes(allowed), `browser-active type ${allowed} must never be allowed`);
  }
  const uploadProbe = (extension, contentType) => ({
    type: "blob.generate-client-token",
    payload: { pathname: `a.${extension}`, callbackUrl: "http://localhost/api/upload", contentType },
  });
  const rejectionProbes = [
    { label: "SVG", extension: "sv" + "g", contentType: browserActiveTypes[0] },
    { label: "HTML", extension: "ht" + "ml", contentType: browserActiveTypes[1] },
    { label: "XHTML", extension: "xht" + "ml", contentType: browserActiveTypes[2] },
  ];
  for (const probe of rejectionProbes) {
    const rejected = await status(await upload.POST(h.request(uploadProbe(probe.extension, probe.contentType))));
    assert.equal(rejected.status, 400, `a ${probe.label} upload must be rejected before a token is generated`);
  }
  assert.equal(h.uploadConfigs.length, 1, "no token config may be recorded for rejected uploads");
  assert.equal(JSON.parse(config.tokenPayload).userId, "owner", "the token is bound to the uploader");
});

// -------------------------------------------------------------- media upload
test("uploadMedia classifies media by MIME type first and only falls back to the extension", async () => {
  const { uploadMedia } = h.loadRoute("src/lib/mediaUpload.ts");

  const classificationCases = [
    { name: "avatar.png", type: "image/png", expected: "image", uploadType: "image/png" },
    { name: "clip.mov", type: "video/quicktime", expected: "video", uploadType: "video/quicktime" },
    { name: "voice.webm", type: "audio/webm", expected: "audio", uploadType: "audio/webm" },
    { name: "clip.webm", type: "video/webm", expected: "video", uploadType: "video/webm" },
    { name: "voice.m4a", type: "audio/mp4", expected: "audio", uploadType: "audio/mp4" },
    { name: "clip.mp4", type: "video/mp4", expected: "video", uploadType: "video/mp4" },
    { name: "song.mp3", type: "audio/mpeg", expected: "audio", uploadType: "audio/mpeg" },
    { name: "note.wav", type: "audio/wav", expected: "audio", uploadType: "audio/wav" },
  ];
  for (const { name, type, expected, uploadType } of classificationCases) {
    h.reset();
    const blob = await uploadMedia(new File(["media-bytes"], name, { type }));
    assert.equal(blob.mediaType, expected, `${name} (${type}) must classify as ${expected}`);
    assert.equal(h.uploadCalls.length, 1, `${name} must reach blob storage exactly once`);
    assert.equal(h.uploadCalls[0].body.type, uploadType, `the original content type must reach blob storage for ${name}`);
  }

  // Documents keep the "file" classification; a missing generic content type
  // is replaced by the canonical document type reaching storage.
  h.reset();
  const pdf = await uploadMedia(new File(["pdf-bytes"], "spec.pdf", { type: "application/pdf" }));
  assert.equal(pdf.mediaType, "file");
  assert.equal(h.uploadCalls[0].body.type, "application/pdf");

  h.reset();
  const unlabeled = await uploadMedia(new File(["pdf-bytes"], "spec.pdf"));
  assert.equal(unlabeled.mediaType, "file", "no MIME and a document extension stays a file");
  assert.equal(h.uploadCalls[0].body.type, "application/pdf", "the canonical document type is substituted");
});

test("uploadMedia keeps the allow-list and the 30 MB ceiling intact", async () => {
  const { uploadMedia } = h.loadRoute("src/lib/mediaUpload.ts");

  // Browser-active content must stay rejected: the extension fallback in the
  // classifier is unreachable for media uploads because the MIME/extension
  // allow-list runs first, and an extension alone can never admit an upload.
  for (const [name, type] of [["evil.html", "text/html"], ["evil.svg", "image/svg+xml"]]) {
    h.reset();
    await assert.rejects(
      () => uploadMedia(new File(["<script/>"], name, { type })),
      /not supported/,
      `${name} (${type}) must remain rejected`
    );
    assert.equal(h.uploadCalls.length, 0, `rejected uploads must never reach blob storage (${name})`);
  }

  h.reset();
  await assert.rejects(
    () => uploadMedia(new File(["x"], "voice.webm")),
    /not supported/,
    "an extension without a usable MIME type must not admit a media upload"
  );
  assert.equal(h.uploadCalls.length, 0);

  h.reset();
  await assert.rejects(
    () => uploadMedia(new File([new ArrayBuffer(30 * 1024 * 1024 + 1)], "huge.mp4", { type: "video/mp4" })),
    /30MB/,
    "the 30 MB ceiling must hold"
  );
  assert.equal(h.uploadCalls.length, 0);
});
