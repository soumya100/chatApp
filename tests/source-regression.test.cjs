const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test("the API route inventory is complete and every route exports an HTTP handler", () => {
  const apiRoot = path.join(root, "src/app/api");
  const routes = walk(apiRoot).filter(file => /route\.(ts|js)$/.test(file));
  assert.equal(routes.length, 31, "update this inventory assertion when adding or removing API routes");

  for (const file of routes) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)|export\s+\{\s*handler\s+as\s+GET,\s*handler\s+as\s+POST\s*\}/, path.relative(root, file));
  }
});

test("protected API routes have an explicit authentication boundary", () => {
  const apiRoot = path.join(root, "src/app/api");
  const routes = walk(apiRoot).filter(file => /route\.(ts|js)$/.test(file));
  const publicProtocolRoutes = new Set([
    "auth/[...nextauth]/route.ts",
    "auth/register/route.ts",
  ]);

  for (const file of routes) {
    const relative = path.relative(apiRoot, file).replaceAll(path.sep, "/");
    if (publicProtocolRoutes.has(relative)) continue;
    const source = fs.readFileSync(file, "utf8");
    assert.match(
      source,
      /getServerSession|getToken|CRON_SECRET|Authorization|authorization|authOptions/,
      `No explicit auth boundary found in ${relative}`
    );
  }
});

test("chat mounts the member manager and activity panel instead of only toggling state", () => {
  const source = read("src/components/Chat/index.tsx");
  assert.match(source, /<GroupMembersManager\b/);
  assert.match(source, /<GroupFeaturesPanel\b/);
  assert.match(source, /setIsMembersManagerOpen\(true\)/);
  assert.match(source, /setIsGroupFeaturesOpen\(true\)/);
});

test("group update subscriptions use the same event names as the management API", () => {
  const chat = read("src/components/Chat/index.tsx");
  const manage = read("src/app/api/group/[groupId]/manage/route.ts");
  for (const eventName of ["group_updated", "group_deleted", "group_removed"]) {
    assert.ok(chat.includes(eventName), `chat is missing subscription for ${eventName}`);
    assert.ok(manage.includes(eventName), `API is missing event emission for ${eventName}`);
  }
});

test("member profile endpoint applies membership authorization and a field allow-list", () => {
  const source = read("src/app/api/group/[groupId]/members/route.ts");
  assert.match(source, /getServerSession\(authOptions\)/);
  assert.match(source, /memberIds\s*\|\|\s*\[\]\)\.includes\(userId\)/);
  assert.match(source, /return\s*\{\s*id,\s*name:/);
  assert.doesNotMatch(source, /return\s*\{[^}]*email:/s);
});

