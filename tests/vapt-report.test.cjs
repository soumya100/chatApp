const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectReport } = require("../scripts/validate-zap-report.cjs");

test("ZAP report schema is validated instead of treating missing results as a clean scan", () => {
  assert.throws(() => inspectReport({}), /site\[\] is missing/);
  assert.throws(() => inspectReport(null), /site\[\] is missing/);
});

test("ZAP low and informational findings are reported without blocking", () => {
  const result = inspectReport({ site: [{ "@name": "http://localhost", alerts: [
    { riskcode: "0", name: "Informational", url: "http://localhost/login" },
    { riskcode: "1", name: "Low", url: "http://localhost/signup" },
    { riskcode: "2", name: "Medium", url: "http://localhost/api/auth/csrf" },
  ] }] });
  assert.equal(result.findings.length, 3);
  assert.equal(result.blockers.length, 0);
  assert.deepEqual(result.byRisk, { 0: 1, 1: 1, 2: 1 });
});

test("ZAP high and critical findings both block release", () => {
  const result = inspectReport({ site: [{ "@name": "http://localhost", alerts: [
    { riskcode: "3", name: "High risk issue" },
    { riskcode: "4", name: "Critical issue" },
  ] }] });
  assert.equal(result.blockers.length, 2);
  assert.deepEqual(result.blockers.map(item => item.risk), [3, 4]);
});


test("ZAP report fails closed when an alert has an invalid or missing risk code", () => {
  assert.throws(() => inspectReport({ site: [{ alerts: [{ name: "Unknown severity" }] }] }), /risk code/);
  assert.throws(() => inspectReport({ site: [{ alerts: [{ riskcode: "unknown", name: "Unknown severity" }] }] }), /risk code/);
  assert.throws(() => inspectReport({ site: [{ alerts: [{ riskcode: "", name: "Empty severity" }] }] }), /risk code/);
  assert.throws(() => inspectReport({ site: [{ alerts: [{ riskcode: "   ", name: "Whitespace severity" }] }] }), /risk code/);
  assert.throws(() => inspectReport({ site: [{ alerts: [{ riskcode: null, riskCode: null, name: "Null severity" }] }] }), /risk code/);
  assert.throws(() => inspectReport({ site: [{ alerts: [{ riskcode: false, name: "Boolean severity" }] }] }), /risk code/);
  assert.throws(() => inspectReport({ site: [{ alerts: {} }] }), /alerts must be an array/);
});

test("CLI fails closed with exit code 1 for an empty-string risk code", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zap-gate-"));
  try {
    const reportPath = path.join(tempDir, "zap-report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      site: [{ "@name": "http://localhost", alerts: [{ riskcode: "", name: "Empty Code Alert", url: "http://localhost/x" }] }],
    }));
    const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "validate-zap-report.cjs"), reportPath], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1, "unclassified finding must fail the gate");
    assert.doesNotMatch(result.stdout, /ZAP gate passed/);
    assert.match(result.stderr, /VAPT report validation failed/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("report-derived fields are sanitized before reaching CI logs", () => {
  const { sanitizeLogField } = require("../scripts/validate-zap-report.cjs");
  const hostile = "SQLi\r\n2026-11-18T00:00:00Z ERROR forged log line";
  const sanitized = sanitizeLogField(hostile);
  assert.doesNotMatch(sanitized, /[\r\n]/, "control characters must not survive into CI logs");
  assert.equal(sanitized.includes("forged log line"), true, "legitimate content is preserved");
  assert.equal(sanitizeLogField("x".repeat(500)).length <= 200, true, "oversized fields are capped");
  assert.equal(sanitizeLogField("   spaced\tout   "), "spaced out");
});
