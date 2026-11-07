/** CAN School Sites: finite, server-renderable visual identity tokens.
 * No external font, CSS, remote image or untrusted church-source style is injected.
 * A suggested brand is private draft data, NOT a published theme.
 */
/** Structural template selection is independent of colors, fonts and approved school data. */
export const siteTemplateIds = ["heritage", "community", "modern", "bright-futures", "summit", "classic", "campus"] as const;
export type SiteTemplateId = typeof siteTemplateIds[number];
export function resolveSiteTemplateId(value: unknown): SiteTemplateId {
  return typeof value === "string" && siteTemplateIds.includes(value as SiteTemplateId)
    ? value as SiteTemplateId : "heritage";
}

export const sitePaletteIds = ["signature","heritage","forest","copper","coastal","harbor",
  "brand-heritage","brand-community","brand-modern","brand-bright-futures",
  "brand-summit","brand-classic","brand-campus"] as const;
export type SitePaletteId = typeof sitePaletteIds[number];
export const siteTypographyIds = ["editorial","traditional","contemporary"] as const;
export type SiteTypographyId = typeof siteTypographyIds[number];

export const siteFontCatalog = {
  georgia: { label: "Georgia · editorial serif", css: "Georgia, Cambria, serif" },
  cambria: { label: "Cambria · academic serif", css: "Cambria, Georgia, serif" },
  palatino: { label: "Palatino · literary serif", css: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  times: { label: "Times · classical serif", css: "'Times New Roman', Times, serif" },
  arial: { label: "Arial · clean sans", css: "Arial, Helvetica, sans-serif" },
  verdana: { label: "Verdana · open sans", css: "Verdana, Geneva, sans-serif" },
  trebuchet: { label: "Trebuchet · humanist sans", css: "'Trebuchet MS', Arial, sans-serif" },
  system: { label: "System · modern sans", css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
} as const;
export type SiteFontId = keyof typeof siteFontCatalog;
export function isSiteFontId(value: unknown): value is SiteFontId {
  return typeof value === "string" && Object.hasOwn(siteFontCatalog, value);
}

export type ProposedChurchBrand = {
  siteId: string;
  sourceUrl: string;
  analyzedAt: string;
  paletteSuggestions: Array<{
    hex: string;
    roleSuggestion: "primary" | "secondary" | "accent";
    sourceEvidence: string;
  }>;
  headingFontSuggestion?: { familyName: string; sourceEvidence: string };
  bodyFontSuggestion?: { familyName: string; sourceEvidence: string };
  logoSuggestion?: { sourceUrl: string; reuseStatus: "rights_unconfirmed" };
  status: "suggested" | "accepted" | "modified" | "rejected";
};

const palettes = {
  signature: { ink:"#112d34", canvas:"#f8f6f0", accent:"#bb8a48", secondary:"#315d4c", muted:"#586762" },
  heritage: { ink:"#162b45", canvas:"#faf6ed", accent:"#9d7136", secondary:"#354f65", muted:"#59636a" },
  forest: { ink:"#173e35", canvas:"#f8f8f0", accent:"#b08040", secondary:"#42624c", muted:"#53655c" },
  copper: { ink:"#4a3028", canvas:"#fbf6f0", accent:"#a2643d", secondary:"#734f42", muted:"#685a51" },
  coastal: { ink:"#174153", canvas:"#f5f9f8", accent:"#956e3e", secondary:"#427a78", muted:"#54686d" },
  // Harborlight reference: burgundy, muted rose and ivory, shared across all Sites.
  harbor: { ink:"#561c31", canvas:"#fbf6f2", accent:"#c98883", secondary:"#793a4c", muted:"#654e58" },
  // Audited, contrast-checked equivalents of the seven supplied ZIP brand kits.
  // All remain finite tokens; untrusted CSS/remote fonts are still forbidden.
  "brand-heritage": { ink:"#0c2038", canvas:"#f1ede4", accent:"#dcb568", secondary:"#253e56", muted:"#536374" },
  "brand-community": { ink:"#173c2e", canvas:"#f7f3e7", accent:"#eabf4c", secondary:"#214c3b", muted:"#4d6a5c" },
  "brand-modern": { ink:"#080e20", canvas:"#ebf1ff", accent:"#65e8f3", secondary:"#132b48", muted:"#51617c" },
  "brand-bright-futures": { ink:"#16326b", canvas:"#fff9e8", accent:"#f4772f", secondary:"#3856a0", muted:"#4a5f8c" },
  "brand-summit": { ink:"#05131e", canvas:"#f7f1e8", accent:"#e9c57a", secondary:"#122d43", muted:"#536a79" },
  "brand-classic": { ink:"#0c213c", canvas:"#f6f2e9", accent:"#c39c56", secondary:"#253d55", muted:"#56637a" },
  "brand-campus": { ink:"#181f24", canvas:"#f7f4ea", accent:"#e6bc72", secondary:"#334b51", muted:"#566873" },
} as const;
const fonts = {
  editorial: { display:"Georgia, Cambria, 'Times New Roman', serif", body:"Arial, Helvetica, sans-serif" },
  traditional: { display:"Cambria, Georgia, 'Times New Roman', serif", body:"Arial, Helvetica, sans-serif" },
  contemporary: { display:"'Trebuchet MS', Arial, sans-serif", body:"Arial, Helvetica, sans-serif" },
} as const;
export type SiteTheme = {
  paletteId: SitePaletteId;
  typographyId: SiteTypographyId;
  ink: string; canvas: string; accent: string; secondary: string; muted: string;
  displayFont: string; bodyFont: string; onDark: "#ffffff";
};

/** Compare theme colors at 4.5:1 for ordinary body and 3:1 for large text. */
export function contrastRatio(a: string,b: string): number {
  function luminance(hex: string): number {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Only bounded hex color tokens are supported");
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
      .map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4));
    return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
  }
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

export function resolveSiteTheme(paletteId?: string, typographyId?: string, headingFontId?: SiteFontId, bodyFontId?: SiteFontId): SiteTheme {
  const palette = sitePaletteIds.includes(paletteId as SitePaletteId)
    ? paletteId as SitePaletteId : "signature";
  const typography = siteTypographyIds.includes(typographyId as SiteTypographyId)
    ? typographyId as SiteTypographyId : "editorial";
  const colors=palettes[palette], type=fonts[typography];
  if (contrastRatio(colors.ink,colors.canvas)<4.5 ||
      contrastRatio(colors.muted,colors.canvas)<4.5 ||
      contrastRatio("#ffffff",colors.ink)<4.5) {
    return resolveSiteTheme("signature","editorial");
  }
  return {paletteId:palette,typographyId:typography,...colors,
    displayFont:isSiteFontId(headingFontId)?siteFontCatalog[headingFontId].css:type.display,bodyFont:isSiteFontId(bodyFontId)?siteFontCatalog[bodyFontId].css:type.body,onDark:"#ffffff"};
}

/** P may suggest but never publish. No network fetch or imported font binary. */
export function reviewSuggestedChurchPalette(proposal: ProposedChurchBrand | null | undefined) {
  if (!proposal) return {state:"unavailable" as const, reason:"Church source discovery has not supplied a verified proposal"};
  return {state:"suggested" as const, sourceUrl:proposal.sourceUrl,
    candidates:proposal.paletteSuggestions.filter(p=>/^#[\da-f]{6}$/i.test(p.hex))
      .map(p=>({...p, usableForBody:contrastRatio(p.hex,"#ffffff")>=4.5})),
    headingFontSuggestion:proposal.headingFontSuggestion?.familyName ?? null,
    bodyFontSuggestion:proposal.bodyFontSuggestion?.familyName ?? null};
}
