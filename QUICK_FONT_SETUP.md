# Quick Font Setup Guide

## Step 1: Download Fonts

### Inter (Regular & Bold)
1. Visit: **https://rsms.me/inter/download/**
2. Download the ZIP file
3. Extract:
   - `Inter-Regular.ttf`
   - `Inter-Bold.ttf`

### DM Serif Display
1. Visit: **https://fonts.google.com/specimen/DM+Serif+Display**
2. Click **"Download family"**
3. Extract: `DMSerifDisplay-Regular.ttf`

## Step 2: Copy Fonts to Repository

Once downloaded, run these commands from the project root:

```bash
# Copy fonts to assets/fonts/
cp ~/Downloads/Inter-Regular.ttf assets/fonts/
cp ~/Downloads/Inter-Bold.ttf assets/fonts/
cp ~/Downloads/DMSerifDisplay-Regular.ttf assets/fonts/

# Verify files are present
ls -lh assets/fonts/*.ttf

# Should show:
# Inter-Regular.ttf
# Inter-Bold.ttf
# DMSerifDisplay-Regular.ttf
```

## Step 3: Commit and Push

```bash
git add assets/fonts/*.ttf assets/fonts/*.otf
git commit -m "Add required font files for wordmark generation"
git push origin main
```

## Step 4: Verify

After Railway redeploys, test with:
```bash
npm run test:font-to-path
```

## Troubleshooting

**If fonts are in a different location:**
```bash
# Find fonts
find ~ -name "Inter-Regular.ttf" 2>/dev/null
find ~ -name "DMSerifDisplay-Regular.ttf" 2>/dev/null

# Copy from wherever they are
cp /path/to/font.ttf assets/fonts/
```

**If you have .otf files instead:**
- The code supports both .ttf and .otf
- Just copy the .otf files instead

**File naming is critical:**
- ✅ `Inter-Regular.ttf` (correct)
- ❌ `inter-regular.ttf` (wrong case)
- ❌ `InterRegular.ttf` (wrong format)
