import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BlueprintOfferingAdoptionPicker } from "@/components/launch-studio/BlueprintOfferingAdoptionPicker";

vi.mock("@/modules/blueprints/blueprint-studio.functions", () => ({
  discoverCanonicalBlueprintOfferings: vi.fn(),
}));

describe("canonical Blueprint published Offering intent", () => {
  it("renders a Site-scoped, planning-only Offering selector", () => {
    const markup = renderToStaticMarkup(
      <BlueprintOfferingAdoptionPicker
        siteId="00000000-0000-4000-8000-000000000001"
        components={[{ id: "00000000-0000-4000-8000-000000000002", key: "programs" }]}
        selected={[]}
        onChange={vi.fn()}
      />
    );
    expect(markup).toContain("Adopt a published Offering");
    expect(markup).toContain("Find published Offerings");
    expect(markup).toContain("availability is advisory");
    expect(markup).toContain("does not establish regulatory approval");
    expect(markup).not.toContain("Activate program");
    expect(markup).not.toContain("Enroll learner");
  });
});
