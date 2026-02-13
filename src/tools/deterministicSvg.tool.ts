import { z } from "zod";
import { tool } from "@openai/agents";
import { fontToPath, type FontToPathOutput } from "./fontToPath.tool";
import { textToPath } from "./fontToPath.tool";

const MotifFamilyEnum = z.enum([
  "interlock",
  "orbit",
  "fold",
  "knot",
  "swap",
  "monogram-interlock",
]);

const DeterministicSvgInputSchema = z.object({
  brand_name: z.string().min(1),
  direction_name: z.string().min(1),
  logo_archetype: z.string().min(1),
  keywords: z.array(z.string().min(1)),
  palette_hex: z.array(
    z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Expected a hex color"),
  ),
  vibe: z.string().min(1),
  tracking: z.number().optional().default(0),
  regen_seed: z.string().optional(),
  motif_family: MotifFamilyEnum.optional(),
  geometry_style: z.enum(["sharp", "round"]).optional(),
});

type DeterministicSvgInput = z.infer<typeof DeterministicSvgInputSchema>;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

type FontName = "inter" | "inter_bold" | "dm_serif";

function getWordmarkFont(input: DeterministicSvgInput): FontName {
  return input.logo_archetype.includes("serif") ||
    input.logo_archetype.includes("display")
    ? "dm_serif"
    : "inter_bold";
}

