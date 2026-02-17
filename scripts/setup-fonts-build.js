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
const oflPath = path.join(fontsMainPath, "ofl");
const googleFontsRepo = "https://github.com/google/fonts.git";

// Check if fonts-main already exists and has fonts
if (fs.existsSync(oflPath)) {
  try {
    const ttfFiles = fs.readdirSync(oflPath, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith(".ttf"));
    if (ttfFiles.length > 0) {
      console.log(`✅ Google Fonts repository already exists with ${ttfFiles.length} TTF files, skipping clone`);
      process.exit(0);
    }
  } catch (e) {
    // Continue to clone if check fails
  }
}

console.log("📦 Cloning Google Fonts repository...");
console.log(`   Target: ${fontsMainPath}`);
console.log(`   CWD: ${process.cwd()}`);

try {
  // Create parent directory if needed
  const fontsDir = path.join(rootDir, "assets", "fonts");
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  // Remove existing directory if it exists but is incomplete
  if (fs.existsSync(fontsMainPath)) {
    console.log("   Removing incomplete fonts-main directory...");
    fs.rmSync(fontsMainPath, { recursive: true, force: true });
  }

  // Try sparse clone first (faster, less disk space)
  let sparseCloneWorked = false;
  try {
    console.log("   Attempting sparse clone (this may take a few minutes)...");
    execSync(`git clone --depth 1 --filter=blob:none --sparse ${googleFontsRepo} "${fontsMainPath}"`, {
      stdio: "pipe",
      cwd: rootDir,
      timeout: 600000, // 10 minute timeout
    });

    // Configure sparse checkout to only get ofl directory (Open Font License fonts)
    console.log("   Configuring sparse checkout for ofl directory...");
    execSync("git sparse-checkout init --cone", {
      stdio: "pipe",
      cwd: fontsMainPath,
    });
    execSync("git sparse-checkout set ofl", {
      stdio: "pipe",
      cwd: fontsMainPath,
    });
    sparseCloneWorked = true;
  } catch (sparseError) {
    console.warn("   Sparse clone failed, trying full shallow clone...");
    console.warn(`   Error: ${sparseError.message}`);
    // Remove partial clone if it exists
    if (fs.existsSync(fontsMainPath)) {
      fs.rmSync(fontsMainPath, { recursive: true, force: true });
    }
    
    // Fallback: full shallow clone (slower but more reliable)
    console.log("   Cloning full repository (shallow, this may take several minutes)...");
    execSync(`git clone --depth 1 ${googleFontsRepo} "${fontsMainPath}"`, {
      stdio: "inherit",
      cwd: rootDir,
      timeout: 900000, // 15 minute timeout for full clone
    });
  }

  // Verify the clone worked
  if (!fs.existsSync(oflPath)) {
    throw new Error("ofl directory not found after clone");
  }

  const ttfFiles = fs.readdirSync(oflPath, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith(".ttf"));
  
  if (ttfFiles.length === 0) {
    throw new Error("No TTF files found in ofl directory after clone");
  }

  console.log(`✅ Google Fonts repository cloned successfully: ${ttfFiles.length} TTF files found`);
} catch (error) {
  console.error("❌ Failed to clone Google Fonts repository:", error.message);
  console.error("   Stack:", error.stack);
  console.error("   Fonts may not be available. The build will continue but wordmarks may fail.");
  // Don't fail the build - allow fallback behavior
  process.exit(0);
}
