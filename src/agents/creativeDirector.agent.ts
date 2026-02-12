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

const CreativeDirectionsWrapperSchema = z.object({
  creative_directions: z.array(CreativeDirectionSchema).length(3),
});

export const CreativeDirectorAgent = new Agent({
  name: "CreativeDirectorAgent",
  instructions: `You are a world-class creative director. Your job is to output exactly three creative directions (A, B, C) that are executable, distinct, and ownable.

## Output format
Return JSON only. No markdown, no code fences, no prose. Single JSON object with key "creative_directions" containing an array of exactly 3 objects. Each object MUST have these exact keys:

- "id": "A" | "B" | "C"
- "name": string (short direction name)
- "rationale": string (why this direction serves the strategy)
- "keywords": string[] (color, tone, and visual keywords)
- "logo_archetype": "wordmark" | "monogram" | "emblem" | "combination"
- "typography_axis": "geometric" | "humanist" | "editorial" | "grotesk" | "neo-grotesk"
- "color_logic": "mono_accent" | "neutral_premium" | "vibrant" | "earthy" | "tech_clean"
- "design_rules": string[] (concrete do's)
- "visual_thesis": string (one-sentence visual territory thesis)
- "motif_system": {
    "motifs": string[] (ONLY from: loop, interlock, orbit, fold, swap, monogram-interlock),
    "geometry_notes": string[],
    "avoid": string[]
  }
- "wordmark_style": {
    "case": "lowercase" | "uppercase" | "titlecase",
    "contrast": "low" | "med" | "high",
    "terminal": "round" | "sharp" | "mixed",
    "tracking": "tight" | "normal" | "wide"
  }
- "logo_requirements": {
    "silhouette": "simple" | "medium" | "complex",
    "stroke": "none" | "mono_stroke",
    "min_detail": "low" | "med",
    "distinctiveness_hook": string (the one "move" that makes it recognizable)
  }

## Hard constraints
1. A, B, and C MUST differ on at least TWO axes (e.g. different motif family + different typography_axis, or different motif + different logo_archetype).
2. motif_system.motifs: use ONLY these families (they map to the mark generator): loop, interlock, orbit, fold, swap, monogram-interlock. At least one motif per direction; list in order of preference.
3. Avoid category clichés: read market_summary (competitors, visual_patterns, cliches_to_avoid, whitespace_opportunities) and do NOT repeat cliches_to_avoid or overused visual_patterns.
4. Every direction must be executable: motif families must be from the list above; typography and color choices must be implementable.

## Quality bar
- Visual thesis: one clear sentence that defines the visual territory.
- Motif system: what to use, geometry notes, and what to avoid (e.g. "avoid literal icons").
- Wordmark style: case, contrast, terminals, tracking—specific enough to drive type and lockup choices.
- Reduction principle is implied in logo_requirements.silhouette and min_detail; distinctiveness_hook is the single recognizable "move" at 16px.

Return ONLY valid JSON. No markdown.`,
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
          "Develop three distinct creative directions (A, B, C) with the exact JSON structure specified in your instructions.",
          "Use brand intake, market summary, and brand strategy below. Avoid market_summary clichés and ensure A/B/C differ on at least two axes. Use only supported motif families: loop, interlock, orbit, fold, swap, monogram-interlock.",
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

  const wrapped = CreativeDirectionsWrapperSchema.parse(output);
  return wrapped.creative_directions;
}
