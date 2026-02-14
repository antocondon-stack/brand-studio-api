/**
 * Test script: fontToPath with return_glyphs=true — log glyph count and first glyph bbox.
 */

import { fontToPath, type FontToPathOutputWithGlyphs } from "../src/tools/fontToPath.tool";

function main() {
  const result = fontToPath({
    text: "Swapqed",
    font_name: "inter_bold",
    font_size: 32,
    tracking_px: 0,
    return_glyphs: true,
  }) as FontToPathOutputWithGlyphs;

  const glyphCount = result.glyphs?.length ?? 0;
  console.log("Glyph count:", glyphCount);
  if (result.glyphs?.[0]) {
    console.log("First glyph bbox:", result.glyphs[0].bbox);
  }
}

main();
