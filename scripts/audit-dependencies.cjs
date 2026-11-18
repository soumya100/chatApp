const { spawnSync } = require("node:child_process");

const pkg = require("../package.json");
const PROD_DEPENDENCY_ROOTS = new Set(Object.keys(pkg.dependencies || {}));

// Gate policy (no per-advisory exceptions, ever):
// - high/critical advisories reachable from production dependencies BLOCK,
//   always. There is no mechanism to whitelist them in this file.
// - high/critical advisories proven to be reachable only through
//   devDependency roots are REPORTED as warnings and do not block.
// - unknown topology (no finding paths) is treated as production-reachable so
//   the gate fails closed.
// - moderate/low/informational advisories are reported below the gate and
//   never block.
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

function devRoots(advisory) {
  const roots = new Set(findingPaths(advisory).map(path => String(path).split(">")[0]));
  roots.delete(undefined);
  return [...roots];
}

function classifyAdvisories(advisories) {
  const blocking = [];
  const devOnly = [];
  const reportedBelowThreshold = [];

  for (const advisory of advisories) {
    const severity = String(advisory.severity || "").toLowerCase();
    if (severity !== "high" && severity !== "critical") {
      reportedBelowThreshold.push(advisory);
      continue;
    }

    if (isReachableFromProductionDependencies(advisory)) {
      blocking.push(advisory);
    } else {
      devOnly.push(advisory);
    }
  }

  return { blocking, devOnly, reportedBelowThreshold };
}

// Parses Yarn's line-delimited JSON audit output. Unparsable lines are
// counted and reported by the caller instead of being swallowed silently.
function parseAuditEvents(stdout) {
  const events = [];
  let unparsedLines = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Yarn emits human-readable progress lines only when JSON mode is absent.
      unparsedLines += 1;
    }
  }
  return { events, unparsedLines };
}

function runAudit() {
  const result = spawnSync("yarn", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });

  if (result.error) throw result.error;

  const { events, unparsedLines } = parseAuditEvents(result.stdout || "");
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
  if (unparsedLines) {
    console.warn(`Skipped ${unparsedLines} unparsable audit output line(s) that were not JSON.`);
  }

  for (const advisory of classified.devOnly) {
    console.warn(
      `DEV-ONLY ADVISORY (reported, not blocking): ${uniqueAdvisory(advisory)} is reachable only through ` +
      `devDependency root(s) [${devRoots(advisory).join(", ")}] and cannot ship to production. ` +
      `${advisory.url || "no advisory URL"}`
    );
  }

  const belowThresholdCounts = classified.reportedBelowThreshold.reduce((counts, advisory) => {
    const severity = String(advisory.severity || "unknown").toLowerCase();
    counts[severity] = (counts[severity] || 0) + 1;
    return counts;
  }, {});
  const belowThresholdSummary = Object.entries(belowThresholdCounts)
    .map(([severity, count]) => `${count} ${severity}`)
    .join(", ");
  if (classified.reportedBelowThreshold.length) {
    console.warn(
      `Below-threshold advisories reported (not blocking): ${belowThresholdSummary}.`
    );
  }

  if (classified.blocking.length) {
    console.error("Production-reachable high/critical dependency advisories (no exceptions are granted):");
    for (const advisory of classified.blocking) {
      console.error(`- ${uniqueAdvisory(advisory)}: ${advisory.url || "no advisory URL"}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    console.warn(`Yarn audit exited with status ${result.status}; the gate passes because every parsed advisory is reported above and none are production-reachable high/critical.`);
  }

  console.log("Dependency audit gate passed: no production-reachable high/critical findings.");
}

if (require.main === module) {
  try {
    runAudit();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { classifyAdvisories, parseAuditEvents, isReachableFromProductionDependencies };
