import * as opentype from "opentype.js";
import * as path from "path";
import * as fs from "fs";

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

interface FontToPathOptions {
  text: string;
  fontFamily: "Inter" | "DM Serif Display";
  fontSize: number;
  fontWeight?: number;
  tracking?: number; // Letter spacing in em units
  x?: number;
  y?: number;
}

/**
 * Loads a font file from the assets/fonts directory
 */
function loadFont(fontFamily: "Inter" | "DM Serif Display", fontWeight?: number): opentype.Font {
  const fontWeightStr = fontWeight ? `-${fontWeight}` : "";
  const fontFile = `${fontFamily}${fontWeightStr}.ttf`;
  const fontPath = path.join(FONTS_DIR, fontFile);

  if (!fs.existsSync(fontPath)) {
    // Fallback to default weight if specific weight not found
    const fallbackPath = path.join(FONTS_DIR, `${fontFamily}.ttf`);
    if (fs.existsSync(fallbackPath)) {
      return opentype.loadSync(fallbackPath);
    }
    // Try alternative paths (for different directory structures)
    const altPaths = [
      path.join(process.cwd(), "src", "assets", "fonts", fontFile),
      path.join(process.cwd(), "src", "assets", "fonts", `${fontFamily}.ttf`),
      path.join(__dirname, "..", "..", "assets", "fonts", fontFile),
      path.join(__dirname, "..", "..", "assets", "fonts", `${fontFamily}.ttf`),
    ];
    
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        return opentype.loadSync(altPath);
      }
    }
    
    throw new Error(`Font file not found: ${fontPath}. Please ensure font files are in assets/fonts directory.`);
  }

  return opentype.loadSync(fontPath);
}

/**
 * Converts text to SVG path outlines using opentype.js
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

  try {
    const font = loadFont(fontFamily, fontWeight);
    
    // Calculate text metrics
    const scale = fontSize / font.unitsPerEm;
    const paths: string[] = [];
    
    let currentX = x;
    const baseY = y;
    
    // Render each character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!char) continue;
      
      const glyph = font.charToGlyph(char);
      
      if (glyph) {
        // Get glyph path
        const glyphPath = glyph.getPath(currentX, baseY, fontSize);
        
        // Convert to SVG path string
        const pathData = glyphPath.toSVG(2); // 2 decimal places
        paths.push(pathData);
        
        // Advance to next character position
        const advanceWidth = glyph.advanceWidth ?? glyph.advanceWidth ?? fontSize * 0.6; // Fallback if undefined
        const glyphWidth = advanceWidth * scale;
        currentX += glyphWidth + (tracking * fontSize);
      }
    }
    
    return paths.join(" ");
  } catch (error) {
    console.error(`Error converting text to path: ${error}`);
    // Fallback: return empty path if font loading fails
    return "";
  }
}

/**
 * Gets available font weights for a font family
 */
export function getAvailableFontWeights(fontFamily: "Inter" | "DM Serif Display"): number[] {
  const weights: number[] = [];
  const commonWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  
  for (const weight of commonWeights) {
    const fontPath = path.join(FONTS_DIR, `${fontFamily}-${weight}.ttf`);
    if (fs.existsSync(fontPath)) {
      weights.push(weight);
    }
  }
  
  // Also check for base font file
  const basePath = path.join(FONTS_DIR, `${fontFamily}.ttf`);
  if (fs.existsSync(basePath) && weights.length === 0) {
    weights.push(400); // Default weight
  }
  
  return weights;
}
