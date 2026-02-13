import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  FinalKitSchema,
  type FinalKit,
  type FinalizeRequest,
  type LogoConcept,
} from "../schemas";
import { buildWordmarkSvg } from "../tools/deterministicSvg.tool";
import {
  generateMotifMark,
  scoreMotifDistinctiveness,
} from "../tools/motifMark.tool";
import { buildTemplatePreviews } from "../tools/templatePreview.tool";
import { buildLockupsFromSvgs } from "../tools/lockupsFromSvgs.tool";

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

/** Extract palette hexes in stable order: primary, secondary, accent, background, neutral, then remaining */
function paletteHexes(palette: Array<{ role: string; hex: string }>): string[] {
  const roleOrder = ["primary", "secondary", "accent", "background", "neutral"];
  const ordered: string[] = [];
  const seen = new Set<string>();
  
  // Add colors in priority order
  for (const role of roleOrder) {
    const color = palette.find((p) => p.role.toLowerCase() === role.toLowerCase());
    if (color && !seen.has(color.hex)) {
      ordered.push(color.hex);
      seen.add(color.hex);
    }
  }
  
  // Add remaining colors
  for (const color of palette) {
    if (!seen.has(color.hex)) {
      ordered.push(color.hex);
      seen.add(color.hex);
    }
  }
  
  return ordered;
}

