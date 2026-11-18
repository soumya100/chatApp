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
