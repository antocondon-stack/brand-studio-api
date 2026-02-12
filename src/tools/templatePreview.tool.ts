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
}

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

/** Deterministic copy slots from brand and keywords */
function buildCopySlots(brand_name: string, direction_keywords: string[]): CopySlots {
  const k = direction_keywords.slice(0, 3).join(" ");
  return {
    headline: brand_name,
    subhead: k || "Your story. Your audience.",
    cta: "Learn more",
  };
}

/** Social post: 1200x1200, centered mark, headline, subhead, CTA; premium blocks */
function buildSocialPostPreview(input: TemplatePreviewInput): TemplateWithPreview {
  const { palette, fonts, brand_name, logo_svg_mark, direction_keywords } = input;
  const w = 1200;
  const h = 1200;
  const bg = getColor(palette, "background", "#0f0f0f");
  const primary = getColor(palette, "primary", "#ffffff");
  const accent = getColor(palette, "accent", "#3b82f6");
  const neutral = getColor(palette, "neutral", "#a1a1aa");
  const fontHeading = getFontFamily(fonts, "heading");
  const copy_slots = buildCopySlots(brand_name, direction_keywords);
  const layout =
    "Centered: mark top, headline mid, subhead below, CTA bottom. Full-bleed background, generous padding.";

  const markSize = 120;
  const markX = (w - markSize) / 2;
  const markY = 140;
  const headlineY = 380;
  const subheadY = 480;
  const ctaY = 680;
  const ctaW = 200;
  const ctaH = 52;
  const ctaX = (w - ctaW) / 2;

  const markInner = logo_svg_mark
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();

  const preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${markX}, ${markY}) scale(${markSize / 24})">${markInner}</g>
  <text x="${w / 2}" y="${headlineY}" text-anchor="middle" fill="${primary}" font-family="${fontHeading}" font-size="48" font-weight="700">${escapeXml(copy_slots.headline)}</text>
  <text x="${w / 2}" y="${subheadY}" text-anchor="middle" fill="${neutral}" font-family="${fontHeading}" font-size="24">${escapeXml(copy_slots.subhead)}</text>
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="8" fill="${accent}"/>
  <text x="${w / 2}" y="${ctaY + ctaH / 2 + 6}" text-anchor="middle" fill="${primary}" font-family="${fontHeading}" font-size="16" font-weight="600">${escapeXml(copy_slots.cta)}</text>
</svg>`.trim();

  return { layout, copy_slots, preview_svg };
}

/** Website hero: 1400x800, mark left or top, headline/subhead/CTA right or center */
function buildWebsiteHeroPreview(input: TemplatePreviewInput): TemplateWithPreview {
  const { palette, fonts, brand_name, logo_svg_mark, direction_keywords } = input;
  const w = 1400;
  const h = 800;
  const bg = getColor(palette, "background", "#0a0a0a");
  const primary = getColor(palette, "primary", "#ffffff");
  const accent = getColor(palette, "accent", "#3b82f6");
  const neutral = getColor(palette, "neutral", "#a1a1aa");
  const fontHeading = getFontFamily(fonts, "heading");
  const copy_slots = buildCopySlots(brand_name, direction_keywords);
  const layout =
    "Horizontal: mark left, headline and subhead center-right, CTA bottom-right. Dark background, accent CTA.";

  const markSize = 80;
  const markX = 80;
  const markY = (h - markSize) / 2;
  const contentX = 520;
  const headlineY = 320;
  const subheadY = 400;
  const ctaX = contentX;
  const ctaY = 520;
  const ctaW = 180;
  const ctaH = 48;

  const markInner = logo_svg_mark
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();

  const preview_svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${markX}, ${markY}) scale(${markSize / 24})">${markInner}</g>
  <text x="${contentX}" y="${headlineY}" fill="${primary}" font-family="${fontHeading}" font-size="56" font-weight="700">${escapeXml(copy_slots.headline)}</text>
  <text x="${contentX}" y="${subheadY}" fill="${neutral}" font-family="${fontHeading}" font-size="22">${escapeXml(copy_slots.subhead)}</text>
  <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}" rx="8" fill="${accent}"/>
  <text x="${ctaX + ctaW / 2}" y="${ctaY + ctaH / 2 + 5}" text-anchor="middle" fill="${primary}" font-family="${fontHeading}" font-size="15" font-weight="600">${escapeXml(copy_slots.cta)}</text>
</svg>`.trim();

  return { layout, copy_slots, preview_svg };
}

export function buildTemplatePreviews(input: TemplatePreviewInput): TemplatePreviewsOutput {
  return {
    social_post: buildSocialPostPreview(input),
    website_hero: buildWebsiteHeroPreview(input),
  };
}
