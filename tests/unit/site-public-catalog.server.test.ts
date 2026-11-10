import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; name: string; organizationName: string;
    status: string; publishedAt: Date | null; type?: string }>,
  activePrograms: [] as Array<{ id: string; type: string }>,
  reads: 0,
  enrichmentSiteIds: [] as string[],
  academicPrograms: [] as Array<{ programId: string; name: string }>,
  parentExtraProgramIds: [] as string[],
  openingGateCalls: 0,
  openingGateFailures: [] as string[],
}));
vi.mock("@/db/client", () => {
  const query = {
    innerJoin() { return this; },
    where() { return this; },
    for() { return this; },
    limit() { return Promise.resolve(state.reads === 1 ? state.rows : state.activePrograms); },
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
vi.mock("@/modules/sites/site-media-folder.server", () => ({
  readApprovedSchoolSitePhotos: async () => [],
}));
vi.mock("@/modules/sites/site-local-content.server", () => ({
  readCurrentLocalContent: async () => null,
}));
vi.mock("@/modules/sites/academic-program-catalog.server", () => ({
  readAcademicProgramCatalog: async () => state.academicPrograms,
}));
vi.mock("@/modules/programs/school-jurisdiction-opening-gate.server", async () => {
  const { AuthorizationError } = await vi.importActual<typeof import("@/domain/command-context")>(
    "@/domain/command-context",
  );
  return {
    requireCurrentSchoolJurisdictionForOpening: async (_tx: unknown, programId: string) => {
      state.openingGateCalls += 1;
      if (state.openingGateFailures.includes(programId))
        throw new AuthorizationError("current school opening review");
    },
  };
});
vi.mock("@/modules/sites/public-parent-extras.server", () => ({
  readApprovedPublicParentExtras: async (_siteId: string, programIds: string[]) => {
    state.parentExtraProgramIds = programIds;
    return { admissions: { applicationOpen: false, programs: [] } };
  },
}));
vi.mock("@/domain/parent-information", () => ({
  projectApprovedParentInformation: () => ({}),
  withVerifiedPublicApplications: (programs: unknown[]) => programs,
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
  state.activePrograms = [];
  state.reads = 0;
  state.enrichmentSiteIds = [];
  state.academicPrograms = [];
  state.parentExtraProgramIds = [];
  state.openingGateCalls = 0;
  state.openingGateFailures = [];
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
      status: "draft", publishedAt: null, type: "high_school_extension",
    }];
    expect(await readPublishedSiteCatalog("school")).toBeNull();
    expect(state.enrichmentSiteIds).toEqual([]);
  });
  it("only asks for the matched Site and returns an explicit public-safe DTO", async () => {
    state.rows = [{
      id: "site-2", name: "School", organizationName: "Church",
      status: "published", publishedAt: new Date("2026-10-22T00:00:00Z"),
      type: "high_school_extension",
    }];
    const result = await readPublishedSiteCatalog("school");
    expect(state.enrichmentSiteIds).toEqual(["site-2"]);
    expect(result?.host).toBe("school.can-os.com");
    expect(result?.site).toEqual({ name: "School", organizationName: "Church" });
    expect(result?.offerings).toHaveLength(1);
    expect(result?.offerings[0]?.title).toBe("Art Camp");
    expect(JSON.stringify(result)).not.toMatch(/permissionText|sessionIds|internal-session/);
  });
  it("keeps approved academic marketing visible while independent opening review is pending", async () => {
    state.rows = [{
      id: "site-3", name: "School", organizationName: "School",
      status: "published", publishedAt: new Date("2026-10-22T00:00:00Z"),
      type: "high_school_extension",
    }];
    state.academicPrograms = [{ programId: "program-1", name: "High School" }];
    state.activePrograms = [{ id: "program-1", type: "church_hosted_academy" }];
    state.openingGateFailures = ["program-1"];

    const result = await readPublishedSiteCatalog("school");

    expect(result?.academicPrograms).toEqual(state.academicPrograms);
    expect(state.parentExtraProgramIds).toEqual(["program-1"]);
    expect(state.openingGateCalls).toBe(1);
    expect(result?.operatingStatus).toBe("review_required");
  });
  it("keeps Site authorization in review when any active academic Program fails its gate", async () => {
    state.rows = [{
      id: "site-4", name: "School", organizationName: "School",
      status: "published", publishedAt: new Date("2026-10-22T00:00:00Z"),
    }];
    state.academicPrograms = [
      { programId: "program-1", name: "Elementary" },
      { programId: "program-2", name: "High School" },
    ];
    state.activePrograms = [
      { id: "program-1", type: "church_hosted_academy" },
      { id: "program-2", type: "church_hosted_academy" },
    ];
    state.openingGateFailures = ["program-2"];

    const result = await readPublishedSiteCatalog("school");

    expect(result?.academicPrograms).toEqual(state.academicPrograms);
    expect(result?.operatingStatus).toBe("review_required");
    expect(state.openingGateCalls).toBe(2);
  });
});
