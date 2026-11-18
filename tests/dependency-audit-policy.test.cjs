const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyAdvisories,
  parseAuditEvents,
  isReachableFromProductionDependencies,
  validateMitigationRegistry,
  isEntryExpired,
  KNOWN_DEV_MITIGATIONS,
} = require("../scripts/audit-dependencies.cjs");

const NOW = new Date("2026-11-18T00:00:00Z");

const picomatchAdvisory = {
  id: 1247710,
  module_name: "picomatch",
  severity: "high",
  url: "https://www.npmjs.com/advisories/1247710",
};

const devFinding = {
  version: "4.0.7",
  paths: ["tailwindcss>micromatch>picomatch", "eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>picomatch"],
};

const prodFinding = {
  version: "4.0.7",
  paths: ["axios>picomatch"],
};

test("a registered dev-root advisory passes only through its explicit expiring mitigation", () => {
  const result = classifyAdvisories([{ ...picomatchAdvisory, findings: [devFinding] }], NOW);
  assert.equal(result.devMitigated.length, 1);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.unmitigatedDevRooted.length, 0);
  assert.equal(result.devMitigated[0].mitigation.package, "picomatch");
  assert.ok(result.devMitigated[0].mitigation.expiresAt, "the mitigation must surface its expiry");
});

test("an unregistered dev-root high advisory blocks (no silent downgrade)", () => {
  const result = classifyAdvisories(
    [{ ...picomatchAdvisory, id: 999999, module_name: "left-pad", findings: [devFinding] }],
    NOW
  );
  assert.equal(result.devMitigated.length, 0, "no advisory may pass without its own registry entry");
  assert.equal(result.unmitigatedDevRooted.length, 1);
  assert.equal(result.blocking.length, 0);
});

test("any high advisory reachable from a production dependency blocks, registered or not", () => {
  const registered = classifyAdvisories([{ ...picomatchAdvisory, findings: [devFinding, prodFinding] }], NOW);
  assert.equal(registered.blocking.length, 1);
  assert.equal(registered.devMitigated.length, 0, "a production-reachable finding is never mitigated");

  const unregistered = classifyAdvisories(
    [{ ...picomatchAdvisory, id: 888888, module_name: "postcss", findings: [prodFinding] }],
    NOW
  );
  assert.equal(unregistered.blocking.length, 1);
});

test("the gate fails closed when the audit topology is unknown", () => {
  const result = classifyAdvisories([{ ...picomatchAdvisory, findings: [] }], NOW);
  assert.equal(result.blocking.length, 1, "unknown topology blocks even for a registered package");
  assert.equal(result.devMitigated.length, 0);
  assert.equal(isReachableFromProductionDependencies({ findings: [] }), true);
});

test("an expired registry entry stops mitigating and the advisory blocks", () => {
  const afterExpiry = new Date("2027-03-05T00:00:00Z");
  const result = classifyAdvisories([{ ...picomatchAdvisory, findings: [devFinding] }], afterExpiry);
  assert.equal(result.devMitigated.length, 0);
  assert.equal(result.unmitigatedDevRooted.length, 1, "an expired mitigation must fail the gate closed");
});

test("a mitigation only applies to an exact advisory id and package match", () => {
  const wrongPackage = classifyAdvisories(
    [{ ...picomatchAdvisory, module_name: "micromatch", findings: [devFinding] }],
    NOW
  );
  assert.equal(wrongPackage.devMitigated.length, 0);
  assert.equal(wrongPackage.unmitigatedDevRooted.length, 1);

  const wrongId = classifyAdvisories(
    [{ ...picomatchAdvisory, id: 1247711, findings: [devFinding] }],
    NOW
  );
  assert.equal(wrongId.devMitigated.length, 0);
  assert.equal(wrongId.unmitigatedDevRooted.length, 1);
});

test("moderate and lower findings are reported separately from the high/critical gate", () => {
  const result = classifyAdvisories(
    [
      { ...picomatchAdvisory, severity: "moderate", findings: [devFinding] },
      { ...picomatchAdvisory, severity: "low", findings: [devFinding] },
      { ...picomatchAdvisory, severity: "info", findings: [devFinding] },
    ],
    NOW
  );
  assert.equal(result.blocking.length, 0);
  assert.equal(result.devMitigated.length, 0);
  assert.equal(result.unmitigatedDevRooted.length, 0);
  assert.equal(result.reportedBelowThreshold.length, 3);
});

