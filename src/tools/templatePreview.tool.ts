/**
 * Deterministic template preview generator.
 * Produces premium SVG previews for social_post (1200x1200) and website_hero (1400x800)
 * using palette, fonts, and direction keywords. Pure function; no I/O.
 */

export interface PaletteColor {
  role: string;
  hex: string;
}

export interface FontSpec {
  role: string;
  family: string;
  weight: string;
  usage: string;
}

export interface TemplatePreviewInput {
  palette: PaletteColor[];
  fonts: FontSpec[];
  direction_keywords: string[];
  brand_name: string;
  logo_svg_mark: string;
}

export interface CopySlots {
  headline: string;
  subhead: string;
  cta: string;
  kicker?: string;
  label?: string;
}

type StyleMode = "editorial" | "tech" | "premium";

export interface TemplateWithPreview {
  layout: string;
  copy_slots: CopySlots;
  preview_svg: string;
}

export interface TemplatePreviewsOutput {
  social_post: TemplateWithPreview;
  website_hero: TemplateWithPreview;
}

function getColor(palette: PaletteColor[], role: string, fallback: string): string {
  const c = palette.find((p) => p.role.toLowerCase() === role.toLowerCase());
  return c?.hex ?? fallback;
}

function getFontFamily(fonts: FontSpec[], role: string): string {
  const f = fonts.find((p) => p.role.toLowerCase() === role.toLowerCase());
  const name = f?.family ?? "";
  const safe = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return safe ? `${safe}, system-ui, sans-serif` : "system-ui, sans-serif";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Select style mode based on direction keywords, palette, and fonts */
function selectStyleMode(
  direction_keywords: string[],
  palette: PaletteColor[],
  fonts: FontSpec[],
): StyleMode {
  const keywordsLower = direction_keywords.join(" ").toLowerCase();
  const hasEditorial = keywordsLower.includes("editorial") || keywordsLower.includes("story");
  const hasTech = keywordsLower.includes("tech") || keywordsLower.includes("precision");
  
  const displayFont = fonts.find((f) => f.role.toLowerCase() === "display" || f.role.toLowerCase() === "heading");
  const isSerif = displayFont?.family.toLowerCase().includes("serif") || false;
  
  const bgColor = getColor(palette, "background", "#000000");
  const accentColor = getColor(palette, "accent", "#ffffff");
  const isVeryDark = bgColor === "#000000" || bgColor === "#0a0a0a" || bgColor === "#0f0f0f";
  const isNeon = accentColor.match(/^#[0-9a-f]{6}$/i) && (
    accentColor.includes("ff") || accentColor.includes("00") || accentColor.includes("aa")
  );
  
  if (hasEditorial || isSerif) {
    return "editorial";
  }
  if (hasTech || (isVeryDark && isNeon)) {
    return "tech";
  }
  return "premium";
}

/** Normalize mark group for consistent scaling */
function normalizeMarkGroup(markInner: string, targetPx: number, grid: number = 24): string {
  const scale = targetPx / grid;
  const translateX = targetPx / 2;
  const translateY = targetPx / 2;
  return `<g transform="translate(${translateX}, ${translateY}) scale(${scale})">${markInner}</g>`;
}

/** Build mark pattern for watermark/background */
function buildMarkPattern(
  markInner: string,
  mode: StyleMode,
  width: number,
  height: number,
  opacity: number = 0.06,
): string {
  const grid = 24;
  const markSize = mode === "editorial" ? 200 : mode === "tech" ? 80 : 300;
  const spacing = mode === "editorial" ? 400 : mode === "tech" ? 120 : 500;
  const normalizedMark = normalizeMarkGroup(markInner, markSize, grid);
  
  const patterns: string[] = [];
  
  if (mode === "editorial") {
    // Sparse, large watermark corners
    const positions = [
      { x: 100, y: 100 },
      { x: width - 300, y: 100 },
      { x: 100, y: height - 300 },
      { x: width - 300, y: height - 300 },
    ];
    for (const pos of positions) {
      patterns.push(`<g transform="translate(${pos.x}, ${pos.y})" opacity="${opacity}">${normalizedMark}</g>`);
    }
  } else if (mode === "tech") {
    // Tiled small marks in grid
    for (let x = 60; x < width; x += spacing) {
      for (let y = 60; y < height; y += spacing) {
        patterns.push(`<g transform="translate(${x}, ${y})" opacity="${opacity}">${normalizedMark}</g>`);
      }
    }
  } else {
    // Premium: single large watermark behind headline
    const centerX = width / 2;
    const centerY = height / 2 - 100;
    patterns.push(`<g transform="translate(${centerX}, ${centerY})" opacity="${opacity * 1.5}">${normalizedMark}</g>`);
  }
  
  return patterns.join("\n");
}

/** Build photo placeholder window */
function buildPhotoPlaceholder(
  x: number,
  y: number,
  width: number,
  height: number,
  mode: StyleMode,
  caption?: string,
): string {
  const cornerRadius = mode === "tech" ? 4 : mode === "editorial" ? 8 : 12;
  const bgColor = mode === "tech" ? "#1a1a1a" : mode === "editorial" ? "#2a2a2a" : "#1f1f1f";
  const borderColor = mode === "tech" ? "#333333" : mode === "editorial" ? "#444444" : "#333333";
  
  const elements: string[] = [];
  
  // Outer rectangle with rounded corners
  elements.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" fill="${bgColor}" stroke="${borderColor}" stroke-width="1"/>`);
  
  // Inner shadow/overlay (gradient approximation)
  elements.push(`<rect x="${x + 2}" y="${y + 2}" width="${width - 4}" height="${height - 4}" rx="${cornerRadius - 1}" fill="url(#photoGradient)" opacity="0.3"/>`);
  
  // Grid lines (subtle)
  if (mode === "tech") {
    const gridSpacing = 40;
    for (let gx = x + 20; gx < x + width; gx += gridSpacing) {
      elements.push(`<line x1="${gx}" y1="${y + 10}" x2="${gx}" y2="${y + height - 10}" stroke="${borderColor}" stroke-width="0.5" opacity="0.2"/>`);
    }
    for (let gy = y + 20; gy < y + height; gy += gridSpacing) {
      elements.push(`<line x1="${x + 10}" y1="${gy}" x2="${x + width - 10}" y2="${gy}" stroke="${borderColor}" stroke-width="0.5" opacity="0.2"/>`);
    }
  }
  
  // Placeholder icon (simple camera/photo icon)
  const iconX = x + width / 2;
  const iconY = y + height / 2;
  const iconSize = Math.min(width, height) * 0.15;
  elements.push(`<g opacity="0.4">
    <rect x="${iconX - iconSize / 2}" y="${iconY - iconSize / 2}" width="${iconSize}" height="${iconSize * 0.7}" rx="2" fill="none" stroke="${borderColor}" stroke-width="2"/>
    <circle cx="${iconX + iconSize * 0.15}" cy="${iconY - iconSize * 0.1}" r="${iconSize * 0.12}" fill="${borderColor}"/>
  </g>`);
  
  // Caption label
  if (caption) {
    const captionY = y + height - 20;
    elements.push(`<text x="${x + 12}" y="${captionY}" fill="${borderColor}" font-family="system-ui, sans-serif" font-size="11" opacity="0.6">${escapeXml(caption)}</text>`);
  }
  
  return elements.join("\n");
}

/** Enhanced copy slots with kicker and label */
function buildCopySlots(brand_name: string, direction_keywords: string[], mode: StyleMode): CopySlots {
  const keywords = direction_keywords.slice(0, 3);
  const keywordStr = keywords.join(" ");
  
  let kicker: string | undefined;
  let label: string | undefined;
  let subhead: string;
  let cta: string;
  
  if (mode === "editorial") {
    kicker = keywords.length > 0 && keywords[0] ? keywords[0].toUpperCase() : "FEATURED";
    label = keywords.length > 1 && keywords[1] ? `${keywords[1]} • ${keywords[2] || "Story"}` : undefined;
    subhead = keywordStr || "Your story. Your audience.";
    cta = "Read more";
  } else if (mode === "tech") {
    kicker = keywords.length > 0 && keywords[0] ? keywords[0].toUpperCase() : "TECH";
    label = keywords.length > 1 && keywords[1] ? `Verified • ${keywords[1]}` : undefined;
    subhead = keywordStr || "Precision. Performance.";
    cta = "Get started";
  } else {
    kicker = keywords.length > 0 && keywords[0] ? keywords[0].toUpperCase() : "PREMIUM";
    label = keywords.length > 1 && keywords[1] ? `${keywords[1]} • ${keywords[2] || "Luxury"}` : undefined;
    subhead = keywordStr || "Elevated experiences.";
    cta = "Explore";
  }
  
  const result: CopySlots = {
    headline: brand_name,
    subhead,
    cta,
  };
  
  if (kicker !== undefined) {
    result.kicker = kicker;
  }
  if (label !== undefined) {
    result.label = label;
  }
  
  return result;
}

/** Social post: 1200x1200, mode-aware layouts */
function buildSocialPostPreview(input: TemplatePreviewInput): TemplateWithPreview {
  const { palette, fonts, brand_name, logo_svg_mark, direction_keywords } = input;
  const w = 1200;
  const h = 1200;
  const mode = selectStyleMode(direction_keywords, palette, fonts);
  const bg = getColor(palette, "background", "#0f0f0f");
  const primary = getColor(palette, "primary", "#ffffff");
  const accent = getColor(palette, "accent", "#3b82f6");
  const neutral = getColor(palette, "neutral", "#a1a1aa");
  const fontHeading = getFontFamily(fonts, "heading") || getFontFamily(fonts, "display");
  const fontBody = getFontFamily(fonts, "body");
  const copy_slots = buildCopySlots(brand_name, direction_keywords, mode);

  const markInner = logo_svg_mark
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();

  let layout: string;
  let preview_svg: string;

  if (mode === "editorial") {
    // Editorial: top-left kicker, huge headline, photo window bottom-right, mark watermark
    layout = "Editorial: top-left kicker, huge headline, photo window bottom-right, mark watermark corners.";
    const headlineSize = 72;
    const subheadSize = 26;
    const bodySize = 16;
    const lineHeight = 1.4;
    
    const kickerX = 80;
    const kickerY = 100;
    const headlineX = 80;
    const headlineY = 200;
    const subheadX = 80;
    const subheadY = headlineY + headlineSize * lineHeight + 20;
    const photoX = w - 420;
    const photoY = h - 420;
    const photoW = 360;
    const photoH = 360;
    
    preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="photoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.5" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${buildMarkPattern(markInner, mode, w, h, 0.08)}
  ${copy_slots.kicker ? `<text x="${kickerX}" y="${kickerY}" fill="${accent}" font-family="${fontBody}" font-size="${bodySize}" font-weight="600" letter-spacing="2">${escapeXml(copy_slots.kicker)}</text>` : ""}
  <text x="${headlineX}" y="${headlineY}" fill="${primary}" font-family="${fontHeading}" font-size="${headlineSize}" font-weight="700" style="line-height:${lineHeight}">${escapeXml(copy_slots.headline)}</text>
  <text x="${subheadX}" y="${subheadY}" fill="${neutral}" font-family="${fontBody}" font-size="${subheadSize}" style="line-height:${lineHeight}">${escapeXml(copy_slots.subhead)}</text>
  ${buildPhotoPlaceholder(photoX, photoY, photoW, photoH, mode, copy_slots.label)}
</svg>`.trim();
    
  } else if (mode === "tech") {
    // Tech: split layout left info/right photo window, grid lines, small labels
    layout = "Tech: split layout left info/right photo window, grid lines, small labels, tiled mark pattern.";
    const headlineSize = 64;
    const subheadSize = 24;
    const labelSize = 14;
    const lineHeight = 1.2;
    
    const contentX = 80;
    const headlineY = 200;
    const subheadY = headlineY + headlineSize * lineHeight + 16;
    const labelY = subheadY + subheadSize * lineHeight + 24;
    const photoX = w / 2 + 40;
    const photoY = 180;
    const photoW = w / 2 - 120;
    const photoH = h - photoY - 180;
    
    preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="photoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.5" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${buildMarkPattern(markInner, mode, w, h, 0.12)}
  <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="${neutral}" stroke-width="1" opacity="0.1"/>
  ${copy_slots.kicker ? `<text x="${contentX}" y="120" fill="${accent}" font-family="${fontBody}" font-size="${labelSize}" font-weight="600" letter-spacing="1">${escapeXml(copy_slots.kicker)}</text>` : ""}
  <text x="${contentX}" y="${headlineY}" fill="${primary}" font-family="${fontHeading}" font-size="${headlineSize}" font-weight="700" style="line-height:${lineHeight}" letter-spacing="-1">${escapeXml(copy_slots.headline)}</text>
  <text x="${contentX}" y="${subheadY}" fill="${neutral}" font-family="${fontBody}" font-size="${subheadSize}" style="line-height:${lineHeight}">${escapeXml(copy_slots.subhead)}</text>
  ${copy_slots.label ? `<text x="${contentX}" y="${labelY}" fill="${neutral}" font-family="${fontBody}" font-size="${labelSize}" opacity="0.7">${escapeXml(copy_slots.label)}</text>` : ""}
  ${buildPhotoPlaceholder(photoX, photoY, photoW, photoH, mode, copy_slots.label)}
  <rect x="${contentX}" y="${h - 120}" width="180" height="48" rx="24" fill="${accent}"/>
  <text x="${contentX + 90}" y="${h - 120 + 30}" text-anchor="middle" fill="${primary}" font-family="${fontBody}" font-size="${labelSize}" font-weight="600">${escapeXml(copy_slots.cta)}</text>
</svg>`.trim();
    
  } else {
    // Premium: centered headline, minimal subhead, photo window full bleed bottom, small mark stamp
    layout = "Premium: centered headline, minimal subhead, photo window full bleed bottom, small mark stamp.";
    const headlineSize = 68;
    const subheadSize = 22;
    const bodySize = 14;
    const lineHeight = 1.3;
    
    const headlineY = 280;
    const subheadY = headlineY + headlineSize * lineHeight + 16;
    const photoY = 500;
    const photoW = w - 160;
    const photoH = h - photoY - 80;
    const photoX = 80;
    const markX = w - 200;
    const markY = 100;
    const markSize = 80;
    
    preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="photoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.5" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${buildMarkPattern(markInner, mode, w, h, 0.05)}
  <text x="${w / 2}" y="${headlineY}" text-anchor="middle" fill="${primary}" font-family="${fontHeading}" font-size="${headlineSize}" font-weight="700" style="line-height:${lineHeight}">${escapeXml(copy_slots.headline)}</text>
  <text x="${w / 2}" y="${subheadY}" text-anchor="middle" fill="${neutral}" font-family="${fontBody}" font-size="${subheadSize}" style="line-height:${lineHeight}" opacity="0.8">${escapeXml(copy_slots.subhead)}</text>
  ${buildPhotoPlaceholder(photoX, photoY, photoW, photoH, mode, copy_slots.label)}
  <g transform="translate(${markX}, ${markY})">${normalizeMarkGroup(markInner, markSize)}</g>
  <text x="${w / 2}" y="${h - 60}" text-anchor="middle" fill="${neutral}" font-family="${fontBody}" font-size="${bodySize}" opacity="0.6">${escapeXml(copy_slots.cta)}</text>
</svg>`.trim();
  }

  return { layout, copy_slots, preview_svg };
}

/** Website hero: 1400x800, mode-aware layouts */
function buildWebsiteHeroPreview(input: TemplatePreviewInput): TemplateWithPreview {
  const { palette, fonts, brand_name, logo_svg_mark, direction_keywords } = input;
  const w = 1400;
  const h = 800;
  const mode = selectStyleMode(direction_keywords, palette, fonts);
  const bg = getColor(palette, "background", "#0a0a0a");
  const primary = getColor(palette, "primary", "#ffffff");
  const accent = getColor(palette, "accent", "#3b82f6");
  const neutral = getColor(palette, "neutral", "#a1a1aa");
  const fontHeading = getFontFamily(fonts, "heading") || getFontFamily(fonts, "display");
  const fontBody = getFontFamily(fonts, "body");
  const copy_slots = buildCopySlots(brand_name, direction_keywords, mode);

  const markInner = logo_svg_mark
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();

  let layout: string;
  let preview_svg: string;

  if (mode === "editorial") {
    // Editorial: left type column, right photo window, baseline grid line
    layout = "Editorial: left type column, right photo window, baseline grid line, mark watermark.";
    const headlineSize = 72;
    const subheadSize = 26;
    const bodySize = 16;
    const lineHeight = 1.4;
    
    const contentX = 120;
    const headlineY = 240;
    const subheadY = headlineY + headlineSize * lineHeight + 24;
    const photoX = w / 2 + 60;
    const photoY = 120;
    const photoW = w / 2 - 180;
    const photoH = h - photoY - 120;
    
    preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="photoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.5" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${buildMarkPattern(markInner, mode, w, h, 0.08)}
  <line x1="0" y1="${h - 100}" x2="${w}" y2="${h - 100}" stroke="${neutral}" stroke-width="1" opacity="0.2"/>
  ${copy_slots.kicker ? `<text x="${contentX}" y="140" fill="${accent}" font-family="${fontBody}" font-size="${bodySize}" font-weight="600" letter-spacing="2">${escapeXml(copy_slots.kicker)}</text>` : ""}
  <text x="${contentX}" y="${headlineY}" fill="${primary}" font-family="${fontHeading}" font-size="${headlineSize}" font-weight="700" style="line-height:${lineHeight}">${escapeXml(copy_slots.headline)}</text>
  <text x="${contentX}" y="${subheadY}" fill="${neutral}" font-family="${fontBody}" font-size="${subheadSize}" style="line-height:${lineHeight}">${escapeXml(copy_slots.subhead)}</text>
  ${buildPhotoPlaceholder(photoX, photoY, photoW, photoH, mode, copy_slots.label)}
  <text x="${contentX}" y="${h - 60}" fill="${accent}" font-family="${fontBody}" font-size="${bodySize}" font-weight="600">${escapeXml(copy_slots.cta)} →</text>
</svg>`.trim();
    
  } else if (mode === "tech") {
    // Tech: modular blocks, CTA as pill, navigation dots, mark as UI icon
    layout = "Tech: modular blocks, CTA as pill, navigation dots, mark as UI icon, grid lines.";
    const headlineSize = 64;
    const subheadSize = 24;
    const labelSize = 14;
    const lineHeight = 1.2;
    
    const contentX = 100;
    const headlineY = 200;
    const subheadY = headlineY + headlineSize * lineHeight + 16;
    const photoX = w / 2 + 40;
    const photoY = 140;
    const photoW = w / 2 - 120;
    const photoH = h - photoY - 140;
    
    preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="photoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.5" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${buildMarkPattern(markInner, mode, w, h, 0.12)}
  <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="${neutral}" stroke-width="1" opacity="0.1"/>
  ${copy_slots.kicker ? `<text x="${contentX}" y="120" fill="${accent}" font-family="${fontBody}" font-size="${labelSize}" font-weight="600" letter-spacing="1">${escapeXml(copy_slots.kicker)}</text>` : ""}
  <text x="${contentX}" y="${headlineY}" fill="${primary}" font-family="${fontHeading}" font-size="${headlineSize}" font-weight="700" style="line-height:${lineHeight}" letter-spacing="-1">${escapeXml(copy_slots.headline)}</text>
  <text x="${contentX}" y="${subheadY}" fill="${neutral}" font-family="${fontBody}" font-size="${subheadSize}" style="line-height:${lineHeight}">${escapeXml(copy_slots.subhead)}</text>
  ${copy_slots.label ? `<text x="${contentX}" y="${subheadY + subheadSize * lineHeight + 20}" fill="${neutral}" font-family="${fontBody}" font-size="${labelSize}" opacity="0.7">${escapeXml(copy_slots.label)}</text>` : ""}
  ${buildPhotoPlaceholder(photoX, photoY, photoW, photoH, mode, copy_slots.label)}
  <rect x="${contentX}" y="${h - 100}" width="200" height="52" rx="26" fill="${accent}"/>
  <text x="${contentX + 100}" y="${h - 100 + 32}" text-anchor="middle" fill="${primary}" font-family="${fontBody}" font-size="${labelSize}" font-weight="600">${escapeXml(copy_slots.cta)}</text>
  <g opacity="0.4">
    <circle cx="${w - 80}" cy="${h / 2 - 20}" r="4" fill="${neutral}"/>
    <circle cx="${w - 80}" cy="${h / 2}" r="6" fill="${accent}"/>
    <circle cx="${w - 80}" cy="${h / 2 + 20}" r="4" fill="${neutral}"/>
  </g>
  <g transform="translate(${w - 200}, 60)" opacity="0.6">${normalizeMarkGroup(markInner, 40)}</g>
</svg>`.trim();
    
  } else {
    // Premium: asymmetrical whitespace, big headline, understated CTA, mark watermark
    layout = "Premium: asymmetrical whitespace, big headline, understated CTA, mark watermark.";
    const headlineSize = 68;
    const subheadSize = 22;
    const bodySize = 14;
    const lineHeight = 1.3;
    
    const headlineX = 140;
    const headlineY = 280;
    const subheadX = headlineX;
    const subheadY = headlineY + headlineSize * lineHeight + 20;
    const photoX = w / 2 + 80;
    const photoY = 180;
    const photoW = w / 2 - 240;
    const photoH = h - photoY - 140;
    
    preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="photoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
      <stop offset="100%" style="stop-color:#000000;stop-opacity:0.5" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${bg}"/>
  ${buildMarkPattern(markInner, mode, w, h, 0.05)}
  <text x="${headlineX}" y="${headlineY}" fill="${primary}" font-family="${fontHeading}" font-size="${headlineSize}" font-weight="700" style="line-height:${lineHeight}">${escapeXml(copy_slots.headline)}</text>
  <text x="${subheadX}" y="${subheadY}" fill="${neutral}" font-family="${fontBody}" font-size="${subheadSize}" style="line-height:${lineHeight}" opacity="0.8">${escapeXml(copy_slots.subhead)}</text>
  ${buildPhotoPlaceholder(photoX, photoY, photoW, photoH, mode, copy_slots.label)}
  <line x1="${headlineX}" y1="${h - 120}" x2="${headlineX + 120}" y2="${h - 120}" stroke="${accent}" stroke-width="2"/>
  <text x="${headlineX}" y="${h - 80}" fill="${neutral}" font-family="${fontBody}" font-size="${bodySize}" opacity="0.6">${escapeXml(copy_slots.cta)}</text>
</svg>`.trim();
  }

  return { layout, copy_slots, preview_svg };
}

export function buildTemplatePreviews(input: TemplatePreviewInput): TemplatePreviewsOutput {
  return {
    social_post: buildSocialPostPreview(input),
    website_hero: buildWebsiteHeroPreview(input),
  };
}
