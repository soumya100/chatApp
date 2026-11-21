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

test("dev-root high/critical advisories pass only through an explicit, expiring mitigation registry", () => {
  const audit = read("scripts/audit-dependencies.cjs");
  assert.match(audit, /KNOWN_DEV_MITIGATIONS\s*=\s*\[/, "mitigations must live in one explicit registry");
  assert.match(audit, /expiresAt/, "every mitigation must carry an expiry field");
  assert.match(audit, /Date\.parse/, "the gate must validate the expiry as a date");
  assert.match(audit, /validateMitigationRegistry/, "the registry must be structurally validated at run time");
  assert.doesNotMatch(audit, /reported, not blocking/, "the old warn-only dev downgrade must stay deleted");
  assert.match(audit, /grant no exceptions/, "production-reachable high/critical findings are never excepted");

  const { KNOWN_DEV_MITIGATIONS, validateMitigationRegistry } = require("../scripts/audit-dependencies.cjs");
  assert.deepEqual(
    validateMitigationRegistry(new Date()),
    [],
    "every registered mitigation must carry an id, package, written reason and a future expiry"
  );
  for (const entry of KNOWN_DEV_MITIGATIONS) {
    assert.equal(typeof entry.id, "number", `${entry.package}: numeric advisory id required`);
    assert.equal(typeof entry.package, "string", `${entry.id}: exact package name required`);
    assert.ok(entry.reason.length >= 40, `${entry.package}: the reason must justify why no upgrade remediates it`);
    assert.ok(Date.parse(entry.expiresAt) > Date.now(), `${entry.package}: the expiry must still be in the future`);
  }
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

test("CI credential-shaped variables are generated per run, never committed as literals", () => {
  const ci = read(".github/workflows/chatapp-ci.yml");
  for (const name of ["NEXTAUTH_SECRET", "PUSHER_APP_SECRET", "BLOB_READ_WRITE_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]) {
    assert.doesNotMatch(
      ci,
      new RegExp(`^\\s+${name}: \\S+`, "m"),
      `${name} must not be committed as a literal env value; it is generated per run`
    );
  }
  const generateSteps = ci.match(/Generate ephemeral CI-only credentials/g) || [];
  assert.equal(generateSteps.length, 3, "each app-running job must generate its own ephemeral credentials");
  assert.match(ci, /openssl rand -base64/, "credentials must come from a per-run random source");
});

test("CI installs no OS packages and the Redis suites use the in-repo RESP client", () => {
  for (const file of ["chatapp-ci.yml", "deploy-production.yml", "security.yml", "codeql.yml"]) {
    const source = read(path.join(".github", "workflows", file));
    assert.doesNotMatch(source, /apt-get\s+install/, `${file} must not install OS packages at run time`);
  }
  for (const file of ["redis-lua.integration.test.cjs", "redis-message-scripts.integration.test.cjs"]) {
    const source = read(path.join("tests", file));
    assert.doesNotMatch(source, /spawnSync\("redis-cli"/, `${file} must not shell out to the redis-cli binary`);
    assert.match(source, /resp-redis-client/, `${file} must talk RESP through the in-repo client`);
  }
  assert.ok(fs.existsSync(path.join(root, "tests", "helpers", "resp-redis-client.cjs")), "the RESP client helper must exist");
});

test("pull-request workflows keep repository secrets out of validation jobs and isolate gated Vercel deployment", () => {
  const workflowDirectory = path.join(root, ".github", "workflows");
  const workflowFiles = fs.readdirSync(workflowDirectory).filter(file => /\\.ya?ml$/.test(file));
  assert.ok(workflowFiles.length > 0, "workflow definitions must exist");
  for (const file of workflowFiles) {
    const source = fs.readFileSync(path.join(workflowDirectory, file), "utf8");
    const runsOnPullRequests = /^ {2}pull_request(?:_target)?:/m.test(source);
    if (!runsOnPullRequests) continue;

    if (file !== "chatapp-ci.yml") {
      assert.doesNotMatch(source, /secrets\\.[A-Z_]+/, `${file} runs on pull_request and must not reference secrets`);
      continue;
    }

    // Keep validation/build/scanner jobs tokenless. Only the isolated,
    // same-repository Vercel preview job may consume deployment credentials.
    const deploymentMarker = "  deploy-vercel-preview:";
    const deploymentIndex = source.indexOf(deploymentMarker);
    assert.notEqual(deploymentIndex, -1, "the gated Vercel preview job must exist");
    const validationJobs = source.slice(0, deploymentIndex);
    const deploymentJob = source.slice(deploymentIndex);
    assert.doesNotMatch(validationJobs, /secrets\\.[A-Z_]+/, "PR validation and security jobs must remain tokenless");
    assert.match(deploymentJob, /needs:\\s*\\n\\s*- pr-quality-gate/, "preview deployment must depend on the PR quality gate");
    assert.match(deploymentJob, /needs\\.pr-quality-gate\\.result == 'success'/, "preview deployment must require a successful quality gate");
    assert.match(deploymentJob, /github\\.event\\.pull_request\\.head\\.repo\\.full_name == github\\.repository/, "preview deployment must reject fork PRs");
    const secretReferences = [...deploymentJob.matchAll(/secrets\\.([A-Z_]+)/g)].map(match => match[1]);
    assert.ok(secretReferences.length > 0, "the preview deployment must use configured Vercel credentials");
    assert.deepEqual([...new Set(secretReferences)].sort(), ["VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "VERCEL_TOKEN"]);
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

test("text sanitization removes nested HTML tags to a fixed point", () => {
  const authPath = path.join(root, "src/lib/validations/auth.ts");
  const source = fs.readFileSync(authPath, "utf8");
  assert.match(source, /let previous\s*:/);
  assert.match(source, /previous\s*=\s*sanitized/);
  assert.match(source, /sanitized\s*=\s*sanitized\.replace\(\/<\[\^>\]\*>\?\/gm,\s*""\)/);
  assert.match(source, /\}\s*while\s*\(sanitized\s*!==\s*previous\)/);
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

test("deleted or mismatched user records invalidate stale NextAuth JWT sessions", () => {
  const auth = read("src/lib/auth.ts");
  assert.match(auth, /if \(!token\?\.id \|\| typeof token\.id !== "string"\)\s*\{\s*return \{ \.\.\.token, id: "", exp: 0 \}/s);
  assert.match(auth, /if \(!dbUserResult\)\s*\{\s*return \{ \.\.\.token, id: "", exp: 0 \}/s);
  assert.match(auth, /if \(!dbUser\?\.id \|\| dbUser\.id !== token\.id\)\s*\{\s*return \{ \.\.\.token, id: "", exp: 0 \}/s);
  assert.match(auth, /return \{\s*\.\.\.token,\s*id: dbUser\.id/s);
  assert.doesNotMatch(auth, /if \(!dbUserResult\)\s*\{\s*return token/s);
});

test("authentication redirects reject malformed and cross-origin URLs safely", () => {
  const auth = read("src/lib/auth.ts");
  assert.match(auth, /url\.startsWith\("\/"\) && !url\.startsWith\("\/\/"\)/);
  assert.match(auth, /const candidate = new URL\(url\)/);
  assert.match(auth, /candidate\.origin === trustedOrigin/);
  assert.match(auth, /catch \{[\s\S]*?Invalid redirect input is untrusted/);
  assert.match(auth, /return `\$\{baseUrl\}\/dashboard`/);
});
