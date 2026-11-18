const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyAdvisories, EXCEPTIONS, parseAuditEvents } = require("../scripts/audit-dependencies.cjs");

const allowed = {
  id: 1247710,
  module_name: "picomatch",
  severity: "high",
  url: "https://www.npmjs.com/advisories/1247710",
};

test("only the exact upstream Picomatch advisory is temporarily accepted", () => {
  const result = classifyAdvisories([allowed], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.excepted.length, 1);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.excepted[0].exception.id, "1247710");
});

test("different high-severity packages and advisory IDs remain blocking", () => {
  const result = classifyAdvisories([
    allowed,
    { ...allowed, id: 999999, module_name: "postcss" },
    { ...allowed, module_name: "micromatch" },
  ], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.excepted.length, 1);
  assert.equal(result.blocking.length, 2);
});

test("the Picomatch exception expires and blocks after its expiry time", () => {
  const result = classifyAdvisories([allowed], new Date("2026-11-26T00:00:00Z"));
  assert.equal(result.excepted.length, 0);
  assert.equal(result.blocking.length, 1);
  assert.ok(Date.parse(EXCEPTIONS[0].expiresAt) > Date.parse("2026-11-18T00:00:00Z"));
});

test("moderate and lower findings are reported separately from the high/critical gate", () => {
  const result = classifyAdvisories([
    { ...allowed, severity: "moderate" },
    { ...allowed, severity: "low" },
  ], new Date("2026-11-18T00:00:00Z"));
  assert.equal(result.blocking.length, 0);
  assert.equal(result.excepted.length, 0);
  assert.equal(result.ignoredBelowThreshold.length, 2);
});

test("Yarn JSON audit events are parsed line by line and malformed lines are ignored", () => {
  const events = parseAuditEvents([
    "not-json",
    JSON.stringify({ type: "auditAdvisory", data: { advisory: allowed } }),
    "",
    JSON.stringify({ type: "auditSummary", data: { vulnerabilities: { high: 1 } } }),
  ].join("\n"));
  assert.equal(events.length, 2);
  assert.equal(events[0].data.advisory.id, 1247710);
});
