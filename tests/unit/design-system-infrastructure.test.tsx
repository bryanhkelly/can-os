import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuardianApplicationForm } from "@/components/enrollment/GuardianApplicationForm";
import { ChecklistWorkspaceShell, GuidedSetupShell, SplitReviewShell } from "@/components/workflow";
import { brandThemeStyle, contrastRatio, defaultBrandTokens, resolveBrandTokens } from "@/design-system/brand-theme";

describe("controlled institutional branding", () => {
  it("keeps default action and accent pairs above the text contrast threshold", () => {
    expect(contrastRatio(defaultBrandTokens.primaryForeground, defaultBrandTokens.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(defaultBrandTokens.accentForeground, defaultBrandTokens.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(defaultBrandTokens.primary, "#f6f8fb")).toBeGreaterThanOrEqual(4.5);
  });

  it("accepts a complete accessible site token set", () => {
    const brand = { primary: "#075b50", primaryForeground: "#ffffff", accent: "#e5f4f0", accentForeground: "#102a26" };
    expect(resolveBrandTokens(brand)).toEqual({ tokens: brand, issues: [] });
    expect(brandThemeStyle(brand)["--brand-primary"]).toBe(brand.primary);
  });

  it("rejects brand actions that pass on white but fail on shared muted surfaces", () => {
    const candidate = { primary: "#1769ef", primaryForeground: "#ffffff", accent: "#ffffff", accentForeground: "#101d39" };
    expect(contrastRatio(candidate.primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(candidate.primary, "#eef2f7")).toBeLessThan(4.5);
    const resolved = resolveBrandTokens(candidate);
    expect(resolved.tokens).toEqual(defaultBrandTokens);
    expect(resolved.issues).toContain("primary on muted must reach 4.5:1");
  });

  it("rejects accents that fail on shared secondary copy despite passing the brand pairs", () => {
    const candidate = { primary: "#101d39", primaryForeground: "#ffffff", accent: "#b8b8b8", accentForeground: "#101d39" };
    expect(contrastRatio(candidate.primary, candidate.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(candidate.accentForeground, candidate.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#52627c", candidate.accent)).toBeLessThan(4.5);
    const result = resolveBrandTokens(candidate);
    expect(result.tokens).toEqual(defaultBrandTokens);
    expect(result.issues).toContain("mutedForeground on accent must reach 4.5:1");
  });

  it("rejects low contrast and malformed inputs as a complete set", () => {
    const lowContrast = resolveBrandTokens({ primary: "#ffffff", primaryForeground: "#ffffff" });
    expect(lowContrast.tokens).toEqual(defaultBrandTokens);
    expect(lowContrast.issues.length).toBeGreaterThan(0);
    expect(resolveBrandTokens({ primary: "var(--unsafe)" }).tokens).toEqual(defaultBrandTokens);
  });
});

describe("workflow shell contracts", () => {
  it("exposes current guided progress without making future steps interactive", () => {
    const html = renderToStaticMarkup(<GuidedSetupShell title="Application" steps={[
      { id: "one", title: "Student", status: "current" },
      { id: "two", title: "School review", status: "upcoming" },
    ]}><p>Canonical form</p></GuidedSetupShell>);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Current step");
    expect(html).toContain("Canonical form");
    expect(html).not.toContain("<a");
  });

  it("keeps checklist context and split review as separate labelled regions", () => {
    const checklist = renderToStaticMarkup(<ChecklistWorkspaceShell title="Requirements" context={<p>Authorized context</p>}><p>Server requirements</p></ChecklistWorkspaceShell>);
    expect(checklist).toContain("Server requirements");
    expect(checklist).toContain("Authorized context");
    const review = renderToStaticMarkup(<SplitReviewShell record={<p>Evidence</p>} review={<p>Decision</p>} />);
    expect(review).toContain('aria-label="Submitted record"');
    expect(review).toContain('aria-label="Review and decision"');
  });
});

describe("GF22 guided application integration", () => {
  it("renders labelled controls and explicit non-approval guidance", () => {
    const html = renderToStaticMarkup(<GuardianApplicationForm programs={[{ id: "program", name: "High school" }]}
      households={[]} onSubmit={async () => ({ applicationId: "unused" })} />);
    for (const label of ["School or offering", "Your family", "Student legal first name", "Student legal last name", "Entering grade level"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Independent guardian review");
    expect(html).toContain("does not establish legal guardianship");
  });

  it("retains the canonical route loader and bounded submission command", () => {
    const route = readFileSync(new URL("../../src/routes/launch.family.tsx", import.meta.url), "utf8");
    expect(route).toContain("const workspace = await getGuardianFamilyApplicationWorkspace()");
    expect(route).toContain("safeLoader(async () =>");
    expect(route).toContain("startGuardianFamilyApplication({ data: input })");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("drizzle");
  });
});
