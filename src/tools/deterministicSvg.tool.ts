import { z } from "zod";
import { tool } from "@openai/agents";
import { fontToPath, type FontToPathOutput } from "./fontToPath.tool";

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

export function buildDeterministicSvgs(input: DeterministicSvgInput) {
  const key = JSON.stringify(input);
  const seed = hashString(key);

  const width = 640;
  const height = 320;
  const wordmarkFontSize = 32;
  const fontName = getWordmarkFont(input);

  const [primary, secondary, accent] = [
    input.palette_hex[seed % input.palette_hex.length],
    input.palette_hex[(seed + 1) % input.palette_hex.length],
    input.palette_hex[(seed + 2) % input.palette_hex.length],
  ];

  // Three wordmark variants: tight, normal, wide tracking (path-only, no <text>)
  const trackingVariants = [
    { tracking_px: -1, label: "tight" },
    { tracking_px: 0, label: "normal" },
    { tracking_px: 2, label: "wide" },
  ];
  const wordmarkVariants = trackingVariants.map(({ tracking_px }) =>
    fontToPath({
      text: input.brand_name,
      font_name: fontName,
      font_size: wordmarkFontSize,
      tracking_px,
    }),
  );
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

  // Mark: initial letter as path only (no circle fill if we want path-only mark; keep circle for this legacy mark)
  const initialChar = input.brand_name[0]?.toUpperCase() ?? "?";
  const markPathOut = fontToPath({
    text: initialChar,
    font_name: fontName,
    font_size: 64,
    tracking_px: 0,
  });
  const markPath = safePathD(markPathOut.path_d);
  const markBounds = {
    x1: parseFloat(markPathOut.viewBox.split(/\s+/)[0] ?? "0"),
    y1: parseFloat(markPathOut.viewBox.split(/\s+/)[1] ?? "0"),
    w: markPathOut.width,
    h: markPathOut.height,
  };
  const markCenterX = markBounds.x1 + markBounds.w / 2;
  const markCenterY = markBounds.y1 + markBounds.h / 2;

  const circleRadius = 72 + (seed % 16);
  const markSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" role="img" aria-label="${input.brand_name} mark">
  <circle cx="${width / 2}" cy="${width / 2}" r="${circleRadius}" fill="${accent}" />
  <g transform="translate(${width / 2 - markCenterX}, ${width / 2 - markCenterY})">
    <path d="${markPath}" fill="${secondary}" />
  </g>
</svg>`.trim();

  // Horizontal lockup: mark + wordmark aligned on optical center (bbox center)
  const markX = circleRadius + 10;
  const wordmarkStartX = circleRadius * 2 + 30;
  const lockupMidY = height / 2;
  const horizontalLockupWidth = width * 1.5;
  const horizontalLockupSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${horizontalLockupWidth}" height="${height}" viewBox="0 0 ${horizontalLockupWidth} ${height}" role="img" aria-label="${input.brand_name} horizontal lockup">
  <circle cx="${markX}" cy="${lockupMidY}" r="${circleRadius}" fill="${accent}" />
  <g transform="translate(${markX - markCenterX}, ${lockupMidY - markCenterY})">
    <path d="${markPath}" fill="${secondary}" />
  </g>
  <g transform="translate(${wordmarkStartX - wordmarkCenterX}, ${lockupMidY - wordmarkCenterY})">
    <path d="${wordmarkPath}" fill="${primary}" />
  </g>
</svg>`.trim();

  // Stacked lockup: mark above wordmark, both aligned on optical center
  const stackedHeight = height + width / 2;
  const markStackedY = circleRadius + 20;
  const wordmarkStackedY = circleRadius * 2 + 60;
  const stackedLockupSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stackedHeight}" viewBox="0 0 ${width} ${stackedHeight}" role="img" aria-label="${input.brand_name} stacked lockup">
  <circle cx="${width / 2}" cy="${markStackedY}" r="${circleRadius}" fill="${accent}" />
  <g transform="translate(${width / 2 - markCenterX}, ${markStackedY - markCenterY})">
    <path d="${markPath}" fill="${secondary}" />
  </g>
  <g transform="translate(${width / 2 - wordmarkCenterX}, ${wordmarkStackedY - wordmarkCenterY})">
    <path d="${wordmarkPath}" fill="${primary}" />
  </g>
</svg>`.trim();

  return {
    logo_svg_wordmark: wordmarkSvg,
    logo_svg_mark: markSvg,
    logo_svg_horizontal: horizontalLockupSvg,
    logo_svg_stacked: stackedLockupSvg,
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
