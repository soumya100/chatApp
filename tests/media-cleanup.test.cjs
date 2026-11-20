const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

const cleanup = h.loadRoute("src/app/api/maintenance/media-cleanup/route.ts");
const upload = h.loadRoute("src/app/api/upload/route.ts");
const send = h.loadRoute("src/app/api/message/send/route.ts");

const oldSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-cron-secret";
const responseData = async response => ({ status: response.status, data: await response.json() });

test.after(() => {
  if (oldSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = oldSecret;
});

test("media cleanup: scheduled endpoint rejects unauthenticated callers", async () => {
  h.reset();
  const result = await cleanup.GET(new Request("http://localhost/api/maintenance/media-cleanup"));
  assert.equal(result.status, 401);
});

test("upload: completed but unclaimed Blob uploads enter the orphan index", async () => {
  h.reset();
  const url = "https://bucket.public.blob.vercel-storage.com/abandoned.png";
  const request = new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "blob.upload-completed", payload: { files: [{ url, contentType: "image/png" }] } }),
  });
  const result = await upload.POST(request);
  assert.equal(result.status, 200);
  assert.deepEqual(await h.db.zrange("media:orphans", 0, -1), [url]);
});

test("upload: rejects URLs that only contain the trusted Blob domain as a substring", async () => {
  h.reset();
  const forgedUrls = [
    "https://evil.example/.public.blob.vercel-storage.com/file.png",
    "https://evil.public.blob.vercel-storage.com.attacker.example/file.png",
    "https://evil.example/?next=.public.blob.vercel-storage.com/file.png",
    "https://user@bucket.public.blob.vercel-storage.com/file.png",
    "http://bucket.public.blob.vercel-storage.com/file.png",
    "https://bucket.public.blob.vercel-storage.com.evil/file.png",
  ];
  const request = new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "blob.upload-completed", payload: { files: forgedUrls.map(url => ({ url, contentType: "image/png" })) } }),
  });
  const result = await upload.POST(request);
  assert.equal(result.status, 200);
  assert.deepEqual(await h.db.zrange("media:orphans", 0, -1), []);
});

test("message send: attaching an uploaded Blob removes its orphan marker atomically", async () => {
  h.reset();
  h.seedSet("user:owner:friends", ["member"]);
  h.seedSet("user:member:friends", ["owner"]);
  const url = "https://bucket.public.blob.vercel-storage.com/attached.png";
  await h.db.zadd("media:orphans", { score: Date.now(), member: url });
  const response = await send.POST(new Request("http://localhost/api/message/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chatId: "owner--member", text: "", mediaUrl: url, mediaType: "image", requestId: "attach-orphan-0001" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await h.db.zrange("media:orphans", 0, -1)).length, 0);
});

test("media cleanup: ignores forged hostnames and removes their invalid jobs", async () => {
  h.reset();
  const forged = "https://evil.example/.public.blob.vercel-storage.com/not-owned.png";
  const record = JSON.stringify({ url: forged, queuedAt: Date.now() });
  await h.db.zadd("media:cleanup", { score: Date.now(), member: record });
  await h.db.zadd("media:orphans", { score: Date.now() - 8 * 24 * 60 * 60 * 1000, member: forged });

  const result = await responseData(await cleanup.GET(new Request("http://localhost/api/maintenance/media-cleanup", {
    headers: { authorization: "Bearer test-cron-secret" },
  })));
  assert.equal(result.status, 200);
  assert.deepEqual(h.blobCalls, [], "untrusted URLs must never be sent to Blob deletion");
  assert.equal((await h.db.zrange("media:cleanup", 0, -1)).length, 0);
  assert.equal((await h.db.zrange("media:orphans", 0, -1)).length, 0);
});

test("media cleanup: retries deleted-message jobs and aged abandoned uploads", async () => {
  h.reset();
  const deletedUrl = "https://bucket.public.blob.vercel-storage.com/deleted.pdf";
  const orphanUrl = "https://bucket.public.blob.vercel-storage.com/abandoned.pdf";
  const cleanupRecord = JSON.stringify({ url: deletedUrl, queuedAt: Date.now() });
  await h.db.zadd("media:cleanup", { score: Date.now(), member: cleanupRecord });
  await h.db.zadd("media:orphans", { score: Date.now() - 8 * 24 * 60 * 60 * 1000, member: orphanUrl });

  const result = await responseData(await cleanup.GET(new Request("http://localhost/api/maintenance/media-cleanup", {
    headers: { authorization: "Bearer test-cron-secret" },
  })));
  assert.equal(result.status, 200);
  assert.equal(result.data.deleted, 2);
  assert.deepEqual(h.blobCalls.sort(), [deletedUrl, orphanUrl].sort());
  assert.equal(h.getZset("media:cleanup").length, 0);
  assert.equal((await h.db.zrange("media:orphans", 0, -1)).length, 0);
});
