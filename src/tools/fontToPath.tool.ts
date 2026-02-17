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

// Railway-safe font directories (try multiple locations, dist first for production)
const FONT_DIRS = [
  path.join(process.cwd(), "dist", "assets", "fonts"), // For Railway build output (dist first)
  path.join(process.cwd(), "assets", "fonts"),
  path.join(__dirname, "..", "..", "assets", "fonts"),
  path.join(__dirname, "..", "assets", "fonts"),
  process.platform !== "win32" ? "/tmp/fonts" : null,
].filter((d): d is string => d !== null);

// In-memory font cache
const fontCache = new Map<string, opentype.Font>();

// --- Google Fonts support ---

type FontIndexEntry = {
  family: string;
  file: string;
  fullPath: string;
  style?: "normal" | "italic";
  weight?: number;
};

let googleFontIndex: FontIndexEntry[] | null = null;

function getGoogleFontsDirs(): string[] {
  const dirs: string[] = [];
  // Check dist first (production build)
  dirs.push(path.join(process.cwd(), "dist", "assets", "google-fonts"));
  if (process.env.GOOGLE_FONTS_DIR) {
    dirs.push(path.resolve(process.env.GOOGLE_FONTS_DIR));
  }
  dirs.push(path.join(process.cwd(), "assets", "google-fonts"));
  if (process.platform !== "win32") {
    dirs.push("/app/assets/google-fonts"); // Railway safety
  }
  return dirs;
}

function inferWeightFromFilename(filename: string): number | undefined {
  const lower = filename.toLowerCase();
  if (lower.includes("thin")) return 100;
  if (lower.includes("extralight") || lower.includes("extra-light")) return 200;
  if (lower.includes("light")) return 300;
  if (lower.includes("regular") || lower.includes("normal")) return 400;
  if (lower.includes("medium")) return 500;
  if (lower.includes("semibold") || lower.includes("semi-bold")) return 600;
  if (lower.includes("bold")) return 700;
  if (lower.includes("extrabold") || lower.includes("extra-bold")) return 800;
  if (lower.includes("black")) return 900;
  return undefined;
}

function inferStyleFromFilename(filename: string): "normal" | "italic" | undefined {
  const lower = filename.toLowerCase();
  return lower.includes("italic") ? "italic" : "normal";
}

function buildGoogleFontsIndex(rootDir: string): FontIndexEntry[] {
  const index: FontIndexEntry[] = [];
  if (!fs.existsSync(rootDir)) return index;

  const subdirs = ["ofl", "apache", "ufl"];
  for (const subdir of subdirs) {
    const subdirPath = path.join(rootDir, subdir);
    if (!fs.existsSync(subdirPath)) continue;

    try {
      const entries = fs.readdirSync(subdirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const familyDir = path.join(subdirPath, entry.name);
        const familyName = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");

        try {
          const files = fs.readdirSync(familyDir);
          for (const file of files) {
            if (!file.toLowerCase().endsWith(".ttf")) continue;
            const fullPath = path.join(familyDir, file);
            const weight = inferWeightFromFilename(file);
            const style = inferStyleFromFilename(file);
            const entry: FontIndexEntry = {
              family: familyName,
              file,
              fullPath,
            };
            if (weight !== undefined) entry.weight = weight;
            if (style !== undefined) entry.style = style;
            index.push(entry);
          }
        } catch {
          // Skip if can't read family dir
        }
      }
    } catch {
      // Skip if can't read subdir
    }
  }

  return index;
}

let googleFontsStartupLogged = false;
let selectedGoogleFontsRoot: string | null = null;

export function getSelectedGoogleFontsRoot(): string | null {
  return selectedGoogleFontsRoot;
}

