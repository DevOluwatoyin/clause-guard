import OpenAI from "openai";
import { z } from "zod";

export const ClauseAnalysis = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  explanation: z.string().min(1),
  suggestedRedline: z.string().min(1)
});

export type ClauseAnalysisT = z.infer<typeof ClauseAnalysis>;

export const ContractAnalysis = z.object({
  overallRiskLevel: z.enum(["low", "medium", "high"]),
  executiveSummary: z.string().min(1),
  findings: z.array(z.object({
    riskLevel: z.enum(["low", "medium", "high"]),
    title: z.string().min(1),
    clause: z.string().min(1),
    explanation: z.string().min(1),
    suggestedRedline: z.string().min(1)
  })).min(1).max(8)
});

export type ContractAnalysisT = z.infer<typeof ContractAnalysis>;

const SYSTEM_PROMPT = `You are ClauseGuard, a contracts risk-review assistant for non-lawyers.
Analyze one contract clause. You provide educational information, not legal advice.
Respond ONLY with JSON matching exactly this shape:
{"riskLevel":"low" | "medium" | "high","explanation":"<2-3 plain-English sentences on what this clause means and why it is risky or not>","suggestedRedline":"<a rewritten, more balanced version of the clause, or 'No change needed' if low risk>"}
Do not include text outside the JSON object. Be concrete and specific to the clause given, not generic.`;

function getClient(): OpenAI {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const legacyOpenRouterKey = process.env.OPENAI_API_KEY?.startsWith("sk-or-")
    ? process.env.OPENAI_API_KEY
    : undefined;
  const useOpenRouter = process.env.LLM_PROVIDER === "openrouter" || Boolean(openRouterKey || legacyOpenRouterKey);

  return new OpenAI({
    apiKey: useOpenRouter ? (openRouterKey ?? legacyOpenRouterKey) : process.env.OPENAI_API_KEY,
    baseURL: useOpenRouter ? "https://openrouter.ai/api/v1" : undefined,
    defaultHeaders: useOpenRouter
      ? { "X-OpenRouter-Title": "ClauseGuard" }
      : undefined
  });
}

function getModel(): string {
  const useOpenRouter = process.env.LLM_PROVIDER === "openrouter" ||
    Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY?.startsWith("sk-or-"));

  return process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ??
    (useOpenRouter ? "openrouter/free" : "gpt-4o-mini");
}

function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace <= firstBrace) {
      throw new SyntaxError("The model response did not contain a JSON object.");
    }

    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  }
}

async function requestAnalysis(systemPrompt: string, userContent: unknown, client: OpenAI) {
  const completion = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent as string }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 2_500
  });

  return parseModelJson(completion.choices[0]?.message.content ?? "{}");
}

async function requestValidated<T>(systemPrompt: string, userContent: unknown, schema: z.ZodType<T>, client: OpenAI): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return schema.parse(await requestAnalysis(systemPrompt, userContent, client));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function analyzeClause(
  clauseText: string,
  client = getClient()
): Promise<ClauseAnalysisT> {
  try {
    return await requestValidated(SYSTEM_PROMPT, clauseText, ClauseAnalysis, client);
  } catch (error) {
    console.error("Clause analysis failed:", error);
    throw error;
  }
}

const CONTRACT_PROMPT = `You are ClauseGuard, a contracts risk-review assistant for non-lawyers.
Review the full contract below. Provide educational information, not legal advice. Identify the most material risks only and write in concise, plain English.
Respond ONLY with JSON matching exactly this shape:
{"overallRiskLevel":"low"|"medium"|"high","executiveSummary":"<one short paragraph>","findings":[{"riskLevel":"low"|"medium"|"high","title":"<short issue name>","clause":"<short quoted or paraphrased clause>","explanation":"<short paragraph>","suggestedRedline":"<concise balanced redline or No change needed>"}]}
Include between 1 and 8 findings, highest risk first. Do not include text outside the JSON object.`;

export async function analyzeContract(documentText: string, client = getClient()): Promise<ContractAnalysisT> {
  try {
    return await requestValidated(CONTRACT_PROMPT, documentText, ContractAnalysis, client);
  } catch (error) {
    console.error("Contract analysis failed:", error);
    throw error;
  }
}

export async function analyzeContractImage(dataUrl: string, filename: string, client = getClient()): Promise<ContractAnalysisT> {
  const content = [
    { type: "text", text: `Review this contract image named ${filename}.` },
    { type: "image_url", image_url: { url: dataUrl } }
  ];
  try {
    return await requestValidated(CONTRACT_PROMPT, content, ContractAnalysis, client);
  } catch (error) {
    console.error("Image contract analysis failed:", error);
    throw error;
  }
}
