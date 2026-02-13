# Fonts Directory (REQUIRED)

**These font files are REQUIRED for the API to function correctly.** The API will throw errors if fonts are missing.

| File | Description | Status |
|------|-------------|--------|
| `Inter-Regular.ttf` or `.otf` | Inter regular (400) | **REQUIRED** |
| `Inter-Bold.ttf` or `.otf` | Inter bold (700) | **REQUIRED** |
| `DMSerifDisplay-Regular.ttf` or `.otf` | DM Serif Display regular | **REQUIRED** |
| `SpaceGrotesk-Regular.ttf` or `.otf` | Space Grotesk regular (fallback) | Optional |

## How to Add Fonts

### Option 1: Download from Sources

1. **Inter** (Regular & Bold):
   - Visit: https://rsms.me/inter/download/
   - Download the ZIP file
   - Extract `Inter-Regular.ttf` and `Inter-Bold.ttf`
   - Copy to `assets/fonts/`

2. **DM Serif Display**:
   - Visit: https://fonts.google.com/specimen/DM+Serif+Display
   - Click "Download family"
   - Extract `DMSerifDisplay-Regular.ttf`
   - Copy to `assets/fonts/`

3. **Space Grotesk** (optional fallback):
   - Visit: https://fonts.google.com/specimen/Space+Grotesk
   - Download and extract `SpaceGrotesk-Regular.ttf`
   - Copy to `assets/fonts/`

### Option 2: Use npm package (if available)

Some font packages can be installed via npm and copied to assets/fonts.

## File Naming

**CRITICAL**: Files must be named exactly as shown above:
- `Inter-Regular.ttf` (not `InterRegular.ttf` or `inter-regular.ttf`)
- `Inter-Bold.ttf` (not `InterBold.ttf`)
- `DMSerifDisplay-Regular.ttf` (not `DM-Serif-Display-Regular.ttf`)

The code is case-sensitive and expects exact matches.

## Verification

After adding fonts, verify they're tracked in git:
```bash
git ls-files assets/fonts/
```

You should see:
- `assets/fonts/Inter-Regular.ttf`
- `assets/fonts/Inter-Bold.ttf`
- `assets/fonts/DMSerifDisplay-Regular.ttf`

## Testing

Run the test script to verify fonts load correctly:
```bash
npm run test:font-to-path
```

## Railway Deployment

Fonts are automatically copied to `dist/assets/fonts/` during build via the `copy-assets` script. Ensure fonts are committed to git before deploying.
