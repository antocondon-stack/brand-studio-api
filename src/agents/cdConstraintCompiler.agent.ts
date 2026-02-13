import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { CDConstraintsSchema, type CDConstraints } from "../schemas";
import type { BrandStrategy, CreativeDirection } from "../schemas";

export const CDConstraintCompilerAgent = new Agent({
  name: "CDConstraintCompilerAgent",
  instructions: `You are a senior Creative Director constraint compiler. Translate a creative direction into STRICT, executable visual constraints for logo execution.

Output ONLY valid JSON with EXACT keys matching CDConstraintsSchema. No prose, no markdown, JSON only.

Rules:
- Translate route "avoid" rules into hard bans (full_rings, concentric_rings, single_badge_circle, etc.)
- Translate distinctiveness_hook into 3-6 explicit checks that can be verified in SVG
- Extract negative space requirements from motif_system.geometry_notes
- Extract tension gap requirements from design_rules
- Set silhouette_rules based on logo_requirements.silhouette
- Set wordmark_rules from wordmark_style
- Prioritize motif_family_priority from motif_system.motifs

Be concrete and specific. No generic statements.`,
  model: "gpt-4.1",
  outputType: CDConstraintsSchema,
});

export async function runCDConstraintCompiler(
  brandName: string,
  brandStrategy: BrandStrategy,
  chosenDirection: CreativeDirection,
): Promise<CDConstraints> {
  const prompt = [
    "Compile visual constraints from this creative direction.",
    "",
    "Brand: " + brandName,
    "",
    "Brand Strategy:",
    JSON.stringify(brandStrategy, null, 2),
    "",
    "Chosen Direction:",
    JSON.stringify(chosenDirection, null, 2),
    "",
    "Output STRICT JSON matching CDConstraintsSchema. Translate avoid rules into hard bans, extract distinctiveness_hook checks, set silhouette/wordmark rules.",
  ].join("\n");

  const result = await run(CDConstraintCompilerAgent, [
    {
      role: "user",
      content: prompt,
    },
  ]);

  const output = result.finalOutput;
  if (!output) {
    throw new Error("CDConstraintCompilerAgent did not produce a final output");
  }

  return CDConstraintsSchema.parse(output);
}
