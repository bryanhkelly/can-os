import { describe, expect, it } from "vitest";
import { suggestedLaunchSlug } from "@/domain/launch-slug";

describe("suggestedLaunchSlug", () => {
  it("derives a kebab-case slug from an ordinary school name", () => {
    expect(suggestedLaunchSlug("Grace Academy")).toBe("grace-academy");
    expect(suggestedLaunchSlug("  St. Mary's K-8 School  ")).toBe("st-mary-s-k-8-school");
  });

  it("strips diacritics and collapses separators", () => {
    expect(suggestedLaunchSlug("Résurrection — École  Élémentaire")).toBe("resurrection-ecole-elementaire");
    expect(suggestedLaunchSlug("Hope & Light!! Academy")).toBe("hope-light-academy");
  });

  it("never produces leading, trailing or double hyphens", () => {
    expect(suggestedLaunchSlug("--Kámehameha--")).toBe("kamehameha");
    expect(suggestedLaunchSlug("School of  the   Ozarks")).toBe("school-of-the-ozarks");
  });

  it("returns an empty string when the name has no usable characters", () => {
    expect(suggestedLaunchSlug("")).toBe("");
    expect(suggestedLaunchSlug("   ")).toBe("");
    expect(suggestedLaunchSlug("!!!")).toBe("");
  });

  it("stays within the launch slug length bound", () => {
    const longName = "very long academy name ".repeat(10);
    const slug = suggestedLaunchSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).not.toMatch(/-$/);
    expect(slug).not.toMatch(/^-/);
  });

  it("respects the server slug pattern when non-empty", () => {
    for (const name of ["Grace Academy", "K-8 + HS", "École Saint-Jean", "12 Stones School"]) {
      const slug = suggestedLaunchSlug(name);
      if (slug) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
