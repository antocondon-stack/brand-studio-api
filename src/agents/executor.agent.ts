import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  FinalKitSchema,
  type FinalKit,
  type FinalizeRequest,
  type LogoConcept,
} from "../schemas";
import { buildWordmarkSvg, buildWordmarkFromVariants } from "../tools/deterministicSvg.tool";
import {
  generateMotifMark,
  scoreMotifDistinctiveness,
} from "../tools/motifMark.tool";
import { buildTemplatePreviews } from "../tools/templatePreview.tool";
import { buildLockupsFromSvgs } from "../tools/lockupsFromSvgs.tool";
import type { CDConstraints, ComparativeCritique } from "../schemas";
import {
  scoreLogoCandidate,
  passesQualityGate,
  pickBest,
  type LogoCandidate,
  type RankedCandidate,
} from "../evals/logoQualityGate";
import { normalizeSvgNumbers } from "../utils/svgUtils";
import { runWordmarkVariants } from "../tools/wordmarkVariants.tool";

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
  cdConstraints?: CDConstraints,
  executionDirectives?: ComparativeCritique["execution_directives"],
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

  // Step 3: Map executor fonts to available fonts
  console.log("🔤 Mapping executor fonts to available fonts...");
  const fontToPathModule = require("../tools/fontToPath.tool");
  const availableFonts = fontToPathModule.ensureGoogleFontsIndex();
  const availableFontFamilies = new Set(availableFonts.map((f: { family: string }) => f.family.toLowerCase()));
  
  const preferredFonts = [
    "spacegrotesk", "intertight", "plusjakartasans", "archivo", 
    "leaguespartan", "bebasneue", "montserratalternates", "inter", "dmserifdisplay"
  ];
  
  // Map font names to display names (Google Fonts resolver handles normalization internally)
  const fontDisplayNames: Record<string, string> = {
    "spacegrotesk": "Space Grotesk",
    "intertight": "Inter Tight",
    "plusjakartasans": "Plus Jakarta Sans",
    "archivo": "Archivo",
    "leaguespartan": "League Spartan",
    "bebasneue": "Bebas Neue",
    "montserratalternates": "Montserrat Alternates",
    "inter": "Inter",
    "dmserifdisplay": "DM Serif Display",
  };
  
  const mappedFonts = executorOutput.fonts.map(font => {
    const requestedFamily = font.family.toLowerCase().replace(/\s+/g, "");
    if (availableFontFamilies.has(requestedFamily)) {
      // Use display name if available, otherwise keep original
      const displayName = fontDisplayNames[requestedFamily] ?? font.family;
      return { ...font, family: displayName };
    }
    
    // Find best match from preferred fonts
    for (const preferred of preferredFonts) {
      if (availableFontFamilies.has(preferred)) {
        const displayName = fontDisplayNames[preferred] ?? preferred;
        console.log(`   Mapping "${font.family}" -> "${displayName}"`);
        return { ...font, family: displayName };
      }
    }
    
    // Fallback to first available font
    if (availableFonts.length > 0) {
      const fallback = availableFonts[0]!;
      const displayName = fontDisplayNames[fallback.family.toLowerCase()] ?? fallback.family;
      console.log(`   Mapping "${font.family}" -> "${displayName}" (fallback)`);
      return { ...font, family: displayName };
    }
    
    return font;
  });

  // Step 4: Generate wordmark variants (12 candidates)
  console.log("📝 Generating wordmark variants...");
  const wordmarkFontFamily = mappedFonts[0]?.family ?? "Space Grotesk";
  const wordmarkVariantsInput = {
    text: intake.brand_name,
    fontFamily: wordmarkFontFamily,
    fontWeight: 700,
    fontStyle: "normal" as const,
    fontSize: 64,
    tracking: 0,
    seed: runSeed ?? `${intake.brand_name}-${chosen_direction.name}`,
  };
  const wordmarkVariantsResult = await runWordmarkVariants(wordmarkVariantsInput);
  const topWordmarkVariants = wordmarkVariantsResult.variants.slice(0, 4); // Top 4

  // Step 5: Generate motif mark candidates (12 candidates) and select best
  console.log("🎯 Generating motif mark candidates (12 variants)...");

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

  let motifFamily: "loop" | "interlock" | "orbit" | "fold" | "swap" | "monogram-interlock" = "loop"; // Default fallback
  
  // Priority: execution_directives > selectedConcept > cdConstraints > chosen_direction
  if (executionDirectives?.motif_family && supportedMotifFamilies.includes(executionDirectives.motif_family as typeof motifFamily)) {
    motifFamily = executionDirectives.motif_family as typeof motifFamily;
    console.log(`✅ Using execution directive motif: ${motifFamily}`);
  } else if (selectedConcept && supportedMotifFamilies.includes(selectedConcept.motif_family as typeof motifFamily)) {
    motifFamily = selectedConcept.motif_family as typeof motifFamily;
    console.log(`✅ Using selected concept motif: ${motifFamily}`);
  } else if (cdConstraints?.motif_family_priority?.length) {
    const priorityFamily = cdConstraints.motif_family_priority.find((f) =>
      supportedMotifFamilies.includes(f as typeof motifFamily),
    );
    if (priorityFamily) {
      motifFamily = priorityFamily as typeof motifFamily;
      console.log(`✅ Using CD constraint motif priority: ${motifFamily}`);
    }
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

  // Helper function to score motif candidates deterministically (respects constraints)
  function scoreMotifCandidate(svg: string, family: typeof motifFamily, strokePx: number): number {
    let score = 10;
    
    // Penalize if SVG contains "<circle" (especially if banned)
    const circleCount = (svg.match(/<circle/g) || []).length;
    if (circleCount > 0) {
      score -= banCircles ? 20 : 10; // Heavy penalty if banned, otherwise moderate
    }
    
    // Penalize full rings if banned
    if (banFullRings) {
      const fullRingPattern = /A\s+\d+\.?\d*\s+\d+\.?\d*\s+0\s+1\s+1/g;
      const ringMatches = svg.match(fullRingPattern);
      if (ringMatches && ringMatches.length >= 2) {
        score -= 15; // Heavy penalty for full rings when banned
      }
    }
    
    // Penalize concentric rings if banned
    if (banConcentricRings) {
      const arcCount = (svg.match(/A\s+\d+\.?\d*\s+\d+\.?\d*/g) || []).length;
      if (arcCount >= 4) {
        score -= 10; // Penalty for concentric patterns
      }
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

  // Generate 12 motif mark candidates with variation
  const primaryColor = primary;
  const motifCandidates: Array<{
    result: { mark_svg: string; construction: { grid: number; stroke_px: number; corner_radius_px: number } };
    family: typeof motifFamily;
    stroke_px: number;
    corner_radius_px: number;
    variant: number;
    use_fill: boolean;
    score: number;
  }> = [];
  
  const variantSeed = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const baseVariant = variantSeed % 6;
  const variantTargets = executionDirectives?.variant_targets?.length
    ? executionDirectives.variant_targets
    : [baseVariant, (baseVariant + 1) % 6, (baseVariant + 2) % 6];
  
  const geometryAdjustments = executionDirectives?.geometry_adjustments ?? [];
  const banCircles = cdConstraints?.must_avoid.single_badge_circle ?? false;
  const banFullRings = cdConstraints?.must_avoid.full_rings ?? false;
  const banConcentricRings = cdConstraints?.must_avoid.concentric_rings ?? false;
  
  console.log(`🎯 Generating 12 mark candidates: family=${motifFamily}, variants=[${variantTargets.join(",")}]`);
  
  const allFamilies: Array<"loop" | "interlock" | "orbit" | "fold" | "swap" | "monogram-interlock"> = 
    ["loop", "interlock", "orbit", "fold", "swap", "monogram-interlock"];
  
  // Generate 12 candidates: vary family, variant, stroke, corner radius, use_fill
  const candidateConfigs: Array<{
    family: typeof motifFamily;
    variant: number;
    strokePx: number;
    cornerRadiusPx: number;
    useFill: boolean;
  }> = [];
  
  // 4 from chosen family with variations
  for (let i = 0; i < 4; i++) {
    candidateConfigs.push({
      family: motifFamily,
      variant: variantTargets[i % variantTargets.length] ?? (baseVariant + i) % 6,
      strokePx: i < 2 ? 5 : 3,
      cornerRadiusPx: i % 2 === 0 ? 3 : 0,
      useFill: true,
    });
  }
  
  // 8 from other families
  const otherFamilies = allFamilies.filter((f): f is typeof motifFamily => f !== motifFamily);
  for (let i = 0; i < 8; i++) {
    const family = otherFamilies[i % otherFamilies.length]!;
    candidateConfigs.push({
      family,
      variant: (baseVariant + i) % 6,
      strokePx: i < 4 ? 5 : (i < 6 ? 4 : 2),
      cornerRadiusPx: i % 3 === 0 ? 3 : (i % 3 === 1 ? 2 : 0),
      useFill: i < 6,
    });
  }
  
  // Generate all 12 mark candidates
  for (let i = 0; i < candidateConfigs.length; i++) {
    const config = candidateConfigs[i]!;
    const candidateSeed = `${seed}-mark-${i}`;
    
    const candidate = generateMotifMark({
      brand_name: intake.brand_name,
      motif_family: config.family,
      seed: candidateSeed,
      grid: 24,
      stroke_px: config.strokePx,
      corner_radius_px: config.cornerRadiusPx,
      primary_hex: primaryColor,
      variant: config.variant,
      use_fill: config.useFill,
    });

    const svg = normalizeSvgNumbers(candidate.mark_svg);
    const score = scoreMotifCandidate(svg, config.family, config.strokePx);
    
    motifCandidates.push({
      result: { ...candidate, mark_svg: svg },
      family: config.family,
      stroke_px: config.strokePx,
      corner_radius_px: config.cornerRadiusPx,
      variant: config.variant,
      use_fill: config.useFill,
      score,
    });
  }

  // Select top 4 mark candidates
  const topMarkCandidates = [...motifCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  
  console.log(`✅ Top 4 mark candidates selected`);
  
  // Step 6: Build combined logo candidates (top 4 wordmarks × top 4 marks = 16 candidates)
  console.log("🎨 Building combined logo candidates (16 total)...");
  const logoCandidates: LogoCandidate[] = [];
  
  for (const wordmarkVariant of topWordmarkVariants) {
    for (const markCandidate of topMarkCandidates) {
      const wordmarkSvg = normalizeSvgNumbers(wordmarkVariant.svg);
      const markSvg = markCandidate.result.mark_svg;
      
      // Build lockups
      const lockups = buildLockupsFromSvgs({
        brand_name: intake.brand_name,
        wordmark_svg: wordmarkSvg,
        wordmark_metrics: {
          viewBox: `0 0 ${wordmarkVariant.bbox.w} ${wordmarkVariant.bbox.h}`,
          width: wordmarkVariant.bbox.w,
          height: wordmarkVariant.bbox.h,
          centerX: wordmarkVariant.bbox.x + wordmarkVariant.bbox.w / 2,
          centerY: wordmarkVariant.bbox.y + wordmarkVariant.bbox.h / 2,
          path_d: wordmarkVariant.paths.map(p => p.d).join(" "),
          primary_color: primary,
        },
        mark_svg: markSvg,
        palette_hex: paletteHexToUse,
        regen_seed: runSeed,
      });
      
      logoCandidates.push({
        markSvg,
        wordmarkSvg,
        horizontal: normalizeSvgNumbers(lockups.horizontal_svg),
        stacked: normalizeSvgNumbers(lockups.stacked_svg),
        metadata: {
          markFamily: markCandidate.family,
          markVariant: markCandidate.variant,
          wordmarkFontFamily: wordmarkVariant.settingsApplied.fontFamily,
          wordmarkWeight: wordmarkVariant.settingsApplied.fontWeight,
          wordmarkTracking: wordmarkVariant.settingsApplied.tracking,
        },
      });
    }
  }
  
  // Step 7: Score candidates with quality gate
  console.log("📊 Scoring logo candidates with quality gate...");
  const directionKeywords = chosen_direction.keywords;
  const rankedCandidates: RankedCandidate[] = logoCandidates.map(candidate => ({
    candidate,
    score: scoreLogoCandidate(candidate, directionKeywords),
  }));
  
  const { best: bestRanked } = pickBest(rankedCandidates);
  const bestCandidate = bestRanked.candidate;
  const bestScore = bestRanked.score;
  
  console.log(`📊 Best candidate score: ${bestScore.total.toFixed(2)} (legibility: ${bestScore.breakdown.legibility.toFixed(1)}, ownability: ${bestScore.breakdown.ownability.toFixed(1)}, boldness: ${bestScore.breakdown.boldness.toFixed(1)}, coherence: ${bestScore.breakdown.coherence.toFixed(1)}, craft: ${bestScore.breakdown.craft.toFixed(1)})`);
  
  // Step 8: Quality gate with retry logic
  let finalCandidate = bestCandidate;
  let finalScore = bestScore;
  let retryCount = 0;
  const maxRetries = 2;
  
  while (!passesQualityGate(finalScore) && retryCount < maxRetries) {
    retryCount++;
    console.log(`⚠️  Quality gate failed (total: ${finalScore.total.toFixed(2)}, legibility: ${finalScore.breakdown.legibility.toFixed(1)}, ownability: ${finalScore.breakdown.ownability.toFixed(1)}). Retry ${retryCount}/${maxRetries}...`);
    
    // Retry 1: Force use_fill=true, increase stroke, switch to interlock/fold
    if (retryCount === 1) {
      const retryFamilies = directionKeywords.some(k => /interlock|connect/i.test(k)) 
        ? ["interlock"] 
        : directionKeywords.some(k => /fold|crease/i.test(k))
        ? ["fold"]
        : ["interlock", "fold"];
      
      const retryCandidates: LogoCandidate[] = [];
      for (const wordmarkVariant of topWordmarkVariants.slice(0, 2)) {
        for (const retryFamily of retryFamilies) {
          const retrySeed = `${seed}-retry1-${retryFamily}`;
          const retryMark = generateMotifMark({
            brand_name: intake.brand_name,
            motif_family: retryFamily as typeof motifFamily,
            seed: retrySeed,
            grid: 24,
            stroke_px: 6,
            corner_radius_px: 3,
            primary_hex: primaryColor,
            variant: baseVariant,
            use_fill: true,
          });
          
          const wordmarkSvg = normalizeSvgNumbers(wordmarkVariant.svg);
          const markSvg = normalizeSvgNumbers(retryMark.mark_svg);
          
          const lockups = buildLockupsFromSvgs({
            brand_name: intake.brand_name,
            wordmark_svg: wordmarkSvg,
            wordmark_metrics: {
              viewBox: `0 0 ${wordmarkVariant.bbox.w} ${wordmarkVariant.bbox.h}`,
              width: wordmarkVariant.bbox.w,
              height: wordmarkVariant.bbox.h,
              centerX: wordmarkVariant.bbox.x + wordmarkVariant.bbox.w / 2,
              centerY: wordmarkVariant.bbox.y + wordmarkVariant.bbox.h / 2,
              path_d: wordmarkVariant.paths.map(p => p.d).join(" "),
              primary_color: primary,
            },
            mark_svg: markSvg,
            palette_hex: paletteHexToUse,
            regen_seed: runSeed,
          });
          
          retryCandidates.push({
            markSvg,
            wordmarkSvg,
            horizontal: normalizeSvgNumbers(lockups.horizontal_svg),
            stacked: normalizeSvgNumbers(lockups.stacked_svg),
            metadata: {
              markFamily: retryFamily,
              markVariant: baseVariant,
              wordmarkFontFamily: wordmarkVariant.settingsApplied.fontFamily,
              wordmarkWeight: wordmarkVariant.settingsApplied.fontWeight,
              wordmarkTracking: wordmarkVariant.settingsApplied.tracking,
            },
          });
        }
      }
      
      const retryRanked = retryCandidates.map(c => ({
        candidate: c,
        score: scoreLogoCandidate(c, directionKeywords),
      }));
      const retryBest = pickBest(retryRanked).best;
      if (retryBest.score.total > finalScore.total) {
        finalCandidate = retryBest.candidate;
        finalScore = retryBest.score;
      }
    }
    
    // Retry 2: Monogram-interlock if brand has distinct initials, force weight 800
    if (retryCount === 2 && !passesQualityGate(finalScore)) {
      const initials = intake.brand_name.split(" ").map(w => w[0]).filter(Boolean).join("").toUpperCase();
      if (initials.length >= 2) {
        const monogramMark = generateMotifMark({
          brand_name: intake.brand_name,
          motif_family: "monogram-interlock",
          seed: `${seed}-retry2-monogram`,
          grid: 24,
          stroke_px: 5,
          corner_radius_px: 3,
          primary_hex: primaryColor,
          variant: 0,
          use_fill: true,
        });
        
        // Use heaviest wordmark variant
        const heaviestWordmark = topWordmarkVariants
          .sort((a, b) => (b.settingsApplied.fontWeight ?? 400) - (a.settingsApplied.fontWeight ?? 400))[0]!;
        
        const wordmarkSvg = normalizeSvgNumbers(heaviestWordmark.svg);
        const markSvg = normalizeSvgNumbers(monogramMark.mark_svg);
        
        const lockups = buildLockupsFromSvgs({
          brand_name: intake.brand_name,
          wordmark_svg: wordmarkSvg,
          wordmark_metrics: {
            viewBox: `0 0 ${heaviestWordmark.bbox.w} ${heaviestWordmark.bbox.h}`,
            width: heaviestWordmark.bbox.w,
            height: heaviestWordmark.bbox.h,
            centerX: heaviestWordmark.bbox.x + heaviestWordmark.bbox.w / 2,
            centerY: heaviestWordmark.bbox.y + heaviestWordmark.bbox.h / 2,
            path_d: heaviestWordmark.paths.map(p => p.d).join(" "),
            primary_color: primary,
          },
          mark_svg: markSvg,
          palette_hex: paletteHexToUse,
          regen_seed: runSeed,
        });
        
        const monogramCandidate: LogoCandidate = {
          markSvg,
          wordmarkSvg,
          horizontal: normalizeSvgNumbers(lockups.horizontal_svg),
          stacked: normalizeSvgNumbers(lockups.stacked_svg),
          metadata: {
            markFamily: "monogram-interlock",
            markVariant: 0,
            wordmarkFontFamily: heaviestWordmark.settingsApplied.fontFamily,
            wordmarkWeight: heaviestWordmark.settingsApplied.fontWeight,
            wordmarkTracking: 0,
          },
        };
        
        const monogramScore = scoreLogoCandidate(monogramCandidate, directionKeywords);
        if (monogramScore.total > finalScore.total) {
          finalCandidate = monogramCandidate;
          finalScore = monogramScore;
        }
      }
    }
  }
  
  if (!passesQualityGate(finalScore)) {
    console.warn(`⚠️  Quality gate still failed after ${retryCount} retries. Using best available candidate.`);
    console.warn(`   Failures: ${finalScore.failures.join("; ")}`);
  } else {
    console.log(`✅ Quality gate passed!`);
  }
  
  const motifResult = {
    mark_svg: finalCandidate.markSvg,
    construction: {
      grid: 24,
      stroke_px: 5,
      corner_radius_px: 3,
    },
  };

  // Lockups already built in quality gate step
  const lockups = {
    horizontal_svg: finalCandidate.horizontal ?? "",
    stacked_svg: finalCandidate.stacked ?? "",
    mark_only_svg: motifResult.mark_svg,
  };

  // Sanity asserts: no <text> in any logo outputs
  if (lockups.horizontal_svg.includes("<text") || lockups.stacked_svg.includes("<text") || lockups.mark_only_svg.includes("<text")) {
    throw new Error("Lockups contain <text> tag - must be path-only");
  }
  
  if (finalCandidate.wordmarkSvg.includes("<text")) {
    throw new Error("Wordmark contains <text> tag - must be path-only");
  }
  
  if (finalCandidate.markSvg.includes("<text")) {
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
    logo_svg_wordmark: finalCandidate.wordmarkSvg,
    logo_svg_mark: finalCandidate.markSvg,
    palette: executorOutput.palette,
    fonts: mappedFonts,
    templates,
    logo_lockups: {
      horizontal_svg: lockups.horizontal_svg,
      stacked_svg: lockups.stacked_svg,
      mark_only_svg: lockups.mark_only_svg,
    },
    construction: {
      grid: 24,
      stroke_px: 5,
      corner_radius_px: 3,
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
  
  // Add wordmark metadata from best variant
  const bestWordmarkVariant = topWordmarkVariants[0];
  if (bestWordmarkVariant) {
    finalKit.wordmark_metadata = {
      fontFamily: bestWordmarkVariant.settingsApplied.fontFamily,
      fontWeight: bestWordmarkVariant.settingsApplied.fontWeight,
      seed: runSeed ?? `${intake.brand_name}-${chosen_direction.name}`,
      settingsApplied: {
        fontFamily: bestWordmarkVariant.settingsApplied.fontFamily,
        fontWeight: bestWordmarkVariant.settingsApplied.fontWeight,
        fontSize: bestWordmarkVariant.settingsApplied.fontSize,
        tracking: bestWordmarkVariant.settingsApplied.tracking,
        kerning: bestWordmarkVariant.settingsApplied.kerning,
      },
      scoreBreakdown: bestWordmarkVariant.evaluation.breakdown,
    };
  }

  return FinalKitSchema.parse(finalKit);
}
