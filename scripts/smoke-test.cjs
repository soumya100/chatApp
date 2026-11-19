const assert = require("node:assert/strict");

const baseUrl = (process.env.CHATAPP_SMOKE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");

async function check(name, path, options, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", ...options });
  assert.equal(response.status, expectedStatus, `${name}: unexpected HTTP status ${response.status}`);
  return response;
}

async function main() {
  const login = await check("login page", "/login", {}, 200);
  assert.match(login.headers.get("content-type") || "", /text\/html/);

  const signup = await check("signup page", "/signup", {}, 200);
  assert.match(signup.headers.get("content-type") || "", /text\/html/);

  const dashboard = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(dashboard.status), "unauthenticated dashboard access must redirect");
  assert.match(dashboard.headers.get("location") || "", /login/);

  const providers = await check("NextAuth provider discovery", "/api/auth/providers", {}, 200);
  const providerData = await providers.json();
  assert.equal(typeof providerData, "object");

  const csrf = await check("NextAuth CSRF endpoint", "/api/auth/csrf", {}, 200);
  assert.equal(typeof (await csrf.json()).csrfToken, "string");

  const protectedRequests = [
    ["group member profiles", "/api/group/smoke-group/members", { method: "GET" }],
    ["group management", "/api/group/smoke-group/manage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "leave" }) }],
    ["group activity read", "/api/group/smoke-group/features", { method: "GET" }],
    ["group activity write", "/api/group/smoke-group/features", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "announce", text: "smoke" }) }],
    ["pinned message read", "/api/group/smoke-group/pin", { method: "GET" }],
    ["pinned message write", "/api/group/smoke-group/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: "smoke", pinned: true }) }],
    ["group preference read", "/api/user/group-preferences?groupId=smoke-group", { method: "GET" }],
    ["group preference write", "/api/user/group-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ groupId: "smoke-group", notifications: "muted" }) }],
    ["member invitation", "/api/group/members/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ groupId: "smoke-group", memberIds: ["smoke-user"] }) }],
    ["group creation", "/api/group/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Smoke group" }) }],
    ["group listing", "/api/group/list", { method: "GET" }],
    ["message send", "/api/message/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId: "smoke-a--smoke-b", text: "smoke" }) }],
    ["message edit", "/api/message/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: "smoke", chatId: "smoke-a--smoke-b", newText: "smoke" }) }],
    ["message delete", "/api/message/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: "smoke", chatId: "smoke-a--smoke-b" }) }],
    ["message react", "/api/message/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: "smoke", chatId: "smoke-a--smoke-b", emoji: "👍" }) }],
    ["message read", "/api/message/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId: "smoke-a--smoke-b" }) }],
    ["message history", "/api/message/history?chatId=smoke-a--smoke-b", { method: "GET" }],
    ["message search", "/api/message/search?chatId=smoke-a--smoke-b&query=smoke", { method: "GET" }],
    ["message typing", "/api/message/typing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId: "smoke-a--smoke-b", isTyping: true }) }],
    ["friend request", "/api/friends/add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "smoke@example.test" }) }],
    ["friend accept", "/api/friends/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "smoke-user" }) }],
    ["friend deny", "/api/friends/deny", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "smoke-user" }) }],
    ["friend list", "/api/friends/list", { method: "GET" }],
    ["community list", "/api/community", { method: "GET" }],
    ["community create", "/api/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Smoke community" }) }],
    ["community mutation", "/api/community/smoke-community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "leave" }) }],
    ["users search", "/api/users/search?q=smoke", { method: "GET" }],
    ["avatar update", "/api/user/avatar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: "https://smoke.example.test/a.png" }) }],
    ["pusher channel auth", "/api/pusher/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ socket_id: "smoke-socket", channel_name: "private-user__smoke" }) }],
    ["upload token", "/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "smoke.png", callbackUrl: "http://127.0.0.1:3100/api/upload" } }) }],
    ["cron cleanup (fail closed without secret)", "/api/cron/cleanup-expired-messages", { method: "GET" }],
  ];

  for (const [name, path, options] of protectedRequests) {
    await check(name, path, options, 401);
  }

  console.log(`Smoke checks passed: 4 public/auth checks, 1 middleware redirect, ${protectedRequests.length} protected API checks.`);
}

main().catch(error => {
  console.error("Smoke test failed:", error);
  process.exitCode = 1;
});
