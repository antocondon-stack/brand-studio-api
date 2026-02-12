import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  FinalKitSchema,
  type FinalKit,
  type FinalizeRequest,
  type LogoConcept,
} from "../schemas";
import { buildDeterministicSvgs } from "../tools/deterministicSvg.tool";
import {
  generateMotifMark,
  scoreMotifDistinctiveness,
} from "../tools/motifMark.tool";

// Schema for the executor output (palette, fonts, templates)
const ExecutorOutputSchema = z.object({
  palette: z
    .array(
      z.object({
        role: z.string().min(1),
        hex: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Expected a hex color"),
      }),
    )
    .min(5)
    .max(7),
  fonts: z.array(
    z.object({
      role: z.string().min(1),
      family: z.string().min(1),
      weight: z.string().min(1),
      usage: z.string().min(1),
    }),
  ),
  templates: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      format: z.string().min(1),
    }),
  ),
});

export const ExecutorAgent = new Agent({
  name: "ExecutorAgent",
  instructions: `You are a brand executor.
Goal: produce the final brand kit including color palette, typography, and templates based on the chosen creative direction.

Rules:
- Generate a cohesive color palette (5-7 colors) based on the creative direction's color keywords
- Recommend typography that matches the typography keywords
- Suggest practical templates for brand application
- Be specific and actionable
- You MUST respond with JSON ONLY (no markdown, no prose).
- Your JSON MUST strictly conform to the ExecutorOutput schema.

Return ONLY valid JSON with EXACT keys:
{
  "palette": [
    {"role": "primary", "hex": "#..."},
    {"role": "secondary", "hex": "#..."},
    {"role": "accent", "hex": "#..."},
    {"role": "neutral", "hex": "#..."},
    {"role": "background", "hex": "#..."}
  ],
  "fonts": [
    {"role": "heading", "family": "...", "weight": "...", "usage": "..."},
    {"role": "body", "family": "...", "weight": "...", "usage": "..."}
  ],
  "templates": [
    {"id": "...", "name": "...", "description": "...", "format": "..."}
  ]
}

Constraints:
- palette: 5-7 colors with roles (primary, secondary, accent, neutral, background, etc.)
- fonts: 2-4 font recommendations with roles (heading, body, display, etc.)
- templates: 3-6 template suggestions for brand application`,
  model: "gpt-4.1",
  outputType: ExecutorOutputSchema,
});

export async function runExecutorAgent(
  request: FinalizeRequest,
  criticActions?: string[],
  selectedConcept?: LogoConcept | null,
): Promise<FinalKit> {
  const { intake, chosen_direction } = request;

  // Step 1: Generate logos using deterministic SVG function
  console.log("🎨 Generating logos...");
  
  // Generate a simple palette from keywords (simplified approach)
  // In production, you might want to use an AI service to generate actual colors from keywords
  // Note: The schema expects 6-digit hex codes like #123456 (7 chars total with #)
  const defaultPalette = [
    "#1a1a1a", // dark
    "#ffffff", // light
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
  ];

  // Generate logos using the deterministic SVG function
  const logos = buildDeterministicSvgs({
    brand_name: intake.brand_name,
    direction_name: chosen_direction.name,
    logo_archetype: chosen_direction.logo_archetype,
    keywords: chosen_direction.color_keywords,
    palette_hex: defaultPalette,
    vibe: chosen_direction.one_liner,
    tracking: 0, // Default tracking, can be adjusted based on creative direction
  });

  // Step 1.5: Generate motif mark via motif_mark (use selected concept's motif family when provided)
  console.log("🎯 Generating motif mark...");

  const seedNum = intake.brand_name.length + chosen_direction.name.length;
  const seed = `${intake.brand_name}-${chosen_direction.name}-${seedNum}`;
  const distinctivenessHook = `${chosen_direction.one_liner} ${chosen_direction.narrative}`.toLowerCase();
  const motifFamilies: Array<"loop" | "interlock" | "orbit" | "fold" | "swap" | "monogram-interlock"> = [
    "loop",
    "interlock",
    "orbit",
    "fold",
    "swap",
    "monogram-interlock",
  ];

  let motifFamily: "loop" | "interlock" | "orbit" | "fold" | "swap" | "monogram-interlock";
  if (selectedConcept && motifFamilies.includes(selectedConcept.motif_family as typeof motifFamily)) {
    motifFamily = selectedConcept.motif_family as typeof motifFamily;
    console.log(`✅ Using selected concept motif: ${motifFamily}`);
  } else {
    const scoringFamilies: Array<"loop" | "interlock" | "orbit" | "fold" | "swap"> = [
      "loop", "interlock", "orbit", "fold", "swap",
    ];
    const selectedFamilies: Array<"loop" | "interlock" | "orbit" | "fold" | "swap"> = [];
    const usedIndices = new Set<number>();
    for (let i = 0; i < 3; i++) {
      let idx = (seedNum + i * 7) % scoringFamilies.length;
      while (usedIndices.has(idx)) {
        idx = (idx + 1) % scoringFamilies.length;
      }
      usedIndices.add(idx);
      const family = scoringFamilies[idx];
      if (family) selectedFamilies.push(family);
    }
    const motifCandidates = selectedFamilies.map((family) => {
      const score = scoreMotifDistinctiveness(family, distinctivenessHook);
      return { family, score };
    });
    const first = motifCandidates[0];
    const best = first && motifCandidates.length > 0
      ? motifCandidates.reduce((a, c) => (c.score > a.score ? c : a), first)
      : { family: "loop" as const, score: 0 };
    motifFamily = best.family;
    console.log(`✅ Selected motif: ${motifFamily}`);
  }

  const motifResult = generateMotifMark({
    brand_name: intake.brand_name,
    motif_family: motifFamily,
    seed,
    grid: 24,
    stroke_px: 2,
    corner_radius_px: 2,
    primary_hex: defaultPalette[0] ?? "#1a1a1a",
  });

  // Step 2: Run Executor Agent to get palette, fonts, and templates
  console.log("📦 Running Executor Agent...");
  
  const executorPrompt = [
    "You are given a chosen creative direction.",
    "Generate a complete brand kit: color palette, typography, and templates.",
    "",
    "Chosen Direction JSON:",
    JSON.stringify(chosen_direction, null, 2),
  ];

  if (criticActions && criticActions.length > 0) {
    executorPrompt.push(
      "",
      "Apply these critic actions to improve the kit:",
      criticActions.map((a) => `- ${a}`).join("\n"),
    );
  }

  const result = await run(
    ExecutorAgent,
    [
      {
        role: "user",
        content: executorPrompt.join("\n"),
      },
    ],
  );

  const output = result.finalOutput;
  if (!output) {
    throw new Error("ExecutorAgent did not produce a final output");
  }

  const executorOutput = ExecutorOutputSchema.parse(output);

  // Combine logos with executor output (mark from motif_mark tool)
  const finalKit: FinalKit = {
    logo_svg_wordmark: logos.logo_svg_wordmark,
    logo_svg_mark: motifResult.mark_svg,
    palette: executorOutput.palette,
    fonts: executorOutput.fonts,
    templates: executorOutput.templates,
  };

  if (selectedConcept) {
    if (selectedConcept.preview_base64) {
      finalKit.selected_concept_preview = selectedConcept.preview_base64;
    }
    finalKit.selected_concept_metadata = {
      motif_family: selectedConcept.motif_family,
      composition: selectedConcept.composition,
    };
  }

  return FinalKitSchema.parse(finalKit);
}
