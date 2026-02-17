# Railway Font Setup Guide

## Current Status

Font setup is **skipped during Railway builds** (`SKIP_FONT_SETUP=true`) to avoid build timeouts. This means fonts need to be made available via one of the methods below.

## Option 1: Commit Fonts to Git (Recommended)

The most reliable way is to commit a subset of commonly-used fonts directly to git:

```bash
# Add only the fonts you need (e.g., Space Grotesk)
git add assets/fonts/fonts-main/ofl/spacegrotesk/
git commit -m "Add Space Grotesk fonts for Railway"
git push
```

**Pros:**
- Fast, reliable builds
- No runtime dependencies
- Works immediately

**Cons:**
- Increases repository size
- Need to commit fonts manually

## Option 2: Use Railway Build Cache

If Railway caches the `assets/fonts` directory between builds, fonts cloned in one build will be available in subsequent builds.

**To enable:**
1. Remove `SKIP_FONT_SETUP=true` from `railway.toml`
2. Let the first build complete (may take 10-15 minutes)
3. Subsequent builds will use cached fonts

**Pros:**
- No git repository bloat
- Automatic after first build

**Cons:**
- First build takes longer
- Cache may be cleared

## Option 3: Download Fonts at Runtime

Create a startup script that downloads fonts when the app starts:

```javascript
// In server.ts startup
if (!fs.existsSync('assets/fonts/fonts-main/ofl')) {
  // Download fonts asynchronously
  downloadFontsInBackground();
}
```

**Pros:**
- No build time impact
- Flexible

**Cons:**
- First requests may fail until fonts download
- Requires network access at runtime

## Option 4: Use Railway Volume

Store fonts in a Railway volume that persists between deployments.

## Recommended Approach

For production, **Option 1 (commit fonts)** is recommended. Commit only the fonts you actually use:

```bash
# Example: Commit Space Grotesk only
git add assets/fonts/fonts-main/ofl/spacegrotesk/
git commit -m "Add Space Grotesk fonts"
git push
```

This ensures fast, reliable builds with no external dependencies.
