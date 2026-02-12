import { Agent, run, imageGenerationTool } from "@openai/agents";
import { z } from "zod";
import type { LogoConcept } from "../schemas";

const MOTIF_FAMILIES = ["loop", "interlock", "orbit", "fold", "swap"] as const;
const COMPOSITIONS = [
  "horizontal lockup",
  "stacked lockup",
  "mark only",
  "wordmark only",
  "badge",
  "icon",
] as const;

const ConceptArtistOutputSchema = z.object({
  concepts: z.array(
    z.object({
      id: z.number(),
      motif_family: z.enum(["loop", "interlock", "orbit", "fold", "swap"]),
      composition: z.string(),
      description: z.string().optional(),
    }),
  ),
});

export const ConceptArtistAgent = new Agent({
  name: "ConceptArtistAgent",
  instructions: `You are a logo concept artist. Generate exactly 6 visually distinct logo concept images for the given brand and creative direction.

You MUST call the image generation tool exactly 6 times. For each call use a DIFFERENT combination:
- Concept 1: motif family "loop", composition "horizontal lockup"
- Concept 2: motif family "interlock", composition "stacked lockup"
- Concept 3: motif family "orbit", composition "mark only"
- Concept 4: motif family "fold", composition "wordmark only"
- Concept 5: motif family "swap", composition "badge"
- Concept 6: motif family "loop", composition "icon" (different from concept 1)

Each image must be a clean, professional logo concept render. Describe the brand name and style in the prompt. Use a simple background or transparent. No gradients unless the creative direction requires it.

After generating all 6 images, output ONLY valid JSON with this exact structure:
{
  "concepts": [
    {"id": 1, "motif_family": "loop", "composition": "horizontal lockup", "description": "brief description"},
    {"id": 2, "motif_family": "interlock", "composition": "stacked lockup", "description": "brief description"},
    {"id": 3, "motif_family": "orbit", "composition": "mark only", "description": "brief description"},
    {"id": 4, "motif_family": "fold", "composition": "wordmark only", "description": "brief description"},
    {"id": 5, "motif_family": "swap", "composition": "badge", "description": "brief description"},
    {"id": 6, "motif_family": "loop", "composition": "icon", "description": "brief description"}
  ]
}`,
  tools: [imageGenerationTool({ size: "1024x1024", outputFormat: "png" })],
  model: "gpt-4.1",
});

function extractBase64ImagesFromRun(result: { newItems?: Array<{ type: string; rawItem?: unknown; output?: unknown }> }): string[] {
  const images: string[] = [];
  const newItems = result.newItems ?? [];

  for (const item of newItems) {
    if (item.type !== "tool_call_output_item") continue;
    const raw = item.rawItem as Record<string, unknown> | undefined;
    const out = (raw?.output ?? item.output) as Record<string, unknown> | undefined;
    if (!out || typeof out !== "object") continue;
    if (out.type === "image" && out.image && typeof out.image === "object") {
      const img = out.image as { data?: string; url?: string };
      if (typeof img.data === "string") {
        images.push(img.data);
      }
    }
  }

  return images;
}

export async function runConceptArtistAgent(
  brandName: string,
  directionName: string,
  directionSummary: string,
): Promise<LogoConcept[]> {
  const result = await run(
    ConceptArtistAgent,
    [
      {
        role: "user",
        content: [
          `Generate exactly 6 logo concept images for the brand "${brandName}" with creative direction "${directionName}".`,
          "",
          "Direction summary:",
          directionSummary,
          "",
          "Call the image generation tool 6 times with the required motif family and composition for each concept. Then output the concepts JSON.",
        ].join("\n"),
      },
    ],
  );

  const images = extractBase64ImagesFromRun(result);

  let conceptsMeta: z.infer<typeof ConceptArtistOutputSchema>;
  const finalOutput = result.finalOutput;
  if (finalOutput && typeof finalOutput === "object" && "concepts" in finalOutput) {
    conceptsMeta = ConceptArtistOutputSchema.parse(finalOutput);
  } else if (typeof finalOutput === "string") {
    try {
      const parsed = JSON.parse(finalOutput);
      conceptsMeta = ConceptArtistOutputSchema.parse(parsed);
    } catch {
      conceptsMeta = {
        concepts: MOTIF_FAMILIES.map((motif_family, i) => ({
          id: i + 1,
          motif_family,
          composition: COMPOSITIONS[i] ?? "horizontal lockup",
        })),
      };
    }
  } else {
    conceptsMeta = {
      concepts: MOTIF_FAMILIES.map((motif_family, i) => ({
        id: i + 1,
        motif_family,
        composition: COMPOSITIONS[i] ?? "horizontal lockup",
      })),
    };
  }

  return conceptsMeta.concepts.map((c, i) => ({
    ...c,
    preview_base64: images[i],
  }));
}
