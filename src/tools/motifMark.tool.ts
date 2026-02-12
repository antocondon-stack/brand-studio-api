import { z } from "zod";
import { tool } from "@openai/agents";
import { textToPath } from "./fontToPath.tool";

const MotifFamilyEnum = z.enum([
  "loop",
  "interlock",
  "orbit",
  "fold",
  "swap",
  "monogram-interlock",
]);

export const MotifMarkInputSchema = z.object({
  brand_name: z.string().min(1),
  motif_family: MotifFamilyEnum,
  seed: z.string(),
  grid: z.number().min(8).max(64).default(24),
  stroke_px: z.number().min(0.5).max(8).default(2),
  corner_radius_px: z.number().min(0).max(8).default(2),
  primary_hex: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Expected hex color"),
});

export const MotifMarkOutputSchema = z.object({
  mark_svg: z.string().min(1),
  construction: z.object({
    grid: z.number(),
    stroke_px: z.number(),
    corner_radius_px: z.number(),
  }),
});

export type MotifMarkInput = z.infer<typeof MotifMarkInputSchema>;
export type MotifMarkOutput = z.infer<typeof MotifMarkOutputSchema>;

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Rounded rect as path (stroke centerline); negative space emphasis */
function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  if (r <= 0) return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  const r2 = Math.min(r, w / 2, h / 2);
  return `M ${x + r2} ${y} L ${x + w - r2} ${y} Q ${x + w} ${y} ${x + w} ${y + r2} L ${x + w} ${y + h - r2} Q ${x + w} ${y + h} ${x + w - r2} ${y + h} L ${x + r2} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r2} L ${x} ${y + r2} Q ${x} ${y} ${x + r2} ${y} Z`;
}

