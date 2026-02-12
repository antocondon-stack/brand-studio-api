import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  BrandStrategySchema,
  CreativeDirectionSchema,
  IntakeSchema,
  MarketSummarySchema,
  type BrandStrategy,
  type CreativeDirection,
  type Intake,
  type MarketSummary,
} from "../schemas";

// Wrap the array schema in an object for Agent outputType
const CreativeDirectionsWrapperSchema = z.object({
  creative_directions: z.array(CreativeDirectionSchema).length(3),
});

export const CreativeDirectorAgent = new Agent({
  name: "CreativeDirectorAgent",
  instructions: `You are a creative director.
Goal: develop three distinct creative directions (A, B, C) based on brand strategy and market insights.

Rules:
- Create three distinct creative directions that explore different visual and messaging approaches.
- Each direction should be viable but offer different strategic trade-offs.
- Be specific about visual language, not generic.
- Ensure all outputs conform strictly to the CreativeDirections schema.
- You MUST respond with JSON ONLY (no markdown, no prose).
- Your JSON MUST strictly conform to the CreativeDirections schema.

Return ONLY valid JSON with EXACT keys:
{
  "creative_directions": [
    {
      "id": "A",
      "name": "...",
      "one_liner": "...",
      "narrative": "...",
      "logo_archetype": "wordmark|monogram|symbol|combination|emblem",
      "color_keywords": ["..."],
      "typography_keywords": ["..."],
      "imagery_style": "...",
      "motion_style": "...",
      "use_cases": ["..."],
      "risks": ["..."],
      "mitigations": ["..."]
    },
    {
      "id": "B",
      ...
    },
    {
      "id": "C",
      ...
    }
  ]
}

Constraints:
- Must return exactly 3 creative directions with ids "A", "B", "C"
- Each direction must be distinct and viable
- logo_archetype: one of wordmark, monogram, symbol, combination, emblem
- color_keywords: 4-6 specific color direction keywords
- typography_keywords: 3-5 typography direction keywords
- imagery_style: specific description of visual style
- motion_style: optional description of motion/animation style
- use_cases: 4-6 specific use cases
- risks: 2-4 potential risks (optional)
- mitigations: 2-4 mitigation strategies (optional)`,
  model: "gpt-4.1",
  outputType: CreativeDirectionsWrapperSchema,
});

export async function runCreativeDirectorAgent(
  intake: Intake,
  marketSummary: MarketSummary,
  brandStrategy: BrandStrategy,
): Promise<CreativeDirection[]> {
  const safeIntake = IntakeSchema.parse(intake);
  const safeMarketSummary = MarketSummarySchema.parse(marketSummary);
  const safeBrandStrategy = BrandStrategySchema.parse(brandStrategy);

  const result = await run(
    CreativeDirectorAgent,
    [
      {
        role: "user",
        content: [
          "You are given brand intake, market research, and brand strategy.",
          "Develop three distinct creative directions (A, B, C) that explore different visual and messaging approaches.",
          "",
          "Intake JSON:",
          JSON.stringify(safeIntake, null, 2),
          "",
          "Market Summary JSON:",
          JSON.stringify(safeMarketSummary, null, 2),
          "",
          "Brand Strategy JSON:",
          JSON.stringify(safeBrandStrategy, null, 2),
        ].join("\n"),
      },
    ],
  );

  const output = result.finalOutput;
  if (!output) {
    throw new Error("CreativeDirectorAgent did not produce a final output");
  }
  
  // Parse the wrapped output and extract the array
  const wrapped = CreativeDirectionsWrapperSchema.parse(output);
  return wrapped.creative_directions;
}
