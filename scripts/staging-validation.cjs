const assert = require("node:assert/strict");

const baseUrl = (process.env.CHATAPP_STAGING_URL || "").replace(/\/$/, "");
const groupId = process.env.CHATAPP_TEST_GROUP_ID;
const soakSeconds = Math.min(Math.max(Number(process.env.CHATAPP_SOAK_SECONDS || 180), 30), 600);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required staging setting: ${name}`);
  return value;
}

function mergeCookies(jar, response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    const pair = value.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader(jar) {
  return Array.from(jar, ([key, value]) => `${key}=${value}`).join("; ");
}

async function request(account, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    redirect: "manual",
    headers: {
      ...(options.headers || {}),
      ...(account.jar.size ? { cookie: cookieHeader(account.jar) } : {}),
    },
  });
  mergeCookies(account.jar, response);
  return response;
}

async function login(label, email, password) {
  const account = { label, jar: new Map(), id: "" };
  const csrfResponse = await request(account, "/api/auth/csrf");
  assert.equal(csrfResponse.status, 200, `${label}: CSRF endpoint must respond`);
  const { csrfToken } = await csrfResponse.json();
  assert.ok(csrfToken, `${label}: CSRF token must exist`);

  const form = new URLSearchParams({
    csrfToken,
    callbackUrl: `${baseUrl}/dashboard`,
    json: "true",
    email,
    password,
  });
  const signIn = await request(account, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  assert.ok([200, 302, 303].includes(signIn.status), `${label}: credentials sign-in failed with HTTP ${signIn.status}`);

  const sessionResponse = await request(account, "/api/auth/session");
  assert.equal(sessionResponse.status, 200, `${label}: session endpoint must respond`);
  const session = await sessionResponse.json();
  assert.ok(session?.user?.id, `${label}: credentials sign-in did not establish a session`);
  account.id = session.user.id;
  console.log(`Authenticated ${label} test account.`);
  return account;
}

async function expectStatus(account, path, expected, options, label) {
  const response = await request(account, path, options);
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, received ${response.status}`);
  return response;
}

