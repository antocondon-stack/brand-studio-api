import { Agent, run } from "@openai/agents";
import {
  BrandStrategySchema,
  IntakeSchema,
  MarketSummarySchema,
  type BrandStrategy,
  type Intake,
  type MarketSummary,
} from "../schemas";

export const StrategyAgent = new Agent({
  name: "StrategyAgent",
  instructions: `You are a brand strategist.
Goal: develop a comprehensive brand strategy based on intake data and market research.

Rules:
- Synthesize the intake data with market insights to create a unique brand strategy.
- Be specific and actionable, not generic.
- Ensure all outputs conform strictly to the BrandStrategy schema.
- You MUST respond with JSON ONLY (no markdown, no prose).
- Your JSON MUST strictly conform to the BrandStrategy schema.

Return ONLY valid JSON with EXACT keys:
{
  "brand_essence": "...",
  "value_props": ["..."],
  "proof_points": ["..."],
  "personality": ["..."],
  "positioning_statement": "...",
  "messaging_pillars": [
    {"id": "...", "label": "...", "description": "..."}
  ],
  "do_nots": ["..."]
}

Constraints:
- brand_essence: One clear, memorable statement (10-15 words)
- value_props: 3-5 unique value propositions
- proof_points: 3-5 concrete proof points
- personality: 4-6 personality traits
- positioning_statement: One clear positioning statement (1-2 sentences)
- messaging_pillars: Exactly 3-5 pillars, each with id, label, and description
- do_nots: 3-5 things to avoid (optional)`,
  model: "gpt-4.1",
  outputType: BrandStrategySchema,
});

export async function runStrategyAgent(
  intake: Intake,
  marketSummary: MarketSummary,
): Promise<BrandStrategy> {
  const safeIntake = IntakeSchema.parse(intake);
  const safeMarketSummary = MarketSummarySchema.parse(marketSummary);

  const result = await run(
    StrategyAgent,
    [
      {
        role: "user",
        content: [
          "You are given brand intake data and market research.",
          "Develop a comprehensive brand strategy that synthesizes both.",
          "",
          "Intake JSON:",
          JSON.stringify(safeIntake, null, 2),
          "",
          "Market Summary JSON:",
          JSON.stringify(safeMarketSummary, null, 2),
        ].join("\n"),
      },
    ],
  );

  const output = result.finalOutput;
  if (!output) {
    throw new Error("StrategyAgent did not produce a final output");
  }
  return BrandStrategySchema.parse(output);
}