/** Ensure path d is safe for SVG attribute (no broken markup). */
function safePathD(pathD: string): string {
  if (!pathD || typeof pathD !== "string") return "M 0 0";
  return pathD.replace(/"/g, "'").trim() || "M 0 0";
}

/** Readability heuristic: prefer aspect ratio not too wide (spread out) or too tight. */
function scoreReadability(
  out: FontToPathOutput,
  _brandName: string,
): number {
  const aspect = out.width / Math.max(out.height, 1);
  if (aspect > 12) return 0;
  if (aspect < 1.5) return 2;
  if (aspect > 8) return 4;
  if (aspect > 5) return 7;
  return 10;
}

/** Infer motif family from keywords/direction_name/vibe if not provided */
function inferMotifFamily(
  input: DeterministicSvgInput,
  seed: number,
): z.infer<typeof MotifFamilyEnum> {
  if (input.motif_family) {
    return input.motif_family;
  }

  const text = [
    ...input.keywords,
    input.direction_name.toLowerCase(),
    input.vibe.toLowerCase(),
  ].join(" ");

  const hasInterlock = /interlock|connect|link|unite|join|bridge/i.test(text);
  const hasOrbit = /orbit|motion|flow|cycle|revolve|dynamic/i.test(text);
  const hasFold = /fold|crease|bend|angle|corner|sharp/i.test(text);
  const hasKnot = /knot|tie|bind|secure|wrap/i.test(text);
  const hasSwap = /swap|exchange|trade|transfer|switch/i.test(text);
  const hasMonogram = /monogram|initial|letter|personal/i.test(text);

  if (hasInterlock) return "interlock";
  if (hasOrbit) return "orbit";
  if (hasFold) return "fold";
  if (hasKnot) return "knot";
  if (hasSwap) return "swap";
  if (hasMonogram) return "monogram-interlock";

  const families: Array<z.infer<typeof MotifFamilyEnum>> = [
    "interlock",
    "orbit",
    "fold",
    "knot",
    "swap",
    "monogram-interlock",
  ];
  return families[seed % families.length]!;
}

/** Rounded rect as path */
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

/** Interlock: two shapes sharing negative space */
function buildInterlock(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  style: "sharp" | "round",
): string {
  const c = grid / 2;
  const r = grid * 0.22;
  const paths: string[] = [];
  const cr = style === "round" ? cornerRadiusPx : 0;

  if (variation === 0) {
    const s = grid * 0.28;
    paths.push(roundedRectPath(c - s, c - s, s * 2, s * 2, cr));
    paths.push(roundedRectPath(c - s * 0.6, c - s * 0.6, s * 1.2, s * 1.2, cr));
  } else if (variation === 1) {
    const s = grid * 0.3;
    paths.push(`M ${c - s} ${c} A ${s} ${s} 0 1 1 ${c + s} ${c} A ${s} ${s} 0 1 1 ${c - s} ${c}`);
    paths.push(`M ${c} ${c - s} A ${s} ${s} 0 1 1 ${c} ${c + s} A ${s} ${s} 0 1 1 ${c} ${c - s}`);
  } else if (variation === 2) {
    const s = grid * 0.26;
    paths.push(roundedRectPath(c - s * 1.5, c - s, s * 3, s * 2, cr));
    paths.push(roundedRectPath(c - s, c - s * 1.5, s * 2, s * 3, cr));
  } else {
    const s = grid * 0.24;
    paths.push(`M ${c - s} ${c - s} L ${c + s} ${c - s} L ${c + s} ${c + s} L ${c - s} ${c + s} Z`);
    paths.push(`M ${c - s * 0.7} ${c - s * 0.7} L ${c + s * 0.7} ${c - s * 0.7} L ${c + s * 0.7} ${c + s * 0.7} L ${c - s * 0.7} ${c + s * 0.7} Z`);
  }
  return paths.join(" ");
}

/** Orbit: offset arcs suggesting motion; open orbit with tension gap */
function buildOrbit(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  style: "sharp" | "round",
): string {
  const c = grid / 2;
  const r1 = grid * 0.38;
  const r2 = grid * 0.26;
  const gap = grid * 0.08;
  const paths: string[] = [];

  if (variation === 0) {
    paths.push(`M ${c} ${c - r1} A ${r1} ${r1} 0 0 1 ${c + r1} ${c}`);
    paths.push(`M ${c} ${c - r2} A ${r2} ${r2} 0 0 0 ${c - r2} ${c}`);
  } else if (variation === 1) {
    paths.push(`M ${c - r1} ${c} A ${r1} ${r1} 0 0 1 ${c} ${c + r1}`);
    paths.push(`M ${c + r2} ${c} A ${r2} ${r2} 0 0 0 ${c} ${c - r2}`);
  } else {
    const angle = (Math.PI * 2) / 3;
    paths.push(`M ${c + r1 * Math.cos(0)} ${c + r1 * Math.sin(0)} A ${r1} ${r1} 0 0 1 ${c + r1 * Math.cos(angle)} ${c + r1 * Math.sin(angle)}`);
    paths.push(`M ${c + r2 * Math.cos(angle * 2)} ${c + r2 * Math.sin(angle * 2)} A ${r2} ${r2} 0 0 1 ${c + r2 * Math.cos(0)} ${c + r2 * Math.sin(0)}`);
  }
  return paths.join(" ");
}

/** Fold: folded corner/crease motif with diagonal and negative space seam */
function buildFold(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  style: "sharp" | "round",
): string {
  const c = grid / 2;
  const s = grid * 0.38;
  const paths: string[] = [];

  if (variation === 0) {
    paths.push(`M ${c} ${c - s} L ${c - s} ${c + s} L ${c + s} ${c + s} Z`);
    paths.push(`M ${c - s * 0.3} ${c - s * 0.3} L ${c} ${c - s} L ${c - s} ${c}`);
  } else if (variation === 1) {
    paths.push(`M ${c} ${c - s} L ${c - s} ${c} L ${c} ${c + s} L ${c + s} ${c} Z`);
    paths.push(`M ${c - s * 0.4} ${c - s * 0.4} L ${c} ${c - s} L ${c - s} ${c}`);
  } else {
    paths.push(`M ${c - s} ${c - s} L ${c} ${c} L ${c - s} ${c + s} Z`);
    paths.push(`M ${c + s} ${c - s} L ${c} ${c} L ${c + s} ${c + s} Z`);
    paths.push(`M ${c - s * 0.5} ${c} L ${c} ${c} L ${c + s * 0.5} ${c}`);
  }
  return paths.join(" ");
}

/** Knot: single continuous ribbon path that crosses once */
function buildKnot(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  style: "sharp" | "round",
): string {
  const c = grid / 2;
  const r = grid * 0.32;
  const paths: string[] = [];

  if (variation === 0) {
    paths.push(`M ${c - r} ${c - r} Q ${c} ${c - r * 0.5} ${c + r} ${c - r} T ${c + r} ${c + r} Q ${c} ${c + r * 0.5} ${c - r} ${c + r} T ${c - r} ${c - r}`);
  } else if (variation === 1) {
    paths.push(`M ${c - r * 0.7} ${c - r} Q ${c} ${c} ${c + r * 0.7} ${c - r} Q ${c} ${c} ${c - r * 0.7} ${c + r} Q ${c} ${c} ${c + r * 0.7} ${c + r} Q ${c} ${c} ${c - r * 0.7} ${c - r}`);
  } else {
    paths.push(`M ${c - r} ${c} Q ${c - r * 0.5} ${c - r} ${c} ${c - r} T ${c + r} ${c} Q ${c + r * 0.5} ${c + r} ${c} ${c + r} T ${c - r} ${c}`);
  }
  return paths.join(" ");
}

/** Swap: two opposing curved strokes implying exchange (no arrows, no recycling triangles) */
function buildSwap(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  variation: number,
  style: "sharp" | "round",
): string {
  const c = grid / 2;
  const b = grid * 0.2;
  const paths: string[] = [];

  if (variation === 0) {
    paths.push(`M ${c - b * 2} ${c - b} Q ${c - b} ${c - b * 1.5} ${c} ${c - b} T ${c + b * 2} ${c - b}`);
    paths.push(`M ${c + b * 2} ${c + b} Q ${c + b} ${c + b * 1.5} ${c} ${c + b} T ${c - b * 2} ${c + b}`);
  } else if (variation === 1) {
    paths.push(`M ${c - b * 1.5} ${c} A ${b} ${b} 0 1 1 ${c - b * 1.5} ${c + 0.1} A ${b} ${b} 0 1 1 ${c - b * 1.5} ${c}`);
    paths.push(`M ${c + b * 1.5} ${c} A ${b} ${b} 0 1 0 ${c + b * 1.5} ${c + 0.1} A ${b} ${b} 0 1 0 ${c + b * 1.5} ${c}`);
  } else {
    paths.push(`M ${c - b * 2} ${c - b * 2} Q ${c - b} ${c} ${c - b * 2} ${c + b * 2}`);
    paths.push(`M ${c + b * 2} ${c + b * 2} Q ${c + b} ${c} ${c + b * 2} ${c - b * 2}`);
  }
  return paths.join(" ");
}

/** Monogram-interlock: interlocking initials */
function buildMonogramInterlock(
  grid: number,
  strokePx: number,
  cornerRadiusPx: number,
  brandName: string,
  seedNum: number,
): string {
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
  return `<g transform="translate(${tx1},${ty}) scale(${scale})"><path d="${path1}"/></g><g transform="translate(${tx2},${ty}) scale(${scale})"><path d="${path2}"/></g>`;
}

/** Build a single motif mark SVG candidate */
function buildMotifMarkSvg(
  family: z.infer<typeof MotifFamilyEnum>,
  seed: number,
  primary: string,
  secondary: string,
  accent: string,
  size: number,
  geometryStyle: "sharp" | "round",
  brandName: string | undefined,
): string {
  const bn: string = brandName || "Brand";
  const grid = 24;
  const scale = size / grid;
  const seedNum = hashString(`${family}-${seed}`);
  const variation = seedNum % 4;
  const strokePx = 2 + (seedNum % 3);
  const cornerRadiusPx = geometryStyle === "round" ? 2 + (seedNum % 3) : 0;

  let pathData: string;
  switch (family) {
    case "interlock":
      pathData = buildInterlock(grid, strokePx, cornerRadiusPx, variation, geometryStyle);
      break;
    case "orbit":
      pathData = buildOrbit(grid, strokePx, cornerRadiusPx, variation, geometryStyle);
      break;
    case "fold":
      pathData = buildFold(grid, strokePx, cornerRadiusPx, variation, geometryStyle);
      break;
    case "knot":
      pathData = buildKnot(grid, strokePx, cornerRadiusPx, variation, geometryStyle);
      break;
    case "swap":
      pathData = buildSwap(grid, strokePx, cornerRadiusPx, variation, geometryStyle);
      break;
    case "monogram-interlock":
      pathData = buildMonogramInterlock(grid, strokePx, cornerRadiusPx, bn, seedNum);
      break;
    default:
      pathData = buildFold(grid, strokePx, cornerRadiusPx, 0, geometryStyle);
  }

  const pathAttrs = `fill="none" stroke="${primary}" stroke-width="${strokePx}" stroke-linecap="round" stroke-linejoin="round"`;
  const viewBox = `0 0 ${grid} ${grid}`;

  if (pathData.includes("<g")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" role="img">
  <g transform="scale(${scale})">
    ${pathData}
  </g>
</svg>`.trim();
  }

  const paths = pathData.split(/\s+(?=M\s+)/).filter(Boolean);

  const pathElements = paths
    .map((p, i) => {
      const color = i === 0 ? primary : i === 1 ? secondary : accent;
      return `  <path d="${p.trim()}" ${pathAttrs.replace(primary, color)} />`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" role="img">
${pathElements}
</svg>`.trim();
}

/** Score a motif mark candidate */
function scoreMotifMark(svg: string, family: string): number {
  let score = 10;

  if (svg.includes("<text")) {
    score -= 20;
  }

  const circleMatches = (svg.match(/<circle/g) || []).length;
  if (circleMatches === 1 && !svg.includes("<path")) {
    score -= 15;
  }

  const pathMatches = (svg.match(/<path/g) || []).length;
  if (pathMatches < 2) {
    score -= 10;
  }

  if (svg.includes("recycling") || svg.match(/triangle.*triangle/i)) {
    score -= 15;
  }

  if (family === "interlock" && svg.includes("negative") || svg.match(/overlap|cut.*out/i)) {
    score += 5;
  }

  if (family === "orbit" && svg.match(/gap|tension|open/i)) {
    score += 5;
  }

  if (family === "fold" && svg.match(/seam|crease|diagonal/i)) {
    score += 5;
  }

  return Math.max(0, score);
}

/** Build wordmark SVG and return metrics for lockup construction */
export function buildWordmarkSvg(input: DeterministicSvgInput) {
  const key = JSON.stringify(input);
  const seed = hashString(key);

  const width = 640;
  const height = 320;
  const wordmarkFontSize = 32;
  const fontName = getWordmarkFont(input);

  const [primary] = [
    input.palette_hex[seed % input.palette_hex.length],
  ];

  // Three wordmark variants: tight, normal, wide tracking (path-only, no <text>)
  const trackingVariants = [
    { tracking_px: -1, label: "tight" },
    { tracking_px: 0, label: "normal" },
    { tracking_px: 2, label: "wide" },
  ];
  
  let wordmarkVariants: FontToPathOutput[];
  try {
    wordmarkVariants = trackingVariants.map(({ tracking_px }) =>
      fontToPath({
        text: input.brand_name,
        font_name: fontName,
        font_size: wordmarkFontSize,
        tracking_px,
      }),
    );
  } catch (error) {
    // Font files are missing - provide graceful fallback with warning
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`⚠️  Font loading failed: ${errorMsg}`);
    console.error(`⚠️  Using fallback wordmark. Please add font files to assets/fonts/ and redeploy.`);
    console.error(`⚠️  Required fonts: Inter-Regular.ttf, Inter-Bold.ttf, DMSerifDisplay-Regular.ttf`);
    
    // Create a basic fallback path that represents the text (simple geometric shapes)
    // This allows the API to continue working until fonts are added
    const len = input.brand_name.length;
    const fallbackWidth = len * wordmarkFontSize * 0.6;
    const fallbackHeight = wordmarkFontSize * 1.2;
    const fallbackPath = `M 0 ${fallbackHeight * 0.3} L ${fallbackWidth} ${fallbackHeight * 0.3} L ${fallbackWidth} ${fallbackHeight * 0.7} L 0 ${fallbackHeight * 0.7} Z`;
    
    wordmarkVariants = [{
      path_d: fallbackPath,
      viewBox: `0 0 ${fallbackWidth} ${fallbackHeight}`,
      width: fallbackWidth,
      height: fallbackHeight,
    }];
  }
  
  const bestWordmark =
    wordmarkVariants.length > 0
      ? wordmarkVariants.reduce((a, b) =>
          scoreReadability(a, input.brand_name) >=
          scoreReadability(b, input.brand_name)
            ? a
            : b,
        )
      : wordmarkVariants[0]!;
  const wordmarkPath = safePathD(bestWordmark.path_d);
  const wordmarkBounds = {
    x1: parseFloat(bestWordmark.viewBox.split(/\s+/)[0] ?? "0"),
    y1: parseFloat(bestWordmark.viewBox.split(/\s+/)[1] ?? "0"),
    w: bestWordmark.width,
    h: bestWordmark.height,
  };
  const wordmarkCenterX = wordmarkBounds.x1 + wordmarkBounds.w / 2;
  const wordmarkCenterY = wordmarkBounds.y1 + wordmarkBounds.h / 2;

  // Wordmark SVG: path only, centered using optical center (bbox center)
  const wordmarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${input.brand_name} wordmark">
  <g transform="translate(${width / 2 - wordmarkCenterX}, ${height / 2 - wordmarkCenterY})">
    <path d="${wordmarkPath}" fill="${primary}" />
  </g>
</svg>`.trim();

  return {
    logo_svg_wordmark: wordmarkSvg,
    wordmark_metrics: {
      viewBox: bestWordmark.viewBox,
      width: bestWordmark.width,
      height: bestWordmark.height,
      centerX: wordmarkCenterX,
      centerY: wordmarkCenterY,
      path_d: wordmarkPath,
      primary_color: primary || "#000000",
    },
  };
}

/** Legacy function for backward compatibility - now only generates wordmark */
export function buildDeterministicSvgs(input: DeterministicSvgInput) {
  const wordmarkResult = buildWordmarkSvg(input);
  return {
    logo_svg_wordmark: wordmarkResult.logo_svg_wordmark,
    wordmark_metrics: wordmarkResult.wordmark_metrics,
    // Legacy fields (empty - mark and lockups built separately)
    logo_svg_mark: "",
    logo_svg_horizontal: "",
    logo_svg_stacked: "",
  };
}

export const deterministicSvgLogoTool = tool({
  name: "deterministic_svg_logo",
  description:
    "Generate deterministic SVG logos with font paths (wordmark, mark, horizontal and stacked lockups). No <text>; path-only. Wordmark uses tight/normal/wide tracking and readability heuristic.",
  parameters: DeterministicSvgInputSchema,
  async execute(args) {
    const input = DeterministicSvgInputSchema.parse(args);
    const result = buildDeterministicSvgs(input);
    return JSON.stringify(result);
  },
});
