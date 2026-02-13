import { z } from "zod";

const LockupsFromSvgsInputSchema = z.object({
  brand_name: z.string().min(1),
  wordmark_svg: z.string().min(1),
  wordmark_metrics: z.object({
    viewBox: z.string(),
    width: z.number(),
    height: z.number(),
    centerX: z.number(),
    centerY: z.number(),
    path_d: z.string(),
    primary_color: z.string(),
  }),
  mark_svg: z.string().min(1),
  palette_hex: z.array(z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)),
  regen_seed: z.string().optional(),
});

type LockupsFromSvgsInput = z.infer<typeof LockupsFromSvgsInputSchema>;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Parse SVG viewBox and extract dimensions and center */
function parseSvgViewBox(svg: string): { x: number; y: number; width: number; height: number; centerX: number; centerY: number } {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1]! : "0 0 24 24";
  const parts = viewBox.split(/\s+/).map(Number);
  const x = parts[0] ?? 0;
  const y = parts[1] ?? 0;
  const width = parts[2] ?? 24;
  const height = parts[3] ?? 24;
  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

/** Extract inner content from SVG (remove outer <svg> tags) */
function extractSvgContent(svg: string): string {
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return match && match[1] ? match[1].trim() : "";
}

export function buildLockupsFromSvgs(input: LockupsFromSvgsInput) {
  const seed = hashString(input.regen_seed || input.brand_name);
  const { wordmark_svg, wordmark_metrics, mark_svg, palette_hex } = input;

  // Parse mark SVG to get dimensions
  const markBounds = parseSvgViewBox(mark_svg);
  const markContent = extractSvgContent(mark_svg);
  const wordmarkContent = extractSvgContent(wordmark_svg);

  // Sanity assert: ensure no <text> in mark
  if (markContent.includes("<text")) {
    throw new Error("Mark SVG contains <text> tag - must be path-only");
  }

  // Sanity assert: ensure no <text> in wordmark
  if (wordmarkContent.includes("<text")) {
    throw new Error("Wordmark SVG contains <text> tag - must be path-only");
  }

  // Sanity assert: ensure mark is not primarily circles
  const circleCount = (markContent.match(/<circle/g) || []).length;
  const pathCount = (markContent.match(/<path/g) || []).length;
  if (circleCount > 0) {
    console.warn(`⚠️  Warning: Mark contains ${circleCount} circle(s) - should use tension-based geometry`);
  }
  if (circleCount === 1 && pathCount === 0) {
    throw new Error("Mark SVG is only a single circle - must be a proper motif");
  }
  
  // Sanity assert: mark should have multiple paths for ownability
  if (pathCount < 2 && !markContent.includes("monogram-interlock")) {
    console.warn(`⚠️  Warning: Mark has only ${pathCount} path(s) - may lack visual weight`);
  }

  // Determine mark size for lockups (scale mark to appropriate visual weight)
  const markDisplaySize = 180; // Visual size in lockup canvas
  const markScale = markDisplaySize / markBounds.width;

  // Canvas dimensions
  const wordmarkCanvasWidth = 640;
  const wordmarkCanvasHeight = 320;
  const horizontalLockupWidth = wordmarkCanvasWidth * 1.5;
  const stackedLockupHeight = wordmarkCanvasHeight + markDisplaySize / 2;

  // Padding and spacing
  const markWordmarkGap = 30 + (seed % 20); // 30-50px gap
  const verticalGap = 40 + (seed % 20); // 40-60px gap

  // Horizontal lockup: mark left, wordmark right
  const markX = markDisplaySize / 2 + 20;
  const markY = wordmarkCanvasHeight / 2;
  const wordmarkX = markDisplaySize + markWordmarkGap;
  const wordmarkY = wordmarkCanvasHeight / 2;

  const horizontalLockupSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${horizontalLockupWidth}" height="${wordmarkCanvasHeight}" viewBox="0 0 ${horizontalLockupWidth} ${wordmarkCanvasHeight}" role="img" aria-label="${input.brand_name} horizontal lockup">
  <g transform="translate(${markX - markBounds.centerX * markScale}, ${markY - markBounds.centerY * markScale}) scale(${markScale})">
    ${markContent}
  </g>
  <g transform="translate(${wordmarkX - wordmark_metrics.centerX}, ${wordmarkY - wordmark_metrics.centerY})">
    <path d="${wordmark_metrics.path_d}" fill="${wordmark_metrics.primary_color}" />
  </g>
</svg>`.trim();

  // Stacked lockup: mark above wordmark
  const markStackedX = horizontalLockupWidth / 2;
  const markStackedY = markDisplaySize / 2 + 20;
  const wordmarkStackedX = horizontalLockupWidth / 2;
  const wordmarkStackedY = markDisplaySize + verticalGap;

  const stackedLockupSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${horizontalLockupWidth}" height="${stackedLockupHeight}" viewBox="0 0 ${horizontalLockupWidth} ${stackedLockupHeight}" role="img" aria-label="${input.brand_name} stacked lockup">
  <g transform="translate(${markStackedX - markBounds.centerX * markScale}, ${markStackedY - markBounds.centerY * markScale}) scale(${markScale})">
    ${markContent}
  </g>
  <g transform="translate(${wordmarkStackedX - wordmark_metrics.centerX}, ${wordmarkStackedY - wordmark_metrics.centerY})">
    <path d="${wordmark_metrics.path_d}" fill="${wordmark_metrics.primary_color}" />
  </g>
</svg>`.trim();

  // Mark-only SVG (scaled to standard size)
  const markOnlySize = 640;
  const markOnlyScale = markOnlySize / markBounds.width;
  const markOnlySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${markOnlySize}" height="${markOnlySize}" viewBox="0 0 ${markOnlySize} ${markOnlySize}" role="img" aria-label="${input.brand_name} mark">
  <g transform="translate(${markOnlySize / 2 - markBounds.centerX * markOnlyScale}, ${markOnlySize / 2 - markBounds.centerY * markOnlyScale}) scale(${markOnlyScale})">
    ${markContent}
  </g>
</svg>`.trim();

  return {
    horizontal_svg: horizontalLockupSvg,
    stacked_svg: stackedLockupSvg,
    mark_only_svg: markOnlySvg,
  };
}
