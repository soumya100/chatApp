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
  const findings = report.site.flatMap(site => {
    if (site.alerts !== undefined && !Array.isArray(site.alerts)) {
      throw new Error("Invalid ZAP report: site.alerts must be an array");
    }
    return (site.alerts || []).map(alert => {
      const risk = Number(alert.riskcode ?? alert.riskCode);
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
  return inspectReport(JSON.parse(fs.readFileSync(reportPath, "utf8")));
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
    console.error("VAPT report validation failed: " + error.message);
    process.exitCode = 1;
  }
}

module.exports = { inspectReport, validateFile, sanitizeLogField };
