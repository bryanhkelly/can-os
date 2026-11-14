import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProgramDiscoveryPanel } from "@/components/launch-studio/ProgramDiscoveryPanel";

vi.mock("@/modules/programs/program-discovery.functions", () => ({
  discoverPrograms: vi.fn(),
}));

describe("ProgramDiscoveryPanel", () => {
  it("offers scoped read-only discovery without implying approval or operating authority", () => {
    const html = renderToStaticMarkup(
      <ProgramDiscoveryPanel siteId="00000000-0000-4000-8000-000000000001" />,
    );

    expect(html).toContain("Explore available programs");
    expect(html).toContain("Delivery model");
    expect(html).toContain("Find available programs");
    expect(html).toContain("Discovery is advisory");
    expect(html).toContain("does not create a program, grant approval, or authorize operation");
  });
});
