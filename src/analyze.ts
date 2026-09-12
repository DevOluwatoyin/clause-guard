import OpenAI from "openai";
import { z } from "zod";

export const ClauseAnalysis = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  explanation: z.string().min(1),
  suggestedRedline: z.string().min(1)
});

export type ClauseAnalysisT = z.infer<typeof ClauseAnalysis>;

const SYSTEM_PROMPT = `You are ClauseGuard, a contracts risk-review assistant for non-lawyers.
Analyze one contract clause. You provide educational information, not legal advice.
Respond ONLY with JSON matching exactly this shape:
{"riskLevel":"low" | "medium" | "high","explanation":"<2-3 plain-English sentences on what this clause means and why it is risky or not>","suggestedRedline":"<a rewritten, more balanced version of the clause, or 'No change needed' if low risk>"}
Do not include text outside the JSON object. Be concrete and specific to the clause given, not generic.`;

export async function analyzeClause(
  clauseText: string,
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
): Promise<ClauseAnalysisT> {
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: clauseText }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const raw = completion.choices[0]?.message.content ?? "{}";
    return ClauseAnalysis.parse(JSON.parse(raw));
  } catch (error) {
    console.error("Clause analysis failed:", error);
    throw error;
  }
}
