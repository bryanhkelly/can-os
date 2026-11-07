import {
  contrastRatio, resolveSiteTemplateId, resolveSiteTheme,
  type SitePaletteId, type SiteTemplateId, type SiteTypographyId,
} from "./site-theme";
import type { SiteLocalBranding } from "./site-local-content";

/**
 * Site-scoped visual identity shared by the public website and private brand
 * previews. The ZIP lockups name fictional schools; they are references only.
 * No arbitrary uploaded SVG, CSS, external font or remote asset is accepted.
 */
export const schoolBrandDesigns: Record<SiteTemplateId, {
  name: string;
  caption: string;
  recommendedPalette: SitePaletteId;
  recommendedTypography: SiteTypographyId;
  emblem: "square" | "rounded" | "circle" | "shield";
  letterSpacing: number;
}> = {
  heritage: { name: "Heritage Academy", caption: "THE SCHOOL JOURNAL", recommendedPalette: "brand-heritage", recommendedTypography: "editorial", emblem: "square", letterSpacing: 3.4 },
  community: { name: "Community & Faith", caption: "A PLACE TO BELONG", recommendedPalette: "brand-community", recommendedTypography: "editorial", emblem: "rounded", letterSpacing: 1.4 },
  modern: { name: "Modern Learning", caption: "DISCOVER YOUR PATH", recommendedPalette: "brand-modern", recommendedTypography: "contemporary", emblem: "rounded", letterSpacing: 2.8 },
  "bright-futures": { name: "Bright Futures", caption: "GROW WITH POSSIBILITY", recommendedPalette: "brand-bright-futures", recommendedTypography: "contemporary", emblem: "circle", letterSpacing: 1.5 },
  summit: { name: "Summit Preparatory", caption: "THE JOURNEY AHEAD", recommendedPalette: "brand-summit", recommendedTypography: "editorial", emblem: "square", letterSpacing: 3.2 },
  classic: { name: "Heritage Classical", caption: "FAITH · SCHOLARSHIP · CHARACTER", recommendedPalette: "brand-classic", recommendedTypography: "traditional", emblem: "shield", letterSpacing: 2.8 },
  campus: { name: "Campus Life", caption: "A SCHOOL JOURNAL", recommendedPalette: "brand-campus", recommendedTypography: "contemporary", emblem: "square", letterSpacing: 1.6 },
};

/** Returns a per-school mark, not a mark named after the chosen design. */
export function schoolBrandMonogram(schoolName: string): string {
  const words = schoolName.trim().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!words.length) return "S";
  return (words.length === 1 ? words[0]!.slice(0, 2) :
    words.slice(0, 2).map(word => [...word][0]).join("")).toLocaleUpperCase();
}

export function resolveSchoolBrand(schoolName: string, branding: Pick<
  SiteLocalBranding, "templateId" | "paletteId" | "typographyId" | "headingFontId" | "bodyFontId"
>) {
  const templateId = resolveSiteTemplateId(branding.templateId);
  const design = schoolBrandDesigns[templateId];
  const selectedTheme = resolveSiteTheme(branding.paletteId, branding.typographyId,
    branding.headingFontId, branding.bodyFontId);
  // Match the hosted Modern template's original sans-serif heading unless
  // the editor explicitly selected another heading font.
  const theme = templateId === "modern" && !branding.headingFontId
    ? { ...selectedTheme, displayFont: selectedTheme.bodyFont }
    : selectedTheme;
  const normalizedName = schoolName.trim().slice(0, 120) || "Your School";
  const readableAccent = contrastRatio(theme.accent, theme.ink) >= 3
    ? theme.accent : theme.canvas;
  return {
    templateId, design, theme,
    schoolName: normalizedName,
    monogram: schoolBrandMonogram(normalizedName),
    background: theme.ink,
    foreground: theme.canvas,
    accent: readableAccent,
  };
}

function escapeSvg(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A real, downloadable school-specific vector generated only from safe tokens. */
export function renderSchoolBrandSvg(schoolName: string, branding: SiteLocalBranding): string {
  const identity = resolveSchoolBrand(schoolName, branding);
  const { design, theme } = identity;
  const bg = identity.background;
  const fg = identity.foreground;
  const accent = identity.accent;
  const family = escapeSvg(theme.displayFont);
  const name = escapeSvg(identity.schoolName);
  const initials = escapeSvg(identity.monogram);
  const fontSize = Math.max(18, Math.min(35, Math.floor(950 / [...identity.schoolName].length)));
  const shield = design.emblem === "shield";
  const circle = design.emblem === "circle";
  const rx = design.emblem === "rounded" ? 22 : circle ? 54 : 0;
  const frame = shield
    ? '<path d="M25 20H119V86Q119 124 72 148Q25 124 25 86Z" fill="none" stroke="' + accent + '" stroke-width="3"/>'
    : '<rect x="25" y="28" width="94" height="94" rx="' + rx + '" fill="none" stroke="' + accent + '" stroke-width="3"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 170" role="img" aria-label="' +
    name + ' brand wordmark">' +
    '<rect width="960" height="170" fill="' + bg + '"/>' +
    frame +
    '<text x="72" y="88" text-anchor="middle" dominant-baseline="middle" font-family="' +
      family + '" font-weight="700" font-size="' + (initials.length > 1 ? 37 : 48) +
      '" fill="' + accent + '">' + initials + '</text>' +
    '<text x="152" y="84" font-family="' + family + '" font-size="' + fontSize +
      '" font-weight="700" fill="' + fg + '" letter-spacing="' + design.letterSpacing + '">' +
      name + '</text>' +
    '<text x="153" y="118" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700"' +
      ' letter-spacing="2" fill="' + accent + '">' + escapeSvg(design.caption) + '</text></svg>';
}

export function schoolBrandSvgDataUrl(schoolName: string, branding: SiteLocalBranding): string {
  return "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(renderSchoolBrandSvg(schoolName, branding));
}
