import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: {
    actorPersonId: "10000000-0000-4000-8000-000000000001",
    capabilities: new Set(["program.launch.start"]),
    scope: {
      programIds: ["10000000-0000-4000-8000-000000000002"],
      organizationIds: ["10000000-0000-4000-8000-000000000003"],
      siteIds: ["10000000-0000-4000-8000-000000000004"],
    },
  },
  market: {
    packs: [{
      versionId: "10000000-0000-4000-8000-000000000005",
      entitlement: "active",
      adoption: { status: "active", versionId: "10000000-0000-4000-8000-000000000005" },
      courses: [{ courseVersionId: "10000000-0000-4000-8000-000000000006" }],
    }],
  },
  rows: [] as Array<Array<Record<string, unknown>>>,
  assign: vi.fn(),
  transaction: vi.fn(),
  capacityCandidates: vi.fn(),
  eligibility: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (value: unknown) => value;
    return {
      validator(validator: (value: unknown) => unknown) {
        parse = validator;
        return this;
      },
      handler(handler: (input: { data: unknown }) => unknown) {
        return (input: { data: unknown }) => handler({ data: parse(input.data) });
      },
    };
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) => state.transaction(callback),
  },
}));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: async () => state.actor,
}));
vi.mock("@/modules/learning/curriculum-marketplace.server", () => ({
  readMarketplace: async () => state.market,
}));
vi.mock("@/modules/staffing/launch-staffing.server", () => ({
  assignLaunchInstructor: state.assign,
  evaluateLaunchTeacher: state.eligibility,
}));
vi.mock("@/modules/staffing/educational-capacity-service", () => ({
  findCapacityCandidates: vi.fn(),
  findCapacityCandidatesInTransaction: state.capacityCandidates,
}));

import { engageMarketplaceTeacher } from "@/modules/staffing/teacher-marketplace.functions";

const request = {
  programId: "10000000-0000-4000-8000-000000000002",
  courseVersionId: "10000000-0000-4000-8000-000000000006",
  teacherPersonId: "10000000-0000-4000-8000-000000000007",
};

function setup(sections: string[] = [
  "10000000-0000-4000-8000-000000000012",
  "10000000-0000-4000-8000-000000000013",
], candidate = true) {
  state.rows = [
    [{
      organizationId: "10000000-0000-4000-8000-000000000003",
      siteId: "10000000-0000-4000-8000-000000000004",
      academicProviderOrganizationId: "10000000-0000-4000-8000-000000000008",
      jurisdictionId: "10000000-0000-4000-8000-000000000009",
    }],
    [{ id: "10000000-0000-4000-8000-000000000010" }],
    candidate ? [{ personId: "10000000-0000-4000-8000-000000000007" }] : [],
    sections.map(id => ({ id })),
    ...sections.map((_, index) => [{
      id: `10000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
      status: "open",
    }]),
  ];
  state.assign.mockResolvedValue({ created: true });
  state.eligibility.mockResolvedValue({ eligible: true, reasons: [] });
  state.capacityCandidates.mockImplementation(async () => [{
    personId: "10000000-0000-4000-8000-000000000007",
    offeringId: "10000000-0000-4000-8000-000000000030",
    remainingSeats: 30,
    requiredSeats: 20,
    remainingDemandSeats: 20,
  }]);
  state.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    let index = 0;
    const tx = {
      select: () => {
        const rows = state.rows[index++] ?? [];
        const query: Record<string, unknown> = {};
        for (const method of ["from", "innerJoin", "where", "orderBy", "for"]) {
          query[method] = () => query;
        }
        query.limit = async () => rows;
        query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve, reject);
        return query;
      },
    };
    return callback(tx);
  });
}

const invoke = (data: unknown = request) =>
  (engageMarketplaceTeacher as unknown as (input: { data: unknown }) => Promise<unknown>)({ data });

beforeEach(() => {
  vi.clearAllMocks();
  state.market = {
    packs: [{
      versionId: "10000000-0000-4000-8000-000000000005",
      entitlement: "active",
      adoption: { status: "active", versionId: "10000000-0000-4000-8000-000000000005" },
      courses: [{ courseVersionId: "10000000-0000-4000-8000-000000000006" }],
    }],
  };
  setup();
});

describe("school-led teacher engagement", () => {
  it("engages every active class through the canonical assignment command", async () => {
    await expect(invoke()).resolves.toEqual({
      sectionCount: 2,
      engaged: 2,
      alreadyEngaged: 0,
    });
    expect(state.assign).toHaveBeenCalledTimes(2);
    expect(state.assign.mock.calls.map((call: unknown[]) => call[2])).toEqual([
      {
        programId: request.programId,
        sectionId: "10000000-0000-4000-8000-000000000012",
        teacherPersonId: request.teacherPersonId,
        capacityDemandId: "10000000-0000-4000-8000-000000000020",
      },
      {
        programId: request.programId,
        sectionId: "10000000-0000-4000-8000-000000000013",
        teacherPersonId: request.teacherPersonId,
        capacityDemandId: "10000000-0000-4000-8000-000000000021",
      },
    ]);
    expect(state.assign.mock.calls[0]?.[0]).toBe(state.assign.mock.calls[1]?.[0]);
  });

  it("limits an override to the selected class", async () => {
    const sectionId = "10000000-0000-4000-8000-000000000011";
    setup([sectionId]);
    await expect(invoke({ ...request, sectionId })).resolves.toMatchObject({
      sectionCount: 1,
      engaged: 1,
    });
    expect(state.assign).toHaveBeenCalledOnce();
    expect(state.assign.mock.calls[0]?.[2]).toEqual({
      programId: request.programId,
      sectionId,
      teacherPersonId: request.teacherPersonId,
      capacityDemandId: "10000000-0000-4000-8000-000000000020",
    });
  });

  it("reports classes that were already assigned without duplicating them", async () => {
    state.assign.mockResolvedValueOnce({ created: false }).mockResolvedValueOnce({ created: true });
    await expect(invoke()).resolves.toEqual({
      sectionCount: 2,
      engaged: 1,
      alreadyEngaged: 1,
    });
  });

  it("rejects a person without a current real provider offering", async () => {
    setup(["10000000-0000-4000-8000-000000000012"], false);
    await expect(invoke()).rejects.toThrow("not an onboarded teacher");
    expect(state.assign).not.toHaveBeenCalled();
  });

  it("does not engage against a course that is no longer adopted", async () => {
    state.rows[1] = [];
    await expect(invoke()).rejects.toThrow("no longer actively adopted");
    expect(state.assign).not.toHaveBeenCalled();
  });

  it("rejects a course-wide engagement when there are no active classes", async () => {
    setup([]);
    await expect(invoke()).rejects.toThrow("No active classes");
    expect(state.assign).not.toHaveBeenCalled();
  });
});
