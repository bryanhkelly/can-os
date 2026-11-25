import { projectPlannedSiteProgramsForPreview } from "@/domain/site-program-preview";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import type { SiteLaunchPreferences } from "@/domain/site-launch-preferences";
import { describe, expect, it } from "vitest";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import {
  projectShareableSitePreview, renderSharedSitePreview, sitePreviewShareHeaders,
} from "@/domain/site-preview-sharing";

const code="K7x2p9AaB3cD";
const pages={"/":'<html><head><title>School</title></head><body><a href="/">Home</a><a href="/about">About</a><a href="/apply">Apply</a><form action="/apply"><input name="child"></form></body></html>',"/about":"<html>About</html>"};
describe("Site website share preview safety", () => {
  it("freezes a sanitized snapshot and disables enrollment and external links", () => {
    const html = renderSharedSitePreview(pages["/"], code, Object.keys(pages));
    expect(html).toContain("Proposed learning community");
    expect(html).toContain("Not published or independently approved");
    expect(html).toContain("/go/"+code+"?");
    expect(html).toContain("page=%2Fabout");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('href="/apply"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(sitePreviewShareHeaders["Referrer-Policy"]).toBe("no-referrer");
    expect(sitePreviewShareHeaders["Cache-Control"]).toBe("private, no-store");
  });

  it("projects only public-safe Site copy and excludes unconsented artwork", () => {
    const content = createSchoolWebsiteStarterContent("Example Site");
    const page = projectShareableSitePreview({
      siteName: "Example Site", organizationName: "Example Community",
      content: {
        ...content,
        branding: { ...content.branding, heroImage: {
          dataUrl: "data:image/png;base64,AAAA",
          altText: "Unconsented image",
          rightsConfirmed: false,
          childImageConsent: "unconfirmed",
        } },
      },
    });
    expect(page.localContent?.editorialBaseline).toBeUndefined();
    expect(page.localContent?.branding.heroImage).toBeNull();
    expect(page.academicPrograms).toEqual([]);
    expect(page.noncreditReleases).toEqual([]);
    expect(page.enrollmentOpportunities).toEqual([]);
    expect(page.contentBlocks).toEqual([]);
    expect(page.media).toEqual({});
  });

  it("renders the full proposed website with Programs from saved intent, never an enrollment offer", () => {
    const preferences: SiteLaunchPreferences = {
      delivery: "both",
      interestIds: ["grades-9-12", "afterschool", "summer"],
      planningVersion: 2,
      timingIds: ["weekdays"],
      audienceIds: ["teens"],
      startingFocus: "summer",
    };
    const planned = projectPlannedSiteProgramsForPreview(preferences);
    expect(planned).toHaveLength(2);
    expect(planned.map(block => block.page)).toEqual(["/", "/programs"]);
    expect(planned.every(block=>block.description.includes("in-person and online learning")
      && block.description.includes("teens")
      && block.description.includes("weekdays"))).toBe(true);
    expect(planned.every(block =>
      block.items.length === 3 &&
      block.items.every(item => item.label === "Learning interest" && !item.link)
    )).toBe(true);
    const page = projectShareableSitePreview({
      siteName: "Proposed Learning Community",
      organizationName: "Example Host",
      content: createSchoolWebsiteStarterContent("Proposed Learning Community"),
      plannedPrograms: planned,
    });
    expect(availablePublicSitePaths(page)).toContain("/programs");
    const homepage = renderPublicSiteHtml(page, { path: "/", localPreview: true });
    const programsPage = renderPublicSiteHtml(page, { path: "/programs", localPreview: true });
    for (const label of ["Grades 9–12", "Afterschool", "Summer &amp; Breaks"]) {
      expect(homepage).toContain(label);
      expect(programsPage).toContain(label);
    }
    expect(programsPage).not.toContain("Proposed · not enrolling");
    expect(programsPage).toContain("Programs you are exploring");
    expect(page.enrollmentOpportunities).toEqual([]);
    expect(page.academicPrograms).toEqual([]);
    expect(page.contentBlocks?.some(block => block.channel === "site.setup")).toBe(false);
  });

  it("does not fabricate Programs when Site planning choices have not been saved", () => {
    expect(projectPlannedSiteProgramsForPreview(null)).toEqual([]);
    expect(projectPlannedSiteProgramsForPreview({
      delivery: "physical", interestIds: [],
    })).toEqual([]);
  });

  it("rejects invalid Go codes",()=>{
    expect(()=>renderSharedSitePreview(pages["/"],"../admin",Object.keys(pages))).toThrow();
  });
});
