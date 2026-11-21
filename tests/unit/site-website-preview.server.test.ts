import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { siteWebsiteDraftReadCapability } from "@/domain/site-publication-policy";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import {
  initialSiteBrandConfiguration, resolveSiteBrandVersion,
  type SavedSiteBrandVersion,
} from "@/domain/site-brand";

const state = vi.hoisted(() => ({
  sites: [] as Array<{ id: string; organizationId: string; name: string; organizationName: string }>,
  assignments: [] as Array<{ id: string; capabilities: string[] }>,
  addresses: [] as Array<{ slug: string; status: string }>,
  reads: 0,
  catalogSiteIds: [] as string[],
  brand: null as unknown,
}));

vi.mock("@/db/client", () => ({
  db: {
    execute: async () => ({ rows: [{ definition: "CHECK (status IN ('draft','published','review_required'))" }] }),
    select: () => {
      const index = state.reads++;
      const query = {
        innerJoin() { return this; },
        where() { return this; },
        limit() {
          return Promise.resolve(
            index === 0 ? state.sites :
            index === 1 ? state.assignments : state.addresses,
          );
        },
      };
      return { from: () => query };
    },
  },
}));
vi.mock("@/modules/sites/academic-program-catalog.server", () => ({
  readAcademicProgramCatalog: async (siteId: string) => {
    state.catalogSiteIds.push(siteId);
    return [{
      programId: "program-approved",
      title: "Approved Academy",
      summary: "Institutionally reviewed information.",
      typeLabel: "High school extension",
      grades: { min: "9", max: "9" },
      delivery: { onsite: true, asynchronous: true, liveOnline: false,
        onsiteDaysPerWeek: 2 },
      availability: "planned",
    }];
  },
}));
vi.mock("@/modules/activities/enrichment-catalog.server", () => ({
  readEnrichmentCatalog: async (siteId: string) => {
    state.catalogSiteIds.push(siteId);
    return [];
  },
}));

// Site publisher authorization/preview contract tests isolate the approved
// extras reader. Program-specific scheduling, identity revision and admissions
// publication gates are covered in public-parent-extras/identity tests.
vi.mock("@/modules/sites/public-parent-extras.server", () => ({
  readApprovedPublicParentExtras: async () => ({
    programSchedules: [],
    people: [],
    admissions: {
      applicationOpen: false,
      description: {value:null,source:"admissions",revision:null,
        audience:"public",status:"not_configured",canDisplay:false},
      programs: [],
    },
    services: [],
  }),
}));

vi.mock("@/modules/sites/site-media-folder.server", () => ({
  readApprovedSchoolSitePhotos: async () => [],
}));
vi.mock("@/modules/sites/site-local-content.server", () => ({
  readCurrentLocalContent: async () => null,
  readLocalContentHistory: async () => [],
}));

vi.mock("@/modules/sites/site-brand.server",()=>({
  readSavedBrandVersion:async()=>state.brand,
}));
import { getPartnerWebsitePreview } from "@/modules/sites/site-website-preview.server";

function editor(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    accountId: "account-a", sessionId: "session-a", grantId: "grant-a",
    grantSiteId: "site-a", actorPersonId: "person-a",
    role: "site_website_editor",
    capabilities: new Set([siteWebsiteDraftReadCapability]),
    scope: { organizationIds: ["org-a"], siteIds: ["site-a"] },
    ...overrides,
  };
}

beforeEach(() => {
  state.sites = [{
    id: "site-a", organizationId: "org-a",
    name: "Partner Academy", organizationName: "Partner Church",
  }];
  state.assignments = [{ id: "explicit-partner-assignment",
    capabilities: ["site.website.draft.read", "site.website.local.publish"] }];
  state.addresses = [{ slug: "partner-academy", status: "draft" }];
  state.reads = 0;
  state.catalogSiteIds = [];
  state.brand = null;
});