test("critical severities follow the same policy as high", () => {
  const result = classifyAdvisories([{ ...picomatchAdvisory, severity: "critical", findings: [devFinding] }], NOW);
  assert.equal(result.devMitigated.length, 1);
});

test("the shipped mitigation registry is structurally valid and currently unexpired", () => {
  assert.deepEqual(validateMitigationRegistry(new Date()), []);
  assert.ok(KNOWN_DEV_MITIGATIONS.length >= 1, "the picomatch mitigation must be registered");
});

test("registry validation rejects malformed, stale and duplicated entries", () => {
  const original = [...KNOWN_DEV_MITIGATIONS];
  KNOWN_DEV_MITIGATIONS.length = 0;
  try {
    KNOWN_DEV_MITIGATIONS.push(
      { id: 1, package: "a", reason: "this malformed entry carries an unparseable expiry date", expiresAt: "not-a-date" },
      { id: 2, package: "b", reason: "this entry is deliberately stale so it must fail closed", expiresAt: "2020-01-01" },
      { id: 3, package: "c", reason: "this entry has no expiry field at all and must be rejected" },
      { package: "d", reason: "this entry has no numeric advisory id and must be rejected", expiresAt: "2099-01-01" },
      { id: 5, package: "e", reason: "first entry with this identity is fine here and valid", expiresAt: "2099-01-01" },
      { id: 5, package: "e", reason: "second entry with the same identity is a duplicate here", expiresAt: "2099-01-01" }
    );
    const errors = validateMitigationRegistry(new Date("2026-11-18T00:00:00Z"));
    assert.equal(errors.length, 5, "every malformed entry must be named, not silently accepted");
    assert.ok(errors.some(error => error.includes("not-a-date") || error.includes("expiresAt")));
    assert.ok(errors.some(error => error.includes("expired")));
    assert.ok(errors.some(error => error.includes("duplicate")));
  } finally {
    KNOWN_DEV_MITIGATIONS.length = 0;
    KNOWN_DEV_MITIGATIONS.push(...original);
  }
});

test("expiry comparison is deterministic and blocks from the end of the expiry day", () => {
  const entry = { expiresAt: "2026-11-25" };
  assert.equal(isEntryExpired(entry, new Date("2026-11-25T00:00:00Z")), false);
  assert.equal(isEntryExpired(entry, new Date("2026-11-25T23:59:59Z")), false);
  assert.equal(isEntryExpired(entry, new Date("2026-11-26T00:00:00Z")), true);
  assert.equal(isEntryExpired({ expiresAt: "garbage" }, new Date()), true);
});

test("audit events are parsed line by line and unparsable lines are counted, not swallowed", () => {
  const { events, unparsedLines, hasSummary } = parseAuditEvents([
    "not-json",
    JSON.stringify({ type: "auditAdvisory", data: { advisory: { ...picomatchAdvisory, findings: [devFinding] } } }),
    "",
    JSON.stringify({ type: "auditSummary", data: { vulnerabilities: { high: 1 } } }),
    "trailing-noise",
  ].join("\n"));
  assert.equal(events.length, 2);
  assert.equal(events[0].data.advisory.id, 1247710);
  assert.equal(unparsedLines, 2);
  assert.equal(hasSummary, true, "the terminal auditSummary record must be detected");
});

test("a fully parseable audit stream reports zero skipped lines", () => {
  const { events, unparsedLines, hasSummary } = parseAuditEvents([
    JSON.stringify({ type: "auditSummary", data: { vulnerabilities: {} } }),
  ].join("\n"));
  assert.equal(events.length, 1);
  assert.equal(unparsedLines, 0);
  assert.equal(hasSummary, true);
});

test("a truncated audit stream without its auditSummary record is detectable", () => {
  const { events, hasSummary } = parseAuditEvents([
    JSON.stringify({ type: "auditAdvisory", data: { advisory: { ...picomatchAdvisory, findings: [devFinding] } } }),
  ].join("\n"));
  assert.equal(events.length, 1);
  assert.equal(hasSummary, false, "a partial run must be distinguishable from a completed one");
});
