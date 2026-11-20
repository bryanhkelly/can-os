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
  const introduce = source("src/domain/launch-introduce-v61.ts");

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
    expect(route).toContain("launchSiteLifecycleLabel(site.lifecycleStatus)");
    expect(route).not.toContain('statusLabel: "Site established"');
    expect(frame).not.toContain("WorkspaceNavigation");
    expect(route).not.toContain("<LaunchStudioChrome");
    expect(destinations).not.toContain("Enrollment open");
  });

  it("routes Introduce through one Site-scoped package service, not duplicate placeholder destinations", () => {
    for (const module of ["promote", "recruit", "interest-events"]) {
      expect(introduce).toContain(module);
    }
    expect(route).toContain("isIntroduceModuleV61(deps.module)");
    expect(route).toContain("listSiteMarketingPackagesV61");
    expect(route).toContain("readSiteMarketingSuggestionsV61");
    expect(route).toContain("<MarketingPackagesV61");
    expect(destinations).not.toContain("  recruit: {");
    expect(destinations).not.toContain('  "interest-events": {');
  });

  it("keeps Prepare and Open on their existing independently authorized destinations", () => {
    expect(route).toContain("isPrepareModuleV61(selected.id)");
    expect(route).toContain("isDestinationModuleV61(selected.id)");
    expect(destinations).toContain('  open: {');
    expect(destinations).toContain("launchModuleDestinationsV61");
    expect(destinations).toContain("isDestinationModuleV61");
    expect(destinations).toContain("encodeURIComponent(siteId)");
  });

  it("uses the shared mobile modal, SPA links and active stage follow-through", () => {
    expect(frame).toContain('import { Modal } from "@/components/ui/modal"');
    expect(frame).toContain('<Modal open={drawer}');
    expect(frame).toContain("useState");
    expect(frame).toContain("activeStage");
    expect(frame).toContain('to="/launch/site"');
    expect(frame).toContain('onClick={() => setDrawer(false)}');
    expect(frame).not.toContain('fixed inset-0 z-50 bg-black');
  });

  it("keeps outreach preparation distinct from enrollment authorization", () => {
    expect(introduce).toContain("No contacts, submissions");
    expect(introduce).toContain("not yet a pre-Program Site-wide event builder");
    expect(destinations).toContain('state: "governed"');
    expect(destinations).toContain("Permission checks");
  });
});
