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
  variant: z.number().min(0).max(5).optional(), // 0-5 for geometry variation
  use_fill: z.boolean().optional().default(true), // Use fill instead of stroke for bolder look (default true for premium marks)
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

/** Create filled ribbon band: outer contour - inner contour (hole) using even-odd fill */
function createRibbonBand(
  outerPath: string,
  innerPath: string,
  gapCut?: string, // Optional gap cut rectangle path
): string {
  if (gapCut) {
    return `${outerPath} ${innerPath} ${gapCut}`;
  }
  return `${outerPath} ${innerPath}`;
}

/** Loop: rounded-square loop ribbon with visible gap (tension cut) - no full circles */
function buildLoop(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  useFill: boolean = true,
): string {
  const c = grid / 2;
  const bandWidth = grid * 0.12; // Ribbon band width
  const outerSize = grid * 0.42;
  const innerSize = outerSize - bandWidth * 2;
  const gapSize = grid * 0.08; // Gap cut size
  const r = Math.min(cornerRadiusPx, outerSize / 4);
  
  if (useFill) {
    // Outer rounded rect
    const outerX = c - outerSize / 2;
    const outerY = c - outerSize / 2;
    const outerPath = roundedRectPath(outerX, outerY, outerSize, outerSize, r);
    
    // Inner rounded rect (hole)
    const innerX = c - innerSize / 2;
    const innerY = c - innerSize / 2;
    const innerPath = roundedRectPath(innerX, innerY, innerSize, innerSize, Math.max(0, r - bandWidth / 2));
    
    // Gap cut rectangle (tension cut)
    const gapX = c + outerSize / 2 - gapSize;
    const gapY = c - gapSize / 2;
    const gapCut = roundedRectPath(gapX, gapY, gapSize, gapSize, 0);
    
    return createRibbonBand(outerPath, innerPath, gapCut);
  } else {
    // Stroke version: rounded-square loop with gap
    const s = outerSize / 2;
    const gapOffset = gapSize / 2;
    return `M ${c - s} ${c - s + gapOffset} L ${c - s} ${c - s} L ${c + s - gapSize} ${c - s} L ${c + s} ${c - s} L ${c + s} ${c + s} L ${c - s} ${c + s} L ${c - s} ${c - s + gapOffset} Z`;
  }
}

/** Interlock: two rounded-rect loop bands that overlap with negative space window */
function buildInterlock(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  useFill: boolean = true,
): string {
  const c = grid / 2;
  const bandWidth = grid * 0.1;
  const size1 = grid * 0.36;
  const size2 = grid * 0.32;
  const overlap = grid * 0.08;
  const r = Math.min(cornerRadiusPx, size1 / 4);
  
  if (useFill) {
    // First band: horizontal rounded rect loop
    const outer1X = c - size1 / 2;
    const outer1Y = c - size2 / 2 - overlap;
    const outer1Path = roundedRectPath(outer1X, outer1Y, size1, size2, r);
    const inner1X = outer1X + bandWidth;
    const inner1Y = outer1Y + bandWidth;
    const inner1Path = roundedRectPath(inner1X, inner1Y, size1 - bandWidth * 2, size2 - bandWidth * 2, Math.max(0, r - bandWidth / 2));
    
    // Second band: vertical rounded rect loop (overlaps first)
    const outer2X = c - size2 / 2 - overlap;
    const outer2Y = c - size1 / 2;
    const outer2Path = roundedRectPath(outer2X, outer2Y, size2, size1, r);
    const inner2X = outer2X + bandWidth;
    const inner2Y = outer2Y + bandWidth;
    const inner2Path = roundedRectPath(inner2X, inner2Y, size2 - bandWidth * 2, size1 - bandWidth * 2, Math.max(0, r - bandWidth / 2));
    
    // Negative space overlap window (carved out by even-odd)
    const windowX = c - overlap / 2;
    const windowY = c - overlap / 2;
    const windowPath = roundedRectPath(windowX, windowY, overlap, overlap, 0);
    
    return `${outer1Path} ${inner1Path} ${outer2Path} ${inner2Path} ${windowPath}`;
  } else {
    // Stroke version: two overlapping rounded rects
    const s1 = size1 / 2;
    const s2 = size2 / 2;
    const path1 = roundedRectPath(c - s1, c - s2 - overlap, size1, size2, r);
    const path2 = roundedRectPath(c - s2 - overlap, c - s1, size2, size1, r);
    return `${path1} ${path2}`;
  }
}

