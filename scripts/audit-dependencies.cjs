const { spawnSync } = require("node:child_process");

const pkg = require("../package.json");
const PROD_DEPENDENCY_ROOTS = new Set(Object.keys(pkg.dependencies || {}));

// Gate policy — requirement R-SEC-2 of this PR (stated in the PR description):
// the dependency audit must fail closed. Concretely:
// - high/critical advisories reachable from production dependencies BLOCK,
//   always. There is no mechanism to whitelist them in this file.
// - high/critical advisories rooted only in devDependency tooling BLOCK too.
//   They may pass only through an entry in KNOWN_DEV_MITIGATIONS below: an
//   explicit, reasoned, expiring record for an advisory that has no fixed
//   release to upgrade to. Nothing is downgraded silently.
// - unknown topology (no finding paths) is treated as production-reachable so
//   the gate fails closed.
// - severities outside the documented set (critical, high, moderate, low,
//   info) BLOCK: a severity the gate cannot classify must never drift into
//   the below-threshold path, mirroring the ZAP report gate's handling of
//   unclassified risk codes.
// - moderate/low/informational advisories are reported below the gate and
//   never block.

// Registered mitigations for advisories that cannot be remediated by an
// upgrade today. Every entry must match one advisory id and one package
// exactly, must carry a written reason, and MUST carry a future expiry; once
// the expiry passes the gate fails closed until the registry is consciously
// reviewed and renewed (or the pin moves past a fixed release and the entry
// is removed). Entries are exported so the security regression suite can
// assert they stay well-formed and current.
const KNOWN_DEV_MITIGATIONS = [
  {
    id: 1247710,
    package: "picomatch",
    // GHSA-fc5q-39xc-vjpf (CVE-2026-112366): ReDoS through single-branch
    // repeated extglobs. No fixed release is published (4.0.7 is the newest
    // version on npm), the tree is pinned to exactly that release via the
    // root "resolutions" entry, and every audit path roots at build-time
    // tooling (tailwindcss, eslint-config-next) that never ships to
    // production.
    reason:
      "No fixed picomatch release exists; the tree is pinned to the newest release (4.0.7) and all audit paths root at dev-only build tooling (tailwindcss, eslint-config-next). Renew or drop this entry when a fixed release is published.",
    expiresAt: "2027-02-28",
  },
];

// The complete set of severities the audit feed is allowed to emit. Anything
// outside this set means the feed schema changed (or a registry/proxy
// reshaped the records): the gate cannot know how risky the finding is, so
// it must fail closed rather than guess.
const KNOWN_SEVERITIES = new Set(["critical", "high", "moderate", "low", "info"]);

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

function isEntryExpired(entry, now) {
  const expiryMs = Date.parse(entry.expiresAt);
  if (Number.isNaN(expiryMs)) return true;
  const reference = now instanceof Date ? now.getTime() : Date.now();
  // An entry blocks from the end of its expiry day (inclusive), fail-closed.
  return reference > expiryMs + 24 * 60 * 60 * 1000 - 1;
}

// Structural validation of the mitigation registry. Any problem is a gate
// failure: a malformed entry must never silently swallow an advisory.
function validateMitigationRegistry(now) {
  const errors = [];
  const seen = new Set();
  for (const entry of Array.isArray(KNOWN_DEV_MITIGATIONS) ? KNOWN_DEV_MITIGATIONS : []) {
    const label = entry && entry.id !== undefined ? `id ${entry.id}` : "malformed entry";
    if (!entry || typeof entry !== "object") {
      errors.push(`${label}: entry must be an object`);
      continue;
    }
    if (!Number.isFinite(entry.id)) errors.push(`${label}: id must be the numeric advisory id`);
    if (typeof entry.package !== "string" || !entry.package) {
      errors.push(`${label}: package must be the exact vulnerable module name`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 40) {
      errors.push(`${label}: reason must justify why no upgrade can remediate the advisory`);
    }
    if (typeof entry.expiresAt !== "string" || Number.isNaN(Date.parse(entry.expiresAt))) {
      errors.push(`${label}: expiresAt must be a parseable date`);
    } else if (isEntryExpired(entry, now)) {
      errors.push(`${label}: mitigation for ${entry.package} expired on ${entry.expiresAt}; review the pin and renew or remove the entry`);
    }
    const key = `${entry.id}:${entry.package}`;
    if (seen.has(key)) errors.push(`${label}: duplicate entry for ${key}`);
    seen.add(key);
  }
  return errors;
}

function matchingMitigation(advisory, now) {
  for (const entry of KNOWN_DEV_MITIGATIONS) {
    if (Number(entry.id) !== Number(advisory.id)) continue;
    if (entry.package !== advisory.module_name) continue;
    if (isEntryExpired(entry, now)) return null;
    return entry;
  }
  return null;
}

// Classifies yarn audit advisories against the fail-closed policy. `now` is
// injectable so tests can prove the expiry behaves deterministically.
function classifyAdvisories(advisories, now) {
  const blocking = [];
  const devMitigated = [];
  const unmitigatedDevRooted = [];
  const reportedBelowThreshold = [];
  const unclassifiable = [];

  for (const advisory of advisories) {
    const severity = String(advisory.severity ?? "").trim().toLowerCase();
    if (!KNOWN_SEVERITIES.has(severity)) {
      // A severity the gate cannot classify must never be reclassified as
      // "below threshold": that would silently pass an advisory whose risk
      // is unknown (fail-open). It gets its own blocking bucket instead.
      unclassifiable.push({ advisory, severity: severity || "(missing)" });
      continue;
    }
    if (severity !== "high" && severity !== "critical") {
      reportedBelowThreshold.push(advisory);
      continue;
    }

    if (isReachableFromProductionDependencies(advisory)) {
      // Production reachability is never mitigated.
      blocking.push({ advisory, mitigation: null });
      continue;
    }

    const mitigation = matchingMitigation(advisory, now);
    if (mitigation) {
      devMitigated.push({ advisory, mitigation });
    } else {
      unmitigatedDevRooted.push({ advisory, mitigation: null });
    }
  }

  return { blocking, devMitigated, unmitigatedDevRooted, reportedBelowThreshold, unclassifiable };
}

// Parses Yarn's line-delimited JSON audit output. Unparsable lines are
// counted and reported by the caller instead of being swallowed silently,
// and the terminal auditSummary record is tracked so an interrupted or
// truncated audit run can never be mistaken for a completed pass.
function parseAuditEvents(stdout) {
  const events = [];
  let unparsedLines = 0;
  let hasSummary = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      events.push(event);
      if (event.type === "auditSummary") hasSummary = true;
    } catch {
      // Yarn emits human-readable progress lines only when JSON mode is absent.
      unparsedLines += 1;
    }
  }
  return { events, unparsedLines, hasSummary };
}

