/**
 * Wordmark variants: 12 variants by small deltas (tracking, weight, fontSize scale), evaluator ranked.
 */

import { z } from "zod";
import { runWordmarkEngine, type WordmarkEngineInput, type WordmarkEngineOutput } from "./wordmarkEngine.tool";
import {
  runWordmarkEvaluator,
  WordmarkEvaluatorOutputSchema,
  type WordmarkEvaluatorOutput,
} from "./wordmarkEvaluator.tool";

export const WordmarkVariantsInputSchema = z.object({
  text: z.string().min(1),
  fontFamily: z.string().min(1).default("Inter"),
  fontWeight: z.number().min(100).max(900).default(400),
  fontStyle: z.string().optional().default("normal"),
  fontUrl: z.string().url().optional(),
  fontDataBase64: z.string().optional(),
  fontSize: z.number().min(1).max(500).default(64),
  tracking: z.number().min(-200).max(200).default(0),
  seed: z.string().min(1),
  routeId: z.string().optional(),
});

export type WordmarkVariantsInput = z.infer<typeof WordmarkVariantsInputSchema>;

export const WordmarkVariantItemSchema = z.object({
  svg: z.string(),
  paths: z.array(z.object({ d: z.string(), bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }) })),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  metrics: z.object({ pathCount: z.number(), commandCount: z.number(), advanceWidth: z.number() }),
  settingsApplied: z.object({ fontFamily: z.string(), fontWeight: z.number(), fontSize: z.number(), tracking: z.number(), kerning: z.boolean() }),
  evaluation: WordmarkEvaluatorOutputSchema,
  variantIndex: z.number(),
});

export const WordmarkVariantsOutputSchema = z.object({
  variants: z.array(WordmarkVariantItemSchema),
  bestIndex: z.number(),
});

export type WordmarkVariantsOutput = z.infer<typeof WordmarkVariantsOutputSchema>;

// 12 deterministic variant param sets: (trackingDelta, fontSizeScale, fontWeight)
const VARIANT_PARAMS: [number, number, number][] = [
  [-15, 1, 400], [-5, 1, 400], [0, 1, 400], [10, 1, 400],
  [-10, 0.98, 500], [5, 1.02, 500], [15, 1, 600],
  [-5, 1, 700], [0, 0.98, 700], [10, 1, 700], [20, 1.02, 700],
  [0, 1, 400],
];

/**
 * Generate 12 variants by varying tracking, weight, and fontSize scale (deterministic from seed).
 */
export async function runWordmarkVariants(input: WordmarkVariantsInput): Promise<WordmarkVariantsOutput> {
  const variants: (WordmarkEngineOutput & { evaluation: WordmarkEvaluatorOutput; variantIndex: number })[] = [];

  for (let i = 0; i < Math.min(12, VARIANT_PARAMS.length); i++) {
    const [trackingDelta, fontSizeScale, weight] = VARIANT_PARAMS[i]!;
    const engineInput: WordmarkEngineInput = {
      text: input.text,
      fontFamily: input.fontFamily,
      fontWeight: weight,
      fontStyle: input.fontStyle ?? "normal",
      fontUrl: input.fontUrl,
      fontDataBase64: input.fontDataBase64,
      fontSize: Math.round(input.fontSize * fontSizeScale),
      tracking: input.tracking + trackingDelta,
      seed: input.seed,
      routeId: input.routeId,
      fill: "currentColor",
    };

    let out: WordmarkEngineOutput;
    try {
      out = await runWordmarkEngine(engineInput);
    } catch {
      continue;
    }

    const advances = out.paths.length >= 2
      ? out.paths.map((p, idx) => (idx < out.paths.length - 1 ? out.paths[idx + 1]!.bbox.x - p.bbox.x : p.bbox.w))
      : [];
    const evaluation = runWordmarkEvaluator({
      paths: out.paths,
      bbox: out.bbox,
      metrics: out.metrics,
      advances,
    });

    variants.push({
      ...out,
      evaluation,
      variantIndex: i,
    });
  }

  if (variants.length === 0) {
    const fallback = await runWordmarkEngine({
      text: input.text,
      fontFamily: input.fontFamily,
      fontWeight: input.fontWeight,
      fontStyle: input.fontStyle ?? "normal",
      fontSize: input.fontSize,
      tracking: input.tracking,
      fill: "currentColor",
    });
    const ev = runWordmarkEvaluator({
      paths: fallback.paths,
      bbox: fallback.bbox,
      metrics: fallback.metrics,
    });
    return {
      variants: [{ ...fallback, evaluation: ev, variantIndex: 0 }],
      bestIndex: 0,
    };
  }

  variants.sort((a, b) => b.evaluation.totalScore - a.evaluation.totalScore);
  const bestIndex = 0;

  return {
    variants,
    bestIndex,
  };
}
