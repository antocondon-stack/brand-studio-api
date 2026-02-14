/**
 * Wordmark engine: real glyph outlines via opentype.js, font caching, optional URL/base64, kerning + pairKern tweaks.
 * Output: single <svg> with grouped <path>, no <text>.
 */

import * as opentype from "opentype.js";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { z } from "zod";

const FONT_FETCH_TIMEOUT_MS = 15000;
const FONT_FETCH_MAX_BYTES = 5 * 1024 * 1024; // 5MB

const FONT_DIRS = [
  path.join(process.cwd(), "assets", "fonts"),
  path.join(process.cwd(), "dist", "assets", "fonts"),
  path.join(__dirname, "..", "..", "assets", "fonts"),
];

const CACHE_DIR = path.join(process.cwd(), "assets", "font-cache");
const LOCAL_FONT_MAP: Record<string, string> = {
  "Inter": "Inter-Regular.ttf",
  "Inter-Regular": "Inter-Regular.ttf",
  "Inter-Bold": "Inter-Bold.ttf",
  "DM Serif Display": "DMSerifDisplay-Regular.ttf",
  "DMSerifDisplay": "DMSerifDisplay-Regular.ttf",
  "Space Grotesk": "SpaceGrotesk-Regular.ttf",
};

const inMemoryFontCache = new Map<string, opentype.Font>();

function sha1(data: string | Buffer): string {
  return crypto.createHash("sha1").update(data).digest("hex").slice(0, 12);
}

