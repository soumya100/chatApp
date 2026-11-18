const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// `runAudit` is not exported; it is exercised through the CLI entry point of
// scripts/audit-dependencies.cjs, with a fake `yarn` binary on PATH and a
// frozen clock so the time-boxed exception classification is deterministic.
const auditModule = require("../../scripts/audit-dependencies.cjs");
const SCRIPT = require.resolve("../../scripts/audit-dependencies.cjs");
const ROOT = path.resolve(__dirname, "..", "..");
const { EXCEPTIONS } = auditModule;

const FROZEN_NOW = "2026-11-18T00:00:00Z";

const FAKE_YARN = `#!/bin/sh
cat "$AUDIT_TEST_STDOUT"
cat "$AUDIT_TEST_STDERR" >&2
exit "$AUDIT_TEST_STATUS"
`;

const FREEZE_DATE = `
const RealDate = Date;
const FIXED = RealDate.parse("${FROZEN_NOW}");
class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED);
    else super(...args);
  }
  static now() {
    return FIXED;
  }
}
global.Date = FrozenDate;
`;

const EXCEPTED_ADVISORY = {
  id: 1247710,
  module_name: "picomatch",
  severity: "high",
  url: "https://www.npmjs.com/advisories/1247710",
};

const advisoryEvent = advisory =>
  JSON.stringify({ type: "auditAdvisory", data: { advisory } });
const summaryEvent = () =>
  JSON.stringify({ type: "auditSummary", data: { vulnerabilities: { high: 0 } } });
const output = events => events.join("\n") + "\n";

function runAuditScript({ stdout = "", stderr = "", status = 0, withYarn = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-deps-test-"));
  try {
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir);
    if (withYarn) {
      const yarnPath = path.join(binDir, "yarn");
      fs.writeFileSync(yarnPath, FAKE_YARN, { mode: 0o755 });
      fs.chmodSync(yarnPath, 0o755);
    }
    fs.writeFileSync(path.join(dir, "stdout.txt"), stdout);
    fs.writeFileSync(path.join(dir, "stderr.txt"), stderr);
    const freezePath = path.join(dir, "freeze-date.cjs");
    fs.writeFileSync(freezePath, FREEZE_DATE);

    const env = {
      ...process.env,
      AUDIT_TEST_STDOUT: path.join(dir, "stdout.txt"),
      AUDIT_TEST_STDERR: path.join(dir, "stderr.txt"),
      AUDIT_TEST_STATUS: String(status),
      PATH: withYarn ? `${binDir}${path.delimiter}${process.env.PATH || ""}` : binDir,
    };

    const child = spawnSync(process.execPath, ["--require", freezePath, SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });

    return {
      status: child.status,
      stdout: child.stdout || "",
      stderr: child.stderr || "",
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("new: audit gate passes when yarn reports no advisories", () => {
  const result = runAuditScript({
    stdout: output([summaryEvent()]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 0 advisory record(s)."), true);
  assert.equal(
    result.stdout.includes("Dependency audit gate passed: no unexcepted high/critical findings."),
    true
  );
  assert.equal(result.stderr, "");
});

test("new: below-threshold severities are counted but never block", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ ...EXCEPTED_ADVISORY, severity: "moderate" }),
      advisoryEvent({ ...EXCEPTED_ADVISORY, severity: "low" }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 2 advisory record(s)."), true);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
  assert.equal(result.stderr.includes("Unexcepted high/critical"), false);
});

test("new: time-boxed exception prints the exception and references without blocking", () => {
  const exception = EXCEPTIONS[0];
  const result = runAuditScript({
    stdout: output([advisoryEvent(EXCEPTED_ADVISORY), summaryEvent()]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 1 advisory record(s)."), true);
  assert.equal(
    result.stderr.includes(
      `TIME-BOXED EXCEPTION: 1247710: picomatch (high); expires ${exception.expiresAt}.`
    ),
    true
  );
  assert.equal(
    result.stderr.includes(`References: ${exception.references.join(" | ")}`),
    true
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
});

test("new: unexcepted high/critical advisories fail the gate with exit code 1", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent(EXCEPTED_ADVISORY),
      advisoryEvent({
        id: 999999,
        module_name: "postcss",
        severity: "high",
        url: "https://www.npmjs.com/advisories/999999",
      }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes("Yarn audit returned 2 advisory record(s)."), true);
  assert.equal(result.stderr.includes("Unexcepted high/critical dependency advisories:"), true);
  assert.equal(
    result.stderr.includes("- 999999: postcss (high): https://www.npmjs.com/advisories/999999"),
    true
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("new: blocking advisory without a URL reports no advisory URL", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ id: 1234567, module_name: "lodash", severity: "critical" }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes("- 1234567: lodash (critical): no advisory URL"),
    true
  );
});

test("new: fails closed when yarn audit produces no parseable JSON", () => {
  const result = runAuditScript({ stdout: "", stderr: "", status: 1 });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes("Dependency audit could not be parsed; failing closed."),
    true
  );
  assert.equal(
    result.stderr.includes("Yarn audit produced no parseable JSON output."),
    true
  );
});

test("new: fails closed and echoes unparseable stdout when stderr is empty", () => {
  const result = runAuditScript({
    stdout: "yarn audit v1.22.22\nnot-json-at-all\n",
    stderr: "",
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes("Dependency audit could not be parsed; failing closed."),
    true
  );
  assert.equal(result.stderr.includes("not-json-at-all"), true);
});

test("new: a non-zero yarn exit with no advisories fails closed", () => {
  const result = runAuditScript({
    stdout: output([summaryEvent()]),
    stderr: "error An unexpected error occurred: network unavailable\n",
    status: 1,
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes("Dependency audit could not be parsed; failing closed."),
    true
  );
  assert.equal(result.stderr.includes("network unavailable"), true);
});

test("new: a non-zero yarn exit with only below-threshold advisories throws a status error", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ ...EXCEPTED_ADVISORY, severity: "moderate" }),
      summaryEvent(),
    ]),
    status: 1,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("Yarn audit exited with status 1."), true);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("new: spawn failures propagate as a failing run", () => {
  const result = runAuditScript({ withYarn: false, status: 0 });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("new: a non-zero yarn exit is tolerated when every advisory is time-boxed", () => {
  assert.ok(
    Date.parse(EXCEPTIONS[0].expiresAt) > Date.parse(FROZEN_NOW),
    "frozen clock must be inside the exception window"
  );

  const result = runAuditScript({
    stdout: output([advisoryEvent(EXCEPTED_ADVISORY), summaryEvent()]),
    status: 1,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr.includes("TIME-BOXED EXCEPTION: 1247710: picomatch (high)"), true);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
});