async function signOut(account) {
  const csrfResponse = await request(account, "/api/auth/csrf");
  const { csrfToken } = await csrfResponse.json();
  await expectStatus(account, "/api/auth/signout", 200, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${baseUrl}/login` }),
  }, `${account.label} sign-out`);
  const sessionResponse = await request(account, "/api/auth/session");
  const session = await sessionResponse.json();
  assert.ok(!session?.user?.id, `${account.label}: session remained active after sign-out`);
}

async function runSoak(accounts, chatId) {
  const started = Date.now();
  const deadline = started + soakSeconds * 1000;
  const samples = [];
  let requests = 0;

  async function worker(account, isMember) {
    while (Date.now() < deadline) {
      const iterationStart = Date.now();
      const routes = isMember
        ? [`/api/group/${encodeURIComponent(groupId)}/features`, `/api/message/history?chatId=${encodeURIComponent(chatId)}&limit=10`]
        : [`/api/group/${encodeURIComponent(groupId)}/members`];
      for (const route of routes) {
        const response = await request(account, route);
        const expected = isMember ? 200 : 403;
        assert.equal(response.status, expected, `${account.label} soak request ${route}: HTTP ${response.status}`);
        assert.ok(response.status < 500, `${account.label}: server error during soak`);
        requests += 1;
      }
      samples.push(Date.now() - iterationStart);
      const remaining = deadline - Date.now();
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(3000, remaining)));
    }
  }

  await Promise.all([
    worker(accounts.admin, true),
    worker(accounts.member, true),
    worker(accounts.outsider, false),
  ]);

  samples.sort((a, b) => a - b);
  const percentile = p => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))] || 0;
  console.log(JSON.stringify({
    soakSeconds,
    concurrentAccounts: 3,
    requestBatches: samples.length,
    httpRequests: requests,
    batchLatencyMs: { p50: percentile(0.50), p95: percentile(0.95), max: samples.at(-1) || 0 },
  }, null, 2));
}

async function main() {
  if (!baseUrl) throw new Error("Set CHATAPP_STAGING_URL to a dedicated staging deployment.");
  const target = new URL(baseUrl);
  assert.equal(target.protocol, "https:", "Staging validation requires HTTPS.");
  assert.notEqual(target.hostname, "chatplus-delta.vercel.app", "Refusing to run mutating validation against the known production hostname.");
  assert.equal(process.env.CHATAPP_STAGING_CONFIRMATION, "staging-only", "Set CHATAPP_STAGING_CONFIRMATION=staging-only only after confirming this is an isolated staging deployment.");
  assert.ok(groupId, "Set CHATAPP_TEST_GROUP_ID to a dedicated test group.");
  assert.ok(!/^(main|production)$/i.test(process.env.GITHUB_REF_NAME || ""), "Do not run staging mutation tests from a production branch.");

  const accounts = {
    admin: await login("admin", required("CHATAPP_TEST_ADMIN_EMAIL"), required("CHATAPP_TEST_ADMIN_PASSWORD")),
    member: await login("member", required("CHATAPP_TEST_MEMBER_EMAIL"), required("CHATAPP_TEST_MEMBER_PASSWORD")),
    outsider: await login("outsider", required("CHATAPP_TEST_OUTSIDER_EMAIL"), required("CHATAPP_TEST_OUTSIDER_PASSWORD")),
  };

  const groupPath = `/api/group/${encodeURIComponent(groupId)}`;
  const adminMembers = await expectStatus(accounts.admin, `${groupPath}/members`, 200, {}, "admin group membership");
  const memberMembers = await expectStatus(accounts.member, `${groupPath}/members`, 200, {}, "member group membership");
  const adminDirectory = await adminMembers.json();
  const memberDirectory = await memberMembers.json();
  assert.ok(adminDirectory.adminIds?.includes(accounts.admin.id), "Configured admin account must be a group admin.");
  assert.ok(!memberDirectory.adminIds?.includes(accounts.member.id), "Configured member account must not be a group admin.");
  await expectStatus(accounts.outsider, `${groupPath}/members`, 403, {}, "outsider group membership isolation");
  await expectStatus(accounts.outsider, `${groupPath}/features`, 403, {}, "outsider group feature isolation");

  const chatId = `group--${groupId}`;
  const requestId = `staging-validation-${Date.now()}-member`;
  const payload = { chatId, text: "Staging reliability validation message", requestId };
  const send = options => request(accounts.member, "/api/message/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    ...options,
  });
  const first = await send();
  assert.equal(first.status, 200, `member message send failed: HTTP ${first.status}`);
  const firstMessage = await first.json();
  assert.ok(firstMessage.id, "Message send must return a persisted message ID.");
  const retry = await send();
  assert.equal(retry.status, 200, "Idempotent retry must succeed.");
  const retriedMessage = await retry.json();
  assert.equal(retriedMessage.id, firstMessage.id, "Idempotent retry must return the same message.");
  await expectStatus(accounts.outsider, `/api/message/history?chatId=${encodeURIComponent(chatId)}&limit=10`, 403, {}, "outsider message history isolation");

  for (const account of [accounts.admin, accounts.member]) {
    const historyResponse = await expectStatus(account, `/api/message/history?chatId=${encodeURIComponent(chatId)}&limit=50`, 200, {}, `${account.label} group message history`);
    const history = await historyResponse.json();
    assert.ok(history.messages?.some(message => message.id === firstMessage.id), `${account.label} must be able to read the persisted test message`);
  }

  await signOut(accounts.member);
  await runSoak(accounts, chatId);
  console.log("Authenticated staging authorization, session logout, message persistence/idempotency, cross-account isolation, and controlled soak checks passed.");
}

main().catch(error => {
  console.error("Staging validation failed:", error.message);
  process.exitCode = 1;
});
