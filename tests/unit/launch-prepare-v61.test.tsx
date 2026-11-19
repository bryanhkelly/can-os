import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { isPrepareModuleV61, LaunchPrepareV61, prepareModulesV61 } from "@/components/launch-studio/LaunchPrepareV61";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { filterPublishedSolutionRecipes, preferredCatalogDelivery, resolveVisibleSolutionRecipe } from "@/domain/launch-prepare-v61";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search, ...props }: {
    children: ReactNode; to: string; search?: Record<string, string | undefined>;
    "aria-current"?: "page" | "step";
  }) => {
    const params = new URLSearchParams(
      Object.entries(search ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const suffix = params.size ? `?${params.toString()}` : "";
    return <a href={to + suffix} aria-current={props["aria-current"]}>{children}</a>;
  },
}));

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

  it("keeps a long Prepare sidebar scrollable and the current accordion identified", () => {
    const html = renderToStaticMarkup(<LaunchSiteFrame
      site={{ id: siteId, name: "Example Site" }} active="funding-enrollment">
      <p>Prepared content</p>
    </LaunchSiteFrame>);
    expect(html).toContain("overflow-y-auto overscroll-contain");
    expect(html).toContain("lg:h-dvh");
    expect(html).toContain("aria-expanded=\"true\"");
    expect(html).toContain("aria-controls=");
    expect(html).toContain("funding-enrollment");
    expect(html).toContain("Prepared content");
  });

  it("uses Establish delivery only as a discovery default", () => {
    expect(preferredCatalogDelivery("physical")).toBe("onsite");
    expect(preferredCatalogDelivery("digital")).toBe("remote");
    expect(preferredCatalogDelivery("both")).toBe("hybrid");
    expect(preferredCatalogDelivery(null)).toBe("onsite");
  });

  it("filters published recipes without leaving an out-of-filter selection visible", () => {
    const recipes = [
      { blueprintVersionId: "one", title: "After School", components: [{ key: "digital_skills" }] },
      { blueprintVersionId: "two", title: "Summer Camp", components: [{ key: "creative_arts" }] },
    ];
    expect(filterPublishedSolutionRecipes(recipes, " DIGITAL ")).toEqual([recipes[0]]);
    expect(filterPublishedSolutionRecipes(recipes, "summer")).toEqual([recipes[1]]);
    expect(filterPublishedSolutionRecipes(recipes, "")).toEqual(recipes);
    expect(resolveVisibleSolutionRecipe(filterPublishedSolutionRecipes(recipes, "summer"), "one")).toBe(recipes[1]);
    expect(resolveVisibleSolutionRecipe([], "one")).toBeUndefined();
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

  it("keeps catalog exploration available when Establish preferences are unavailable", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="program-catalog"
      intentUnavailable />);
    expect(html).toContain("Saved Programs &amp; Audiences could not be loaded");
    expect(html).toContain("Packaged Solution recipes");
    expect(html).not.toContain("You have not saved any learning interests");
  });

  it("maintains independent authorization handoff at the end of Prepare", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="opening-compliance" />);
    expect(html).toContain("Review Launch requirements");
    expect(html).toContain("settings/school/compliance?siteId=");
    expect(html).toContain("Site planning is not approval to operate");
  });
});