/** Orbit: 2 offset partial orbit bands (filled crescents) with gaps - no full rings */
function buildOrbit(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  useFill: boolean = true,
): string {
  const c = grid / 2;
  const bandWidth = grid * 0.12; // Ribbon band width
  const outerSize = grid * 0.42;
  const innerSize = outerSize - bandWidth * 2;
  const gapSize = grid * 0.1; // Gap cut size
  const r = Math.min(cornerRadiusPx, outerSize / 4);
  
  if (useFill) {
    // First crescent: rounded rect loop with gap (top-right quadrant)
    const outer1X = c - outerSize / 2;
    const outer1Y = c - outerSize / 2;
    const outer1Path = roundedRectPath(outer1X, outer1Y, outerSize, outerSize, r);
    
    const inner1X = c - innerSize / 2;
    const inner1Y = c - innerSize / 2;
    const inner1Path = roundedRectPath(inner1X, inner1Y, innerSize, innerSize, Math.max(0, r - bandWidth / 2));
    
    // Gap cut for first crescent (top-right corner)
    const gap1X = c + outerSize / 2 - gapSize;
    const gap1Y = c - outerSize / 2;
    const gap1Path = roundedRectPath(gap1X, gap1Y, gapSize, gapSize, 0);
    
    // Second crescent: rounded rect loop with gap (bottom-left quadrant, offset)
    const offset = grid * 0.08;
    const outer2X = c - outerSize / 2 - offset;
    const outer2Y = c - outerSize / 2 + offset;
    const outer2Path = roundedRectPath(outer2X, outer2Y, outerSize, outerSize, r);
    
    const inner2X = c - innerSize / 2 - offset;
    const inner2Y = c - innerSize / 2 + offset;
    const inner2Path = roundedRectPath(inner2X, inner2Y, innerSize, innerSize, Math.max(0, r - bandWidth / 2));
    
    // Gap cut for second crescent (bottom-left corner)
    const gap2X = c - outerSize / 2 - offset;
    const gap2Y = c + outerSize / 2 - gapSize + offset;
    const gap2Path = roundedRectPath(gap2X, gap2Y, gapSize, gapSize, 0);
    
    // Combine: outer paths - inner paths - gap cuts (even-odd creates crescents)
    return `${outer1Path} ${inner1Path} ${gap1Path} ${outer2Path} ${inner2Path} ${gap2Path}`;
  } else {
    // Stroke version: partial rounded rects with gaps
    const s = outerSize / 2;
    const offset = grid * 0.08;
    return `M ${c - s} ${c - s} L ${c + s - gapSize} ${c - s} M ${c + s} ${c - s} L ${c + s} ${c + s} L ${c - s} ${c + s} L ${c - s} ${c - s} M ${c - s - offset} ${c - s + offset} L ${c + s - gapSize - offset} ${c - s + offset} M ${c + s - offset} ${c - s + offset} L ${c + s - offset} ${c + s + offset} L ${c - s - offset} ${c + s + offset} L ${c - s - offset} ${c - s + offset}`;
  }
}

/** Fold: clean planar fold mark with 2 faces + seam line as negative space */
function buildFold(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  useFill: boolean = true,
): string {
  const c = grid / 2;
  const faceSize = grid * 0.4;
  const seamWidth = grid * 0.04;
  
  if (useFill) {
    // Face 1: left/top face
    const face1 = `M ${c - faceSize / 2} ${c - faceSize / 2} L ${c} ${c} L ${c - faceSize / 2} ${c + faceSize / 2} Z`;
    
    // Face 2: right/bottom face
    const face2 = `M ${c + faceSize / 2} ${c - faceSize / 2} L ${c} ${c} L ${c + faceSize / 2} ${c + faceSize / 2} Z`;
    
    // Seam line (negative space cut)
    const seamX = c - seamWidth / 2;
    const seamY = c - faceSize / 2;
    const seamPath = roundedRectPath(seamX, seamY, seamWidth, faceSize, 0);
    
    return `${face1} ${face2} ${seamPath}`;
  } else {
    // Stroke version: two faces with seam
    const s = faceSize / 2;
    return `M ${c - s} ${c - s} L ${c} ${c} L ${c - s} ${c + s} M ${c + s} ${c - s} L ${c} ${c} L ${c + s} ${c + s} M ${c - seamWidth / 2} ${c - s} L ${c - seamWidth / 2} ${c + s}`;
  }
}