function cacheKey(fontFamily: string, fontWeight: number, fontStyle: string, sourceHash: string): string {
  const slug = `${fontFamily}-${fontWeight}-${fontStyle}`.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
  return `${slug}-${sourceHash}`;
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function resolveLocalFont(fontFamily: string, fontWeight: number): string | null {
  const name = fontWeight >= 700 ? "Inter-Bold" : fontFamily;
  const file = LOCAL_FONT_MAP[name] ?? LOCAL_FONT_MAP[fontFamily];
  if (!file) return null;
  const base = file.replace(/\.(ttf|otf)$/i, "");
  for (const dir of FONT_DIRS) {
    for (const ext of [".ttf", ".otf"]) {
      const p = path.join(dir, base + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function fetchFontFromUrl(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > FONT_FETCH_MAX_BYTES) throw new Error("Font file too large");
    return buf;
  } finally {
    clearTimeout(timeout);
  }
}

function loadFontFromBuffer(buffer: Buffer): opentype.Font {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return opentype.parse(arrayBuffer);
}

function getOrLoadFont(
  fontFamily: string,
  fontWeight: number,
  fontStyle: string,
  fontUrl?: string,
  fontDataBase64?: string,
): opentype.Font {
  let sourceHash: string;
  let buffer: Buffer;

  if (fontDataBase64) {
    sourceHash = sha1(fontDataBase64);
    buffer = Buffer.from(fontDataBase64, "base64");
    if (buffer.length > FONT_FETCH_MAX_BYTES) throw new Error("Font data too large");
  } else if (fontUrl) {
    throw new Error("fontUrl must be fetched async; use getOrLoadFontAsync");
  } else {
    const localPath = resolveLocalFont(fontFamily, fontWeight);
    if (!localPath) throw new Error(`Local font not found: ${fontFamily} ${fontWeight}`);
    sourceHash = sha1("local");
    buffer = fs.readFileSync(localPath);
  }

  const key = cacheKey(fontFamily, fontWeight, fontStyle, sourceHash);
  if (inMemoryFontCache.has(key)) return inMemoryFontCache.get(key)!;

  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, `${key}.ttf`);
  if (fs.existsSync(cachePath)) {
    const font = opentype.loadSync(cachePath);
    inMemoryFontCache.set(key, font);
    return font;
  }
  const font = loadFontFromBuffer(buffer);
  try {
    fs.writeFileSync(cachePath, buffer);
  } catch {
    // ignore write errors (e.g. read-only)
  }
  inMemoryFontCache.set(key, font);
  return font;
}

export async function getOrLoadFontAsync(
  fontFamily: string,
  fontWeight: number,
  fontStyle: string,
  fontUrl?: string,
  fontDataBase64?: string,
): Promise<opentype.Font> {
  let sourceHash: string;
  let buffer: Buffer;

  if (fontDataBase64) {
    sourceHash = sha1(fontDataBase64);
    buffer = Buffer.from(fontDataBase64, "base64");
  } else if (fontUrl) {
    sourceHash = sha1(fontUrl);
    buffer = await fetchFontFromUrl(fontUrl);
  } else {
    return getOrLoadFont(fontFamily, fontWeight, fontStyle);
  }

  if (buffer.length > FONT_FETCH_MAX_BYTES) throw new Error("Font file too large");

  const key = cacheKey(fontFamily, fontWeight, fontStyle, sourceHash);
  if (inMemoryFontCache.has(key)) return inMemoryFontCache.get(key)!;

  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, `${key}.ttf`);
  if (fs.existsSync(cachePath)) {
    const font = opentype.loadSync(cachePath);
    inMemoryFontCache.set(key, font);
    return font;
  }
  const font = loadFontFromBuffer(buffer);
  try {
    fs.writeFileSync(cachePath, buffer);
  } catch {
    // ignore
  }
  inMemoryFontCache.set(key, font);
  return font;
}

// --- Schema and engine ---

export const WordmarkEngineInputSchema = z.object({
  text: z.string().min(1),
  fontFamily: z.string().min(1),
  fontWeight: z.number().min(100).max(900).default(400),
  fontStyle: z.string().optional().default("normal"),
  fontUrl: z.string().url().optional(),
  fontDataBase64: z.string().optional(),
  fontSize: z.number().min(1).max(500).default(64),
  tracking: z.number().min(-200).max(200).default(0),
  seed: z.string().optional(),
  routeId: z.string().optional(),
  tweaks: z
    .object({
      pairKern: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  fill: z.string().optional().default("currentColor"),
  stroke: z.string().optional(),
});

export type WordmarkEngineInput = z.infer<typeof WordmarkEngineInputSchema>;

export const WordmarkEngineOutputSchema = z.object({
  svg: z.string(),
  paths: z.array(z.object({ d: z.string(), bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }) })),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  metrics: z.object({
    pathCount: z.number(),
    commandCount: z.number(),
    advanceWidth: z.number(),
  }),
  settingsApplied: z.object({
    fontFamily: z.string(),
    fontWeight: z.number(),
    fontSize: z.number(),
    tracking: z.number(),
    kerning: z.boolean(),
  }),
});

export type WordmarkEngineOutput = z.infer<typeof WordmarkEngineOutputSchema>;

export async function runWordmarkEngine(input: WordmarkEngineInput): Promise<WordmarkEngineOutput> {
  const {
    text,
    fontFamily,
    fontWeight,
    fontStyle = "normal",
    fontUrl,
    fontDataBase64,
    fontSize,
    tracking,
    tweaks,
    fill,
    stroke,
  } = input;

  const font = await getOrLoadFontAsync(fontFamily, fontWeight, fontStyle, fontUrl, fontDataBase64);
  const fontScale = fontSize / font.unitsPerEm;
  const baselineY = fontSize;
  const letterSpacing = tracking !== 0 ? (tracking / 1000) * fontSize : 0;
  const options: { letterSpacing?: number; kerning?: boolean } = {
    kerning: true,
  };
  if (letterSpacing !== 0) options.letterSpacing = letterSpacing / fontSize;

  const glyphs = font.stringToGlyphs(text);
  const paths: { d: string; bbox: { x: number; y: number; w: number; h: number } }[] = [];
  let x = 0;
  const combinedPath = new opentype.Path();

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i]!;
    const glyphPath = glyph.getPath(x, baselineY, fontSize, options, font);
    const d = glyphPath.toPathData(3);
    const gb = glyphPath.getBoundingBox();
    let advance = glyph.advanceWidth ? glyph.advanceWidth * fontScale : (gb.x2 - gb.x1);
    if (options.kerning && i < glyphs.length - 1) {
      const kern = font.getKerningValue(glyph, glyphs[i + 1]!);
      advance += kern * fontScale;
    }
    if (tweaks?.pairKern && i < text.length - 1) {
      const pair = text[i]! + text[i + 1]!;
      const override = tweaks.pairKern[pair];
      if (override !== undefined) advance += override * fontScale;
    }
    if (letterSpacing !== 0) advance += letterSpacing;

    paths.push({
      d,
      bbox: { x: gb.x1, y: gb.y1, w: gb.x2 - gb.x1, h: gb.y2 - gb.y1 },
    });
    combinedPath.extend(glyphPath);
    x += advance;
  }

  const fullD = combinedPath.toPathData(3);
  const bbox = combinedPath.getBoundingBox();
  const bboxObj = {
    x: bbox.x1,
    y: bbox.y1,
    w: bbox.x2 - bbox.x1,
    h: bbox.y2 - bbox.y1,
  };
  const viewBox = `${bbox.x1} ${bbox.y1} ${bboxObj.w} ${bboxObj.h}`;
  const pathAttrs = [`fill="${fill.replace(/"/g, "'")}"`];
  if (stroke) pathAttrs.push(`stroke="${stroke.replace(/"/g, "'")}"`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none"><g><path d="${fullD.replace(/"/g, "'")}" ${pathAttrs.join(" ")}/></g></svg>`;

  const commandCount = (fullD.match(/[MLCQAZ]/gi) || []).length;

  return {
    svg,
    paths,
    bbox: bboxObj,
    metrics: {
      pathCount: paths.length,
      commandCount,
      advanceWidth: x,
    },
    settingsApplied: {
      fontFamily,
      fontWeight,
      fontSize,
      tracking,
      kerning: options.kerning ?? true,
    },
  };
}

export function runWordmarkEngineSync(input: WordmarkEngineInput): WordmarkEngineOutput | null {
  const { fontUrl, fontDataBase64 } = input;
  if (fontUrl) return null;
  let font: opentype.Font;
  try {
    font = getOrLoadFont(
      input.fontFamily,
      input.fontWeight,
      input.fontStyle ?? "normal",
      undefined,
      fontDataBase64,
    );
  } catch {
    return null;
  }
  const {
    text,
    fontFamily,
    fontWeight,
    fontStyle = "normal",
    fontSize,
    tracking,
    tweaks,
    fill = "currentColor",
    stroke,
  } = input;
  const fontScale = fontSize / font.unitsPerEm;
  const baselineY = fontSize;
  const letterSpacing = tracking !== 0 ? (tracking / 1000) * fontSize : 0;
  const options: { letterSpacing?: number; kerning?: boolean } = { kerning: true };
  if (letterSpacing !== 0) options.letterSpacing = letterSpacing / fontSize;

  const glyphs = font.stringToGlyphs(text);
  const paths: { d: string; bbox: { x: number; y: number; w: number; h: number } }[] = [];
  let x = 0;
  const combinedPath = new opentype.Path();

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i]!;
    const glyphPath = glyph.getPath(x, baselineY, fontSize, options, font);
    const d = glyphPath.toPathData(3);
    const gb = glyphPath.getBoundingBox();
    let advance = glyph.advanceWidth ? glyph.advanceWidth * fontScale : (gb.x2 - gb.x1);
    if (options.kerning && i < glyphs.length - 1) {
      advance += font.getKerningValue(glyph, glyphs[i + 1]!) * fontScale;
    }
    if (tweaks?.pairKern && i < text.length - 1) {
      const pair = text[i]! + text[i + 1]!;
      const override = tweaks.pairKern[pair];
      if (override !== undefined) advance += override * fontScale;
    }
    if (letterSpacing !== 0) advance += letterSpacing;

    paths.push({
      d,
      bbox: { x: gb.x1, y: gb.y1, w: gb.x2 - gb.x1, h: gb.y2 - gb.y1 },
    });
    combinedPath.extend(glyphPath);
    x += advance;
  }

  const fullD = combinedPath.toPathData(3);
  const bbox = combinedPath.getBoundingBox();
  const bboxObj = { x: bbox.x1, y: bbox.y1, w: bbox.x2 - bbox.x1, h: bbox.y2 - bbox.y1 };
  const viewBox = `${bbox.x1} ${bbox.y1} ${bboxObj.w} ${bboxObj.h}`;
  const pathAttrs = [`fill="${fill.replace(/"/g, "'")}"`];
  if (stroke) pathAttrs.push(`stroke="${stroke.replace(/"/g, "'")}"`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none"><g><path d="${fullD.replace(/"/g, "'")}" ${pathAttrs.join(" ")}/></g></svg>`;

  return {
    svg,
    paths,
    bbox: bboxObj,
    metrics: {
      pathCount: paths.length,
      commandCount: (fullD.match(/[MLCQAZ]/gi) || []).length,
      advanceWidth: x,
    },
    settingsApplied: {
      fontFamily,
      fontWeight,
      fontSize,
      tracking,
      kerning: options.kerning ?? true,
    },
  };
}
