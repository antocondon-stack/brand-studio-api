# Font Setup Guide

## Problem

The API requires font files to generate wordmark SVGs. If fonts are missing, you'll see errors like:
```
FontToPath failed: all font attempts failed. Font file not found: dm_serif (DMSerifDisplay-Regular.ttf)
```

## Solution

Add the required font files to `assets/fonts/` directory and commit them to git.

## Quick Setup

1. **Check current status:**
   ```bash
   npm run setup-fonts
   ```

2. **Download required fonts:**

   **Inter (Regular & Bold):**
   - Visit: https://rsms.me/inter/download/
   - Download ZIP
   - Extract `Inter-Regular.ttf` and `Inter-Bold.ttf`
   - Copy to `assets/fonts/`

   **DM Serif Display:**
   - Visit: https://fonts.google.com/specimen/DM+Serif+Display
   - Click "Download family"
   - Extract `DMSerifDisplay-Regular.ttf`
   - Copy to `assets/fonts/`

3. **Verify fonts are added:**
   ```bash
   ls -lh assets/fonts/*.ttf
   ```

4. **Test font loading:**
   ```bash
   npm run test:font-to-path
   ```

5. **Commit fonts to git:**
   ```bash
   git add assets/fonts/*.ttf assets/fonts/*.otf
   git commit -m "Add required font files"
   git push origin main
   ```

## File Naming (CRITICAL)

Files must be named **exactly** as shown (case-sensitive):
- ✅ `Inter-Regular.ttf`
- ✅ `Inter-Bold.ttf`
- ✅ `DMSerifDisplay-Regular.ttf`
- ❌ `inter-regular.ttf` (wrong case)
- ❌ `InterRegular.ttf` (wrong format)
- ❌ `DM-Serif-Display-Regular.ttf` (wrong format)

## Railway Deployment

After committing fonts to git, Railway will:
1. Clone the repository (including fonts)
2. Run `npm run build` (which copies fonts to `dist/assets/fonts/`)
3. Deploy with fonts available

The build script automatically copies `assets/` to `dist/assets/` so fonts are available at runtime.

## Verification

After deployment, verify fonts are available:
```bash
# Check git tracks fonts
git ls-files assets/fonts/

# Should show:
# assets/fonts/Inter-Regular.ttf
# assets/fonts/Inter-Bold.ttf
# assets/fonts/DMSerifDisplay-Regular.ttf
```

## Troubleshooting

**Error: "Font file not found"**
- Ensure fonts are committed to git (not just in local directory)
- Check file names match exactly (case-sensitive)
- Verify fonts are in `assets/fonts/` directory
- After adding fonts, commit and push to trigger Railway rebuild

**Error: "FontToPath quality check failed"**
- Font file may be corrupted or invalid
- Try re-downloading the font
- Verify file size is reasonable (usually 100KB+ for TTF files)
