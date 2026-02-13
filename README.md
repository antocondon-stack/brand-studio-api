# Brand Studio API

Express API for generating brand identity kits including logos, color palettes, typography, templates, and PDF guidelines.

## Endpoints

### Health Check
- **GET** `/health` - Returns API status

### Generate Creative Directions
- **POST** `/generate`
  - Input: `{ brand_name, sector, audience, tone, ambition_level, ... }`
  - Output: `{ market_summary, brand_strategy, creative_directions[], recommended_direction_id }`
  - Generates 3 creative directions (A/B/C) with full specifications

### Finalize Brand Kit
- **POST** `/finalize`
  - Input: `{ intake, market_summary, brand_strategy, chosen_direction, regen?, regen_seed? }`
  - Output: `{ final_kit, chosen_direction, color_tags, typography_tags, regen_seed, guidelines_pdf_url? }`
  - Generates final brand kit with logos, palette, fonts, templates, and optional guidelines PDF

### Routes PDF Export
- **POST** `/routes-pdf`
  - Input: `{ intake, market_summary, brand_strategy, creative_directions, recommended_direction_id }`
  - Output: `{ routes_pdf_url }`
  - Generates a "Creative Routes Deck" PDF with strategy snapshot and Route A/B/C pages

### PDF Downloads
- **GET** `/guidelines/:id` - Download brand guidelines PDF (from `/finalize` response)
- **GET** `/routes/:id` - Download routes deck PDF (from `/routes-pdf` response)

## Features

### Regenerate Execution
The `/finalize` endpoint supports regeneration:
- Set `regen: true` to rerun only execution outputs (logos, palette, templates, PDF)
- Provide `regen_seed` (optional) for reproducible outputs
- When `regen=true`, research/strategy/directions are NOT rerun
- Response includes `regen_seed` for future regeneration

### Template Previews
Final kit includes visual template previews:
- `templates.social_post.preview_svg` - 1200×1200 SVG preview
- `templates.website_hero.preview_svg` - 1400×800 SVG preview
- Each template includes `layout` description and `copy_slots` (headline, subhead, cta)
- Previews are deterministically generated from palette, fonts, and direction keywords

### PDF Endpoints

#### Brand Guidelines PDF
Generated automatically on `/finalize`:
- Cover page with brand name and chosen route
- Logo usage (wordmark, mark, lockups)
- Clearspace and minimum size specifications
- Color palette swatches
- Typography hierarchy
- Template previews
- Usage rules from design_rules and tone

#### Routes Deck PDF
Generated via `/routes-pdf`:
- Cover page
- Strategy snapshot (positioning, essence, personality, value props)
- Route pages (A/B/C) with:
  - Visual thesis and rationale
  - Motif system
  - Wordmark style
  - Color logic and keywords
  - Typography axis
  - Design rules
  - Distinctiveness hook

## Environment Variables

- `PORT` - Server port (default: 8787)
- `PUBLIC_BASE_URL` - Override base URL for PDF links (default: inferred from request headers)
- `OPENAI_API_KEY` - Required for AI agents (not logged)

## Railway Deployment

- Uses Node 18
- PDFs stored in `/tmp` directory
- In-memory index maps PDF IDs to file paths
- Base URL inferred from `x-forwarded-proto` and `x-forwarded-host` headers

## Development

```bash
npm install
npm run build
npm run dev
```

## Production

```bash
npm run build
npm start
```
