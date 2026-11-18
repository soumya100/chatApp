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

const DEV_ONLY_ADVISORY = {
  id: 1247710,
  module_name: "picomatch",
  severity: "high",
  url: "https://www.npmjs.com/advisories/1247710",
  // The dev-only verdict is derived from real devDependency paths; production
  // roots or unknown topology always block.
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
    result.stdout.includes("Dependency audit gate passed: no production-reachable high/critical findings."),
    true
  );
  assert.equal(result.stderr, "");
});

test("below-threshold severities are surfaced and never block", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ ...DEV_ONLY_ADVISORY, severity: "moderate" }),
      advisoryEvent({ ...DEV_ONLY_ADVISORY, severity: "low" }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 2 advisory record(s)."), true);
  assert.equal(result.stderr.includes("Below-threshold advisories reported (not blocking): 1 moderate, 1 low."), true);
  assert.equal(result.stderr.includes("Production-reachable high/critical"), false);
});

test("a dev-only high advisory is reported with its dev roots and does not block", () => {
  const result = runAuditScript({
    stdout: output([advisoryEvent(DEV_ONLY_ADVISORY), summaryEvent()]),
    status: 0,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Yarn audit returned 1 advisory record(s)."), true);
  assert.equal(
    result.stderr.includes(
      "DEV-ONLY ADVISORY (reported, not blocking): 1247710: picomatch (high) is reachable only through " +
      "devDependency root(s) [tailwindcss, eslint-config-next]"
    ),
    true
  );
  assert.equal(result.stderr.includes("https://www.npmjs.com/advisories/1247710"), true);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), true);
});

test("production-reachable high/critical advisories fail the gate with exit code 1", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent(DEV_ONLY_ADVISORY),
      advisoryEvent({
        id: 999999,
        module_name: "postcss",
        severity: "high",
        url: "https://www.npmjs.com/advisories/999999",
        findings: [{ version: "8.4.31", paths: ["next>postcss"] }],
      }),
      summaryEvent(),
    ]),
    status: 0,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes("Yarn audit returned 2 advisory record(s)."), true);
  assert.equal(
    result.stderr.includes("Production-reachable high/critical dependency advisories (no exceptions are granted):"),
    true
  );
  assert.equal(
    result.stderr.includes("- 999999: postcss (high): https://www.npmjs.com/advisories/999999"),
    true
  );
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
    result.stderr.includes("- 1234567: lodash (critical): no advisory URL"),
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

test("a non-zero yarn exit with only reported advisories passes with a warning", () => {
  const result = runAuditScript({
    stdout: output([
      advisoryEvent({ ...DEV_ONLY_ADVISORY, severity: "moderate" }),
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
      advisoryEvent(DEV_ONLY_ADVISORY),
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

test("unknown topology blocks even when the module is otherwise dev-only", () => {
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
  assert.equal(result.stderr.includes("DEV-ONLY ADVISORY"), false);
  assert.equal(result.stdout.includes("Dependency audit gate passed"), false);
});
