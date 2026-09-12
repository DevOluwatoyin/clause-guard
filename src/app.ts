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

  const isDocumentIntent = /\b(attached file|attachment|this document|this file|attached|document|file)\b/i.test(clauseText);
  if (isDocumentIntent && (clauseText.length < 80 || !looksLikeContract(clauseText))) {
    await respond("Slack slash commands cannot receive file attachments. Upload the file directly to the channel for ClauseGuard's automatic review, or attach it in a message with `@ClauseGuard`.");
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
    await respond("ClauseGuard could not complete the review due to an unexpected error. Please try again or contact support.");
  }
});

let cachedBotUserId: string | undefined;
const recentFileReviews = new Map<string, number>();
const FILE_REVIEW_DEDUPLICATION_MS = 5 * 60 * 1_000;

async function getBotUserId(client: any): Promise<string | undefined> {
  if (!cachedBotUserId) {
    try {
      const auth = await client.auth.test();
      cachedBotUserId = auth.user_id;
    } catch {
      // ignore auth test failure if token missing in test env
    }
  }
  return cachedBotUserId;
}

async function fetchSlackFile(url: string, token: string): Promise<Buffer> {
  let currentUrl = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(currentUrl, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual"
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirect missing location header (${res.status})`);
      currentUrl = location;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Could not download Slack file (${res.status} ${res.statusText})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Too many redirects downloading file");
}

app.event("file_created", async ({ event, client, logger }) => {
  const fileEvent = event as any;
  const channelId = fileEvent.channel_id ?? fileEvent.channel;
  for (const fileId of getFileIds(fileEvent)) {
    await reviewSlackFile(fileId, channelId, client, logger);
  }
});

app.event("file_shared", async ({ event, client, logger }) => {
  const fileEvent = event as any;
  const channelId = fileEvent.channel_id ?? fileEvent.channel;
  for (const fileId of getFileIds(fileEvent)) {
    await reviewSlackFile(fileId, channelId, client, logger);
  }
});

app.event("app_mention", async ({ event, client, logger }) => {
  const mention = event as any;
  const text = String(mention.text ?? "").replace(/<@[^>]+>/g, "").trim();
  const fileIds = getFileIds(mention);
  if (fileIds.length > 0) {
    for (const fileId of fileIds) {
      await reviewSlackFile(fileId, mention.channel, client, logger);
    }
    return;
  }
  if (!text) {
    await client.chat.postMessage({ channel: mention.channel, text: "Mention me with a clause, or attach a supported contract file in the same message." });
    return;
  }
  try {
    const result = await analyzeClause(text);
    await client.chat.postMessage({ channel: mention.channel, text: "ClauseGuard review", blocks: buildResultBlocks(text, result) });
  } catch (error) {
    logger.error(error);
    await client.chat.postMessage({ channel: mention.channel, text: "ClauseGuard couldn't analyze that clause. Please try again or upload a supported file." });
  }
});

function getFileIds(event: any): string[] {
  const ids = [
    event.file_id,
    event.file?.id,
    ...(Array.isArray(event.files) ? event.files.map((file: any) => file?.id) : [])
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

async function reviewSlackFile(fileId: string, fallbackChannelId: string | undefined, client: any, logger: any) {
  const now = Date.now();
  const previousReview = recentFileReviews.get(fileId);
  if (previousReview && now - previousReview < FILE_REVIEW_DEDUPLICATION_MS) return;
  recentFileReviews.set(fileId, now);

  try {
    const metadata = await client.files.info({ file: fileId });
    const file = metadata.file as any;
    if (!file?.name || !isSupportedFile(file.name)) return;

    const botUserId = await getBotUserId(client);
    if ((botUserId && file.user === botUserId) || file.name.startsWith("clauseguard-") || String(file.title ?? "").startsWith("ClauseGuard")) {
      return;
    }

    if (!file.url_private_download) throw new Error("The uploaded file has no private download URL.");
    const channelId = fallbackChannelId ??
      file.channels?.[0] ??
      file.groups?.[0] ??
      Object.keys(file.shares?.public ?? {})[0] ??
      Object.keys(file.shares?.private ?? {})[0];
    if (!channelId) return;

    await client.chat.postMessage({
      channel: channelId,
      text: `🔍 ClauseGuard is reviewing the attached document *${file.name}*. This may take a moment.`
    });

    const buffer = await fetchSlackFile(file.url_private_download, process.env.SLACK_BOT_TOKEN!);
    const document = await extractUploadedDocument(buffer, file.name);
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
    if (fallbackChannelId) {
      await client.chat.postMessage({
        channel: fallbackChannelId,
        text: `ClauseGuard could not review that attachment. ${fileErrorMessage(error)}`
      });
    }
  }
}

function fileErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "FILE_TOO_LARGE") {
    return "Files must be 10 MB or smaller."
  }
  if (error instanceof Error && error.message === "LEGACY_PPT") {
    return "Convert legacy .ppt files to .pptx first."
  }
  if (error instanceof Error && error.message === "NO_EXTRACTABLE_TEXT") {
    return "No readable contract text was found in the file."
  }
  return "Please upload a supported TXT, DOCX, PDF, PPTX, PNG, JPG, JPEG, or WEBP file and try again.";
}

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
