import "dotenv/config";
import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { analyzeClause, analyzeContract, analyzeContractImage } from "./analyze.js";
import { buildContractResultBlocks, buildResultBlocks } from "./blocks.js";
import { extractUploadedDocument, fileHelpText, isSupportedFile } from "./files.js";
import { buildContractReport } from "./reports.js";

const MAX_CLAUSE_CHARACTERS = 4_000;
const MAX_CONTRACT_CHARACTERS = 30_000;
const requiredEnvironment = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"];
const missing = requiredEnvironment.filter((name) => !process.env[name]);

if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
  missing.push("OPENAI_API_KEY or OPENROUTER_API_KEY");
}

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const receiver = new ExpressReceiver({ signingSecret: process.env.SLACK_SIGNING_SECRET! });

receiver.router.get("/", (_request, response) => {
  response.type("html").send(`<!doctype html><html><head><title>ClauseGuard</title><style>body{font-family:system-ui;max-width:760px;margin:48px auto;padding:0 20px;color:#1f2937;line-height:1.55}h1,h2{color:#111827}code{background:#f3f4f6;padding:2px 5px;border-radius:4px}</style></head><body><h1>ClauseGuard</h1><p>ClauseGuard reviews contract language in Slack and returns an educational risk summary, plain-English explanation, and suggested redline.</p><h2>Use it</h2><p><code>/clauseguard &lt;one clause&gt;</code> reviews a clause up to 4,000 characters. Paste a full agreement to receive a whole-contract review up to 30,000 characters.</p><h2>File review</h2><p>Share a TXT, DOCX, PDF, PPTX, PNG, JPG, JPEG, or WEBP file in a Slack channel where ClauseGuard is installed. Files may be up to 10 MB. Convert legacy <code>.ppt</code> files to <code>.pptx</code> first.</p><h2>Results</h2><p>Clause reviews are private to the requester. Contract reviews show an executive summary and ranked findings, then share a downloadable Markdown report in the channel. ClauseGuard provides educational information only, not legal advice.</p></body></html>`);
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  logLevel: process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO
});

app.command("/clauseguard", async ({ command, ack, respond, client }) => {
  await ack("🔍 Analyzing your clause...");

  const clauseText = command.text?.trim();
  if (!clauseText) {
    await respond("Paste a clause after the command, or use `/clauseguard help` for limits, supported files, and whole-contract review.");
    return;
  }

  if (clauseText.toLowerCase() === "help" || clauseText.toLowerCase() === "overview") {
    await respond({ response_type: "ephemeral", text: `*ClauseGuard overview*\n• Review one clause: up to ${MAX_CLAUSE_CHARACTERS.toLocaleString()} characters.\n• Review a whole agreement: paste it directly, up to ${MAX_CONTRACT_CHARACTERS.toLocaleString()} characters.\n• ${fileHelpText()}\n• Whole-contract results include a downloadable Markdown report.\n• More details: ${process.env.PUBLIC_BASE_URL ?? "open this app's public URL"}` });
    return;
  }

  if (clauseText.length > MAX_CLAUSE_CHARACTERS) {
    if (!looksLikeContract(clauseText)) {
      await respond(`This paragraph is ${clauseText.length.toLocaleString()} characters. ClauseGuard can reliably redline one clause up to ${MAX_CLAUSE_CHARACTERS.toLocaleString()} characters. Split this lengthy paragraph into the specific clause you want reviewed, or paste a structured agreement for whole-contract review.`);
      return;
    }
    await respondContract("Pasted contract", clauseText, command.channel_id, respond, client);
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

app.event("file_shared", async ({ event, client, logger }) => {
  try {
    const metadata = await client.files.info({ file: event.file_id });
    const file = metadata.file as any;
    if (!file?.name || !isSupportedFile(file.name)) return;
    if (!file.url_private_download) throw new Error("The uploaded file has no private download URL.");
    const channelId = Object.keys(file.shares?.public ?? {})[0] ?? Object.keys(file.shares?.private ?? {})[0];
    if (!channelId) return;
    const download = await fetch(file.url_private_download, { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } });
    if (!download.ok) throw new Error(`Could not download Slack file (${download.status}).`);
    const document = await extractUploadedDocument(Buffer.from(await download.arrayBuffer()), file.name);
    if (document.imageDataUrl) {
      const result = await analyzeContractImage(document.imageDataUrl, document.filename);
      await publishContractReview(document.filename, result, channelId, client);
      return;
    }
    if (!document.text || document.text.length > MAX_CONTRACT_CHARACTERS) {
      await client.chat.postMessage({ channel: channelId, text: `ClauseGuard could not review ${file.name}: extracted text exceeds the ${MAX_CONTRACT_CHARACTERS.toLocaleString()}-character contract limit.` });
      return;
    }
    const result = await analyzeContract(document.text);
    await publishContractReview(document.filename, result, channelId, client);
  } catch (error) {
    logger.error(error);
  }
});

function looksLikeContract(text: string): boolean {
  return /\b(this agreement|agreement|whereas|terms and conditions|in witness whereof)\b/i.test(text) || /\n\s*\d+[.)]\s/.test(text);
}

async function respondContract(title: string, text: string, channelId: string, respond: (message: any) => Promise<any>, client: any) {
  if (text.length > MAX_CONTRACT_CHARACTERS) {
    await respond(`This contract is ${text.length.toLocaleString()} characters. ClauseGuard's whole-contract limit is ${MAX_CONTRACT_CHARACTERS.toLocaleString()} characters. Upload or paste a shorter section, or review the key clauses separately.`);
    return;
  }
  try {
    const result = await analyzeContract(text);
    await respond({ response_type: "ephemeral", blocks: buildContractResultBlocks(title, result) });
    await client.files.uploadV2({ channel_id: channelId, filename: "clauseguard-contract-review.md", title: "ClauseGuard contract review", content: buildContractReport(title, result) });
  } catch (error) {
    console.error("Unable to review contract:", error);
    await respond("I couldn't complete this whole-contract review. Try a smaller contract section or one specific clause.");
  }
}

async function publishContractReview(title: string, result: any, channelId: string, client: any) {
  await client.chat.postMessage({ channel: channelId, text: `ClauseGuard contract review for ${title}`, blocks: buildContractResultBlocks(title, result) });
  await client.files.uploadV2({ channel_id: channelId, filename: "clauseguard-contract-review.md", title: `ClauseGuard review - ${title}`, content: buildContractReport(title, result) });
}

function isInsufficientQuotaError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === "credit_balance_exhausted";
}

void (async () => {
  await app.start(Number(process.env.PORT ?? 3000));
  console.log(`⚡️ ClauseGuard is running on port ${process.env.PORT ?? 3000}`);
})();
