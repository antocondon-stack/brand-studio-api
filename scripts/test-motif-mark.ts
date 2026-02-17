/**
 * Test script for motif mark generation, especially monogram-interlock scaling
 */

import { generateMotifMark } from "../src/tools/motifMark.tool";
import * as fs from "fs";
import * as path from "path";

function extractNumbersFromSvg(svg: string): number[] {
  const numbers = svg.match(/[-+]?\d*\.?\d+/g)?.map(parseFloat).filter(n => !isNaN(n)) || [];
  return numbers;
}

function checkCoordsInRange(svg: string, grid: number, tolerance: number = 5): boolean {
  const numbers = extractNumbersFromSvg(svg);
  const maxCoord = numbers.length > 0 ? Math.max(...numbers.map(Math.abs)) : 0;
  const maxAllowed = grid + tolerance;
  return maxCoord <= maxAllowed;
}

function testMonogramInterlock() {
  console.log("🧪 Testing monogram-interlock mark generation...\n");
  
  const testCases = [
    { brandName: "Swapqed", expectedTwoInitials: false },
    { brandName: "Swap Qed", expectedTwoInitials: true },
    { brandName: "Brand Studio", expectedTwoInitials: true },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`Testing: "${testCase.brandName}"`);
    
    try {
      const result = generateMotifMark({
        brand_name: testCase.brandName,
        motif_family: "monogram-interlock",
        seed: `test-${testCase.brandName}`,
        grid: 24,
        stroke_px: 2,
        corner_radius_px: 2,
        primary_hex: "#000000",
        use_fill: true,
      });
      
      // Check 1: No <text> tags
      if (result.mark_svg.includes("<text")) {
        console.error(`  ❌ FAIL: Contains <text> tag`);
        failed++;
        continue;
      }
      
      // Check 2: Coordinates are within reasonable range
      const coordsInRange = checkCoordsInRange(result.mark_svg, 24, 5);
      if (!coordsInRange) {
        const numbers = extractNumbersFromSvg(result.mark_svg);
        const maxCoord = numbers.length > 0 ? Math.max(...numbers.map(Math.abs)) : 0;
        console.error(`  ❌ FAIL: Coordinates out of range (max: ${maxCoord.toFixed(1)}, expected <= 29)`);
        failed++;
        continue;
      }
      
      // Check 3: Has transform attribute (indicates scaling was applied)
      const hasTransform = result.mark_svg.includes('transform="');
      if (!hasTransform) {
        console.error(`  ❌ FAIL: Missing transform attribute (mark may be unscaled)`);
        failed++;
        continue;
      }
      
      // Check 4: ViewBox is correct
      const viewBoxMatch = result.mark_svg.match(/viewBox=["']([^"']+)["']/);
      if (!viewBoxMatch || viewBoxMatch[1] !== "0 0 24 24") {
        console.error(`  ❌ FAIL: Incorrect viewBox (got: ${viewBoxMatch?.[1]}, expected: 0 0 24 24)`);
        failed++;
        continue;
      }
      
      console.log(`  ✅ PASS: All checks passed`);
      passed++;
      
      // Write test output to file for inspection
      const outputDir = path.join(process.cwd(), "test-output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const filename = `monogram-${testCase.brandName.replace(/\s+/g, "-")}.svg`;
      fs.writeFileSync(path.join(outputDir, filename), result.mark_svg);
      console.log(`  📄 Saved to test-output/${filename}`);
      
    } catch (error) {
      console.error(`  ❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
    
    console.log("");
  }
  
  // Test non-monogram families are unaffected
  console.log("Testing non-monogram families...\n");
  const nonMonogramFamilies: Array<"loop" | "interlock" | "orbit" | "fold" | "swap"> = [
    "loop", "interlock", "orbit", "fold", "swap"
  ];
  
  for (const family of nonMonogramFamilies) {
    try {
      const result = generateMotifMark({
        brand_name: "Test Brand",
        motif_family: family,
        seed: `test-${family}`,
        grid: 24,
        stroke_px: 2,
        corner_radius_px: 2,
        primary_hex: "#000000",
        use_fill: true,
      });
      
      if (result.mark_svg.includes("<text")) {
        console.error(`  ❌ FAIL (${family}): Contains <text> tag`);
        failed++;
      } else {
        console.log(`  ✅ PASS (${family}): No <text> tag`);
        passed++;
      }
    } catch (error) {
      console.error(`  ❌ FAIL (${family}): ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));
  
  if (failed > 0) {
    process.exit(1);
  }
}

testMonogramInterlock();
