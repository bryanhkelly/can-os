import { describe, expect, it } from "vitest";
import { boundedChurchBrandEvidence, deriveChurchBrandProposal } from "./church-brand-suggestions";
import { sitePaletteIds, siteTypographyIds, resolveSiteTheme } from "./site-theme";

describe("church brand suggestions remain curated, bounded, private and advisory", () => {
  const url = "https://church.org/";
  const observedAt = "2026-11-03T18:00:00.000Z";

  it("extracts only bounded metadata and inline declarations, not external fonts or CSS", () => {
    const html = `<head>
      <meta content="#112d34" name="theme-color">
      <link rel="stylesheet" href="https://remote.example.net/font.css">
      <style>:root {--brand-ink:#112d34;--accent:#bb8a48;}
      h1 {font-family: Georgia, serif}</style></head><body></body>`;
    const evidence = boundedChurchBrandEvidence(html, url);
    expect(evidence.map(e => e.value)).toContain("#112d34");
    expect(evidence.map(e => e.value)).toContain("Georgia");
    expect(evidence.every(e => e.pageUrl === url)).toBe(true);
    expect(evidence.every(e => e.sourceEvidence.length <= 120)).toBe(true);
    const suggestion = deriveChurchBrandProposal(url, observedAt, evidence);
    expect(suggestion).toBeTruthy();
    expect(suggestion?.status).toBe("suggested");
    expect(suggestion?.assetReuse).toBe("not_authorized");
    expect(suggestion?.paletteCandidates.length).toBeGreaterThan(0);
    expect(suggestion?.paletteCandidates.every(p => sitePaletteIds.includes(p.paletteId))).toBe(true);
    expect(suggestion?.typographyCandidates.every(p => siteTypographyIds.includes(p.typographyId))).toBe(true);
    expect(suggestion?.paletteCandidates.every(p => {
      const theme = resolveSiteTheme(p.paletteId, "editorial");
      return p.contrastInkCanvas >= 4.5 && p.contrastMutedCanvas >= 4.5 &&
        theme.paletteId === p.paletteId;
    })).toBe(true);
  });

  it("does not invent a brand when evidence is absent or comes from another origin", () => {
    expect(deriveChurchBrandProposal(url, observedAt, [])).toBeNull();
    const evidence = boundedChurchBrandEvidence(
      '<meta name="theme-color" content="#123456">', "https://otherchurch.org/",
    );
    expect(deriveChurchBrandProposal(url, observedAt, evidence)).toBeNull();
  });

  it("ignores CSS content beyond the bounded source window and rejects arbitrary font labels", () => {
    const evidence = boundedChurchBrandEvidence(
      "x".repeat(33000) + '<style>body{font-family:"Remote Custom Font"; color: #123456}</style>',
      url,
    );
    expect(evidence).toEqual([]);
    expect(deriveChurchBrandProposal(url, observedAt, evidence)).toBeNull();
  });
});