test("group member removal confirmation closes independently from the parent dialog", () => {
  const source = read("src/components/Chat/GroupMembersManager.tsx");
  for (const term of ["promote", "demote", "remove", "DialogUI", "confirmRemoveMember", "toast.error", "onGroupUpdated"]) {
    assert.ok(source.includes(term), `member manager is missing ${term}`);
  }
  assert.match(source, /onClose=\{\(\)\s*=>\s*\{\s*if\s*\(!isRemoveDialogOpen\)\s*onClose\(\)/);
  assert.match(source, /closeHandler=\{\(open\)\s*=>\s*\{\s*setIsRemoveDialogOpen\(open\)/);
  assert.match(source, /onClick=\{\(\)\s*=>\s*\{\s*setIsRemoveDialogOpen\(false\);\s*setPendingRemovalId\(null\)\s*\}\}/);
  assert.doesNotMatch(source, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
});

test("application source contains no native browser alert, confirm, or prompt calls", () => {
  const sourceRoot = path.join(root, "src");
  const sourceFiles = walk(sourceRoot).filter(file => /\.(?:[cm]?[jt]sx?)$/.test(file));
  const nativeDialogCall = /\b(?:(?:window|globalThis)\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/;

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, nativeDialogCall, `Native browser dialog call found in ${path.relative(root, file)}`);
  }
});

test("group settings keep admin-only controls, tabs, and responsive modal boundaries", () => {
  const source = read("src/components/Chat/GroupSettingsModal.tsx");
  for (const term of ["general", "permissions", "privacy", "isAdmin", "max-h-[100dvh]", "overflow-hidden"]) {
    assert.ok(source.includes(term), `settings modal is missing ${term}`);
  }
  assert.match(source, /GroupPrivacySettings/);
});

test("privacy settings serialize writes and restore state after a failed request", () => {
  const source = read("src/components/Chat/GroupPrivacySettings.tsx");
  assert.match(source, /if\s*\(saving\)\s*return/);
  assert.match(source, /setPreferences\(previous\)/);
  assert.match(source, /disabled=\{saving\}/);
});

test("group activity preserves drafts when an API mutation fails", () => {
  const source = read("src/components/Chat/GroupFeaturesPanel.tsx");
  assert.match(source, /const\s+saved\s*=\s*await\s+act/);
  assert.match(source, /if\s*\(saved\)/);
  assert.match(source, /toast\.error/);
});

test("group routes use Next.js 15 async route params", () => {
  for (const relative of [
    "src/app/api/group/[groupId]/members/route.ts",
    "src/app/api/group/[groupId]/manage/route.ts",
    "src/app/api/group/[groupId]/features/route.ts",
    "src/app/api/group/[groupId]/pin/route.ts",
  ]) {
    const source = read(relative);
    assert.match(source, /params:\s*Promise<\{\s*groupId:\s*string\s*\}>/);
    assert.doesNotMatch(source, /params\.groupId/);
  }
});

test("the group settings and activity APIs use bounded validation and membership checks", () => {
  const manage = read("src/app/api/group/[groupId]/manage/route.ts");
  const features = read("src/app/api/group/[groupId]/features/route.ts");
  const pins = read("src/app/api/group/[groupId]/pin/route.ts");
  const privacy = read("src/app/api/user/group-preferences/route.ts");

  assert.match(manage, /discriminatedUnion/);
  assert.match(manage, /max\(500\)/);
  assert.match(features, /options:\s*z\.array/);
  assert.match(features, /\.max\(10\)/);
  assert.match(features, /memberIds\s*\|\|\s*\[\]\)\.includes\(userId\)/);
  assert.match(pins, /messageId:\s*z\.string\(\)\.min\(1\)/);
  assert.match(pins, /message\.senderId\s*==\s*"system"\s+or\s+message\.isDeleted/);
  assert.match(privacy, /notifications:\s*z\.enum\(\["all",\s*"muted"\]\)/);
});


test("group message sending preserves creator permissions for legacy empty admin lists", () => {
  const source = read("src/app/api/message/send/route.ts");
  // The legacy fallback (empty adminIds -> creator administers) lives in the
  // shared resolveAdminIds helper; every group route must derive admins there.
  assert.match(source, /resolveAdminIds\(group\)\.includes\(session\.user\.id\)/);
  assert.match(read("src/lib/group.ts"), /group\.adminIds\?\.length\s*\?\s*group\.adminIds\s*:\s*\[group\.creatorId\]/);
  assert.match(source, /onlyAdminsCanSendMessages\s*\|\|\s*group\.settings\?\.announcementsOnly/);
  assert.match(source, /Request body must be valid JSON/);
});

test("member invitations enforce explicit admin-approval and disabled-invite policies", () => {
  const source = read("src/app/api/group/members/add/route.ts");
  assert.match(source, /approvalRequired\s*&&\s*!isAdmin/);
  assert.match(source, /allowMemberInvites\s*===\s*false/);
  assert.match(source, /Promise\.allSettled/);
});


test("global controls use accessible premium checkbox and radio styling", () => {
  const styles = read("src/app/globals.css");
  assert.match(styles, /input\[type="checkbox"\][\s\S]*input\[type="radio"\]/);
  assert.match(styles, /input\[type="checkbox"\]:checked\s*\{[\s\S]*background-image:/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /:disabled/);
  assert.match(styles, /html\.dark input\[type="checkbox"\]/);
});

test("dark application canvas matches the login slate background", () => {
  const styles = read("src/app/globals.css");
  const layout = read("src/app/layout.tsx");
  assert.match(styles, /html\.dark body\s*\{[\s\S]*background-color:\s*#020617/);
  assert.match(layout, /dark:bg-slate-950/);
  assert.match(layout, /color:\s*"#020617"/);
});

test("community member actions are scoped per community and prevent duplicate submissions", () => {
  const source = read("src/components/Chat/CommunitiesPanel.tsx");
  assert.match(source, /memberIds\[community\.id\]/);
  assert.match(source, /addingTo/);
  assert.match(source, /disabled=\{addingTo===item\.id\}/);
  assert.match(source, /finally \{ setAddingTo\(null\) \}/);
  assert.match(source, /inviteBusyId/);
});

test("group activity refreshes without hiding the panel and disables duplicate event responses", () => {
  const source = read("src/components/Chat/GroupFeaturesPanel.tsx");
  assert.match(source, /await load\(false\)/);
  assert.match(source, /disabled=\{busy\} onClick=\{\(\)=>act\(\{action:"respondEvent"/);
});


test("Redis operations probe is secret-authenticated and exposes only aggregate queue metrics", () => {
  const source = read("src/app/api/health/redis/route.ts");
  assert.match(source, /authorization.*Bearer/);
  assert.match(source, /db\.ping\(\)/);
  assert.match(source, /chat:expiring/);
  assert.match(source, /media:cleanup/);
  assert.match(source, /media:orphans/);
  assert.match(source, /Do not leak Redis URLs, tokens, commands or raw provider errors/);
  assert.doesNotMatch(source, /UPSTASH_REDIS_REST_TOKEN|UPSTASH_REDIS_REST_URL/);
});
