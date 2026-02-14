/**
 * Wordmark evaluator: legibility, weight, distinctiveness proxy, spacing consistency.
 * Output: totalScore, breakdown, flags[].
 */

import { z } from "zod";

export const WordmarkEvaluatorInputSchema = z.object({
  svg: z.string().optional(),
  paths: z
    .array(
      z.object({
        d: z.string(),
        bbox: z.object({
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
        }),
      }),
    )
    .optional(),
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  metrics: z
    .object({
      pathCount: z.number().optional(),
      commandCount: z.number().optional(),
      advanceWidth: z.number().optional(),
    })
    .optional(),
  advances: z.array(z.number()).optional(),
});

export type WordmarkEvaluatorInput = z.infer<typeof WordmarkEvaluatorInputSchema>;

export const WordmarkEvaluatorOutputSchema = z.object({
  totalScore: z.number(),
  breakdown: z.object({
    legibility: z.number(),
    weight: z.number(),
    distinctiveness: z.number(),
    spacingConsistency: z.number(),
  }),
  flags: z.array(z.string()),
});

export type WordmarkEvaluatorOutput = z.infer<typeof WordmarkEvaluatorOutputSchema>;

function pathArea(d: string): number {
  const nums = d.match(/-?[\d.]+/g);
  if (!nums || nums.length < 4) return 0;
  let area = 0;
  let i = 0;
  let x0 = 0,
    y0 = 0;
  const n = nums.length;
  while (i < n - 1) {
    const x = parseFloat(nums[i]!);
    const y = parseFloat(nums[i + 1]!);
    if (i >= 2) area += (x0 * y - x * y0) / 2;
    x0 = x;
    y0 = y;
    i += 2;
  }
  return Math.abs(area);
}

function pathCommandCount(d: string): number {
  return (d.match(/[MLCQAZ]/gi) || []).length;
}

/**
 * Compute simple scores: legibility (bbox coverage + min counter size), weight (area ratio),
 * distinctiveness (node count band + aspect ratio), spacing consistency (stddev of advances).
 */
export function runWordmarkEvaluator(input: WordmarkEvaluatorInput): WordmarkEvaluatorOutput {
  const { bbox, paths = [], metrics, advances = [] } = input;
  const flags: string[] = [];

  const bboxArea = bbox.w * bbox.h;
  const pathCount = paths.length > 0 ? paths.length : (metrics?.pathCount ?? 0);
  const commandCount = metrics?.commandCount ?? paths.reduce((acc, p) => acc + pathCommandCount(p.d), 0);

  let totalArea = 0;
  let minCounterSize = bbox.w;
  for (const p of paths) {
    const a = pathArea(p.d);
    totalArea += a;
    if (p.bbox.w > 0 && p.bbox.h > 0 && p.bbox.w < minCounterSize) minCounterSize = p.bbox.w;
    if (p.bbox.h > 0 && p.bbox.h < minCounterSize) minCounterSize = p.bbox.h;
  }
  if (bboxArea <= 0) minCounterSize = 0;

  const legibilityBbox = bboxArea > 0 ? Math.min(100, (totalArea / bboxArea) * 80) : 0;
  const legibilityCounter = bbox.w > 0 ? Math.min(100, (minCounterSize / bbox.w) * 150) : 0;
  const legibility = Math.min(100, (legibilityBbox + legibilityCounter) / 2);
  if (pathCount < 2) flags.push("low_path_count");
  if (minCounterSize < bbox.w * 0.02) flags.push("tiny_counters");

  const weight = bboxArea > 0 ? Math.min(100, (totalArea / bboxArea) * 120) : 0;
  if (weight < 20) flags.push("too_light");
  if (weight > 95) flags.push("very_heavy");

  const aspectRatio = bbox.h > 0 ? bbox.w / bbox.h : 1;
  const nodeBand = commandCount < 30 ? 0 : commandCount < 100 ? 50 : Math.min(100, commandCount / 5);
  const aspectScore = aspectRatio >= 1 && aspectRatio <= 20 ? 100 : aspectRatio < 1 ? 50 : Math.max(0, 100 - aspectRatio);
  const distinctiveness = Math.min(100, (nodeBand + aspectScore) / 2);
  if (commandCount < 30) flags.push("low_detail");

  let spacingConsistency = 100;
  if (advances.length >= 2) {
    const mean = advances.reduce((a, b) => a + b, 0) / advances.length;
    const variance = advances.reduce((acc, v) => acc + (v - mean) ** 2, 0) / advances.length;
    const stddev = Math.sqrt(variance);
    spacingConsistency = mean > 0 ? Math.max(0, 100 - (stddev / mean) * 200) : 100;
    if (spacingConsistency < 50) flags.push("inconsistent_spacing");
  }

  const totalScore =
    legibility * 0.35 + weight * 0.2 + distinctiveness * 0.25 + spacingConsistency * 0.2;

  return {
    totalScore: Math.round(Math.min(100, Math.max(0, totalScore)) * 10) / 10,
    breakdown: {
      legibility: Math.round(legibility * 10) / 10,
      weight: Math.round(weight * 10) / 10,
      distinctiveness: Math.round(distinctiveness * 10) / 10,
      spacingConsistency: Math.round(spacingConsistency * 10) / 10,
    },
    flags,
  };
}
