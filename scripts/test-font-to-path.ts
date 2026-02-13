/**
 * Test script for fontToPath tool
 * Validates that font loading produces real glyph outlines, not placeholder rectangles
 */

import * as fs from "fs";
import * as path from "path";
import { fontToPath, getAvailableFonts, countPathCommands } from "../src/tools/fontToPath.tool";

async function testFontToPath() {
  console.log("🧪 Testing fontToPath tool...\n");
  
  // Check available fonts
  const availableFonts = getAvailableFonts();
  console.log(`Available fonts: ${availableFonts.length > 0 ? availableFonts.join(", ") : "NONE (fonts missing!)"}`);
  
  if (availableFonts.length === 0) {
    console.error("❌ ERROR: No font files found in assets/fonts/");
    console.error("   Please ensure font files exist:");
    console.error("   - assets/fonts/Inter-Regular.ttf");
    console.error("   - assets/fonts/Inter-Bold.ttf");
    console.error("   - assets/fonts/DMSerifDisplay-Regular.ttf");
    console.error("   - assets/fonts/SpaceGrotesk-Regular.ttf");
    process.exit(1);
  }
  
  // Test case: "Swapqed" in inter_bold at size 64
  const testText = "Swapqed";
  const testFont = "inter_bold";
  const testSize = 64;
  const testTracking = 0;
  
  console.log(`\n📝 Test input:`);
  console.log(`   Text: "${testText}"`);
  console.log(`   Font: ${testFont}`);
  console.log(`   Size: ${testSize}px`);
  console.log(`   Tracking: ${testTracking}px`);
  
  try {
    const result = fontToPath({
      text: testText,
      font_name: testFont as "inter" | "inter_bold" | "dm_serif" | "space_grotesk",
      font_size: testSize,
      tracking_px: testTracking,
    });
    
    // Count commands
    const commandCount = countPathCommands(result.path_d);
    
    console.log(`\n✅ FontToPath succeeded:`);
    console.log(`   Command count: ${commandCount}`);
    console.log(`   ViewBox: ${result.viewBox}`);
    console.log(`   Width: ${result.width.toFixed(2)}px`);
    console.log(`   Height: ${result.height.toFixed(2)}px`);
    console.log(`   Path length: ${result.path_d.length} chars`);
    
    // Quality checks
    console.log(`\n🔍 Quality checks:`);
    
    if (commandCount < 30) {
      console.error(`   ❌ FAIL: Command count ${commandCount} < 30 (expected >= 30)`);
      process.exit(1);
    } else {
      console.log(`   ✅ PASS: Command count ${commandCount} >= 30`);
    }
    
    if (result.width < testSize * 0.5) {
      console.error(`   ❌ FAIL: Width ${result.width} < ${testSize * 0.5} (expected >= ${testSize * 0.5})`);
      process.exit(1);
    } else {
      console.log(`   ✅ PASS: Width ${result.width.toFixed(2)} >= ${(testSize * 0.5).toFixed(2)}`);
    }
    
    if (result.height < testSize * 0.4) {
      console.error(`   ❌ FAIL: Height ${result.height} < ${testSize * 0.4} (expected >= ${testSize * 0.4})`);
      process.exit(1);
    } else {
      console.log(`   ✅ PASS: Height ${result.height.toFixed(2)} >= ${(testSize * 0.4).toFixed(2)}`);
    }
    
    // Check for placeholder patterns
    const isPlaceholder = result.path_d.match(/^M\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+L\s+[\d.]+\s+[\d.]+\s+Z$/);
    if (isPlaceholder) {
      console.error(`   ❌ FAIL: Path appears to be a simple rectangle (placeholder)`);
      process.exit(1);
    } else {
      console.log(`   ✅ PASS: Path is not a simple rectangle`);
    }
    
    // Write test SVG
    const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${result.viewBox}" width="${result.width}" height="${result.height}">
  <path d="${result.path_d}" fill="#000000" />
</svg>`;
    
    const outputDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, "wordmark-test.svg");
    fs.writeFileSync(outputPath, testSvg);
    console.log(`\n💾 Test SVG written to: ${outputPath}`);
    
    console.log(`\n✅ All tests passed!`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed:`);
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run test
testFontToPath();
