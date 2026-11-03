import { contrastRatio, resolveSiteTheme, sitePaletteIds, siteTypographyIds,
  type SitePaletteId, type SiteTypographyId } from "./site-theme";

/**
 * P-only, private advisory contract. Do not accept arbitrary CSS, user supplied
 * font files or copied artwork. Publishing requires B's existing versioned
 * maintained theme selection and independent editor review.
 */
export type ChurchBrandEvidence = {
  pageUrl: string;
  signal: "meta-theme-color" | "inline-css-token" | "inline-font-family";
  value: string;
  sourceEvidence: string;
};
export type ChurchBrandProposal = {
  sourceUrl: string;
  observedAt: string;
  extractionVersion: "church-html-v1";
  evidence: ChurchBrandEvidence[];
  paletteCandidates: Array<{
    paletteId: SitePaletteId;
    contrastInkCanvas: number;
    contrastMutedCanvas: number;
    contrastWhiteInk: number;
    reason: string;
  }>;
  typographyCandidates: Array<{ typographyId: SiteTypographyId; reason: string }>;
  assetReuse: "not_authorized";
  status: "suggested";
};

const validHex = /^#[0-9a-f]{6}$/i;
function colorChannels(hex: string) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}
function distance(a: string, b: string) {
  const aa = colorChannels(a), bb = colorChannels(b);
  return Math.sqrt(aa.reduce((sum, value, i) => sum + (value - bb[i]!) ** 2, 0));
}

/** Extract ONLY limited source indications from previously bounded public HTML. */
export function boundedChurchBrandEvidence(html: string, pageUrl: string): ChurchBrandEvidence[] {
  const doc = html.slice(0, 32 * 1024);
  const evidence: ChurchBrandEvidence[] = [];
  const attr = (tag: string, name: string) => {
    const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  };
  for (const tag of doc.match(/<meta\b[^>]{0,1000}>/gi) ?? []) {
    if (attr(tag, "name").toLowerCase() !== "theme-color") continue;
    const value = attr(tag, "content").toLowerCase();
    if (validHex.test(value)) {
      evidence.push({
        pageUrl, signal: "meta-theme-color", value,
        sourceEvidence: "HTML theme-color metadata",
      });
    }
  }
  // Only inline declarations in bounded HTML. No external stylesheet fetch,
  // script execution, arbitrary CSS serialization or font downloads.
  for (const style of doc.match(/<style\b[^>]*>[\s\S]{0,4096}<\/style>/gi) ?? []) {
    for (const match of style.matchAll(/(--[a-z\d_-]{1,50})\s*:\s*(#[\da-f]{6})(?![\da-f])/gi)) {
      if (evidence.length >= 6) break;
      const value = match[2]!.toLowerCase();
      if (validHex.test(value)) evidence.push({
        pageUrl, signal: "inline-css-token", value,
        sourceEvidence: `Declared color token ${match[1]!.slice(0, 50)}`,
      });
    }
    const family = /font-family\s*:\s*([^;}{]{1,80})/i.exec(style)?.[1] ?? "";
    const matched = /\b(Trebuchet MS|Cambria|Georgia)\b/i.exec(family)?.[1];
    if (matched && evidence.length < 8) evidence.push({
      pageUrl, signal: "inline-font-family", value: matched,
      sourceEvidence: "Inline CSS font-family declaration",
    });
  }
  return evidence.slice(0, 8);
}

export function deriveChurchBrandProposal(
  sourceUrl: string, observedAt: string, sourceEvidence: readonly ChurchBrandEvidence[],
): ChurchBrandProposal | null {
  const evidence = sourceEvidence.filter(item =>
    item.pageUrl.startsWith(new URL(sourceUrl).origin + "/") &&
    item.sourceEvidence.length <= 120 &&
    item.value.length <= 80 &&
    (item.signal === "inline-font-family" || validHex.test(item.value))).slice(0, 8);
  if (!evidence.length) return null;
  const colors = evidence.filter(item => validHex.test(item.value)).map(item => item.value);
  const paletteCandidates = colors.length ? sitePaletteIds.map(paletteId => {
    const theme = resolveSiteTheme(paletteId, "editorial");
    return {
      paletteId,
      score: Math.min(...colors.map(hex => Math.min(distance(hex, theme.ink), distance(hex, theme.accent)))),
      contrastInkCanvas: contrastRatio(theme.ink, theme.canvas),
      contrastMutedCanvas: contrastRatio(theme.muted, theme.canvas),
      contrastWhiteInk: contrastRatio("#ffffff", theme.ink),
      reason: "Closest maintained theme to observed public color evidence; not an imported brand identity",
    };
  }).filter(candidate =>
    candidate.contrastInkCanvas >= 4.5 &&
    candidate.contrastMutedCanvas >= 4.5 &&
    candidate.contrastWhiteInk >= 4.5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2).map(candidate => ({
      paletteId: candidate.paletteId,
      contrastInkCanvas: candidate.contrastInkCanvas,
      contrastMutedCanvas: candidate.contrastMutedCanvas,
      contrastWhiteInk: candidate.contrastWhiteInk,
      reason: candidate.reason,
    })) : [];
  const fontEvidence = evidence.find(item => item.signal === "inline-font-family");
  const preferred = fontEvidence?.value.toLowerCase().includes("trebuchet") ? "contemporary"
    : fontEvidence?.value.toLowerCase().includes("cambria") ? "traditional"
      : fontEvidence?.value.toLowerCase().includes("georgia") ? "editorial" : null;
  const typographyCandidates = preferred && siteTypographyIds.includes(preferred)
    ? [{ typographyId: preferred as SiteTypographyId,
      reason: "Matched a maintained, locally available typography preset to inline font evidence" }]
    : [];
  return {
    sourceUrl, observedAt, extractionVersion: "church-html-v1",
    evidence, paletteCandidates, typographyCandidates,
    assetReuse: "not_authorized", status: "suggested",
  };
}
