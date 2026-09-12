import type { KnownBlock } from "@slack/types";
import type { ClauseAnalysisT } from "./analyze.js";

const RISK_EMOJI: Record<ClauseAnalysisT["riskLevel"], string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴"
};

function quoteForSlack(text: string): string {
  return text.split("\n").map((line) => `>${line}`).join("\n");
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
    { type: "section", text: { type: "mrkdwn", text: `*What this means:*\n${result.explanation}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Suggested redline:*\n${result.suggestedRedline}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Educational information only — consult qualified legal counsel for legal advice." }] }
  ];
}
