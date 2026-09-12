import type { ContractAnalysisT } from "./analyze.js";

export function buildContractReport(title: string, result: ContractAnalysisT): string {
  const findings = result.findings.map((finding, index) => [
    `## ${index + 1}. ${finding.title} (${finding.riskLevel.toUpperCase()} risk)`,
    "",
    `**Clause:** ${finding.clause}`,
    "",
    `**Why it matters:** ${finding.explanation}`,
    "",
    `**Suggested redline:** ${finding.suggestedRedline}`
  ].join("\n")).join("\n\n");
  return [`# ClauseGuard Contract Review: ${title}`, "", `**Overall risk:** ${result.overallRiskLevel.toUpperCase()}`, "", "## Executive summary", "", result.executiveSummary, "", "## Findings", "", findings, "", "---", "Educational information only - consult qualified legal counsel for legal advice."].join("\n");
}
