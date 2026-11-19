import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { isPrepareModuleV61, LaunchPrepareV61, prepareModulesV61 } from "@/components/launch-studio/LaunchPrepareV61";

vi.mock("@/modules/programs/program-discovery.functions", () => ({
  discoverLaunchSitePrograms: vi.fn(),
}));
vi.mock("@/modules/blueprints/blueprint-studio.functions", () => ({
  readCanonicalBlueprintWorkspace: vi.fn(() => new Promise(() => {})),
}));

const siteId = "00000000-0000-4000-8000-000000000001";

describe("V6.1 Prepare to Open", () => {
  it("has six distinct, stable modules without inventing a parallel readiness engine", () => {
    expect(prepareModulesV61.map(module => module.id)).toEqual([
      "program-catalog",
      "facilities-resources",
      "invite-team",
      "schedules-capacity",
      "funding-enrollment",
      "opening-compliance",
    ]);
    expect(new Set(prepareModulesV61.map(module => module.id)).size).toBe(6);
    expect(isPrepareModuleV61("schedules-capacity")).toBe(true);
    expect(isPrepareModuleV61("website-brand")).toBe(false);
  });

  it("preserves the requested Site across internal navigation and links to existing owners", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="facilities-resources" />);
    expect(html).toContain("Facilities &amp; Resources");
    expect(html).toContain('aria-label="Prepare modules"');
    expect(html).toContain("siteId=" + siteId + "&amp;module=schedules-capacity");
    expect(html).toContain("siteId=" + siteId + "&amp;module=site-information");
    expect(html).toContain("/canonical/lab/site-qualification");
    expect(html).toContain("This page does not claim that any requirement has passed.");
    expect(html).not.toContain("100%");
  });

  it("shows Establish preferences as intents rather than adoption or authorization", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="program-catalog"
      intent={{ interestIds: ["summer", "afterschool"], timingIds: ["weekdays"], audienceIds: ["children"], startingFocus: "summer" }} />);
    expect(html).toContain("Summer");
    expect(html).toContain("After-School");
    expect(html).toContain("From Program to Solution to Offering");
    expect(html).toContain("Browse available Offerings");
    expect(html).toContain("Packaged Solution recipes");
    expect(html).toContain("Adoption intent is recorded in the existing Blueprint workspace");
    expect(html).not.toContain("Approved for enrollment");
  });

  it("maintains independent authorization handoff at the end of Prepare", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="opening-compliance" />);
    expect(html).toContain("Review Launch requirements");
    expect(html).toContain("settings/school/compliance?siteId=");
    expect(html).toContain("Site planning is not approval to operate");
  });
});
