import * as opentype from "opentype.js";
import * as path from "path";
import * as fs from "fs";
import { z } from "zod";
import { tool } from "@openai/agents";

// Font file mapping
const FONT_FILES: Record<"inter" | "inter_bold" | "dm_serif" | "space_grotesk", string> = {
  inter: "Inter-Regular.ttf",
  inter_bold: "Inter-Bold.ttf",
  dm_serif: "DMSerifDisplay-Regular.ttf",
  space_grotesk: "SpaceGrotesk-Regular.ttf",
};

// Railway-safe font directories (try multiple locations)
const FONT_DIRS = [
  path.join(process.cwd(), "assets", "fonts"),
  path.join(process.cwd(), "dist", "assets", "fonts"), // For Railway build output
  path.join(__dirname, "..", "..", "assets", "fonts"),
  path.join(__dirname, "..", "assets", "fonts"),
];

// In-memory font cache
const fontCache = new Map<string, opentype.Font>();

/**
 * Resolve font file path, trying multiple directories and extensions (.ttf, .otf)
 */
function resolveFontPath(fontName: keyof typeof FONT_FILES): string | null {
  const file = FONT_FILES[fontName];
  const base = file.replace(/\.(ttf|otf)$/i, "");
  const extensions = [".ttf", ".otf"];
  
  for (const dir of FONT_DIRS) {
    for (const ext of extensions) {
      const fontPath = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(fontPath)) {
        return fontPath;
      }
    }
  }
  
  return null;
}

/**
 * Load font with caching. Throws error if font file is missing.
 */
function loadFont(fontName: keyof typeof FONT_FILES): opentype.Font {
  // Check cache first
  if (fontCache.has(fontName)) {
    return fontCache.get(fontName)!;
  }
  
  const fontPath = resolveFontPath(fontName);
  if (!fontPath) {
    const attemptedPaths = FONT_DIRS.map(dir => path.join(dir, FONT_FILES[fontName])).join(", ");
    throw new Error(
      `Font file not found: ${fontName} (${FONT_FILES[fontName]}). Attempted paths: ${attemptedPaths}. ` +
      `Ensure font files exist in assets/fonts/ directory.`
    );
  }
  
  try {
    const font = opentype.loadSync(fontPath);
    fontCache.set(fontName, font);
    return font;
  } catch (error) {
    throw new Error(
      `Failed to load font ${fontName} from ${fontPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Count path commands in path_d string
 */
export function countPathCommands(path_d: string): number {
  const commands = path_d.match(/[MLCQAZ]/gi);
  return commands ? commands.length : 0;
}

/**
 * Quality gate: Check if path has sufficient detail (not a placeholder rectangle)
 */
function validatePathQuality(
  path_d: string,
  width: number,
  height: number,
  font_size: number,
): void {
  const commandCount = countPathCommands(path_d);
  
  // Check command count (real glyphs have many commands)
  if (commandCount < 30) {
    throw new Error(
      `FontToPath quality check failed: path has only ${commandCount} commands (expected >= 30). ` +
      `This suggests font loading failed or produced a placeholder shape.`
    );
  }
  
  // Check dimensions (real glyphs have reasonable aspect ratios)
  if (width < font_size * 0.5) {
    throw new Error(
      `FontToPath quality check failed: width ${width} is too small for font size ${font_size} ` +
      `(expected >= ${font_size * 0.5}).`
    );
  }
  
  if (height < font_size * 0.4) {
    throw new Error(
      `FontToPath quality check failed: height ${height} is too small for font size ${font_size} ` +
      `(expected >= ${font_size * 0.4}).`
    );
  }
  
  // Check if path looks like a simple rectangle (suspiciously few unique coordinates)
  const coords = path_d.match(/[\d.]+/g) || [];
  const uniqueCoords = new Set(coords.map(c => parseFloat(c).toFixed(1))).size;
  if (uniqueCoords < 10) {
    throw new Error(
      `FontToPath quality check failed: path has only ${uniqueCoords} unique coordinates ` +
      `(expected >= 10). This suggests a placeholder shape.`
    );
  }
}

const FontToPathInputSchema = z.object({
  text: z.string().min(1),
  font_name: z.enum(["inter", "inter_bold", "dm_serif", "space_grotesk"]),
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
 * Throws error if font files are missing or if output quality is insufficient.
 * Never returns placeholder shapes - always produces real glyph outlines.
 */
export function fontToPath(input: FontToPathInput): FontToPathOutput {
  const { text, font_name, font_size, tracking_px } = input;
  
  // Fallback font order if primary fails
  const fallbackOrder: Array<keyof typeof FONT_FILES> = [
    font_name,
    font_name === "inter_bold" ? "inter" : font_name === "inter" ? "inter_bold" : "inter",
    "space_grotesk",
    "dm_serif",
  ];
  
  let lastError: Error | null = null;
  
  // Try primary font, then fallbacks
  for (const tryFontName of fallbackOrder) {
    try {
      const font = loadFont(tryFontName);
      
      // Build path with tracking
      const letterSpacing = tracking_px !== 0 ? tracking_px / font_size : undefined;
      const options: { letterSpacing?: number } = {};
      if (letterSpacing !== undefined) options.letterSpacing = letterSpacing;
      
      // Use baseline at y = fontSize so glyphs sit positive
      const baselineY = font_size;
      const path = font.getPath(text, 0, baselineY, font_size, options);
      const path_d = path.toPathData(3); // Precision 3 for quality
      
      // Get bounding box
      const bbox = path.getBoundingBox();
      const x1 = bbox.x1;
      const y1 = bbox.y1;
      const x2 = bbox.x2;
      const y2 = bbox.y2;
      const width = x2 - x1;
      const height = y2 - y1;
      
      // Validate bounds
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        throw new Error(`Invalid bounding box: width=${width}, height=${height}`);
      }
      
      // Quality gate: ensure path has sufficient detail
      validatePathQuality(path_d, width, height, font_size);
      
      const viewBox = `${x1} ${y1} ${width} ${height}`;
      
      return {
        path_d,
        viewBox,
        width,
        height,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Continue to next fallback
      continue;
    }
  }
  
  // All fonts failed
  throw new Error(
    `FontToPath failed: all font attempts failed. Last error: ${lastError?.message}. ` +
    `Ensure font files exist in assets/fonts/ directory.`
  );
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

/**
 * Get all available font names (for debugging/testing)
 */
export function getAvailableFonts(): string[] {
  const available: string[] = [];
  for (const fontName of Object.keys(FONT_FILES) as Array<keyof typeof FONT_FILES>) {
    if (hasFontFile(fontName)) {
      available.push(fontName);
    }
  }
  return available;
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
): "inter" | "inter_bold" | "dm_serif" | "space_grotesk" {
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
      // Font not available, skip
    }
  }
  return weights.length ? weights : [400];
}
