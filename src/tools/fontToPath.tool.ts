import * as opentype from "opentype.js";
import * as path from "path";
import * as fs from "fs";
import { z } from "zod";
import { tool } from "@openai/agents";

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

const FONT_FILES: Record<"inter" | "inter_bold" | "dm_serif", string> = {
  inter: "Inter-Regular.ttf",
  inter_bold: "Inter-Bold.ttf",
  dm_serif: "DMSerifDisplay-Regular.ttf",
};

const FONT_DIRS = [
  FONTS_DIR,
  path.join(process.cwd(), "assets", "fonts"),
  path.join(__dirname, "..", "..", "assets", "fonts"),
];

function resolveFontPath(fontName: keyof typeof FONT_FILES): string | null {
  const file = FONT_FILES[fontName];
  const base = file.replace(/\.ttf$/i, "");
  const toTry = [`${base}.ttf`, `${base}.otf`];
  for (const dir of FONT_DIRS) {
    for (const name of toTry) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function loadFont(fontName: keyof typeof FONT_FILES): opentype.Font | null {
  const fontPath = resolveFontPath(fontName);
  if (!fontPath) return null;
  try {
    return opentype.loadSync(fontPath);
  } catch {
    return null;
  }
}

/** Fallback when fonts are missing: simple bar shape so /finalize does not 500 */
function fallbackPathOutput(text: string, font_size: number, tracking_px: number): FontToPathOutput {
  const len = Math.max(1, text.length);
  const width = len * font_size * 0.6 + (len - 1) * (tracking_px ?? 0);
  const height = font_size * 1.2;
  const path_d = `M 0 ${height * 0.2} L ${width} ${height * 0.2} L ${width} ${height * 0.5} L 0 ${height * 0.5} Z`;
  return {
    path_d,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
  };
}

const FontToPathInputSchema = z.object({
  text: z.string().min(1),
  font_name: z.enum(["inter", "inter_bold", "dm_serif"]),
  font_size: z.number().min(1).max(2000),
  tracking_px: z.number().min(-50).max(200).default(0),
});

const FontToPathOutputSchema = z.object({
  path_d: z.string(),
  viewBox: z.string(),
  width: z.number(),
  height: z.number(),
});

export type FontToPathInput = z.infer<typeof FontToPathInputSchema>;
export type FontToPathOutput = z.infer<typeof FontToPathOutputSchema>;

/**
 * Convert text to a single SVG path and tight viewBox using opentype.js.
 * When font files are missing (e.g. on Railway without assets/fonts), returns a fallback bar shape so the API does not 500.
 */
export function fontToPath(input: FontToPathInput): FontToPathOutput {
  const { text, font_name, font_size, tracking_px } = input;
  const font = loadFont(font_name);

  if (!font) {
    return fallbackPathOutput(text, font_size, tracking_px);
  }

  const letterSpacing =
    tracking_px !== 0 ? tracking_px / font_size : undefined;
  const options: { letterSpacing?: number } = {};
  if (letterSpacing !== undefined) options.letterSpacing = letterSpacing;

  const path = font.getPath(text, 0, 0, font_size, options);
  const path_d = path.toPathData(2);

  const bbox = path.getBoundingBox();
  const x1 = bbox.x1;
  const y1 = bbox.y1;
  const x2 = bbox.x2;
  const y2 = bbox.y2;
  const width = x2 - x1;
  const height = y2 - y1;

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return fallbackPathOutput(text, font_size, tracking_px);
  }

  const viewBox = `${x1} ${y1} ${width} ${height}`;

  return {
    path_d,
    viewBox,
    width,
    height,
  };
}

export const font_to_path = tool({
  name: "font_to_path",
  description:
    "Convert text to an SVG path outline using opentype.js. Returns path_d, tight viewBox, and dimensions. Uses assets/fonts (Inter-Regular, Inter-Bold, DMSerifDisplay-Regular).",
  parameters: FontToPathInputSchema,
  async execute(args) {
    const input = FontToPathInputSchema.parse(args);
    const result = fontToPath(input);
    return JSON.stringify(result);
  },
});

/** Check if a font file exists (for tool description / health). */
export function hasFontFile(fontName: keyof typeof FONT_FILES): boolean {
  return resolveFontPath(fontName) !== null;
}

// --- Legacy API for existing callers (deterministicSvg, motifMark) ---

export type LegacyFontFamily = "Inter" | "DM Serif Display";

interface FontToPathOptions {
  text: string;
  fontFamily: LegacyFontFamily;
  fontSize: number;
  fontWeight?: number;
  tracking?: number;
  x?: number;
  y?: number;
}

function legacyFontName(
  fontFamily: LegacyFontFamily,
  fontWeight?: number,
): "inter" | "inter_bold" | "dm_serif" {
  if (fontFamily === "DM Serif Display") return "dm_serif";
  return fontWeight === 700 ? "inter_bold" : "inter";
}

/**
 * Legacy: converts text to SVG path d string. Used by deterministicSvg and motifMark.
 * Tracking in em units (tracking * fontSize = tracking_px equivalent when tracking is in em).
 */
export function textToPath(options: FontToPathOptions): string {
  const {
    text,
    fontFamily,
    fontSize,
    fontWeight = 400,
    tracking = 0,
    x = 0,
    y = 0,
  } = options;

  const fontName = legacyFontName(
    fontFamily as LegacyFontFamily,
    fontWeight,
  );
  const tracking_px = tracking * fontSize;
  const result = fontToPath({
    text,
    font_name: fontName,
    font_size: fontSize,
    tracking_px,
  });
  return result.path_d;
}

export function getAvailableFontWeights(
  fontFamily: "Inter" | "DM Serif Display",
): number[] {
  const names: ("inter" | "inter_bold" | "dm_serif")[] =
    fontFamily === "Inter" ? ["inter", "inter_bold"] : ["dm_serif"];
  const weights: number[] = [];
  for (const name of names) {
    if (loadFont(name)) weights.push(name === "inter_bold" ? 700 : 400);
  }
  return weights.length ? weights : [400];
}
