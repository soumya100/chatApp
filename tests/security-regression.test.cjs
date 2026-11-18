const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("local secrets and environment files are ignored while .env.example remains tracked", () => {
  const ignore = read(".gitignore");
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);

  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(tracked.includes(".env"), false);
  assert.equal(tracked.some(file => /^\.env\.(?!example$)/.test(file)), false);
});

test("uploaded user media is not committed into the public source tree", () => {
  const trackedUploads = execFileSync("git", ["ls-files", "public/uploads"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert.equal(trackedUploads, "", "user uploads must be stored in Blob/Redis-backed storage, not Git");
});

test("production dependency overrides retain the reviewed security floors", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.ok(Number.parseInt(pkg.engines.node.match(/\d+/)?.[0] || "0", 10) >= 20);
  assert.equal(pkg.resolutions.uuid, "11.1.1");
  assert.equal(pkg.resolutions.zod, "4.6.6");
});

test("dashboard authorization remains enforced at the middleware boundary", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /withAuth/);
  assert.match(middleware, /getToken\(\{\s*req\s*\}\)/);
  assert.match(middleware, /sensitiveRoutes\.some\(\(route\) => pathname\.startsWith\(route\)\)/);
  assert.match(middleware, /matcher:\s*\[.*\/dashboard\/:path\*/s);
});

test("cron cleanup requires a server-side secret rather than trusting request input", () => {
  const cron = read("src/app/api/cron/cleanup-expired-messages/route.ts");
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /authorization|Authorization/);
  assert.match(cron, /timingSafeEqual|===|!==/);
});

test("registration stores a password hash and applies server-side validation", () => {
  const registration = read("src/app/api/auth/register/route.ts");
  assert.match(registration, /safeParse/);
  assert.match(registration, /bcrypt\.hash/);
  assert.match(registration, /12/);
  assert.doesNotMatch(registration, /db\.set\([^\n]*password\s*[,)]/);
});

test("dangerous raw HTML injection is not introduced in app components", () => {
  const sourceRoot = path.join(root, "src");
  const files = [];
  const walk = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (item.isDirectory()) walk(target);
      else if (/\.(tsx?|jsx?)$/.test(item.name)) files.push(target);
    }
  };
  walk(sourceRoot);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/, path.relative(root, file));
  }
});