export async function runExecutorAgent(
  request: FinalizeRequest,
  criticActions?: string[],
  selectedConcept?: LogoConcept | null,
  runSeed?: string,
): Promise<FinalKit> {
  const { intake, chosen_direction } = request;

  // Step 1: Run Executor Agent FIRST to get palette, fonts, and templates
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

  // Step 2: Extract palette hexes from executor output
  const paletteHex = paletteHexes(executorOutput.palette);
  const defaultPalette = [
    "#1a1a1a",
    "#ffffff",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
  ];
  const paletteHexToUse = paletteHex.length > 0 ? paletteHex : defaultPalette;
  const primary = paletteHexToUse[0] ?? "#1a1a1a";
  const secondary = paletteHexToUse[1] ?? "#ffffff";
  const accent = paletteHexToUse[2] ?? "#3b82f6";
  
  console.log(`🎨 Palette hexes: [${paletteHexToUse.join(", ")}]`);
  console.log(`🎨 Primary: ${primary}, Secondary: ${secondary}, Accent: ${accent}`);

  // Step 3: Generate wordmark SVG and metrics using actual palette
  console.log("📝 Generating wordmark...");
  const wordmarkResult = buildWordmarkSvg({
    brand_name: intake.brand_name,
    direction_name: chosen_direction.name,
    logo_archetype: chosen_direction.logo_archetype,
    keywords: chosen_direction.keywords,
    palette_hex: paletteHexToUse,
    vibe: chosen_direction.visual_thesis,
    tracking: 0,
    regen_seed: runSeed,
  });

  // Step 4: Generate motif mark candidates and select best
  console.log("🎯 Generating motif mark candidates...");

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

  // Helper function to score motif candidates deterministically
  function scoreMotifCandidate(svg: string, family: typeof motifFamily, strokePx: number): number {
    let score = 10;
    
    // Penalize if SVG contains "<circle"
    const circleCount = (svg.match(/<circle/g) || []).length;
    if (circleCount > 0) {
      score -= 10; // Heavy penalty for circles
    }
    
    // Penalize if it contains 1 path only (unless monogram-interlock with 2 glyphs)
    const pathCount = (svg.match(/<path/g) || []).length;
    if (pathCount === 1 && family !== "monogram-interlock") {
      score -= 15; // Heavy penalty for single path
    }
    
    // Penalize if it looks like full ring (detect "A r r 0 1 1" repeated)
    const fullRingPattern = /A\s+\d+\.?\d*\s+\d+\.?\d*\s+0\s+1\s+1/g;
    const ringMatches = svg.match(fullRingPattern);
    if (ringMatches && ringMatches.length >= 2) {
      score -= 8; // Penalize full rings
    }
    
    // Reward if it has fill-rule="evenodd" and has 2+ subpaths
    if (svg.includes('fill-rule="evenodd"')) {
      score += 10; // Reward even-odd fill (negative space)
    }
    if (pathCount >= 2) {
      score += 8; // Reward multiple paths
    }
    if (pathCount >= 3) {
      score += 5; // Extra reward for 3+ paths
    }
    
    // Reward distinct silhouette (no circles, multiple paths)
    if (circleCount === 0 && pathCount >= 2) {
      score += 7;
    }
    
    return Math.max(0, score); // Ensure non-negative
  }

  // Generate 9 motif mark candidates: 3 from chosen family, 6 from adjacent families
  // Use primary color from actual palette
  const primaryColor = primary;
  const motifCandidates = [];
  
  // Derive variant from seed deterministically (0-5)
  const variantSeed = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const baseVariant = variantSeed % 6;
  
  console.log(`🎯 Motif settings: family=${motifFamily}, variant=${baseVariant}, use_fill=true, stroke_px=5`);
  
  // Get adjacent families (families that are visually/compositionally related)
  const allFamilies: Array<typeof motifFamily> = ["loop", "interlock", "orbit", "fold", "swap", "monogram-interlock"];
  const currentFamilyIndex = allFamilies.indexOf(motifFamily);
  const adjacentFamilies: Array<typeof motifFamily> = [];
  for (let i = 0; i < 6; i++) {
    const idx = (currentFamilyIndex + i + 1) % allFamilies.length;
    const family = allFamilies[idx];
    if (family && family !== motifFamily && !adjacentFamilies.includes(family)) {
      adjacentFamilies.push(family);
    }
  }
  
  // 3 candidates from chosen motif family (variants 0-2)
  for (let i = 0; i < 3; i++) {
    const candidateSeed = `${seed}-chosen-${i}`;
    const strokePx = 5; // Set to 5px for bolder marks
    const cornerRadiusPx = 3; // Set to 3px
    const variant = (baseVariant + i) % 6; // 0-5
    
    const candidate = generateMotifMark({
      brand_name: intake.brand_name,
      motif_family: motifFamily,
      seed: candidateSeed,
      grid: 24,
      stroke_px: strokePx,
      corner_radius_px: cornerRadiusPx,
      primary_hex: primaryColor,
      variant,
      use_fill: true, // Always use fill for premium marks
    });

    const svg = candidate.mark_svg;
    const score = scoreMotifCandidate(svg, motifFamily, strokePx);
    
    motifCandidates.push({
      result: candidate,
      family: motifFamily,
      stroke_px: strokePx,
      corner_radius_px: cornerRadiusPx,
      variant,
      use_fill: true,
      score,
    });
  }
  
  // 6 candidates from adjacent families
  for (let i = 0; i < 6; i++) {
    const family = adjacentFamilies[i % adjacentFamilies.length];
    if (!family) continue;
    
    const candidateSeed = `${seed}-adjacent-${i}`;
    const strokePx = 5; // Set to 5px for bolder marks
    const cornerRadiusPx = 3; // Set to 3px
    const variant = (baseVariant + i) % 6; // 0-5
    
    const candidate = generateMotifMark({
      brand_name: intake.brand_name,
      motif_family: family,
      seed: candidateSeed,
      grid: 24,
      stroke_px: strokePx,
      corner_radius_px: cornerRadiusPx,
      primary_hex: primaryColor,
      variant,
      use_fill: true, // Always use fill for premium marks
    });

    const svg = candidate.mark_svg;
    const score = scoreMotifCandidate(svg, family, strokePx);
    
    motifCandidates.push({
      result: candidate,
      family,
      stroke_px: strokePx,
      corner_radius_px: cornerRadiusPx,
      variant,
      use_fill: true,
      score,
    });
  }

  // Select best candidate
  const bestCandidate = motifCandidates.reduce((best, current) =>
    current.score > best.score ? current : best
  );
  
  console.log(`✅ Selected motif mark: family=${bestCandidate.family}, variant=${bestCandidate.variant}, use_fill=${bestCandidate.use_fill}, stroke_px=${bestCandidate.stroke_px}, score=${bestCandidate.score}`);
  console.log(`🔗 Lockups built from motif mark (not legacy circle badge)`);
  
  // Sanity assert: no <text> in mark
  if (bestCandidate.result.mark_svg.includes("<text")) {
    throw new Error("Selected motif mark contains <text> tag - must be path-only");
  }
  
  // Sanity assert: mark is not primarily circles
  const circleCount = (bestCandidate.result.mark_svg.match(/<circle/g) || []).length;
  if (circleCount > 0) {
    console.warn(`⚠️  Warning: Selected mark contains ${circleCount} circle(s) - should use tension-based geometry`);
  }
  
  const motifResult = bestCandidate.result;

  // Step 5: Build lockups from motif mark + wordmark
  console.log("🔗 Building lockups from motif mark + wordmark...");
  const lockups = buildLockupsFromSvgs({
    brand_name: intake.brand_name,
    wordmark_svg: wordmarkResult.logo_svg_wordmark,
    wordmark_metrics: wordmarkResult.wordmark_metrics,
    mark_svg: motifResult.mark_svg,
    palette_hex: paletteHexToUse,
    regen_seed: runSeed,
  });

  // Sanity asserts: no <text> in any logo outputs
  if (lockups.horizontal_svg.includes("<text") || lockups.stacked_svg.includes("<text") || lockups.mark_only_svg.includes("<text")) {
    throw new Error("Lockups contain <text> tag - must be path-only");
  }
  
  if (wordmarkResult.logo_svg_wordmark.includes("<text")) {
    throw new Error("Wordmark contains <text> tag - must be path-only");
  }
  
  if (motifResult.mark_svg.includes("<text")) {
    throw new Error("Motif mark contains <text> tag - must be path-only");
  }
  
  // Sanity assert: motif mark is not primarily circles
  const markCircleCount = (motifResult.mark_svg.match(/<circle/g) || []).length;
  if (markCircleCount > 0) {
    console.warn(`⚠️  Warning: Motif mark contains ${markCircleCount} circle(s) - should use tension-based geometry`);
  }
  
  // Check for circles in lockups (should not be present unless motif explicitly needs them)
  const horizontalCircleCount = (lockups.horizontal_svg.match(/<circle/g) || []).length;
  const stackedCircleCount = (lockups.stacked_svg.match(/<circle/g) || []).length;
  if (horizontalCircleCount > 0 || stackedCircleCount > 0) {
    console.warn(`⚠️  Warning: Lockups contain ${horizontalCircleCount + stackedCircleCount} circle(s) - may indicate legacy badge mark`);
  }

  // Step 6: Build template previews using the same palette/fonts + motif mark
  console.log("📄 Building template previews...");
  const templates = buildTemplatePreviews({
    palette: executorOutput.palette,
    fonts: executorOutput.fonts,
    direction_keywords: chosen_direction.keywords,
    brand_name: intake.brand_name,
    logo_svg_mark: motifResult.mark_svg,
  });

  const finalKit: FinalKit = {
    logo_svg_wordmark: wordmarkResult.logo_svg_wordmark,
    logo_svg_mark: motifResult.mark_svg,
    palette: executorOutput.palette,
    fonts: executorOutput.fonts,
    templates,
    logo_lockups: {
      horizontal_svg: lockups.horizontal_svg,
      stacked_svg: lockups.stacked_svg,
      mark_only_svg: lockups.mark_only_svg,
    },
    construction: {
      grid: 24,
      stroke_px: bestCandidate.stroke_px,
      corner_radius_px: bestCandidate.corner_radius_px,
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
