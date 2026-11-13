import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BlueprintReferenceCatalogPanel } from "@/components/launch-studio/BlueprintReferenceCatalogPanel";

vi.mock("@/modules/blueprints/blueprint-reference-catalog.functions", () => ({
  exploreBlueprintReferenceCatalog: vi.fn(),
}));

describe("BlueprintReferenceCatalogPanel", () => {
  it("is accessible as planning-only reference discovery", () => {
    const html = renderToStaticMarkup(
      <BlueprintReferenceCatalogPanel siteId="00000000-0000-4000-8000-000000000001" />,
    );

    expect(html).toContain("Explore the School Blueprint library");
    expect(html).toContain("Library category");
    expect(html).toContain("Browse reference library");
    expect(html).toContain("Program models");
    expect(html).toContain("not adopted Offerings or approved programs");
    expect(html).toContain("does not change your School Blueprint");
    expect(html).not.toContain("Add to School Blueprint");
    expect(html).not.toContain("Publish Blueprint");
  });
});
