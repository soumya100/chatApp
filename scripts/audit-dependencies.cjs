const { spawnSync } = require("node:child_process");

const pkg = require("../package.json");
const PROD_DEPENDENCY_ROOTS = new Set(Object.keys(pkg.dependencies || {}));

const EXCEPTIONS = [
  {
    id: "1247710",
    module: "picomatch",
    severity: "high",
    expiresAt: "2026-11-25T23:59:59Z",
    // The exception applies to dependency trees that cannot reach production
    // code (see isReachableFromProductionDependencies); production paths always block.
    devOnly: true,
    reason: "CVE-2026-112366/GHSA-fc5q-39xc-vjpf has no published fixed picomatch release (upstream patched_versions is <0.0.0 as of 2026-11-18). All affected usages are devDependencies (tailwindcss, eslint-config-next) that never ship to production. Upstream fix proposals remain open; this exception is temporary and does not assert that the package is safe.",
    references: [
      "https://github.com/micromatch/picomatch/issues/247",
      "https://github.com/micromatch/picomatch/pull/238",
      "https://github.com/micromatch/picomatch/pull/246",
    ],
  },
];

function findingPaths(advisory) {
  const findings = Array.isArray(advisory.findings) ? advisory.findings : [];
  return findings.flatMap(finding => {
    if (Array.isArray(finding.paths)) return finding.paths;
    return finding.paths ? [finding.paths] : [];
  });
}

// Returns true when the advisory cannot be proven unreachable from production:
// unknown topology (no finding paths) is treated as production-reachable so the
// audit gate fails closed.
function isReachableFromProductionDependencies(advisory) {
  const paths = findingPaths(advisory);
  if (!paths.length) return true;
  return paths.some(path => PROD_DEPENDENCY_ROOTS.has(String(path).split(">")[0]));
}

function classifyAdvisories(advisories, now = new Date()) {
  const blocking = [];
  const excepted = [];
  const ignoredBelowThreshold = [];

  for (const advisory of advisories) {
    const severity = String(advisory.severity || "").toLowerCase();
    if (severity !== "high" && severity !== "critical") {
      ignoredBelowThreshold.push(advisory);
      continue;
    }

    const exception = EXCEPTIONS.find(item =>
      String(advisory.id) === item.id &&
      advisory.module_name === item.module &&
      severity === item.severity &&
      now.getTime() <= Date.parse(item.expiresAt)
    );

    const canExcept = exception &&
      (!exception.devOnly || !isReachableFromProductionDependencies(advisory));

    if (canExcept) {
      excepted.push({ advisory, exception });
    } else {
      blocking.push(advisory);
    }
  }

  return { blocking, excepted, ignoredBelowThreshold };
}

function parseAuditEvents(stdout) {
  const events = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Yarn emits human-readable progress lines only when JSON mode is absent.
    }
  }
  return events;
}

function runAudit() {
  const result = spawnSync("yarn", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });

  if (result.error) throw result.error;

  const events = parseAuditEvents(result.stdout || "");
  const advisories = events
    .filter(event => event.type === "auditAdvisory")
    .map(event => event.data?.advisory)
    .filter(Boolean);

  if (!events.length || (!advisories.length && result.status !== 0)) {
    process.stderr.write(result.stderr || result.stdout || "Yarn audit produced no parseable JSON output.\n");
    throw new Error("Dependency audit could not be parsed; failing closed.");
  }

  const classified = classifyAdvisories(advisories);
  const uniqueAdvisory = advisory => `${advisory.id}: ${advisory.module_name} (${advisory.severity})`;

  console.log(`Yarn audit returned ${advisories.length} advisory record(s).`);

  for (const { advisory, exception } of classified.excepted) {
    console.warn(
      `TIME-BOXED EXCEPTION: ${uniqueAdvisory(advisory)}; expires ${exception.expiresAt}. ${exception.reason}`
    );
    console.warn(`References: ${exception.references.join(" | ")}`);
  }

  if (classified.blocking.length) {
    console.error("Unexcepted high/critical dependency advisories:");
    for (const advisory of classified.blocking) {
      console.error(`- ${uniqueAdvisory(advisory)}: ${advisory.url || "no advisory URL"}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0 && !classified.excepted.length) {
    process.stderr.write(result.stderr || "");
    throw new Error(`Yarn audit exited with status ${result.status}.`);
  }

  console.log("Dependency audit gate passed: no unexcepted high/critical findings.");
}

if (require.main === module) {
  try {
    runAudit();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { EXCEPTIONS, classifyAdvisories, parseAuditEvents };
