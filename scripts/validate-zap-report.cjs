const fs = require("node:fs");

// ZAP reports are attacker-influenced content (alert names, URLs and site
// names come from scanned responses). Everything derived from the report is
// sanitized before it reaches CI logs so control characters cannot forge log
// lines and oversized fields cannot flood them.
function sanitizeLogField(value, maxLength = 200) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " " )
    .trim()
    .slice(0, maxLength);
}

function inspectReport(report) {
  if (!report || !Array.isArray(report.site)) {
    throw new Error("Unexpected ZAP JSON schema: site[] is missing");
  }
  if (!report.site.length) {
    // A scan that never really ran can still be serialized as a structurally
    // valid report; treating zero sites as a clean scan would let a
    // suppressed scan pass the release gate.
    throw new Error("ZAP report contains no site entries; an empty scan cannot pass the gate");
  }
  const findings = report.site.flatMap(site => {
    if (!site || typeof site !== "object") {
      throw new Error("Invalid ZAP report: site entries must be objects");
    }
    if (site.alerts !== undefined && !Array.isArray(site.alerts)) {
      throw new Error("Invalid ZAP report: site.alerts must be an array");
    }
    return (site.alerts || []).map(alert => {
      if (!alert || typeof alert !== "object") {
        throw new Error("Invalid ZAP report: site.alerts entries must be objects");
      }
      const raw = alert.riskcode ?? alert.riskCode;
      const risk = typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;
      if (!Number.isInteger(risk) || risk < 0 || risk > 4) {
        throw new Error("Invalid or missing ZAP alert risk code; refusing to pass an unclassified finding");
      }
      return {
        site: sanitizeLogField(site["@name"] || site.name || "unknown", 120),
        risk,
        name: sanitizeLogField(alert.name || alert.alert || "Unnamed alert"),
        url: sanitizeLogField(alert.url || "", 300),
      };
    });
  });
  const blockers = findings.filter(item => item.risk >= 3);
  const byRisk = findings.reduce((counts, item) => {
    counts[item.risk] = (counts[item.risk] || 0) + 1;
    return counts;
  }, {});
  return { findings, blockers, byRisk };
}

function validateFile(reportPath) {
  if (!fs.existsSync(reportPath)) throw new Error("ZAP report is missing: " + reportPath);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    // JSON.parse embeds a snippet of the raw file in its SyntaxError text on
    // Node 18+. The report is attacker-influenced content, so those bytes
    // must never reach the CI log through error.message.
    throw new Error("ZAP report is not valid JSON");
  }
  return inspectReport(report);
}

if (require.main === module) {
  try {
    const reportPath = process.argv[2] || "zap-report.json";
    const { findings, blockers, byRisk } = validateFile(reportPath);
    console.log("ZAP findings: " + findings.length + "; risk distribution: " + JSON.stringify(byRisk));
    for (const item of findings) {
      console.log("[" + (item.risk >= 3 ? "BLOCK" : item.risk === 2 ? "REVIEW" : "INFO") + "] " + item.name + " " + item.url);
    }
    if (blockers.length) {
      console.error("High/Critical ZAP findings must be resolved before release:");
      for (const item of blockers) console.error("- " + item.name + " (" + item.site + "): " + item.url);
      process.exitCode = 1;
    } else {
      console.log("ZAP gate passed: no High/Critical findings.");
    }
  } catch (error) {
    // The failure path must respect the same invariant as the success path:
    // nothing attacker-influenced reaches the CI log unsanitized.
    const message = error && error.message ? error.message : String(error);
    console.error("VAPT report validation failed: " + sanitizeLogField(message, 500));
    process.exitCode = 1;
  }
}

module.exports = { inspectReport, validateFile, sanitizeLogField };
