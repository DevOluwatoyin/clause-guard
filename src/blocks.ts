import type { KnownBlock } from "@slack/types";
import type { ClauseAnalysisT, ContractAnalysisT } from "./analyze.js";

const RISK_EMOJI: Record<ClauseAnalysisT["riskLevel"], string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴"
};

const MAX_SECTION_TEXT_LENGTH = 2_700;

function limitForSlack(text: string): string {
  return text.length <= MAX_SECTION_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_SECTION_TEXT_LENGTH - 1).trimEnd()}…`;
}

function quoteForSlack(text: string): string {
  return limitForSlack(text.split("\n").map((line) => `>${line}`).join("\n"));
}

export function buildResultBlocks(
  clauseText: string,
  result: ClauseAnalysisT
): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "ClauseGuard review", emoji: true }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${RISK_EMOJI[result.riskLevel]} Risk level: ${result.riskLevel.toUpperCase()}*`
      }
    },
    { type: "section", text: { type: "mrkdwn", text: `*Clause reviewed:*\n${quoteForSlack(clauseText)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*What this means:*\n${limitForSlack(result.explanation)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Suggested redline:*\n${limitForSlack(result.suggestedRedline)}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Educational information only — consult qualified legal counsel for legal advice." }] }
  ];
}

export function buildContractResultBlocks(title: string, result: ContractAnalysisT): KnownBlock[] {
  const findingBlocks: KnownBlock[] = result.findings.flatMap((finding, index) => [
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${index + 1}. ${RISK_EMOJI[finding.riskLevel]} ${finding.title}*\n${limitForSlack(finding.explanation)}` }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Suggested redline*\n${limitForSlack(finding.suggestedRedline)}` }
    }
  ]);

  return [
    { type: "header", text: { type: "plain_text", text: "ClauseGuard contract review", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${RISK_EMOJI[result.overallRiskLevel]} Overall risk: ${result.overallRiskLevel.toUpperCase()}*\n*Document:* ${limitForSlack(title)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Executive summary*\n${limitForSlack(result.executiveSummary)}` } },
    ...findingBlocks,
    { type: "context", elements: [{ type: "mrkdwn", text: "A downloadable Markdown report has been shared in this channel. Educational information only - consult qualified legal counsel." }] }
  ];
}
