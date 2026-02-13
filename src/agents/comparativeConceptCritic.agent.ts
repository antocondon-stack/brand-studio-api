import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  ComparativeCritiqueSchema,
  type ComparativeCritique,
  type CDConstraints,
  type CreativeDirection,
  type LogoConcept,
} from "../schemas";

export const ComparativeConceptCriticAgent = new Agent({
  name: "ComparativeConceptCriticAgent",
  instructions: `You are a senior Creative Director comparing logo concepts side-by-side. Rank concepts for ownability + strategic alignment, NOT just aesthetics.

Output ONLY valid JSON with EXACT keys matching ComparativeCritiqueSchema. No prose, no markdown, JSON only.

Rules:
- Compare concepts side-by-side
- Rank by ownability (distinctiveness, memorability) + alignment with constraints
- Select the best concept for execution
- Provide execution_directives: motif_family, variant_targets (array of 0-5), geometry_adjustments (concrete like "increase negative-space window", "ban circles", "add seam gap at 35deg"), composition
- Risk flags should identify generic/cliché risks

Be strategic, not just pretty.`,
  model: "gpt-4.1",
  outputType: ComparativeCritiqueSchema,
});

export async function runComparativeConceptCritic(
  brandName: string,
  chosenDirection: CreativeDirection,
  cdConstraints: CDConstraints,
  concepts: LogoConcept[],
): Promise<ComparativeCritique> {
  const prompt = [
    "Compare these logo concepts side-by-side and rank them for ownability + strategic alignment.",
    "",
    "Brand: " + brandName,
    "",
    "Chosen Direction:",
    JSON.stringify(
      {
        name: chosenDirection.name,
        visual_thesis: chosenDirection.visual_thesis,
        avoid: chosenDirection.motif_system.avoid,
        distinctiveness_hook: chosenDirection.logo_requirements.distinctiveness_hook,
      },
      null,
      2,
    ),
    "",
    "CD Constraints:",
    JSON.stringify(cdConstraints, null, 2),
    "",
    "Concepts:",
    JSON.stringify(concepts, null, 2),
    "",
    "Output STRICT JSON matching ComparativeCritiqueSchema. Rank concepts, select best, provide execution directives.",
  ].join("\n");

  const result = await run(ComparativeConceptCriticAgent, [
    {
      role: "user",
      content: prompt,
    },
  ]);

  const output = result.finalOutput;
  if (!output) {
    throw new Error("ComparativeConceptCriticAgent did not produce a final output");
  }

  return ComparativeCritiqueSchema.parse(output);
}
