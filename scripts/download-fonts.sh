#!/bin/bash
# Script to download and add required font files
# Run: bash scripts/download-fonts.sh

set -e

FONTS_DIR="assets/fonts"
TEMP_DIR="/tmp/brand-studio-fonts"

echo "🔤 Font Download Script"
echo "======================"
echo ""

# Create fonts directory if it doesn't exist
mkdir -p "$FONTS_DIR"
mkdir -p "$TEMP_DIR"

echo "📥 This script will help you download the required fonts."
echo ""
echo "Required fonts:"
echo "  1. Inter-Regular.ttf"
echo "  2. Inter-Bold.ttf"
echo "  3. DMSerifDisplay-Regular.ttf"
echo ""

# Check if fonts already exist
MISSING=()
if [ ! -f "$FONTS_DIR/Inter-Regular.ttf" ] && [ ! -f "$FONTS_DIR/Inter-Regular.otf" ]; then
  MISSING+=("Inter-Regular")
fi
if [ ! -f "$FONTS_DIR/Inter-Bold.ttf" ] && [ ! -f "$FONTS_DIR/Inter-Bold.otf" ]; then
  MISSING+=("Inter-Bold")
fi
if [ ! -f "$FONTS_DIR/DMSerifDisplay-Regular.ttf" ] && [ ! -f "$FONTS_DIR/DMSerifDisplay-Regular.otf" ]; then
  MISSING+=("DMSerifDisplay-Regular")
fi

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "✅ All required fonts are already present!"
  exit 0
fi

echo "❌ Missing fonts: ${MISSING[*]}"
echo ""
echo "📋 Manual Download Instructions:"
echo ""
echo "1. Inter (Regular & Bold):"
echo "   Visit: https://rsms.me/inter/download/"
echo "   Or: https://github.com/rsms/inter/releases"
echo "   Download the ZIP file"
echo "   Extract Inter-Regular.ttf and Inter-Bold.ttf"
echo ""
echo "2. DM Serif Display:"
echo "   Visit: https://fonts.google.com/specimen/DM+Serif+Display"
echo "   Click 'Download family'"
echo "   Extract DMSerifDisplay-Regular.ttf"
echo ""
echo "After downloading, place the files in: $FONTS_DIR/"
echo ""
echo "Then run:"
echo "  git add assets/fonts/*.ttf assets/fonts/*.otf"
echo "  git commit -m 'Add required font files'"
echo "  git push origin main"
echo ""

# Try to detect if fonts are in common locations
echo "🔍 Checking common locations..."
COMMON_LOCATIONS=(
  "$HOME/Downloads"
  "$HOME/Desktop"
  "$HOME/Documents"
)

FOUND_FONTS=()
for loc in "${COMMON_LOCATIONS[@]}"; do
  if [ -d "$loc" ]; then
    for font in "${MISSING[@]}"; do
      if [ -f "$loc/$font.ttf" ]; then
        echo "  ✅ Found $font.ttf in $loc"
        FOUND_FONTS+=("$loc/$font.ttf")
      elif [ -f "$loc/$font.otf" ]; then
        echo "  ✅ Found $font.otf in $loc"
        FOUND_FONTS+=("$loc/$font.otf")
      fi
    done
  fi
done

if [ ${#FOUND_FONTS[@]} -gt 0 ]; then
  echo ""
  echo "📋 Found fonts! Copy them with:"
  for font_path in "${FOUND_FONTS[@]}"; do
    font_name=$(basename "$font_path")
    echo "  cp \"$font_path\" \"$FONTS_DIR/$font_name\""
  done
fi

echo ""
exit 1
