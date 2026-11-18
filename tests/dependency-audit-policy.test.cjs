const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyAdvisories, parseAuditEvents, isReachableFromProductionDependencies } = require("../scripts/audit-dependencies.cjs");

const baseAdvisory = {
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

test("the gate grants no exceptions: a dev-only high advisory is reported, never whitelisted", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [devFinding] }]);
  assert.equal(result.devOnly.length, 1);
  assert.equal(result.blocking.length, 0);
  // The classification is generic policy, not a per-advisory carve-out:
  // the same verdict must apply to any package whose paths start from a
  // devDependency root.
  const generic = classifyAdvisories([{ ...baseAdvisory, id: 999999, module_name: "left-pad", findings: [devFinding] }]);
  assert.equal(generic.devOnly.length, 1);
  assert.equal(generic.blocking.length, 0);
});

test("any high advisory reachable from a production dependency blocks", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [devFinding, prodFinding] }]);
  assert.equal(result.devOnly.length, 0);
  assert.equal(result.blocking.length, 1);
});

test("the gate fails closed when the audit topology is unknown", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [] }]);
  assert.equal(result.devOnly.length, 0);
  assert.equal(result.blocking.length, 1);
  assert.equal(isReachableFromProductionDependencies({ findings: [] }), true);
});

test("different high-severity packages follow the same production-reachability rule", () => {
  const result = classifyAdvisories([
    { ...baseAdvisory, findings: [devFinding] },
    { ...baseAdvisory, id: 999999, module_name: "postcss", findings: [prodFinding] },
    { ...baseAdvisory, module_name: "micromatch", findings: [] },
  ]);
  assert.equal(result.devOnly.length, 1);
  assert.equal(result.blocking.length, 2);
});

test("moderate and lower findings are reported separately from the high/critical gate", () => {
  const result = classifyAdvisories([
    { ...baseAdvisory, severity: "moderate", findings: [devFinding] },
    { ...baseAdvisory, severity: "low", findings: [devFinding] },
    { ...baseAdvisory, severity: "info", findings: [devFinding] },
  ]);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.devOnly.length, 0);
  assert.equal(result.reportedBelowThreshold.length, 3);
});

test("audit events are parsed line by line and unparsable lines are counted, not swallowed", () => {
  const { events, unparsedLines } = parseAuditEvents([
    "not-json",
    JSON.stringify({ type: "auditAdvisory", data: { advisory: { ...baseAdvisory, findings: [devFinding] } } }),
    "",
    JSON.stringify({ type: "auditSummary", data: { vulnerabilities: { high: 1 } } }),
    "trailing-noise",
  ].join("\n"));
  assert.equal(events.length, 2);
  assert.equal(events[0].data.advisory.id, 1247710);
  assert.equal(unparsedLines, 2);
});

test("a fully parseable audit stream reports zero skipped lines", () => {
  const { events, unparsedLines } = parseAuditEvents([
    JSON.stringify({ type: "auditSummary", data: { vulnerabilities: {} } }),
  ].join("\n"));
  assert.equal(events.length, 1);
  assert.equal(unparsedLines, 0);
});