/** Loop: continuous ribbon loop; no endpoints; single closed path */
function buildLoop(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
): string {
  const c = grid / 2;
  const r = grid * 0.32;
  const r2 = grid * 0.2;
  if (variation === 0) {
    return `M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}`;
  }
  if (variation === 1) {
    return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`;
  }
  if (variation === 2) {
    return `M ${c - r2} ${c - r2} A ${r2} ${r2} 0 1 1 ${c + r2} ${c - r2} A ${r2} ${r2} 0 1 1 ${c + r2} ${c + r2} A ${r2} ${r2} 0 1 1 ${c - r2} ${c + r2} A ${r2} ${r2} 0 1 1 ${c - r2} ${c - r2}`;
  }
  return `M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}`;
}

/** Interlock: two shapes sharing negative space */
function buildInterlock(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
): string {
  const c = grid / 2;
  const r = grid * 0.22;
  const paths: string[] = [];
  if (variation === 0) {
    paths.push(`M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}`);
    paths.push(`M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`);
  } else if (variation === 1) {
    const s = grid * 0.28;
    paths.push(`M ${c - s} ${c - s} L ${c + s} ${c - s} L ${c + s} ${c + s} L ${c - s} ${c + s} Z`);
    paths.push(`M ${c - s} ${c} L ${c} ${c - s} L ${c + s} ${c} L ${c} ${c + s} Z`);
  } else {
    const a = (Math.PI * 2) / 3;
    paths.push(
      `M ${c + r * Math.cos(0)} ${c + r * Math.sin(0)} A ${r} ${r} 0 1 1 ${c + r * Math.cos(a)} ${c + r * Math.sin(a)} A ${r} ${r} 0 1 1 ${c + r * Math.cos(2 * a)} ${c + r * Math.sin(2 * a)} Z`,
    );
  }
  return paths.join(" ");
}

/** Orbit: offset arcs suggesting motion; strong 1-color silhouette */
function buildOrbit(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
): string {
  const c = grid / 2;
  const r1 = grid * 0.38;
  const r2 = grid * 0.26;
  const r3 = grid * 0.14;
  const paths: string[] = [];
  paths.push(`M ${c} ${c - r1} A ${r1} ${r1} 0 1 1 ${c} ${c + r1} A ${r1} ${r1} 0 1 1 ${c} ${c - r1}`);
  paths.push(`M ${c} ${c - r2} A ${r2} ${r2} 0 1 0 ${c} ${c + r2} A ${r2} ${r2} 0 1 0 ${c} ${c - r2}`);
  paths.push(`M ${c} ${c - r3} A ${r3} ${r3} 0 1 1 ${c} ${c + r3} A ${r3} ${r3} 0 1 1 ${c} ${c - r3}`);
  return paths.join(" ");
}

/** Fold: shape folds back on itself; exchange tension */
function buildFold(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
): string {
  const c = grid / 2;
  const s = grid * 0.38;
  if (variation === 0) {
    return `M ${c} ${c - s} L ${c - s} ${c + s} L ${c + s} ${c + s} Z`;
  }
  if (variation === 1) {
    return `M ${c} ${c - s} L ${c - s} ${c} L ${c} ${c + s} L ${c + s} ${c} Z`;
  }
  return `M ${c - s} ${c - s} L ${c} ${c} L ${c - s} ${c + s} Z M ${c + s} ${c - s} L ${c} ${c} L ${c + s} ${c + s} Z`;
}

/** Swap: abstract swap logic; no literal arrows */
function buildSwap(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
): string {
  const c = grid / 2;
  const b = grid * 0.2;
  const paths: string[] = [];
  if (variation === 0) {
    paths.push(roundedRectPath(c - b * 2, c - b * 2, b, b, cornerRadiusPx));
    paths.push(roundedRectPath(c + b, c + b, b, b, cornerRadiusPx));
  } else if (variation === 1) {
    paths.push(`M ${c - b * 1.5} ${c} A ${b} ${b} 0 1 1 ${c - b * 1.5} ${c + 0.1} A ${b} ${b} 0 1 1 ${c - b * 1.5} ${c}`);
    paths.push(`M ${c + b * 1.5} ${c} A ${b} ${b} 0 1 0 ${c + b * 1.5} ${c + 0.1} A ${b} ${b} 0 1 0 ${c + b * 1.5} ${c}`);
  } else {
    paths.push(`M ${c - b * 2} ${c - b * 2} L ${c - b} ${c - b} L ${c - b * 2} ${c + b} Z`);
    paths.push(`M ${c + b * 2} ${c + b * 2} L ${c + b} ${c + b} L ${c + b * 2} ${c - b} Z`);
  }
  return paths.join(" ");
}

/** Monogram-interlock: interlocking initial(s) from brand_name, consistent stroke (path-only) */
function buildMonogramInterlock(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  brandName: string,
  seedNum: number,
): string | Array<{ d: string; transform: string }> {
  const words = brandName.trim().split(/\s+/).filter(Boolean);
  const firstInitial = (words[0]?.[0] ?? "A").toUpperCase();
  const secondInitial = words.length >= 2 ? (words[1]?.[0] ?? firstInitial).toUpperCase() : firstInitial;
  const useTwo = words.length >= 2 && firstInitial !== secondInitial;
  const fontSize = 64;
  const c = grid / 2;
  const scale = (grid * 0.52) / fontSize;
  let path1: string;
  let path2: string;
  try {
    path1 = textToPath({
      text: firstInitial,
      fontFamily: "Inter",
      fontSize,
      fontWeight: 700,
      tracking: 0,
      x: 0,
      y: 0,
    });
    path2 = useTwo
      ? textToPath({
          text: secondInitial,
          fontFamily: "Inter",
          fontSize,
          fontWeight: 700,
          tracking: 0,
          x: 0,
          y: 0,
        })
      : path1;
  } catch {
    const r = grid * 0.36;
    path1 = `M ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c}`;
    path2 = `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`;
    return path1 + " " + path2;
  }
  if (!useTwo) return path1;
  const tx1 = c - fontSize * scale * 0.42;
  const ty = c + fontSize * scale * 0.35;
  const tx2 = c - fontSize * scale * 0.08;
  return [
    { d: path1, transform: `translate(${tx1},${ty}) scale(${scale})` },
    { d: path2, transform: `translate(${tx2},${ty}) scale(${scale})` },
  ];
}

function buildMarkPath(
  input: MotifMarkInput,
): string | Array<{ d: string; transform: string }> {
  const { motif_family, seed, grid, corner_radius_px } = input;
  const seedNum = hashSeed(seed);
  const variation = seedNum % 4;

  switch (motif_family) {
    case "loop":
      return buildLoop(grid, input.stroke_px, corner_radius_px, variation);
    case "interlock":
      return buildInterlock(grid, input.stroke_px, corner_radius_px, variation);
    case "orbit":
      return buildOrbit(grid, input.stroke_px, corner_radius_px, variation);
    case "fold":
      return buildFold(grid, input.stroke_px, corner_radius_px, variation);
    case "swap":
      return buildSwap(grid, input.stroke_px, corner_radius_px, variation);
    case "monogram-interlock":
      return buildMonogramInterlock(
        grid,
        input.stroke_px,
        corner_radius_px,
        input.brand_name,
        seedNum,
      );
    default:
      return buildLoop(grid, input.stroke_px, corner_radius_px, 0);
  }
}

/** Produces clean SVG path-based mark (no gradients, no bitmap, no text). Readable at 16px, 1 color. */
export function generateMotifMark(input: MotifMarkInput): MotifMarkOutput {
  const pathOrPaths = buildMarkPath(input);
  const { grid, stroke_px, corner_radius_px, primary_hex } = input;

  const pathAttrs = `fill="none" stroke="${primary_hex}" stroke-width="${stroke_px}" stroke-linecap="round" stroke-linejoin="round"`;
  const pathContent = Array.isArray(pathOrPaths)
    ? pathOrPaths
        .map(
          (p) =>
            `  <path d="${p.d}" ${pathAttrs} transform="${p.transform}" />`,
        )
        .join("\n")
    : `  <path d="${pathOrPaths}" ${pathAttrs} />`;

  const mark_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${grid}" height="${grid}" viewBox="0 0 ${grid} ${grid}" role="img" aria-label="${input.brand_name} mark">
${pathContent}
</svg>`.trim();

  return {
    mark_svg,
    construction: { grid, stroke_px, corner_radius_px },
  };
}

