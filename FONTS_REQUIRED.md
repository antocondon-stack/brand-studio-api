# ⚠️ ACTION REQUIRED: Add Font Files

## Current Status

The Railway deployment is failing because required font files are missing from the repository.

**Error:**
```
FontToPath failed: all font attempts failed. Font file not found: dm_serif (DMSerifDisplay-Regular.ttf)
```

## Required Action

**You must add the following font files to `assets/fonts/` and commit them to git:**

1. `Inter-Regular.ttf`
2. `Inter-Bold.ttf`
3. `DMSerifDisplay-Regular.ttf`

## Quick Fix Steps

1. **Download fonts:**
   - Inter: https://rsms.me/inter/download/ → Extract `Inter-Regular.ttf` and `Inter-Bold.ttf`
   - DM Serif Display: https://fonts.google.com/specimen/DM+Serif+Display → Download → Extract `DMSerifDisplay-Regular.ttf`

2. **Copy fonts to repository:**
   ```bash
   # Ensure fonts directory exists
   mkdir -p assets/fonts
   
   # Copy downloaded fonts to assets/fonts/
   cp ~/Downloads/Inter-Regular.ttf assets/fonts/
   cp ~/Downloads/Inter-Bold.ttf assets/fonts/
   cp ~/Downloads/DMSerifDisplay-Regular.ttf assets/fonts/
   ```

3. **Verify files:**
   ```bash
   ls -lh assets/fonts/*.ttf
   # Should show all 3 files
   ```

4. **Commit and push:**
   ```bash
   git add assets/fonts/*.ttf
   git commit -m "Add required font files for wordmark generation"
   git push origin main
   ```

5. **Railway will automatically redeploy** with fonts included.

## File Naming (CRITICAL)

Files must be named **exactly**:
- `Inter-Regular.ttf` (not `inter-regular.ttf` or `InterRegular.ttf`)
- `Inter-Bold.ttf` (not `inter-bold.ttf` or `InterBold.ttf`)
- `DMSerifDisplay-Regular.ttf` (not `DM-Serif-Display-Regular.ttf`)

## Verification

After adding fonts, test locally:
```bash
npm run test:font-to-path
```

Should output: `✅ All tests passed!`

## Why This Is Required

The updated `fontToPath` tool now:
- ✅ Produces real glyph outlines (not placeholder rectangles)
- ✅ Has quality gates to ensure output is valid
- ✅ Throws clear errors when fonts are missing (instead of silent fallback)

This ensures wordmarks render correctly with actual typography, not simple rectangles.
