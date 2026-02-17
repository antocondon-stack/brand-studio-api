#!/usr/bin/env node
/**
 * Copy fonts to dist/ for production builds.
 * Copies assets/google-fonts -> dist/assets/google-fonts
 * Copies assets/fonts -> dist/assets/fonts
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return 0;
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst, { recursive: true });
  }
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      count += copyRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      count++;
    }
  }
  return count;
}

const googleFontsSrc = path.join(rootDir, "assets", "google-fonts");
const googleFontsDst = path.join(rootDir, "dist", "assets", "google-fonts");
const fontsSrc = path.join(rootDir, "assets", "fonts");
const fontsDst = path.join(rootDir, "dist", "assets", "fonts");

let googleCount = 0;
let fontsCount = 0;

if (fs.existsSync(googleFontsSrc)) {
  googleCount = copyRecursive(googleFontsSrc, googleFontsDst);
  console.log(`✅ Copied ${googleCount} Google Fonts files to dist/assets/google-fonts`);
} else {
  console.log(`⚠️  assets/google-fonts not found, skipping`);
}

if (fs.existsSync(fontsSrc)) {
  fontsCount = copyRecursive(fontsSrc, fontsDst);
  console.log(`✅ Copied ${fontsCount} font files to dist/assets/fonts`);
} else {
  console.log(`⚠️  assets/fonts not found, skipping`);
}

if (googleCount === 0 && fontsCount === 0) {
  console.warn(`⚠️  No fonts copied. Ensure assets/google-fonts or assets/fonts exist.`);
}
