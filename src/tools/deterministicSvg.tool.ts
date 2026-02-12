import { z } from "zod";
import { tool } from "@openai/agents";

const DeterministicSvgInputSchema = z.object({
  brand_name: z.string().min(1),
  direction_name: z.string().min(1),
  logo_archetype: z.string().min(1),
  keywords: z.array(z.string().min(1)),
  palette_hex: z.array(
    z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{3}){3}$/, "Expected 6-digit hex color"),
  ),
  vibe: z.string().min(1),
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

function buildDeterministicSvgs(input: DeterministicSvgInput) {
  const key = JSON.stringify(input);
  const seed = hashString(key);

  const width = 640;
  const height = 320;

  const [primary, secondary, accent] = [
    input.palette_hex[seed % input.palette_hex.length],
    input.palette_hex[(seed + 1) % input.palette_hex.length],
    input.palette_hex[(seed + 2) % input.palette_hex.length],
  ];

  const radii = [4, 6, 8, 10];
  const radius = pick(radii, seed);

  const wordmarkSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${input.brand_name} wordmark">
  <defs>
    <linearGradient id="grad-${seed}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${primary}" />
      <stop offset="100%" stop-color="${secondary}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${radius}" fill="#050608" />
  <rect x="24" y="${height / 2 - 32}" width="${width - 48}" height="64" rx="${radius}" fill="url(#grad-${seed})" />
  <text
    x="${width / 2}"
    y="${height / 2 + 8}"
    text-anchor="middle"
    font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-weight="700"
    font-size="32"
    fill="#ffffff"
  >
    ${input.brand_name}
  </text>
  <text
    x="32"
    y="${height - 28}"
    text-anchor="start"
    font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-weight="400"
    font-size="12"
    fill="${accent}"
  >
    ${input.direction_name} • ${input.logo_archetype} • ${input.vibe}
  </text>
</svg>`.trim();

  const circleRadius = 72 + (seed % 16);

  const markSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" role="img" aria-label="${input.brand_name} mark">
  <defs>
    <radialGradient id="blob-${seed}" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${accent}" />
      <stop offset="60%" stop-color="${secondary}" />
      <stop offset="100%" stop-color="#050608" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${width}" fill="#050608" />
  <circle
    cx="${width / 2}"
    cy="${width / 2}"
    r="${circleRadius}"
    fill="url(#blob-${seed})"
  />
  <text
    x="${width / 2}"
    y="${width / 2 + 10}"
    text-anchor="middle"
    font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-weight="700"
    font-size="64"
    letter-spacing="4"
    fill="#ffffff"
  >
    ${input.brand_name[0] ?? "?"}
  </text>
</svg>`.trim();

  return {
    logo_svg_wordmark: wordmarkSvg,
    logo_svg_mark: markSvg,
  };
}

export const deterministicSvgLogoTool = tool({
  name: "deterministic_svg_logo",
  description:
    "Generate a deterministic SVG logo wordmark and mark for the given brand and creative direction.",
  parameters: DeterministicSvgInputSchema,
  async execute(args) {
    const input = DeterministicSvgInputSchema.parse(args);
    const result = buildDeterministicSvgs(input);
    return JSON.stringify(result);
  },
});