/** Swap: two opposing bands that pass each other (exchange tension) without arrows */
function buildSwap(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  useFill: boolean = true,
): string {
  const c = grid / 2;
  const bandWidth = grid * 0.12;
  const bandLength = grid * 0.32;
  const offset = grid * 0.15;
  const r = Math.min(cornerRadiusPx, bandWidth / 2);
  
  if (useFill) {
    // First band: curved upward band
    const band1CenterX = c - offset;
    const band1CenterY = c;
    const band1Outer = roundedRectPath(
      band1CenterX - bandLength / 2,
      band1CenterY - bandWidth / 2 - offset / 2,
      bandLength,
      bandWidth,
      r,
    );
    const band1Inner = roundedRectPath(
      band1CenterX - bandLength / 2 + bandWidth / 3,
      band1CenterY - bandWidth / 2 - offset / 2 + bandWidth / 3,
      bandLength - bandWidth * 2 / 3,
      bandWidth / 3,
      Math.max(0, r - bandWidth / 3),
    );
    
    // Second band: curved downward band (passes under first)
    const band2CenterX = c + offset;
    const band2CenterY = c;
    const band2Outer = roundedRectPath(
      band2CenterX - bandLength / 2,
      band2CenterY - bandWidth / 2 + offset / 2,
      bandLength,
      bandWidth,
      r,
    );
    const band2Inner = roundedRectPath(
      band2CenterX - bandLength / 2 + bandWidth / 3,
      band2CenterY - bandWidth / 2 + offset / 2 + bandWidth / 3,
      bandLength - bandWidth * 2 / 3,
      bandWidth / 3,
      Math.max(0, r - bandWidth / 3),
    );
    
    // Crossing negative space (carved out)
    const crossX = c - bandWidth / 2;
    const crossY = c - bandWidth / 2;
    const crossPath = roundedRectPath(crossX, crossY, bandWidth, bandWidth, 0);
    
    return `${band1Outer} ${band1Inner} ${band2Outer} ${band2Inner} ${crossPath}`;
  } else {
    // Stroke version: two curved bands
    const b = bandLength / 2;
    return `M ${c - offset - b} ${c - offset / 2} Q ${c - offset} ${c - offset} ${c - offset + b} ${c - offset / 2} M ${c + offset - b} ${c + offset / 2} Q ${c + offset} ${c + offset} ${c + offset + b} ${c + offset / 2}`;
  }
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
  } catch (error) {
    // Font files are missing - use geometric fallback with warning
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Font loading failed for monogram-interlock: ${errorMsg}`);
    console.warn(`⚠️  Using geometric fallback. Please add font files to assets/fonts/`);
    
    // Fallback: use ribbon-style rounded rect loops instead of circles
    const bandWidth = grid * 0.12;
    const outerSize = grid * 0.36;
    const innerSize = outerSize - bandWidth * 2;
    const r = Math.min(4, outerSize / 4);
    
    // First initial: rounded rect loop
    const outer1X = c - outerSize / 2 - grid * 0.1;
    const outer1Y = c - outerSize / 2;
    const outer1Path = roundedRectPath(outer1X, outer1Y, outerSize, outerSize, r);
    const inner1X = outer1X + bandWidth;
    const inner1Y = outer1Y + bandWidth;
    const inner1Path = roundedRectPath(inner1X, inner1Y, innerSize, innerSize, Math.max(0, r - bandWidth / 2));
    
    // Second initial: rounded rect loop (offset)
    const outer2X = c - outerSize / 2 + grid * 0.1;
    const outer2Y = c - outerSize / 2;
    const outer2Path = roundedRectPath(outer2X, outer2Y, outerSize, outerSize, r);
    const inner2X = outer2X + bandWidth;
    const inner2Y = outer2Y + bandWidth;
    const inner2Path = roundedRectPath(inner2X, inner2Y, innerSize, innerSize, Math.max(0, r - bandWidth / 2));
    
    path1 = `${outer1Path} ${inner1Path}`;
    path2 = `${outer2Path} ${inner2Path}`;
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
  const { motif_family, seed, grid, corner_radius_px, variant, use_fill } = input;
  const seedNum = hashSeed(seed);
  const variation = variant !== undefined ? variant : seedNum % 6; // Use variant if provided, else derive from seed
  const fillMode = use_fill ?? true; // Default to true for premium marks

  switch (motif_family) {
    case "loop":
      return buildLoop(grid, input.stroke_px, corner_radius_px, variation, fillMode);
    case "interlock":
      return buildInterlock(grid, input.stroke_px, corner_radius_px, variation, fillMode);
    case "orbit":
      return buildOrbit(grid, input.stroke_px, corner_radius_px, variation, fillMode);
    case "fold":
      return buildFold(grid, input.stroke_px, corner_radius_px, variation, fillMode);
    case "swap":
      return buildSwap(grid, input.stroke_px, corner_radius_px, variation, fillMode);
    case "monogram-interlock":
      return buildMonogramInterlock(
        grid,
        input.stroke_px,
        corner_radius_px,
        input.brand_name,
        seedNum,
      );
    default:
      return buildLoop(grid, input.stroke_px, corner_radius_px, 0, fillMode);
  }
}

/** Produces clean SVG path-based mark (no gradients, no bitmap, no text). Readable at 16px, 1 color. */
export function generateMotifMark(input: MotifMarkInput): MotifMarkOutput {
  const pathOrPaths = buildMarkPath(input);
  const { grid, stroke_px, corner_radius_px, primary_hex, use_fill } = input;

  // Use fill for bolder, more ownable marks (default); stroke for lighter marks
  // Ensure minimum stroke weight of 5px at 640px scale (scaled down from grid)
  const effectiveStrokePx = Math.max(stroke_px, 5 * (grid / 640));
  const fillMode = use_fill ?? true; // Default to true for premium marks
  
  // For filled ribbons, use even-odd fill rule to carve out negative space
  const pathAttrs = fillMode
    ? `fill="${primary_hex}" fill-rule="evenodd" stroke="none"`
    : `fill="none" stroke="${primary_hex}" stroke-width="${effectiveStrokePx}" stroke-linecap="round" stroke-linejoin="round"`;
  
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

  // Sanity checks
  if (mark_svg.includes("<text")) {
    throw new Error("Mark SVG contains <text> tag - must be path-only");
  }
  
  const circleCount = (mark_svg.match(/<circle/g) || []).length;
  const pathCount = (mark_svg.match(/<path/g) || []).length;
  
  // Check for full ring patterns (A r r 0 1 1 repeated)
  const fullRingPattern = /A\s+\d+\.?\d*\s+\d+\.?\d*\s+0\s+1\s+1/g;
  const ringMatches = mark_svg.match(fullRingPattern);
  const ringCount = ringMatches ? ringMatches.length : 0;
  
  if (ringCount >= 3) {
    console.warn(`⚠️  Warning: Mark contains ${ringCount} full ring pattern(s) - falling back to fold or swap`);
    // Fallback: regenerate with fold or swap
    const fallbackFamily = input.motif_family === "orbit" ? "fold" : "swap";
    const fallbackPath = buildMarkPath({ ...input, motif_family: fallbackFamily });
    const fallbackContent = Array.isArray(fallbackPath)
      ? fallbackPath.map((p) => `  <path d="${p.d}" ${pathAttrs} transform="${p.transform}" />`).join("\n")
      : `  <path d="${fallbackPath}" ${pathAttrs} />`;
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${grid}" height="${grid}" viewBox="0 0 ${grid} ${grid}" role="img" aria-label="${input.brand_name} mark">
${fallbackContent}
</svg>`.trim();
    return {
      mark_svg: fallbackSvg,
      construction: { grid, stroke_px: effectiveStrokePx, corner_radius_px },
    };
  }
  
  if (circleCount > 0) {
    console.warn(`⚠️  Warning: Mark contains ${circleCount} circle(s) - should use tension-based geometry`);
  }
  
  // Check for multiple subpaths (M commands) in compound paths
  const moveCommandCount = (mark_svg.match(/\bM\s+[-\d.]+\s+[-\d.]+/g) || []).length;
  if (pathCount < 2 && input.motif_family !== "monogram-interlock") {
    console.warn(`⚠️  Warning: Mark has only ${pathCount} path(s) - may lack visual weight`);
  }
  if (moveCommandCount < 2 && input.motif_family !== "monogram-interlock") {
    console.warn(`⚠️  Warning: Mark has only ${moveCommandCount} subpath(s) - may lack visual weight`);
  }

  return {
    mark_svg,
    construction: { grid, stroke_px: effectiveStrokePx, corner_radius_px },
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
