import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { isPrepareModuleV61, LaunchPrepareV61, prepareModulesV61 } from "@/components/launch-studio/LaunchPrepareV61";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { LaunchModuleDestinationV61, launchModuleDestinationsV61 } from "@/components/launch-studio/LaunchModuleDestinationV61";
import { filterPublishedSolutionRecipes, matchingSolutionInterests, orderSolutionsByVision, preferredCatalogDelivery, replaceVisibleOfferingIntents, resolveSavedSolutionPlan, resolveVisibleSolutionRecipe, selectSavedSolutionPlans } from "@/domain/launch-prepare-v61";

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

vi.mock("@/modules/sites/site-preview-sharing.functions", () => ({
  createSitePreviewShare: vi.fn(),
  listSitePreviewShares: vi.fn().mockResolvedValue([]),
  revokeSitePreviewShare: vi.fn(),
}));
vi.mock("@/modules/sites/launch-site-publication.functions", () => ({
  readLaunchSitePublication: vi.fn(),
  reviewLaunchSiteWebsiteCopy: vi.fn(),
}));
vi.mock("@/modules/sites/site-publication.functions", () => ({
  setSitePublicationStatus: vi.fn(),
  verifySitePublicationReachability: vi.fn(),
}));

const siteId = "00000000-0000-4000-8000-000000000001";

