import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; name: string; organizationName: string;
    status: string; publishedAt: Date | null }>,
  reads: 0,
  enrichmentSiteIds: [] as string[],
}));
vi.mock("@/db/client", () => {
  const query = {
    innerJoin() { return this; },
    where() { return this; },
    for() { return this; },
    limit() { return Promise.resolve(state.rows); },
  };
  const select = () => {
    state.reads += 1;
    return { from: () => query };
  };
  return { db: {
    select,
    transaction: async (callback: (tx: { select: typeof select }) => Promise<unknown>) =>
      callback({ select }),
  } };
});
vi.mock("@/modules/sites/site-local-content.server", () => ({
  readCurrentLocalContent: async () => null,
}));
vi.mock("@/modules/sites/academic-program-catalog.server", () => ({
  readAcademicProgramCatalog: async () => [],
}));

vi.mock("@/modules/activities/enrichment-catalog.server", () => ({
  readEnrichmentCatalog: async (siteId: string) => {
    state.enrichmentSiteIds.push(siteId);
    return [{
      seasonId: "season-1", name: "Art Camp", seasonName: "Summer",
      programName: "Enrichment", startsOn: "2027-07-01", endsOn: "2027-07-31",
      feeAmountCents: 4000, seatsRemaining: 5, registrationOpen: true,
      firstMeeting: null, meetingTimezone: null,
      permissionText: "Must not appear publicly",
      packages: [{
        id: "package-1", title: "Week one", priceCents: 4000,
        available: true, seatsRemaining: 5, sessionIds: ["internal-session"],
      }],
    }];
  },
}));

import { readPublishedSiteCatalog } from "@/modules/sites/site-public-catalog.server";

beforeEach(() => {
  state.rows = [];
  state.reads = 0;
  state.enrichmentSiteIds = [];
});

describe("site public catalog read gate", () => {
  it("rejects reserved, invalid and unknown Site hostnames without exposing any offerings", async () => {
    expect(await readPublishedSiteCatalog("www")).toBeNull();
    expect(await readPublishedSiteCatalog("other.site")).toBeNull();
    expect(state.reads).toBe(0);
    expect(await readPublishedSiteCatalog("unknown-site")).toBeNull();
    expect(state.enrichmentSiteIds).toEqual([]);
  });
  it("does not expose a draft Site even if enrichment Seasons are independently published", async () => {
    state.rows = [{
      id: "site-1", name: "School", organizationName: "Church",
      status: "draft", publishedAt: null,
    }];
    expect(await readPublishedSiteCatalog("school")).toBeNull();
    expect(state.enrichmentSiteIds).toEqual([]);
  });
  it("only asks for the matched Site and returns an explicit public-safe DTO", async () => {
    state.rows = [{
      id: "site-2", name: "School", organizationName: "Church",
      status: "published", publishedAt: new Date("2026-10-22T00:00:00Z"),
    }];
    const result = await readPublishedSiteCatalog("school");
    expect(state.enrichmentSiteIds).toEqual(["site-2"]);
    expect(result?.host).toBe("school.can-os.com");
    expect(result?.site).toEqual({ name: "School", organizationName: "Church" });
    expect(result?.offerings).toHaveLength(1);
    expect(result?.offerings[0]?.title).toBe("Art Camp");
    expect(JSON.stringify(result)).not.toMatch(/permissionText|sessionIds|internal-session/);
  });
});
