import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  useBlocker: vi.fn(),
}));
vi.mock("@/modules/programs/site-programs-audiences-v61.functions", () => ({
  saveSiteProgramsAudiencesV61: vi.fn(),
}));
vi.mock("@/modules/blueprints/blueprint-reference-catalog.functions", () => ({
  exploreBlueprintReferenceCatalog: vi.fn().mockResolvedValue([]),
}));

import { EstablishProgramsAudiencesV61 } from "@/components/launch-studio/EstablishProgramsAudiencesV61";

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const props = {
  siteId: "00000000-0000-4000-8000-000000000121",
  initial: {
    siteId: "00000000-0000-4000-8000-000000000121",
    revision: "2026-11-19T10:00:00.000Z",
    saved: true,
    intent: {
      interestIds: ["grades-9-12", "senior"] as ("grades-9-12" | "senior")[],
      timingIds: ["weekdays", "daytime"] as ("weekdays" | "daytime")[],
      audienceIds: ["teens", "older_adults"] as ("teens" | "older_adults")[],
      startingFocus: "grades-9-12" as const,
    },
  },
  onBackToSiteInformation: vi.fn(),
  onSaveAndExit: vi.fn(),
  onContinueToWebsiteBrand: vi.fn(),
};

describe("V6.1 Programs & Audiences route and screen", () => {
  it("renders a two-step responsive central flow with accessible navigation", () => {
    const html = renderToStaticMarkup(<EstablishProgramsAudiencesV61 {...props} />);
    expect(html).toContain('aria-label="Setup progress"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Program Interests");
    expect(html).toContain("Your Audiences");
    expect(html).toContain("Continue to Audiences");
    expect(html).not.toContain("Review Your Plans");
    expect(html).toContain("grid-cols-2");
  });

  it("preserves re-entered learning, day and time choices in form state", () => {
    const html = renderToStaticMarkup(<EstablishProgramsAudiencesV61 {...props} />);
    for (const label of [
      "Grades 6–8", "Grades 9–12", "After-school", "Summer &amp; Breaks",
      "Adult Learning", "Older Adult Learning",
      "Weekdays", "Weekends", "Daytime", "Evenings",
    ]) expect(html).toContain(label);
    expect(html).toContain("Select any experiences");
    expect(html).toContain("Choose a starting focus");
    expect(html).toContain("I'll decide later");
    expect(html).toContain('value="grades-9-12"');
    expect(html).toContain("Save &amp; Exit");
  });

  it("keeps all Site intent commands scoped, revision-aware and private", () => {
    const route = read("src/routes/launch.site.tsx");
    const server = read("src/modules/programs/site-programs-audiences-v61.functions.ts");
    const ui = read("src/components/launch-studio/EstablishProgramsAudiencesV61.tsx");
    expect(route).toContain('deps.module === "programs-audiences"');
    expect(route).toContain("readSiteProgramsAudiencesV61({ data: { siteId: site.id } })");
    expect(route).toContain('module: "website-brand"');
    expect(route).toContain('module: "site-information"');
    expect(server).toContain('assertSiteSetupScope(actor, site, "program.launch.start")');
    expect(server).toContain("getBlueprintReferenceCatalog(actor, { siteId: data.siteId })");
    // Unchanged published references are private planning intent. Saving other
    // Site vision fields must not fail when a separate catalog role is offline.
    expect(server).toContain("const previouslySelected = new Set(");
    expect(server).toContain("const addedCodes = ");
    expect(server).toContain("if (addedCodes.length)");
    expect(server).not.toContain("if (selectedPrograms.length)");
    expect(server.indexOf("const addedCodes")).toBeGreaterThan(
      server.indexOf("site.updatedAt.toISOString() !== data.expectedRevision"));
    expect(ui).toContain("exploreBlueprintReferenceCatalog");
    expect(ui).toContain("Programs under consideration");
    expect(ui).toContain("programCodes");
    expect(server).toContain('assertSiteSetupScope(actor, site, "program.read")');
    expect(server).toContain('.for("update")');
    expect(server).toContain("data.expectedRevision");
    expect(server).toContain('setResponseHeader("Cache-Control", "private, no-store")');
    expect(server).not.toContain("tx.insert(programs)");
    expect(server).not.toContain("tx.insert(classes)");
    expect(ui).toContain("useLaunchUnsavedChanges");
    expect(ui).toContain("setReloadRequired(true)");
    expect(ui).toContain("await router.invalidate()");
    expect(ui).toContain("onContinueToWebsiteBrand()");
  });

  it("does not add a third navigator or a duplicate global Launch frame", () => {
    const ui = read("src/components/launch-studio/EstablishProgramsAudiencesV61.tsx");
    expect(ui).toContain('<GuidedSetupShell');
    expect(ui).not.toContain("<LaunchSiteFrame");
    expect(ui).not.toContain("<LaunchStudioChrome");
    expect(ui).toContain('id: "interests"');
    expect(ui).toContain('id: "audiences"');
    expect(ui).not.toContain('id: "review"');
    expect(ui).toContain('SummaryRow label="Days & times"');
    expect(ui).toContain('SummaryRow label="Starting focus"');
  });
});
