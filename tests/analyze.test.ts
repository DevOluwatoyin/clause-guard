import { analyzeClause } from "../src/analyze";

const validAnalysis = {
  riskLevel: "high",
  explanation: "The obligation has no financial cap and is one-sided.",
  suggestedRedline: "Each party will indemnify the other, subject to a reasonable liability cap."
};

function createClient(response: string) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({ choices: [{ message: { content: response } }] })
      }
    }
  } as any;
}

describe("analyzeClause", () => {
  it("returns a validated analysis from a valid model response", async () => {
    await expect(analyzeClause("Vendor shall indemnify Customer.", createClient(JSON.stringify(validAnalysis))))
      .resolves.toEqual(validAnalysis);
  });

  it("rejects malformed model output", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(analyzeClause("Vendor shall indemnify Customer.", createClient('{"riskLevel":"critical"}'))).rejects.toThrow();
    consoleError.mockRestore();
  });

  it("accepts a JSON response prefixed by an OpenRouter provider message", async () => {
    const response = `User Safety: safe\n\n${JSON.stringify(validAnalysis)}`;

    await expect(analyzeClause("Vendor shall indemnify Customer.", createClient(response)))
      .resolves.toEqual(validAnalysis);
  });
});
