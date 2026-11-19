import { projectPlannedSiteProgramsForPreview } from "@/domain/site-program-preview";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import type { SiteLaunchPreferences } from "@/domain/site-launch-preferences";
import { describe, expect, it } from "vitest";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import {
  activePreviewShare, createPreviewShareToken, hashPreviewShareToken,
  projectShareableSitePreview, readSitePreviewShares, renderSharedSitePreview, sitePreviewShareHeaders,
  validPreviewShareToken,
} from "@/domain/site-preview-sharing";

const siteId = "00000000-0000-4000-8000-000000000001";
const today = new Date("2026-11-19T12:00:00.000Z");

function sampleShare(overrides: Record<string, unknown> = {}) {
  const { token, tokenDigest } = createPreviewShareToken();
  const share = {
    id: "00000000-0000-4000-8000-000000000002",
    tokenDigest,
    createdAt: "2026-11-18T12:00:00.000Z",
    expiresAt: "2026-11-26T12:00:00.000Z",
    revokedAt: null,
    sourceRevision: 12,
    pages: {
      "/": `<!doctype html><html><head><title>School</title></head><body>
        <a href="/">Home</a><a href="/about">About</a><a href="/apply">Apply</a>
        <form action="/apply" method="post"><input name="child"></form>
        </body></html>`,
      "/about": "<!doctype html><html><head><title>About</title></head><body>About</body></html>",
    },
    ...overrides,
  };
  return { token, share };
}

describe("Site website share preview safety", () => {
  it("uses high-entropy, nonrecoverable bearer digests", () => {
    const one = createPreviewShareToken();
    const two = createPreviewShareToken();
    expect(validPreviewShareToken(one.token)).toBe(true);
    expect(one.token).not.toBe(two.token);
    expect(one.tokenDigest).toBe(hashPreviewShareToken(one.token));
    expect(one.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(one.tokenDigest).not.toContain(one.token);
    expect(validPreviewShareToken("guess")).toBe(false);
  });

  it("enforces expiry and immediate revocation for every subsequent GET", () => {
    const { token, share } = sampleShare();
    expect(activePreviewShare([share], token, today)?.sourceRevision).toBe(12);
    expect(activePreviewShare([share], token + "A", today)).toBeNull();
    expect(activePreviewShare([share], token, new Date("2026-11-26T12:00:00.000Z"))).toBeNull();
    expect(activePreviewShare([{ ...share, revokedAt: "2026-11-19T12:00:00.000Z" }],
      token, today)).toBeNull();
  });

  it("freezes a sanitized snapshot and disables enrollment and external links", () => {
    const { token, share } = sampleShare();
    const html = renderSharedSitePreview(share.pages["/"], siteId, token, Object.keys(share.pages));
    expect(html).toContain("Proposed learning community");
    expect(html).toContain("Not published or independently approved");
    expect(html).toContain("/site-preview-share?");
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
    expect(planned.every(block =>
      block.items.length === 3 &&
      block.items.every(item => item.label === "Proposed · not enrolling" && !item.link)
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
    expect(programsPage).toContain("Proposed · not enrolling");
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

  it("rejects invalid persisted share metadata rather than displaying private content", () => {
    const { share } = sampleShare();
    expect(readSitePreviewShares({})).toEqual([]);
    expect(readSitePreviewShares({ websitePreviewSharesV1: [share] })).toHaveLength(1);
    expect(() => readSitePreviewShares({ websitePreviewSharesV1: [{ ...share,
      pages: { "/admin": "private", "/": "home" },
    }] })).toThrow();
  });
});