export const motif_mark = tool({
  name: "motif_mark",
  description:
    "Generate a deterministic, path-based SVG motif mark. Supports families: loop, interlock, orbit, fold, swap, monogram-interlock. Output is clean SVG (no gradients, no text).",
  parameters: MotifMarkInputSchema,
  async execute(args) {
    const input = MotifMarkInputSchema.parse(args);
    const result = generateMotifMark(input);
    return JSON.stringify(result);
  },
});

// --- Legacy exports for executor (same 5 families + scoring used by pipeline) ---
export function scoreMotifDistinctiveness(
  motifFamily: "loop" | "interlock" | "orbit" | "fold" | "swap",
  distinctivenessHook: string,
): number {
  const hook = distinctivenessHook.toLowerCase();
  let score = 0;
  if (hook.includes("loop") || hook.includes("circular") || hook.includes("flow")) {
    score += motifFamily === "loop" ? 10 : motifFamily === "orbit" ? 8 : 0;
  }
  if (hook.includes("interlock") || hook.includes("connect") || hook.includes("link")) {
    score += motifFamily === "interlock" ? 10 : 0;
  }
  if (hook.includes("orbit") || hook.includes("circle") || hook.includes("round")) {
    score += motifFamily === "orbit" ? 10 : motifFamily === "loop" ? 6 : 0;
  }
  if (hook.includes("fold") || hook.includes("origami") || hook.includes("geometric")) {
    score += motifFamily === "fold" ? 10 : motifFamily === "interlock" ? 6 : 0;
  }
  if (hook.includes("swap") || hook.includes("alternate") || hook.includes("dynamic")) {
    score += motifFamily === "swap" ? 10 : 0;
  }
  const baseScores: Record<"loop" | "interlock" | "orbit" | "fold" | "swap", number> = {
    loop: 5,
    interlock: 6,
    orbit: 5,
    fold: 7,
    swap: 6,
  };
  return score + (baseScores[motifFamily] ?? 5);
}
