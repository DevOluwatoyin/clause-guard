import "dotenv/config";
import { App, LogLevel } from "@slack/bolt";
import { analyzeClause } from "./analyze.js";
import { buildResultBlocks } from "./blocks.js";

const requiredEnvironment = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "OPENAI_API_KEY"];
const missing = requiredEnvironment.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO
});

app.command("/clauseguard", async ({ command, ack, respond }) => {
  await ack("🔍 Analyzing your clause...");

  const clauseText = command.text?.trim();
  if (!clauseText) {
    await respond("Paste a contract clause after the command, e.g. `/clauseguard The Vendor shall indemnify...`");
    return;
  }

  try {
    const result = await analyzeClause(clauseText);
    await respond({ response_type: "ephemeral", blocks: buildResultBlocks(clauseText, result) });
  } catch (error) {
    console.error("Unable to respond to ClauseGuard command:", error);
    if (isInsufficientQuotaError(error)) {
      await respond("ClauseGuard's OpenAI API account has no available credit. Ask the app owner to add API billing or update `OPENAI_API_KEY`, then try again.");
      return;
    }
    await respond("I couldn't analyze that clause just now. Please try again with a shorter clause.");
  }
});

function isInsufficientQuotaError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === "credit_balance_exhausted";
}

void (async () => {
  await app.start(Number(process.env.PORT ?? 3000));
  console.log(`⚡️ ClauseGuard is running on port ${process.env.PORT ?? 3000}`);
})();
