import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { siteWebsiteDraftReadCapability } from "@/domain/site-publication-policy";

const state = vi.hoisted(() => ({
  sites: [] as Array<{ id: string; organizationId: string; name: string; organizationName: string }>,
  assignments: [] as Array<{ id: string; capabilities: string[] }>,
  addresses: [] as Array<{ slug: string; status: string }>,
  reads: 0,
  catalogSiteIds: [] as string[],
}));

vi.mock("@/db/client", () => ({
  db: {
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

vi.mock("@/modules/sites/site-local-content.server", () => ({
  readCurrentLocalContent: async () => null,
  readLocalContentHistory: async () => [],
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
    expect(result.approvedAcademicCount).toBe(1);
    expect(result.previewHtml).toContain("Approved Academy");
    expect(result.previewHtml).toContain("Partner Church");
    expect(result.previewHtml).not.toContain("<form");
    expect(result.previewHtml).not.toContain("studentProfileId");
    expect(result.previewHtml).not.toContain("applicationId");
    expect(Object.keys(result).sort()).toEqual([
      "approvedAcademicCount", "approvedEnrichmentCount", "canPublish",
      "currentRevision", "editingContent", "host", "localContentStatus",
      "localHistory", "organizationName", "previewHtml", "siteId", "siteName", "status",
    ]);
    expect(state.catalogSiteIds).toEqual(["site-a", "site-a"]);
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
