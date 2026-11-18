const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// `runAudit` is not exported; it is exercised through the CLI entry point of
// scripts/audit-dependencies.cjs, with a fake `yarn` binary on PATH so the
// classification is deterministic.
const SCRIPT = require.resolve("../../scripts/audit-dependencies.cjs");
const ROOT = path.resolve(__dirname, "..", "..");

const FAKE_YARN = `#!/bin/sh
cat "$AUDIT_TEST_STDOUT"
cat "$AUDIT_TEST_STDERR" >&2
exit "$AUDIT_TEST_STATUS"
`;

// The real registered mitigation: every path roots at devDependency tooling,
// and the advisory is registered in KNOWN_DEV_MITIGATIONS with a future expiry.
const REGISTERED_DEV_ADVISORY = {
  id: 1247710,
  module_name: "picomatch",
  severity: "high",
  url: "https://www.npmjs.com/advisories/1247710",
  findings: [
    {
      version: "4.0.7",
      paths: [
        "tailwindcss>micromatch>picomatch",
        "eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>picomatch",
      ],
    },
  ],
};

// Same shape, but no registry entry exists for this id/package pair, so the
// fail-closed policy must block it instead of downgrading it to a warning.
const UNREGISTERED_DEV_ADVISORY = {
  id: 999999,
  module_name: "left-pad",
  severity: "high",
  url: "https://www.npmjs.com/advisories/999999",
  findings: [
    {
      version: "1.3.0",
      paths: ["tailwindcss>micromatch>left-pad"],
    },
  ],
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

    const env = {
      ...process.env,
      AUDIT_TEST_STDOUT: path.join(dir, "stdout.txt"),
      AUDIT_TEST_STDERR: path.join(dir, "stderr.txt"),
      AUDIT_TEST_STATUS: String(status),
      PATH: withYarn ? `${binDir}${path.delimiter}${process.env.PATH || ""}` : binDir,
    };

    const child = spawnSync(process.execPath, [SCRIPT], {
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

test("audit gate passes when yarn reports no advisories", () => {
  const result = runAuditScript({
    stdout: output([summaryEvent()]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 0 advisory record(s)."), true);
  assert.equal(
    result.stdout.includes("Dependency audit gate passed: no unmitigated high/critical findings."),
    true
  );
  assert.equal(result.stderr, "");
});

test("below-threshold severities are surfaced and never block", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ ...REGISTERED_DEV_ADVISORY, severity: "moderate" }),
      advisoryEvent({ ...REGISTERED_DEV_ADVISORY, severity: "low" }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 2 advisory record(s)."), true);
  assert.equal(result.stderr.includes("Below-threshold advisories reported (not blocking): 1 moderate, 1 low."), true);
  assert.equal(result.stderr.includes("blocking the gate"), false);
});

test("a registered dev-root advisory passes loudly through its explicit expiring mitigation", () => {
  const result = runAuditScript({
    stdout: output([advisoryEvent(REGISTERED_DEV_ADVISORY), summaryEvent()]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 1 advisory record(s)."), true);
  assert.equal(
    result.stderr.includes(
      "MITIGATED DEV-ROOT ADVISORY: 1247710: picomatch (high) is reachable only through " +
      "devDependency root(s) [tailwindcss, eslint-config-next] and is registered in KNOWN_DEV_MITIGATIONS."
    ),
    true
  );
  assert.match(result.stderr, /Mitigation expires: \d{4}-\d{2}-\d{2}/, "the expiry must be printed on every run");
  assert.match(result.stderr, /advisories\/1247710/, "the advisory URL is reported");
  assert.equal(
    result.stderr.includes(
      "MITIGATION SUMMARY: 1 high/critical advisory(ies) pass only through an " +
      "explicit, expiring registry entry."
    ),
    true,
    "the mitigation summary must state why the finding does not block"
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
});

test("an unregistered dev-root high advisory blocks with exit code 1", () => {
  const result = runAuditScript({
    stdout: output([advisoryEvent(UNREGISTERED_DEV_ADVISORY), summaryEvent()]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes(
      "UNMITIGATED DEV-ROOT ADVISORY (blocking): 999999: left-pad (high) is rooted at " +
      "[tailwindcss] but has no valid KNOWN_DEV_MITIGATIONS entry"
    ),
    true
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("advisories with a missing or unrecognized severity fail closed instead of passing", () => {
  // A feed schema change (or a reshaping proxy) must never downgrade a
  // finding the gate cannot classify into the below-threshold path.
  const missing = runAuditScript({
    stdout: output([
      advisoryEvent({
        id: 424242,
        module_name: "left-pad",
        url: "https://www.npmjs.com/advisories/424242",
        findings: [{ version: "1.3.0", paths: ["tailwindcss>left-pad"] }],
      }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(missing.status, 1);
  assert.equal(missing.stderr.includes("UNCLASSIFIABLE ADVISORY (blocking)"), true);
  assert.equal(missing.stderr.includes("(missing)"), true);
  assert.equal(missing.stdout.includes("Dependency audit gate passed"), false);

  const unrecognized = runAuditScript({
    stdout: output([
      advisoryEvent({ ...UNREGISTERED_DEV_ADVISORY, severity: "severe" }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(unrecognized.status, 1);
  assert.equal(unrecognized.stderr.includes('"severe"'), true);
  assert.equal(unrecognized.stderr.includes("(unrecognized severity"), true);
  assert.equal(unrecognized.stdout.includes("Dependency audit gate passed"), false);
});

test("production-reachable high/critical advisories fail the gate with exit code 1", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent(REGISTERED_DEV_ADVISORY),
      advisoryEvent({
        id: 888888,
        module_name: "postcss",
        severity: "high",
        url: "https://www.npmjs.com/advisories/888888",
        findings: [{ version: "8.4.31", paths: ["next>postcss"] }],
      }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes("Yarn audit returned 2 advisory record(s)."), true);
  assert.equal(
    result.stderr.includes(
      "High/critical dependency advisories are blocking the gate (production-reachable findings grant no exceptions):"
    ),
    true
  );
  assert.equal(
    result.stderr.includes("- 888888: postcss (high) (production-reachable): https://www.npmjs.com/advisories/888888"),
    true
  );
  // The dev-root picomatch finding is still reported through its mitigation,
  // but the production-reachable postcss finding fails the gate regardless.
  assert.equal(result.stderr.includes("MITIGATED DEV-ROOT ADVISORY"), true);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("a blocking advisory without a URL reports no advisory URL", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ id: 1234567, module_name: "lodash", severity: "critical" }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes("- 1234567: lodash (critical) (production-reachable): no advisory URL"),
    true
  );
});

test("fails closed when yarn audit produces no parseable JSON", () => {
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

test("fails closed when the audit stream is truncated and auditSummary never arrives", () => {
  // An interrupted run can emit advisories and then die with exit code 0;
  // without the terminal auditSummary record the advisory list is partial,
  // so the gate must fail closed instead of passing on the prefix.
  const result = runAuditScript({
    stdout: output([advisoryEvent(REGISTERED_DEV_ADVISORY)]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes(
      "Dependency audit ended without the auditSummary record (interrupted or truncated run); failing closed."
    ),
    true
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("fails closed and echoes unparseable stdout when stderr is empty", () => {
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

test("a non-zero yarn exit with no advisories fails closed", () => {
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

test("a non-zero yarn exit with only below-threshold advisories passes with a warning", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ ...REGISTERED_DEV_ADVISORY, severity: "moderate" }),
      summaryEvent(),
    ]),
    status: 1,
  });

  assert.equal(result.status, 0);
  assert.equal(
    result.stderr.includes("Yarn audit exited with status 1; the gate passes because every parsed advisory is reported above"),
    true
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
});

test("spawn failures propagate as a failing run", () => {
  const result = runAuditScript({ withYarn: false, status: 0 });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});

test("unparsable output lines are reported instead of being silently dropped", () => {
  const result = runAuditScript({
    stdout: output([
      "human readable progress noise",
      advisoryEvent(REGISTERED_DEV_ADVISORY),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(
    result.stderr.includes("Skipped 1 unparsable audit output line(s) that were not JSON."),
    true
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
});

test("unknown topology blocks even when the module is registered as dev-only", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({
        id: 1247710,
        module_name: "picomatch",
        severity: "high",
        url: "https://www.npmjs.com/advisories/1247710",
      }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("MITIGATED DEV-ROOT ADVISORY"), false);
  assert.equal(
    result.stderr.includes("- 1247710: picomatch (high) (production-reachable): https://www.npmjs.com/advisories/1247710"),
    true,
    "without paths the gate must assume production reachability and block"
  );
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});
