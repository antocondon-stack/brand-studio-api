import { z } from "zod";
import { tool } from "@openai/agents";
import { textToPath } from "./fontToPath.tool";

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
  tracking: z.number().optional().default(0), // Letter spacing in em units
});

type DeterministicSvgInput = z.infer<typeof DeterministicSvgInputSchema>;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function pick<T>(items: T[], seed: number): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty array");
  }
  const index = seed % items.length;
  return items[index]!; // Safe because we checked length > 0
}

export function buildDeterministicSvgs(input: DeterministicSvgInput) {
  const key = JSON.stringify(input);
  const seed = hashString(key);

  const width = 640;
  const height = 320;
  const tracking = input.tracking ?? 0;

  // Select colors from palette
  const [primary, secondary, accent] = [
    input.palette_hex[seed % input.palette_hex.length],
    input.palette_hex[(seed + 1) % input.palette_hex.length],
    input.palette_hex[(seed + 2) % input.palette_hex.length],
  ];

  // Determine font family based on archetype
  const fontFamily = input.logo_archetype.includes("serif") || 
                     input.logo_archetype.includes("display") 
                     ? "DM Serif Display" 
                     : "Inter";
  const fontWeight = 700; // Bold for logos

  // Generate wordmark text path (start at 0,0 for proper measurement)
  const wordmarkPath = textToPath({
    text: input.brand_name,
    fontFamily: fontFamily as "Inter" | "DM Serif Display",
    fontSize: 32,
    fontWeight,
    tracking,
    x: 0,
    y: 0,
  });

  // Wordmark SVG (centered, no gradients)
  const wordmarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${input.brand_name} wordmark">
  <g transform="translate(${width / 2}, ${height / 2 + 8})" text-anchor="middle">
    <path d="${wordmarkPath}" fill="${primary}" />
  </g>
</svg>`.trim();

  // Mark SVG (symbol/icon)
  const circleRadius = 72 + (seed % 16);
  const initialChar = input.brand_name[0]?.toUpperCase() ?? "?";
  
  const markPath = textToPath({
    text: initialChar,
    fontFamily: fontFamily as "Inter" | "DM Serif Display",
    fontSize: 64,
    fontWeight,
    tracking: 0,
    x: 0,
    y: 0,
  });

  const markSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" role="img" aria-label="${input.brand_name} mark">
  <circle
    cx="${width / 2}"
    cy="${width / 2}"
    r="${circleRadius}"
    fill="${accent}"
  />
  <g transform="translate(${width / 2}, ${width / 2 + 10})" text-anchor="middle">
    <path d="${markPath}" fill="${secondary}" />
  </g>
</svg>`.trim();

  // Horizontal lockup (wordmark + mark side by side, no gradients)
  const horizontalLockupWidth = width * 1.5;
  const horizontalLockupSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${horizontalLockupWidth}" height="${height}" viewBox="0 0 ${horizontalLockupWidth} ${height}" role="img" aria-label="${input.brand_name} horizontal lockup">
  <circle
    cx="${circleRadius + 10}"
    cy="${height / 2}"
    r="${circleRadius}"
    fill="${accent}"
  />
  <g transform="translate(${circleRadius + 10}, ${height / 2 + 10})" text-anchor="middle">
    <path d="${markPath}" fill="${secondary}" />
  </g>
  <g transform="translate(${circleRadius * 2 + 30}, ${height / 2 + 8})">
    <path d="${wordmarkPath}" fill="${primary}" />
  </g>
</svg>`.trim();

  // Stacked lockup (mark above wordmark, no gradients)
  const stackedHeight = height + width / 2;
  const stackedLockupSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stackedHeight}" viewBox="0 0 ${width} ${stackedHeight}" role="img" aria-label="${input.brand_name} stacked lockup">
  <circle
    cx="${width / 2}"
    cy="${circleRadius + 20}"
    r="${circleRadius}"
    fill="${accent}"
  />
  <g transform="translate(${width / 2}, ${circleRadius + 30})" text-anchor="middle">
    <path d="${markPath}" fill="${secondary}" />
  </g>
  <g transform="translate(${width / 2}, ${circleRadius * 2 + 60})" text-anchor="middle">
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
    "Generate deterministic SVG logos with font paths (wordmark, mark, horizontal and stacked lockups) for the given brand and creative direction.",
  parameters: DeterministicSvgInputSchema,
  async execute(args) {
    const input = DeterministicSvgInputSchema.parse(args);
    const result = buildDeterministicSvgs(input);
    return JSON.stringify(result);
  },
});
