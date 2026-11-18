const fs = require("node:fs");

const reportPath = process.argv[2] || "zap-report.json";

try {
  if (!fs.existsSync(reportPath)) throw new Error("ZAP report is missing: " + reportPath);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (!Array.isArray(report.site)) throw new Error("Unexpected ZAP JSON schema: site[] is missing");

  const findings = report.site.flatMap(site => (site.alerts || []).map(alert => ({
    site: site["@name"] || site.name || "unknown",
    risk: Number(alert.riskcode ?? alert.riskCode ?? 0),
    name: alert.name || alert.alert || "Unnamed alert",
    url: alert.url || "",
  })));

  const blockers = findings.filter(item => item.risk >= 3);
  const byRisk = findings.reduce((counts, item) => {
    counts[item.risk] = (counts[item.risk] || 0) + 1;
    return counts;
  }, {});

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
