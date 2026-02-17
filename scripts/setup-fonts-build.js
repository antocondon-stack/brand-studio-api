#!/usr/bin/env node
/**
 * Setup fonts during Railway build.
 * Clones Google Fonts repository if fonts-main doesn't exist.
 * This ensures fonts are available in Railway builds without committing them to git.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const fontsMainPath = path.join(rootDir, "assets", "fonts", "fonts-main");
const googleFontsRepo = "https://github.com/google/fonts.git";

// Check if fonts-main already exists
if (fs.existsSync(fontsMainPath)) {
  console.log("✅ Google Fonts repository already exists, skipping clone");
  process.exit(0);
}

console.log("📦 Cloning Google Fonts repository...");
console.log(`   Target: ${fontsMainPath}`);

try {
  // Create parent directory if needed
  const fontsDir = path.join(rootDir, "assets", "fonts");
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  // Clone the repository (shallow clone for speed)
  execSync(`git clone --depth 1 --filter=blob:none --sparse ${googleFontsRepo} "${fontsMainPath}"`, {
    stdio: "inherit",
    cwd: rootDir,
  });

  // Configure sparse checkout to only get ofl directory (Open Font License fonts)
  execSync("git sparse-checkout set ofl", {
    stdio: "inherit",
    cwd: fontsMainPath,
  });

  console.log("✅ Google Fonts repository cloned successfully");
} catch (error) {
  console.warn("⚠️  Failed to clone Google Fonts repository:", error.message);
  console.warn("   Fonts may not be available. Ensure fonts are committed or available via other means.");
  // Don't fail the build - allow fallback behavior
  process.exit(0);
}
