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
  assert.equal(pkg.resolutions.postcss, "8.5.33");
  assert.equal(pkg.resolutions.picomatch, "4.0.7");
  assert.match(read("yarn.lock"), /postcss@8\.4\.31, postcss@8\.5\.33, postcss@\^8, postcss@\^8\.4\.47:\s+version "8\.5\.33"/);
});

test("the affected picomatch@2.3.2 artifact is gone and every picomatch range resolves to the newest release", () => {
  const lock = read("yarn.lock");
  assert.match(lock, /picomatch@[\d^][^:]*:\s+version "4\.0\.7"/);
  assert.doesNotMatch(lock, /picomatch-2\.\d+\.\d+\.tgz/);
  assert.doesNotMatch(lock, /version "2\.3\.2"/);
});

test("the dependency audit gate grants no exceptions for high/critical advisories", () => {
  const audit = read("scripts/audit-dependencies.cjs");
  assert.doesNotMatch(audit, /EXCEPTIONS\s*=/, "the gate must not whitelist specific advisories");
  assert.doesNotMatch(audit, /canExcept/, "no per-advisory exception pathway may exist");
  assert.match(audit, /no exceptions are granted/);
});

test("every third-party GitHub Action is pinned to an immutable commit SHA", () => {
  const workflowDirectory = path.join(root, ".github", "workflows");
  const workflowFiles = fs.readdirSync(workflowDirectory).filter(file => /\.ya?ml$/.test(file));
  assert.ok(workflowFiles.length > 0);
  const usesLines = [];
  for (const file of workflowFiles) {
    const source = fs.readFileSync(path.join(workflowDirectory, file), "utf8");
    for (const line of source.split(/\r?\n/)) {
      if (/^\s*uses:/.test(line)) usesLines.push([file, line.trim()]);
    }
  }
  assert.ok(usesLines.length > 0, "workflows must reference actions to pin");
  for (const [file, line] of usesLines) {
    const action = line.replace(/^uses:\s*/, "");
    if (action.startsWith("./")) continue; // local composite actions are in-repo
    assert.match(action, /@[0-9a-f]{40}$/, `${file}: ${action} must be pinned to a 40-char commit SHA`);
  }
});

test("CI container images are digest-pinned and the Vercel CLI is version-pinned", () => {
  for (const relative of [".github/workflows/chatapp-ci.yml", ".github/workflows/security.yml"]) {
    const source = read(relative);
    for (const image of ["ghcr.io/zaproxy/zaproxy@sha256:", "ghcr.io/gitleaks/gitleaks@sha256:"]) {
      if (source.includes(image.split("@")[0])) {
        assert.ok(source.includes(image), `${relative} must reference ${image.split("@")[0]} by digest`);
      }
    }
    assert.doesNotMatch(source, /ghcr\.io\/[^\s]+:(latest|stable)\b/, `${relative} must not pull mutable image tags`);
  }
  const deploy = read(".github/workflows/deploy-production.yml");
  assert.doesNotMatch(deploy, /vercel@latest/, "the production deploy CLI must not float on @latest");
  assert.match(deploy, /npm install --global vercel@\d+\.\d+\.\d+/);
});

test("CI placeholder env vars are scoped to the jobs that build and run the app", () => {
  const ci = read(".github/workflows/chatapp-ci.yml");
  const workflowLevelEnv = ci.match(/^env:\n((?:  .*(?:\n|$))+?)^jobs:/m);
  assert.equal(workflowLevelEnv, null, "chatapp-ci.yml must not export env vars at workflow level");
  for (const jobName of ["build-and-browser-smoke", "vapt", "vapt-active"]) {
    const jobBlock = ci.slice(ci.indexOf(`  ${jobName}:`));
    assert.match(jobBlock, /^    env:/m, `${jobName} must declare its own env block`);
  }
});

test("workflows triggered by pull requests never reference repository secrets", () => {
  const workflowDirectory = path.join(root, ".github", "workflows");
  const workflowFiles = fs.readdirSync(workflowDirectory).filter(file => /\.ya?ml$/.test(file));
  assert.ok(workflowFiles.length > 0, "workflow definitions must exist");
  for (const file of workflowFiles) {
    const source = fs.readFileSync(path.join(workflowDirectory, file), "utf8");
    const runsOnPullRequests = /^ {2}pull_request(?:_target)?:/m.test(source);
    if (runsOnPullRequests) {
      assert.doesNotMatch(source, /secrets\.[A-Z_]+/, `${file} runs on pull_request and must not reference secrets`);
    }
  }
});

test("the production deploy gate only trusts CI runs from this repository's own main branch", () => {
  const workflow = read(".github/workflows/deploy-production.yml");
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
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
