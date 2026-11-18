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