export function ensureGoogleFontsIndex(): FontIndexEntry[] {
  if (googleFontIndex !== null) return googleFontIndex;

  const dirs = getGoogleFontsDirs();
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      googleFontIndex = buildGoogleFontsIndex(dir);
      if (googleFontIndex.length > 0) {
        selectedGoogleFontsRoot = dir;
        const ttfCount = googleFontIndex.filter((e) => e.file.toLowerCase().endsWith(".ttf")).length;
        if (!googleFontsStartupLogged) {
          console.log(`✅ Google Fonts index built: ${googleFontIndex.length} files (${ttfCount} .ttf) from ${dir}`);
          googleFontsStartupLogged = true;
        }
        return googleFontIndex;
      }
    }
  }

  googleFontIndex = [];
  selectedGoogleFontsRoot = null;
  if (!googleFontsStartupLogged) {
    console.warn(`⚠️  Google Fonts directory not found. Tried: ${dirs.join(", ")}`);
    googleFontsStartupLogged = true;
  }
  return googleFontIndex;
}

function normalizeFamilyName(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveGoogleFontTtf(
  family: string,
  weight: number,
  style: "normal" | "italic",
): string | null {
  const index = ensureGoogleFontsIndex();
  if (index.length === 0) return null;

  const normalized = normalizeFamilyName(family);
  const candidates = index.filter((e) => e.family === normalized);

  if (candidates.length === 0) return null;

  // Prefer exact weight match, then nearest
  const withStyle = candidates.filter((e) => (e.style ?? "normal") === style);
  const candidatesToUse = withStyle.length > 0 ? withStyle : candidates;

  let best: FontIndexEntry | null = null;
  let bestWeightDiff = Infinity;

  for (const candidate of candidatesToUse) {
    const candidateWeight = candidate.weight ?? 400;
    const diff = Math.abs(candidateWeight - weight);
    if (diff < bestWeightDiff) {
      bestWeightDiff = diff;
      best = candidate;
    }
  }

  return best && fs.existsSync(best.fullPath) ? best.fullPath : null;
}

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
 * Supports both legacy font_name mapping and Google Fonts via font_family.
 */
function loadFont(
  fontName?: keyof typeof FONT_FILES,
  fontFamily?: string,
  fontWeight?: number,
  fontStyle?: "normal" | "italic",
): opentype.Font {
  // If font_family is provided, try Google Fonts first
  if (fontFamily && fontWeight !== undefined && fontStyle !== undefined) {
    const cacheKey = `google:${fontFamily}:${fontWeight}:${fontStyle}`;
    if (fontCache.has(cacheKey)) {
      return fontCache.get(cacheKey)!;
    }

    const googlePath = resolveGoogleFontTtf(fontFamily, fontWeight, fontStyle);
    if (googlePath) {
      try {
        const font = opentype.loadSync(googlePath);
        fontCache.set(cacheKey, font);
        return font;
      } catch (error) {
        throw new Error(
          `Failed to load Google Font ${fontFamily} ${fontWeight} ${fontStyle} from ${googlePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Not found in Google Fonts - provide helpful error
    const index = ensureGoogleFontsIndex();
    const dirs = getGoogleFontsDirs();
    const existingDir = dirs.find((d) => fs.existsSync(d));
    throw new Error(
      `Google Font not found: family="${fontFamily}", weight=${fontWeight}, style=${fontStyle}. ` +
        (index.length === 0
          ? `Google Fonts directory not found. Tried: ${dirs.join(", ")}. Set GOOGLE_FONTS_DIR env var or ensure assets/google-fonts exists.`
          : `Index has ${index.length} fonts. Ensure the font family name matches (normalized: ${normalizeFamilyName(fontFamily)}).`)
    );
  }

  // Legacy path: use font_name mapping
  if (!fontName) {
    throw new Error("Either font_name or font_family must be provided");
  }

  // Check cache first
  if (fontCache.has(fontName)) {
    return fontCache.get(fontName)!;
  }

  const fontPath = resolveFontPath(fontName);
  if (!fontPath) {
    const attemptedPaths = FONT_DIRS.map((dir) => path.join(dir, FONT_FILES[fontName])).join(", ");
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
 * Detect placeholder rectangle (simple M/L/Z path with 4-5 points)
 */
function isPlaceholderRectangle(path_d: string): boolean {
  const commands = path_d.match(/[MLCQAZ]/gi) || [];
  if (commands.length < 4 || commands.length > 6) return false;
  const coords = path_d.match(/[\d.]+/g) || [];
  const uniqueCoords = new Set(coords.map((c) => parseFloat(c).toFixed(1))).size;
  return uniqueCoords <= 8 && /^M\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+Z$/i.test(path_d.trim().replace(/\s+/g, " "));
}

/**
 * Quality gate: Check if path has sufficient detail (not a placeholder rectangle)
 * Throws error in production unless ALLOW_WORDMARK_FALLBACK=true or DEMO_MODE=true
 */
function validatePathQuality(
  path_d: string,
  width: number,
  height: number,
  font_size: number,
): void {
  const commandCount = countPathCommands(path_d);
  const allowFallback = process.env.ALLOW_WORDMARK_FALLBACK === "true" || process.env.DEMO_MODE === "true";
  
  // Check if placeholder rectangle
  if (isPlaceholderRectangle(path_d)) {
    if (!allowFallback) {
      throw new Error(
        `FontToPath quality check failed: placeholder rectangle detected. ` +
        `This indicates fonts are missing. Set ALLOW_WORDMARK_FALLBACK=true for local demos only. ` +
        `Check /debug/fonts endpoint for font availability.`
      );
    }
    console.warn("⚠️  Placeholder rectangle detected (ALLOW_WORDMARK_FALLBACK=true)");
    return;
  }
  
  // Check command count (real glyphs have many commands)
  if (commandCount < 30) {
    if (!allowFallback) {
      throw new Error(
        `FontToPath quality check failed: path has only ${commandCount} commands (expected >= 30). ` +
        `This suggests font loading failed or produced a placeholder shape. ` +
        `Check /debug/fonts endpoint for font availability.`
      );
    }
    console.warn(`⚠️  Low command count ${commandCount} (ALLOW_WORDMARK_FALLBACK=true)`);
    return;
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
    if (!allowFallback) {
      throw new Error(
        `FontToPath quality check failed: path has only ${uniqueCoords} unique coordinates ` +
        `(expected >= 10). This suggests a placeholder shape. ` +
        `Check /debug/fonts endpoint for font availability.`
      );
    }
    console.warn(`⚠️  Low unique coordinates ${uniqueCoords} (ALLOW_WORDMARK_FALLBACK=true)`);
  }
}

const FontToPathInputSchema = z
  .object({
    text: z.string().min(1),
    font_name: z.enum(["inter", "inter_bold", "dm_serif", "space_grotesk"]).optional(),
    font_family: z.string().optional(),
    font_weight: z.number().min(100).max(900).optional(),
    font_style: z.enum(["normal", "italic"]).optional(),
    font_size: z.number().min(1).max(2000),
    tracking_px: z.number().min(-50).max(200).default(0),
    return_glyphs: z.boolean().optional().default(false),
  })
  .refine((data) => data.font_name || data.font_family, {
    message: "Either font_name or font_family must be provided",
  })
  .refine(
    (data) => !data.font_family || (data.font_weight !== undefined && data.font_style !== undefined),
    {
      message: "font_weight and font_style are required when font_family is provided",
    },
  );

const FontToPathOutputSchema = z.object({
  path_d: z.string(),
  viewBox: z.string(),
  width: z.number(),
  height: z.number(),
});

const GlyphRunItemSchema = z.object({
  index: z.number(),
  char: z.string(),
  path_d: z.string(),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  advance: z.number(),
});

export type FontToPathInput = z.infer<typeof FontToPathInputSchema>;
export type FontToPathOutput = z.infer<typeof FontToPathOutputSchema>;
export type FontToPathOutputWithGlyphs = FontToPathOutput & {
  glyphs: z.infer<typeof GlyphRunItemSchema>[];
};

/**
 * Convert text to a single SVG path and tight viewBox using opentype.js.
 * Throws error if font files are missing or if output quality is insufficient.
 * Never returns placeholder shapes - always produces real glyph outlines.
 * When return_glyphs is true, returns per-glyph path_d, bbox, and advance.
 */
export function fontToPath(input: FontToPathInput): FontToPathOutput | FontToPathOutputWithGlyphs {
  const {
    text,
    font_name,
    font_family,
    font_weight,
    font_style,
    font_size,
    tracking_px,
    return_glyphs,
  } = input;

  // Defaults only when using font_family
  const weight = font_family ? (font_weight ?? 400) : 400;
  const style = font_family ? (font_style ?? "normal") : "normal";

  let lastError: Error | null = null;

  // Priority: font_family (Google Fonts) > font_name (legacy mapping)
  if (font_family) {
    try {
      const font = loadFont(undefined, font_family, weight, style);
      return renderFontPath(font, text, font_size, tracking_px, return_glyphs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      throw lastError;
    }
  }

  // Legacy path: use font_name with fallback order
  if (!font_name) {
    throw new Error("Either font_name or font_family must be provided");
  }

  const fallbackOrder: Array<keyof typeof FONT_FILES> = [
    font_name,
    font_name === "inter_bold" ? "inter" : font_name === "inter" ? "inter_bold" : "inter",
    "space_grotesk",
    "dm_serif",
  ];

  // Try primary font, then fallbacks
  for (const tryFontName of fallbackOrder) {
    try {
      const font = loadFont(tryFontName);
      return renderFontPath(font, text, font_size, tracking_px, return_glyphs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }

  throw new Error(
    `FontToPath failed: all font attempts failed. Last error: ${lastError?.message}. ` +
      `Ensure font files exist in assets/fonts/ directory.`
  );
}

function renderFontPath(
  font: opentype.Font,
  text: string,
  font_size: number,
  tracking_px: number,
  return_glyphs: boolean,
): FontToPathOutput | FontToPathOutputWithGlyphs {
  const fontScale = font_size / font.unitsPerEm;
  const letterSpacing = tracking_px !== 0 ? tracking_px / font_size : undefined;
  const options: { letterSpacing?: number } = {};
  if (letterSpacing !== undefined) options.letterSpacing = letterSpacing;

  // Use baseline at y = fontSize so glyphs sit positive
  const baselineY = font_size;

  if (return_glyphs) {
    const glyphs: Array<{
      index: number;
      char: string;
      path_d: string;
      bbox: { x: number; y: number; w: number; h: number };
      advance: number;
    }> = [];
    let x = 0;
    let combinedPath: opentype.Path | null = null;

    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      const glyph = font.charToGlyph(char);
      const glyphPath = glyph.getPath(x, baselineY, font_size, options, font);
      const path_d = glyphPath.toPathData(3);
      const gbbox = glyphPath.getBoundingBox();
      const advance = glyph.advanceWidth ? glyph.advanceWidth * fontScale : (gbbox.x2 - gbbox.x1);
      const advancePx = advance + (letterSpacing !== undefined ? letterSpacing * font_size : 0);

      glyphs.push({
        index: i,
        char,
        path_d,
        bbox: {
          x: gbbox.x1,
          y: gbbox.y1,
          w: gbbox.x2 - gbbox.x1,
          h: gbbox.y2 - gbbox.y1,
        },
        advance: advancePx,
      });

      if (!combinedPath) combinedPath = new opentype.Path();
      combinedPath.extend(glyphPath);
      x += advancePx;
    }

    if (glyphs.length === 0) {
      throw new Error("No glyphs produced");
    }

    const path_d = combinedPath!.toPathData(3);
    const bbox = combinedPath!.getBoundingBox();
    const x1 = bbox.x1;
    const y1 = bbox.y1;
    const width = bbox.x2 - x1;
    const height = bbox.y2 - y1;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(`Invalid bounding box: width=${width}, height=${height}`);
    }
    validatePathQuality(path_d, width, height, font_size);

    const viewBox = `${x1} ${y1} ${width} ${height}`;
    return {
      path_d,
      viewBox,
      width,
      height,
      glyphs,
    };
  }

  // Original combined path only
  const path = font.getPath(text, 0, baselineY, font_size, options);
  const path_d = path.toPathData(3);
  const bbox = path.getBoundingBox();
  const x1 = bbox.x1;
  const y1 = bbox.y1;
  const width = bbox.x2 - x1;
  const height = bbox.y2 - y1;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid bounding box: width=${width}, height=${height}`);
  }
  validatePathQuality(path_d, width, height, font_size);

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
    return_glyphs: false,
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
