const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyAdvisories, EXCEPTIONS, parseAuditEvents } = require("../scripts/audit-dependencies.cjs");

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

test("only the exact upstream Picomatch advisory is temporarily accepted, and only on dev-only paths", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [devFinding] }], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.excepted.length, 1);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.excepted[0].exception.id, "1247710");
  assert.equal(result.excepted[0].exception.devOnly, true);
});

test("the same advisory is blocked when any finding path starts from a production dependency", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [devFinding, prodFinding] }], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.excepted.length, 0);
  assert.equal(result.blocking.length, 1);
});

test("the exception fails closed when the audit topology is unknown", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [] }], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.excepted.length, 0);
  assert.equal(result.blocking.length, 1);
});

test("different high-severity packages and advisory IDs remain blocking", () => {
  const result = classifyAdvisories([
    { ...baseAdvisory, findings: [devFinding] },
    { ...baseAdvisory, id: 999999, module_name: "postcss", findings: [devFinding] },
    { ...baseAdvisory, module_name: "micromatch", findings: [devFinding] },
  ], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.excepted.length, 1);
  assert.equal(result.blocking.length, 2);
});

test("the Picomatch exception expires and blocks after its expiry time", () => {
  const result = classifyAdvisories([{ ...baseAdvisory, findings: [devFinding] }], new Date("2026-11-26T00:00:00Z"));
  assert.equal(result.excepted.length, 0);
  assert.equal(result.blocking.length, 1);
  assert.ok(Date.parse(EXCEPTIONS[0].expiresAt) > Date.parse("2026-11-18T00:00:00Z"));
});

test("every whitelisted exception is time-boxed and documented with upstream references", () => {
  assert.ok(Array.isArray(EXCEPTIONS));
  for (const exception of EXCEPTIONS) {
    assert.ok(exception.expiresAt, "exception must declare an expiry timestamp");
    assert.ok(Date.parse(exception.expiresAt) > Date.now(), "expired exceptions must be removed");
    assert.ok(exception.reason && exception.reason.length > 50, "exception must carry a substantive rationale");
    assert.ok(Array.isArray(exception.references) && exception.references.length > 0, "exception must link upstream tracking");
  }
});

test("moderate and lower findings are reported separately from the high/critical gate", () => {
  const result = classifyAdvisories([
    { ...baseAdvisory, severity: "moderate", findings: [devFinding] },
    { ...baseAdvisory, severity: "low", findings: [devFinding] },
  ], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.blocking.length, 0);
  assert.equal(result.excepted.length, 0);
  assert.equal(result.ignoredBelowThreshold.length, 2);
});

test("Yarn JSON audit events are parsed line by line and malformed lines are ignored", () => {
  const events = parseAuditEvents([
    "not-json",
    JSON.stringify({ type: "auditAdvisory", data: { advisory: { ...baseAdvisory, findings: [devFinding] } } }),
    "",
    JSON.stringify({ type: "auditSummary", data: { vulnerabilities: { high: 1 } } }),
  ].join("\n"));
  assert.equal(events.length, 2);
  assert.equal(events[0].data.advisory.id, 1247710);
});
