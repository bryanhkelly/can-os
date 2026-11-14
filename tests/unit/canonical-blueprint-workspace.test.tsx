import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanonicalBlueprintWorkspace } from "@/components/launch-studio/CanonicalBlueprintWorkspace";

vi.mock("@/modules/blueprints/blueprint-studio.functions", () => ({
  readCanonicalBlueprintWorkspace: vi.fn(),
  readCanonicalBlueprintConfiguration: vi.fn(),
  createCanonicalBlueprintConfiguration: vi.fn(),
  saveCanonicalBlueprintConfiguration: vi.fn(),
  submitCanonicalBlueprintConfiguration: vi.fn(),
}));
vi.mock("@/modules/blueprints/blueprint-reference-catalog.functions", () => ({
  exploreBlueprintReferenceCatalog: vi.fn(),
}));

describe("canonical School Blueprint configuration", () => {
  it("presents planning separately from independent approvals and operation", () => {
    const markup = renderToStaticMarkup(
      <CanonicalBlueprintWorkspace siteId="00000000-0000-4000-8000-000000000001" />,
    );
    expect(markup).toContain("Configure your School Blueprint");
    expect(markup).toContain("Choose a published recipe");
    expect(markup).toContain("Review and approval are separate from operating authorization");
    expect(markup).toContain("Loading Blueprint workspace");
    expect(markup).not.toContain("Start enrollment");
    expect(markup).not.toContain("Activate program");
  });
});