describe("V6.1 Prepare to Open", () => {
  it("has seven distinct, stable modules without inventing a parallel readiness engine", () => {
    expect(prepareModulesV61[0]?.title).toBe("Program Catalog");
    expect(prepareModulesV61.map(module => module.id)).toEqual([
      "program-catalog",
      "facilities-resources",
      "invite-team",
      "schedules-capacity",
      "funding-enrollment",
      "opening-compliance",
      "publish-site",
    ]);
    expect(new Set(prepareModulesV61.map(module => module.id)).size).toBe(7);
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

  it("reserves center navigation for actual steps within a submodule", () => {
    for (const module of prepareModulesV61) {
      const html = renderToStaticMarkup(
        <LaunchPrepareV61 siteId={siteId} module={module.id} />,
      );
      expect(html, module.id).not.toContain('aria-label="Prepare modules"');
      expect(html, module.id).not.toContain('aria-label="Prepare module navigation"');
      expect(html, module.id).not.toContain("Continue: " + module.title);
      expect(html, module.id).not.toContain(" of 7");
      expect(html, module.id).toContain("Launch Studio / Prepare");
    }
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

  it("orders published Solution recipes by saved vision without claiming approval", () => {
    const recipes = [
      { blueprintVersionId: "other", title: "Community Learning", components: [{ key: "mentorship" }] },
      { blueprintVersionId: "summer", title: "Summer Discovery", components: [{ key: "science" }] },
      { blueprintVersionId: "after", title: "After School STEM", components: [{ key: "digital_skills" }] },
    ];
    const result = orderSolutionsByVision(recipes, ["afterschool", "summer"], "summer");
    expect(result.map(recipe => recipe.blueprintVersionId)).toEqual(["summer", "after", "other"]);
    expect(matchingSolutionInterests(recipes[0], ["afterschool"])).toEqual([]);
    expect(matchingSolutionInterests(recipes[1], ["summer"])).toEqual(["summer"]);
    expect(recipes.map(recipe => recipe.blueprintVersionId)).toEqual(["other", "summer", "after"]);
  });

  it("prioritizes exact saved Program codes over heuristic Solution title matches", () => {
    const recipes = [
      { blueprintVersionId: "generic", title: "AI Guidance", components: [{ key: "skills" }] },
      { blueprintVersionId: "ai", title: "Digital Learning", programCode: "can.program.ai_digital_skills",
        offeringCode: "CLC-DIGITAL-01", components: [{ key: "four_session_calendar" }] },
      { blueprintVersionId: "custom", title: "Custom Training", programCode: "can.program.custom_training",
        offeringCode: "CLC-CUSTOM-TRAINING-01", components: [{ key: "knowledge_check" }] },
    ];
    const result = orderSolutionsByVision(recipes, [], null,
      ["can.program.ai_digital_skills", "can.program.custom_training"], "can.program.custom_training");
    expect(result.map(item => item.blueprintVersionId)).toEqual(["custom", "ai", "generic"]);
    expect(filterPublishedSolutionRecipes(recipes, "CLC-DIGITAL-01")).toEqual([recipes[1]]);
  });

  it("selects saved Solution plans by their immutable published Blueprint version", () => {
    const plans = [
      { configurationId: "a", blueprintVersionId: "v1", name: "Older version" },
      { configurationId: "b", blueprintVersionId: "v2", name: "Current version" },
      { configurationId: "c", blueprintVersionId: "v2", name: "Second location" },
    ];
    expect(selectSavedSolutionPlans(plans, "v2").map(plan => plan.configurationId))
      .toEqual(["b", "c"]);
    expect(selectSavedSolutionPlans(plans, "missing")).toEqual([]);
    expect(plans).toHaveLength(3);
  });

  it("resolves only the exact saved Solution plan and published version", () => {
    const plans = [
      { configurationId: "mine", blueprintVersionId: "v1", revision: 2 },
      { configurationId: "other", blueprintVersionId: "v2", revision: 1 },
    ];
    const templates = [{ blueprintVersionId: "v1", title: "Pilot v1" }];
    expect(resolveSavedSolutionPlan(plans, templates, "mine")).toEqual({
      plan: plans[0], template: templates[0],
    });
    expect(resolveSavedSolutionPlan(plans, templates, "other")).toBeNull();
    expect(resolveSavedSolutionPlan(plans, templates, "missing")).toBeNull();
    expect(resolveSavedSolutionPlan(plans, templates, null)).toBeNull();
    expect(resolveSavedSolutionPlan(plans, [{ blueprintVersionId: "v2" }], "mine"))
      .toBeNull();
    expect(plans).toHaveLength(2);
  });

  it("links Prepare and Open readiness directly to the saved Solution plan", () => {
    const read = (path: string) => readFileSync(
      new URL("../../" + path, import.meta.url), "utf8");
    const route = read("src/routes/launch.site.tsx");
    const prepare = read("src/components/launch-studio/LaunchPrepareV61.tsx");
    const catalog = read("src/components/launch-studio/SolutionCatalogV61.tsx");
    const readiness = read("src/components/launch-studio/LaunchReadinessPanelV61.tsx");
    expect(route).toContain("solutionPlanId: z.string().uuid().optional()");
    expect(route).toContain('selected.id === "program-catalog" ? search.solutionPlanId : undefined');
    expect(prepare).toContain("initialPlanId={solutionPlanId}");
    expect(catalog).toContain("resolveSavedSolutionPlan(");
    expect(catalog).toContain("setResumeConfigurationId(saved.plan.configurationId)");
    expect(readiness).toContain("solutionPlanId:plan.configurationId");
    expect(readiness).toContain("View published Solution requirements");
    expect(readiness).toContain("These are not verified Site readiness.");
    expect(readiness).toContain("Continue plan");
    expect(readiness).toContain("Review plan");
  });

  it("preserves invisible proposed Offering intents when editing a visible Program component", () => {
    const previous = [
      { componentId: "proposed", offeringVersionId: "prior" },
      { componentId: "editable", offeringVersionId: "old" },
      { componentId: "other", offeringVersionId: "untouched" },
    ];
    const edited = [{ componentId: "editable", offeringVersionId: "new" }];
    expect(replaceVisibleOfferingIntents(previous, edited, ["editable"])).toEqual([
      previous[0], previous[2], edited[0],
    ]);
    expect(previous).toHaveLength(3);
    expect(replaceVisibleOfferingIntents(previous, [], ["editable"])).toEqual([
      previous[0], previous[2],
    ]);
    expect(replaceVisibleOfferingIntents(previous, [
      { componentId: "other", offeringVersionId: "invalid-outside-visible" },
    ], ["editable"])).toEqual([previous[0], previous[2]]);
  });

  it("links to authorized workspaces without duplicating sidebar module navigation", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="facilities-resources" />);
    expect(html).toContain("Facilities &amp; Resources");
    expect(html).not.toContain('aria-label="Prepare modules"');
    expect(html).not.toContain('aria-label="Prepare module navigation"');
    expect(html).not.toContain("module=schedules-capacity");
    expect(html).toContain("Launch Studio / Prepare");
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
    expect(html).not.toContain("Browse available Offerings");
    expect(html).toContain("Available Solutions");
    expect(html).toContain("CAN administers the published Solution definition");
    expect(html).not.toContain("Explore published learning products");
    expect(html).toContain("Available Solutions");
    expect(html).not.toContain("/canonical/blueprints?siteId=" + siteId);
    expect(html).not.toContain("Approved for enrollment");
  });

  it("keeps catalog exploration available when Establish preferences are unavailable", () => {
    const html = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="program-catalog"
      intentUnavailable />);
    expect(html).toContain("Saved Programs &amp; Audiences could not be loaded");
    expect(html).toContain("Available Solutions");
    expect(html).not.toContain("You have not saved any learning interests");
  });

  it("prepares admissions in Prepare and enables enrollment only through Open authority", () => {
    expect(prepareModulesV61.find(module => module.id === "funding-enrollment")?.title)
      .toBe("Funding & Admissions Setup");
    const prepare = renderToStaticMarkup(
      <LaunchPrepareV61 siteId={siteId} module="funding-enrollment" />,
    );
    expect(prepare).toContain("Funding &amp; Admissions Setup");
    expect(prepare).toContain("Prepare admissions capacity");
    expect(prepare).toContain("registration is enabled independently in Open");
    expect(prepare).not.toContain("Enable Enrollment");

    expect(launchModuleDestinationsV61.open.note).toContain("not a Site-wide toggle");
    const open = renderToStaticMarkup(
      <LaunchModuleDestinationV61 module="open" title="Open" stage="Open" siteId={siteId} />,
    );
    expect(open).toContain("Enable Enrollment");
    expect(open).toContain("/programs/noncredit/enrollment?publicSiteId=" + siteId);
    expect(open).toContain("only for independently approved noncredit releases");
  });

  it("keeps Site publication an explicit Prepare decision, separate from enrollment", () => {
    const safety = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="opening-compliance" />);
    expect(safety).not.toContain("Continue: Publish Site");
    expect(safety).not.toContain('aria-label="Prepare modules"');
    expect(safety).toContain("settings/school/compliance?siteId=");
    const publish = renderToStaticMarkup(<LaunchPrepareV61 siteId={siteId} module="publish-site" />);
    expect(publish).toContain("Publish your Site website");
    expect(publish).not.toContain("Review Launch requirements");
    expect(publish).not.toContain('aria-label="Prepare module navigation"');
    expect(publish).toContain("A shared preview is not Site publication");
    expect(publish).not.toContain("Activate enrollment");
  });
});
