#!/bin/bash
# Setup script to help download and verify required font files
# Run: bash scripts/setup-fonts.sh

set -e

FONTS_DIR="assets/fonts"
REQUIRED_FONTS=(
  "Inter-Regular.ttf"
  "Inter-Bold.ttf"
  "DMSerifDisplay-Regular.ttf"
)

echo "🔤 Font Setup Script"
echo "===================="
echo ""

# Check if fonts directory exists
if [ ! -d "$FONTS_DIR" ]; then
  echo "Creating $FONTS_DIR directory..."
  mkdir -p "$FONTS_DIR"
fi

# Check which fonts are missing
MISSING_FONTS=()
for font in "${REQUIRED_FONTS[@]}"; do
  if [ ! -f "$FONTS_DIR/$font" ]; then
    MISSING_FONTS+=("$font")
  fi
done

if [ ${#MISSING_FONTS[@]} -eq 0 ]; then
  echo "✅ All required fonts are present!"
  echo ""
  echo "Fonts found:"
  ls -lh "$FONTS_DIR"/*.ttf "$FONTS_DIR"/*.otf 2>/dev/null || echo "  (none)"
  exit 0
fi

echo "❌ Missing fonts:"
for font in "${MISSING_FONTS[@]}"; do
  echo "  - $font"
done
echo ""

echo "📥 Download Instructions:"
echo ""
echo "1. Inter (Regular & Bold):"
echo "   Visit: https://rsms.me/inter/download/"
echo "   Download ZIP, extract Inter-Regular.ttf and Inter-Bold.ttf"
echo "   Copy to: $FONTS_DIR/"
echo ""
echo "2. DM Serif Display:"
echo "   Visit: https://fonts.google.com/specimen/DM+Serif+Display"
echo "   Download family, extract DMSerifDisplay-Regular.ttf"
echo "   Copy to: $FONTS_DIR/"
echo ""
echo "After adding fonts, verify with:"
echo "  npm run test:font-to-path"
echo ""
echo "Then commit fonts to git:"
echo "  git add assets/fonts/*.ttf assets/fonts/*.otf"
echo "  git commit -m 'Add required font files'"
echo ""

exit 1
