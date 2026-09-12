import { buildResultBlocks } from "../src/blocks";

const analysis = {
  riskLevel: "medium" as const,
  explanation: "A concise explanation.",
  suggestedRedline: "A concise redline."
};

describe("buildResultBlocks", () => {
  it("limits long user text so Slack Block Kit accepts the response", () => {
    const blocks = buildResultBlocks("A".repeat(7_000), analysis);
    const clauseBlock = blocks[2] as { text: { text: string } };

    expect(clauseBlock.text.text.length).toBeLessThanOrEqual(2_720);
    expect(clauseBlock.text.text).toContain("…");
  });
});
