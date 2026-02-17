/**
 * Test script: Load Google Fonts (Space Grotesk 700, DM Serif Display 400, Inter 700).
 * Prints font path, command count, bbox.
 */

import { fontToPath, ensureGoogleFontsIndex } from "../src/tools/fontToPath.tool";

async function main() {
  console.log("🧪 Testing Google Fonts loading...\n");

  const index = ensureGoogleFontsIndex();
  console.log(`Google Fonts index: ${index.length} files\n`);

  const testCases = [
    { family: "Space Grotesk", weight: 700 },
    { family: "DM Serif Display", weight: 400 },
    { family: "Inter", weight: 700 },
  ];

  for (const test of testCases) {
    console.log(`📝 Testing: ${test.family} ${test.weight}`);
    try {
      const result = fontToPath({
        text: "Swapqed",
        font_family: test.family,
        font_weight: test.weight,
        font_size: 64,
        tracking_px: 0,
        return_glyphs: false,
      });

      const cmdCount = (result.path_d.match(/[MLCQAZ]/gi) || []).length;
      console.log(`   ✅ Font loaded`);
      console.log(`   Command count: ${cmdCount}`);
      console.log(`   Bbox: ${result.width.toFixed(1)} × ${result.height.toFixed(1)}`);
      console.log(`   ViewBox: ${result.viewBox}`);
      console.log();
    } catch (error) {
      console.error(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
