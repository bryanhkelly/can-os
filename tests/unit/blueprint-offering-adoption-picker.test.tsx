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
  const linkedOffering = {
    offeringVersionId: "00000000-0000-4000-8000-000000000789",
    code: "CLC-DIGITAL-01", title: "AI & Digital Skills", versionNo: 1,
  };

  it("allows Blueprint-linked published products to be included in private planning", () => {
    const markup = renderToStaticMarkup(<BlueprintOfferingAdoptionPicker
      siteId="00000000-0000-4000-8000-000000000001"
      components={[{ id: "component-1", key: "published_course" }]}
      linkedOffering={linkedOffering} selected={[]} onChange={vi.fn()} />);
    expect(markup).toContain("Published learning product included in this Solution");
    expect(markup).toContain("CLC-DIGITAL-01");
    expect(markup).toContain("Include in private plan");
    expect(markup).toContain("Site availability, resources, qualification, approval and learner");
    expect(markup).not.toContain("Approved for enrollment");
  });

  it("requires a target Program component when the Solution has multiple", () => {
    const markup = renderToStaticMarkup(<BlueprintOfferingAdoptionPicker
      siteId="00000000-0000-4000-8000-000000000001"
      components={[{ id: "component-1", key: "core_course" }, { id: "component-2", key: "optional_course" }]}
      linkedOffering={linkedOffering} selected={[]} onChange={vi.fn()} />);
    expect(markup).toContain("Choose a Program component below");
    expect(markup).toContain("core course");
    expect(markup).toContain("optional course");
  });

  it("shows the pinned published product when reopening a saved private plan", () => {
    const markup = renderToStaticMarkup(<BlueprintOfferingAdoptionPicker
      siteId="00000000-0000-4000-8000-000000000001"
      components={[{ id: "component-1", key: "published_course" }]}
      linkedOffering={linkedOffering}
      selected={[{ componentId: "component-1", offeringVersionId: linkedOffering.offeringVersionId, configuration: {} }]}
      onChange={vi.fn()} />);
    expect(markup).toContain("Included in private plan");
    expect(markup).toContain("Planned Offering adoptions");
    expect(markup).toContain("does not establish regulatory approval");
  });

});
