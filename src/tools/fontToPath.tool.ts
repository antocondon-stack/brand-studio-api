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

function resolveFontPath(fontName: keyof typeof FONT_FILES): string {
  const file = FONT_FILES[fontName];
  const candidates = [
    path.join(FONTS_DIR, file),
    path.join(process.cwd(), "assets", "fonts", file),
    path.join(__dirname, "..", "..", "assets", "fonts", file),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Font file not found: ${file}. Place OFL fonts in assets/fonts/ (see assets/fonts/README.md).`,
  );
}

function loadFont(fontName: keyof typeof FONT_FILES): opentype.Font {
  const fontPath = resolveFontPath(fontName);
  return opentype.loadSync(fontPath);
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
 * Tracking is applied by adjusting advance per glyph (letterSpacing), not CSS.
 */
export function fontToPath(input: FontToPathInput): FontToPathOutput {
  const { text, font_name, font_size, tracking_px } = input;
  const font = loadFont(font_name);

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
    throw new Error(
      "font_to_path: path bounds invalid (empty text or font error).",
    );
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
    try {
      loadFont(name);
      weights.push(name === "inter_bold" ? 700 : 400);
    } catch {
      // skip
    }
  }
  return weights.length ? weights : [400];
}
