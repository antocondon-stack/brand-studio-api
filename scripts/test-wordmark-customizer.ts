/**
 * Test script: buildDeterministicSvgs for brand "Swapqed", keywords ["interlock","bold","trust"], fixed regen_seed.
 * Writes /tmp/custom-wordmark.svg and logs metrics + command count.
 */

import * as fs from "fs";
import { buildDeterministicSvgs } from "../src/tools/deterministicSvg.tool";
import { countPathCommands } from "../src/tools/fontToPath.tool";

const REGEN_SEED = "wordmark-customizer-test-v1";

function main() {
  const result = buildDeterministicSvgs({
    brand_name: "Swapqed",
    direction_name: "Modern",
    logo_archetype: "wordmark",
    keywords: ["interlock", "bold", "trust"],
    palette_hex: ["#000000", "#ffffff", "#3b82f6"],
    vibe: "bold",
    tracking: 0,
    regen_seed: REGEN_SEED,
  });

  const pathD = result.wordmark_metrics?.path_d ?? "";
  const cmdCount = countPathCommands(pathD);
  console.log("Command count:", cmdCount);
  console.log("Metrics (from wordmark_metrics):", result.wordmark_metrics);

  const outPath = "/tmp/custom-wordmark.svg";
  fs.writeFileSync(outPath, result.logo_svg_wordmark);
  console.log("Wrote:", outPath);

  if (result.logo_svg_wordmark.includes("<text")) {
    console.error("FAIL: wordmark SVG contains <text>");
    process.exit(1);
  }
  console.log("OK: No <text> in wordmark SVG");
}

main();
