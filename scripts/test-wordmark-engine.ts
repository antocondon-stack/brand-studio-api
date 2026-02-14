/**
 * Unit test: "Swapqed" wordmark returns > 5 paths and bbox width > bbox height.
 */

import { runWordmarkEngine } from "../src/tools/wordmarkEngine.tool";

async function main() {
  const result = await runWordmarkEngine({
    text: "Swapqed",
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: 64,
    tracking: 0,
    seed: "test",
  });

  const pathCount = result.paths.length;
  const widthOk = result.bbox.w > result.bbox.h;

  console.log("Paths:", pathCount, "Bbox:", result.bbox);

  if (pathCount <= 5) {
    console.error("FAIL: expected > 5 paths, got", pathCount);
    process.exit(1);
  }
  if (!widthOk) {
    console.error("FAIL: expected bbox width > bbox height, got", result.bbox);
    process.exit(1);
  }

  console.log("PASS: path count > 5 and bbox width > bbox height");
  if (result.svg.includes("<text")) {
    console.error("FAIL: SVG must not contain <text>");
    process.exit(1);
  }
  console.log("PASS: SVG contains no <text>");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