function runAudit() {
  const result = spawnSync("yarn", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });

  if (result.error) throw result.error;

  const { events, unparsedLines, hasSummary } = parseAuditEvents(result.stdout || "");
  const advisories = events
    .filter(event => event.type === "auditAdvisory")
    .map(event => event.data?.advisory)
    .filter(Boolean);

  if (!events.length || (!advisories.length && result.status !== 0)) {
    process.stderr.write(result.stderr || result.stdout || "Yarn audit produced no parseable JSON output.\n");
    throw new Error("Dependency audit could not be parsed; failing closed.");
  }

  // Yarn terminates every completed audit with an auditSummary record. Its
  // absence means the run was interrupted or truncated mid-stream: treating
  // the partial advisory list as a full result would be fail-open.
  if (!hasSummary) {
    process.stderr.write(result.stderr || result.stdout || "Yarn audit ended without its auditSummary record.\n");
    throw new Error("Dependency audit ended without the auditSummary record (interrupted or truncated run); failing closed.");
  }

  const registryErrors = validateMitigationRegistry(new Date());
  if (registryErrors.length) {
    console.error("The mitigation registry is malformed or stale (failing closed):");
    for (const error of registryErrors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const classified = classifyAdvisories(advisories, new Date());
  const uniqueAdvisory = advisory => `${advisory.id}: ${advisory.module_name} (${advisory.severity})`;

  console.log(`Yarn audit returned ${advisories.length} advisory record(s).`);
  if (unparsedLines) {
    console.warn(`Skipped ${unparsedLines} unparsable audit output line(s) that were not JSON.`);
  }

  for (const { advisory, mitigation } of classified.devMitigated) {
    console.warn(
      `MITIGATED DEV-ROOT ADVISORY: ${uniqueAdvisory(advisory)} is reachable only through ` +
      `devDependency root(s) [${devRoots(advisory).join(", ")}] and is registered in KNOWN_DEV_MITIGATIONS. ` +
      `Reason: ${mitigation.reason} Mitigation expires: ${mitigation.expiresAt}. ` +
      `${advisory.url || "no advisory URL"}`
    );
  }
  if (classified.devMitigated.length) {
    console.warn(
      `MITIGATION SUMMARY: ${classified.devMitigated.length} high/critical advisory(ies) pass only through an ` +
      `explicit, expiring registry entry. Production-reachable findings are never mitigated, and an expired or ` +
      `malformed entry fails the gate.`
    );
  }

  for (const { advisory } of classified.unmitigatedDevRooted) {
    console.warn(
      `UNMITIGATED DEV-ROOT ADVISORY (blocking): ${uniqueAdvisory(advisory)} is rooted at ` +
      `[${devRoots(advisory).join(", ")}] but has no valid KNOWN_DEV_MITIGATIONS entry, so it fails the gate. ` +
      `Upgrade past the fixed release, or register an explicit, reasoned, expiring mitigation. ` +
      `${advisory.url || "no advisory URL"}`
    );
  }

  for (const { advisory, severity } of classified.unclassifiable) {
    console.error(
      `UNCLASSIFIABLE ADVISORY (blocking): ${advisory.id}: ${advisory.module_name} carries severity ` +
      `${JSON.stringify(severity)} which is outside the known set (critical, high, moderate, low, info). ` +
      `The gate fails closed instead of guessing; fix the advisory record or re-run yarn audit. ` +
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

  if (
    classified.blocking.length ||
    classified.unmitigatedDevRooted.length ||
    classified.unclassifiable.length
  ) {
    console.error("High/critical dependency advisories are blocking the gate (production-reachable findings grant no exceptions):");
    for (const { advisory } of classified.blocking) {
      console.error(`- ${uniqueAdvisory(advisory)} (production-reachable): ${advisory.url || "no advisory URL"}`);
    }
    for (const { advisory } of classified.unmitigatedDevRooted) {
      console.error(`- ${uniqueAdvisory(advisory)} (dev-root, unregistered): ${advisory.url || "no advisory URL"}`);
    }
    for (const { advisory, severity } of classified.unclassifiable) {
      console.error(`- ${advisory.id}: ${advisory.module_name} (unrecognized severity ${JSON.stringify(severity)}): ${advisory.url || "no advisory URL"}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    console.warn(`Yarn audit exited with status ${result.status}; the gate passes because every parsed advisory is reported above and none are unmitigated.`);
  }

  console.log("Dependency audit gate passed: no unmitigated high/critical findings.");
}

if (require.main === module) {
  try {
    runAudit();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  classifyAdvisories,
  parseAuditEvents,
  isReachableFromProductionDependencies,
  validateMitigationRegistry,
  isEntryExpired,
  KNOWN_DEV_MITIGATIONS,
};
