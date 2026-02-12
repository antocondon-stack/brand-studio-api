# Fonts Directory (OFL)

Optional: place these font files here for full wordmark rendering. **If missing, the API uses a fallback shape so `/finalize` does not 500.**

| File | Description |
|------|-------------|
| `Inter-Regular.ttf` or `.otf` | Inter regular (400) |
| `Inter-Bold.ttf` or `.otf` | Inter bold (700) |
| `DMSerifDisplay-Regular.ttf` or `.otf` | DM Serif Display regular |

## Sources

- **Inter**: https://rsms.me/inter/download/ or https://github.com/rsms/inter/releases (extract from zip)
- **DM Serif Display**: https://fonts.google.com/specimen/DM+Serif+Display (download and add TTF)

Name files exactly as above (or use `.otf` for Inter). The app loads from `assets/fonts/` and falls back to a simple shape when files are absent.