describe("read-only church partner website", () => {
  it("requires the explicit Site role assignment, even when login grant is valid", async () => {
    state.assignments = [];
    await expect(getPartnerWebsitePreview(editor())).rejects.toThrow(/explicit Site website editor/);
    expect(state.reads).toBe(2);
    expect(state.catalogSiteIds).toEqual([]);
  });

  it("denies unrelated Sites, organization-wide partner grants and registrars", async () => {
    await expect(getPartnerWebsitePreview(editor({
      grantSiteId: "site-b",
      scope: { organizationIds: ["org-a"], siteIds: ["site-b"] },
    }))).rejects.toThrow();
    state.reads = 0;
    await expect(getPartnerWebsitePreview(editor({ grantSiteId: null }))).rejects.toThrow();
    state.reads = 0;
    await expect(getPartnerWebsitePreview(editor({ role: "registrar" }))).rejects.toThrow();
    expect(state.catalogSiteIds).toEqual([]);
  });

  it("returns only a public-safe, read-only site projection and no active inquiry", async () => {
    const result = await getPartnerWebsitePreview(editor());
    expect(result.host).toBe("partner-academy.can-os.com");
    expect(result.status).toBe("draft");
    expect(result.canPublish).toBe(true);
    expect(result.draftStorageReady).toBe(true);
    expect(result.approvedAcademicCount).toBe(1);
    expect(result.previewHtml).toContain("Approved Academy");
    expect(result.previewHtml).toContain("Partner Church");
    expect(result.previewPages["/"]).toContain("Approved Academy");
    expect(result.previewPages["/academics"]).toContain("Approved Academy");
    expect(result.previewPages["/admissions"]).not.toContain("<form");
    expect(result.previewHtml).not.toContain("<form");
    expect(result.previewHtml).not.toContain("studentProfileId");
    expect(result.previewHtml).not.toContain("applicationId");
    expect(Object.keys(result).sort()).toEqual([
      "approvedAcademicCount", "approvedEnrichmentCount", "approvedPhotoCount", "canPrepareWebsite", "canPublish",
      "contentChannelConfig", "currentBrandConfiguration", "currentBrandRevision", "currentBrandVersionId", "currentRevision", "demonstration", "draftStorageReady", "editingContent", "host", "localContentStatus",
      "localHistory", "mediaUploadsEnabled", "organizationName", "parentInformation", "previewHtml", "previewPages",
      "publicInformationReadiness", "siteExperienceProfile", "siteId", "siteInformation", "siteName",
      "siteStoryCopyCandidates", "siteStoryRecommendation", "siteStoryRevision", "siteStorySourceChoices",
      "sourceMapping", "status",
    ]);
    expect(result.contentChannelConfig).toMatchObject({ version: 2, revision: 0 });
    expect(result.sourceMapping).toMatchObject({
      physicalAddressSaved: false, publicAddressVisible: false,
      contactSaved: false, publicContactVisible: false,
      schoolContextSaved: false, learningIntentSaved: false,
      contentChannelsPublished: false,
    });
    expect(state.catalogSiteIds).toEqual(["site-a", "site-a"]);
  });

  it("renders proposed editor copy only inside the private scoped draft preview", async () => {
    const initial = await getPartnerWebsitePreview(editor());
    expect(initial.previewHtml).toContain("<h1>A school that sees the individual. A community that helps them grow.</h1>");
    state.reads = 0;
    const proposal = createSchoolWebsiteStarterContent("Partner Academy");
    const draft = await getPartnerWebsitePreview(editor(), proposal);
    expect(draft.previewHtml).toContain("<h1>A school that sees the individual. A community that helps them grow.</h1>");
    expect(draft.previewHtml).toContain("Partner Academy");
    expect(draft.previewPages["/"]).toContain(proposal.localDescription);
    expect(draft.editingContent).toBeNull();
    expect(draft.localContentStatus).toBeNull();
    expect(draft.previewHtml).not.toContain("editorialBaseline");
    expect(draft.previewHtml).not.toContain("<script");
    // The private preview is read-only. Published local content is never updated.
  });

  it("uses the saved immutable Brand for an unsaved first-visit website preview", async () => {
    const version:SavedSiteBrandVersion={
      id:"22222222-2222-4222-8222-222222222222",
      siteId:"site-a",revision:3,
      configuration:{
        ...initialSiteBrandConfiguration("Canonical Learning Community"),
        paletteId:"forest",typographyId:"traditional",
        headingFontId:"palatino",bodyFontId:"verdana",
      },
      fingerprint:"a".repeat(64),createdAt:"2026-11-19T00:00:00.000Z",
    };
    state.brand = {version,resolved:resolveSiteBrandVersion(version,new Map())};
    const result=await getPartnerWebsitePreview(editor());
    expect(result.currentBrandVersionId).toBe(version.id);
    expect(result.currentBrandRevision).toBe(3);
    expect(result.editingContent).toBeNull();
    expect(result.previewHtml).toContain("Canonical Learning Community");
    expect(result.previewHtml).toContain("Approved Academy");
    expect(result.previewHtml).not.toContain("studentProfileId");
    // The source is the immutable Brand. The first-visit starter remains a
    // private, unsaved website copy, not a second saved branding record.
    expect(result.currentBrandConfiguration?.paletteId).toBe("forest");
    expect(result.currentRevision).toBe(0);
  });

  it("never inserts a consent-unconfirmed logo into the website HTML", async () => {
    const original = createSchoolWebsiteStarterContent("Partner Academy");
    const proposed = {
      ...original,
      branding: {
        ...original.branding,
        logoImage: {
          dataUrl: "data:image/png;base64,unapproved-content",
          altText: "Unapproved private logo",
          rightsConfirmed: false,
          childImageConsent: "unconfirmed" as const,
        },
      },
    };
    const result = await getPartnerWebsitePreview(editor(), proposed);
    expect(result.previewHtml).toBeTruthy();
    expect(result.previewHtml).not.toContain("unapproved-content");
    expect(result.previewHtml).not.toContain("Unapproved private logo");
  });

  it("allows viewing without local publish privilege, but hides publishing controls", async () => {
    state.assignments = [{ id: "read-only-partner", capabilities: ["site.website.draft.read"] }];
    const result = await getPartnerWebsitePreview(editor());
    expect(result.canPublish).toBe(false);
  });

  it("does not fabricate a public address or query Program details for unprovisioned Sites", async () => {
    state.addresses = [];
    const result = await getPartnerWebsitePreview(editor());
    expect(result.host).toBeNull();
    expect(result.previewHtml).toBeNull();
    expect(state.catalogSiteIds).toEqual([]);
  });
});
