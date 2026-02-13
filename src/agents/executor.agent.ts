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
import { buildTemplatePreviews } from "../tools/templatePreview.tool";

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
  templates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
        format: z.string().min(1),
      }),
    )
    .optional(),
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
  runSeed?: string,
): Promise<FinalKit> {
  const { intake, chosen_direction } = request;

  console.log("🎨 Generating logos...");
  const defaultPalette = [
    "#1a1a1a",
    "#ffffff",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
  ];

  const logos = buildDeterministicSvgs({
    brand_name: intake.brand_name,
    direction_name: chosen_direction.name,
    logo_archetype: chosen_direction.logo_archetype,
    keywords: chosen_direction.keywords,
    palette_hex: defaultPalette,
    vibe: chosen_direction.visual_thesis,
    tracking: 0,
    regen_seed: runSeed,
  });

  // Step 1.5: Generate motif mark via motif_mark (use selected concept's motif family when provided)
  console.log("🎯 Generating motif mark...");

  const seedNum = intake.brand_name.length + chosen_direction.name.length;
  const seed = runSeed
    ? `${intake.brand_name}-${chosen_direction.name}-${runSeed}`
    : `${intake.brand_name}-${chosen_direction.name}-${seedNum}`;
  const distinctivenessHook = `${chosen_direction.visual_thesis} ${chosen_direction.rationale} ${chosen_direction.logo_requirements?.distinctiveness_hook ?? ""}`.toLowerCase();
  const supportedMotifFamilies: Array<"loop" | "interlock" | "orbit" | "fold" | "swap" | "monogram-interlock"> = [
    "loop",
    "interlock",
    "orbit",
    "fold",
    "swap",
    "monogram-interlock",
  ];

  let motifFamily: "loop" | "interlock" | "orbit" | "fold" | "swap" | "monogram-interlock";
  if (selectedConcept && supportedMotifFamilies.includes(selectedConcept.motif_family as typeof motifFamily)) {
    motifFamily = selectedConcept.motif_family as typeof motifFamily;
    console.log(`✅ Using selected concept motif: ${motifFamily}`);
  } else if (chosen_direction.motif_system?.motifs?.length) {
    const fromDirection = chosen_direction.motif_system.motifs.find((m) =>
      supportedMotifFamilies.includes(m as typeof motifFamily),
    );
    if (fromDirection) {
      motifFamily = fromDirection as typeof motifFamily;
      console.log(`✅ Using direction motif_system: ${motifFamily}`);
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

  const templates = buildTemplatePreviews({
    palette: executorOutput.palette,
    fonts: executorOutput.fonts,
    direction_keywords: chosen_direction.keywords,
    brand_name: intake.brand_name,
    logo_svg_mark: motifResult.mark_svg,
  });

  const finalKit: FinalKit = {
    logo_svg_wordmark: logos.logo_svg_wordmark,
    logo_svg_mark: motifResult.mark_svg,
    palette: executorOutput.palette,
    fonts: executorOutput.fonts,
    templates,
    logo_lockups: {
      horizontal_svg: logos.logo_svg_horizontal,
      stacked_svg: logos.logo_svg_stacked,
      mark_only_svg: motifResult.mark_svg,
    },
    construction: {
      grid: 24,
      stroke_px: 2,
      corner_radius_px: 2,
      clearspace_ratio: 1.0,
      min_size_px: 16,
    },
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
