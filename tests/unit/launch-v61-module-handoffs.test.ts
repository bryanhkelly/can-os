import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Route and design-system contracts for the new Site-scoped Launch Studio.
 * Source-contract coverage complements, but never replaces, browser acceptance. */
const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("V6.1 Launch Studio module integration", () => {
  const route = source("src/routes/launch.site.tsx");
  const destinations = source("src/components/launch-studio/LaunchModuleDestinationV61.tsx");
  const frame = source("src/components/launch-studio/LaunchSiteFrameV61.tsx");

  it("connects Establish, preserving the private Site revision services", () => {
    expect(route).toContain("readSiteInformationV61");
    expect(route).toContain("readSiteProgramsAudiencesV61");
    expect(route).toContain("EstablishProgramsAudiencesV61");
    expect(route).toContain('module: "site-information"');
    expect(route).toContain('module: "website-brand"');
    expect(route).not.toContain("This section will be connected using the approved V6.1 content contract.");
  });

  it("uses the existing Website & Brand Studio instead of another editor", () => {
    expect(route).toContain('<Navigate\n      to="/launch/website"');
    expect(route).toContain('returnToHub: true');
    expect(source("src/routes/launch.website.tsx")).toContain("WebsiteHome");
    expect(frame).toContain("Preview Website");
  });

  it("never duplicates the global Launch shell or invents statuses", () => {
    expect(route.match(/<LaunchSiteFrame /g)).toHaveLength(1);
    expect(route).toContain("Site established");
    expect(frame).not.toContain("WorkspaceNavigation");
    expect(route).not.toContain("<LaunchStudioChrome");
    expect(destinations).not.toContain("Enrollment open");
  });

  it("keeps all modules in one explicit, Site-scoped V6.1 destination registry", () => {
    for (const module of [
      "promote", "recruit", "interest-events", "invite-team",
      "program-catalog", "opening-compliance", "open",
    ]) {
      expect(destinations).toContain(module);
    }
    expect(destinations).toContain("launchModuleDestinationsV61");
    expect(destinations).toContain("isDestinationModuleV61");
    expect(destinations).toContain("encodeURIComponent(siteId)");
    expect(destinations).toContain('module === "program-catalog"');
  });

  it("uses the shared mobile modal, SPA links and active stage follow-through", () => {
    expect(frame).toContain('import { Modal } from "@/components/ui/modal"');
    expect(frame).toContain('<Modal open={drawer}');
    expect(frame).toContain("useEffect");
    expect(frame).toContain('to="/launch/site"');
    expect(frame).toContain('onClick={() => setDrawer(false)}');
    expect(frame).not.toContain('fixed inset-0 z-50 bg-black');
  });

  it("labels planned and governed actions without bypassing permission boundaries", () => {
    expect(destinations).toContain('state: "planned"');
    expect(destinations).toContain('state: "governed"');
    expect(destinations).toContain("permission");
    expect(destinations).toContain("No opening, publishing, enrollment or activation command runs");
  });
});
