import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveEnrollmentCounts,
  getAdmissionsDashboard,
} from "@/modules/enrollment/admissions-dashboard.functions";

const state = vi.hoisted(() => ({
  select: vi.fn(),
  getCommandContext: vi.fn(),
  resolveOperationsSelection: vi.fn(),
  queries: [] as {
    result: unknown[];
    calls: { name: string; args: unknown[] }[];
  }[],
  results: [] as unknown[][],
}));

vi.mock("@/db/client", () => ({ db: { select: state.select } }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: state.getCommandContext,
}));
vi.mock("@/modules/operations/operations-scope.server", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/operations/operations-scope.server")>();
  return {
    ...actual,
    resolveOperationsSelection: state.resolveOperationsSelection,
  };
});
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://can.local"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: (input: unknown) => unknown) { return callback; },
  }),
}));

const applicationId = "00000000-0000-4000-8000-000000000201";
const registrar = {
  actorPersonId: "registrar",
  role: "registrar",
  capabilities: new Set(["enrollment.decide"]),
  scope: { organizationIds: ["organization"], siteIds: ["site"], programIds: ["program"] },
};

function applicationRecord(id = applicationId, stage = "application") {
  return {
    id,
    stage,
    submittedAt: null,
    program: "Academy",
    programId: "program",
    studentProfileId: "student-profile",
    studentPersonId: "student-person",
    siteId: "site",
    organizationId: "organization",
    firstName: "Selected",
    lastName: "Applicant",
    preferredName: null,
    metadata: {},
  };
}

function query(result: unknown[]) {
  const log = { result, calls: [] as { name: string; args: unknown[] }[] };
  state.queries.push(log);
  const builder = {
    from: (...args: unknown[]) => { log.calls.push({ name: "from", args }); return builder; },
    innerJoin: (...args: unknown[]) => { log.calls.push({ name: "innerJoin", args }); return builder; },
    where: (...args: unknown[]) => { log.calls.push({ name: "where", args }); return builder; },
    groupBy: (...args: unknown[]) => { log.calls.push({ name: "groupBy", args }); return builder; },
    orderBy: (...args: unknown[]) => { log.calls.push({ name: "orderBy", args }); return builder; },
    limit: (...args: unknown[]) => { log.calls.push({ name: "limit", args }); return builder; },
    offset: (...args: unknown[]) => { log.calls.push({ name: "offset", args }); return builder; },
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function queueQueries(...results: unknown[][]) {
  state.results = results;
  state.select.mockImplementation(() => query(state.results.shift() ?? []));
}

function sqlParameterValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(sqlParameterValues);
  const candidate = value as { queryChunks?: unknown[]; value?: unknown };
  if (candidate.queryChunks) return candidate.queryChunks.flatMap(sqlParameterValues);
  return "value" in candidate ? [candidate.value] : [];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://test");
  state.queries = [];
  state.results = [];
  state.getCommandContext.mockResolvedValue(registrar);
  state.resolveOperationsSelection.mockResolvedValue({ siteIds: ["site"], programIds: ["program"] });
});

describe("admissions dashboard pagination and summaries", () => {
  it("counts active program enrollments across the complete authorized scope", async () => {
    queueQueries([
      { programId: "program", activeStudents: 13 },
    ]);

    await expect(getActiveEnrollmentCounts({ data: {} })).resolves.toEqual([
      { programId: "program", activeStudents: 13 },
    ]);
    expect(state.queries[0]?.calls.some(call => call.name === "groupBy")).toBe(true);
    expect(state.queries[0]?.calls.some(call => call.name === "limit")).toBe(false);
  });

  it("loads an exact application outside the current page without widening its authorized scope", async () => {
    queueQueries(
      [{ stage: "application", count: 160 }, { stage: "eligibility", count: 40 }],
      [{ count: 243 }],
      [applicationRecord(applicationId, "eligibility")],
      [],
      [],
      [],
      [],
      [],
    );

    const result = await getAdmissionsDashboard({
      data: { applicationId, page: 5, stage: "declined" },
    }) as {
      rows: unknown[];
      detail: { id: string; stage: string } | null;
      summary: { total: number; awaitingDecision: number; missingRequirements: number };
      page: number;
      filteredTotal: number;
    };

    expect(result.rows).toEqual([]);
    expect(result.detail).toMatchObject({ id: applicationId, stage: "eligibility" });
    expect(result.summary).toEqual(expect.objectContaining({
      total: 200,
      awaitingDecision: 200,
      missingRequirements: 243,
    }));
    expect(result.page).toBe(1);
    expect(result.filteredTotal).toBe(0);

    const detailQuery = state.queries[2];
    expect(detailQuery?.calls.find(call => call.name === "limit")?.args).toEqual([1]);
    expect(detailQuery?.calls.some(call => call.name === "offset")).toBe(false);
    expect(detailQuery?.calls.some(call => call.name === "where")).toBe(true);
    expect(sqlParameterValues(detailQuery?.calls.find(call => call.name === "where")?.args)).toContain(applicationId);
    expect(state.resolveOperationsSelection).toHaveBeenCalledWith(
      registrar,
      expect.objectContaining({ applicationId, page: 5, stage: "declined" }),
    );
  });

  it("filters by stage before a deterministic bounded page and keeps whole-scope aggregates", async () => {
    queueQueries(
      [{ stage: "application", count: 83 }, { stage: "eligibility", count: 91 }, { stage: "inquiry", count: 27 }],
      [{ count: 207 }],
      [applicationRecord("00000000-0000-4000-8000-000000000202", "application")],
      [],
      [],
      [],
      [],
      [],
    );

    const result = await getAdmissionsDashboard({
      data: { page: 3, stage: "application" },
    }) as {
      rows: { id: string }[];
      summary: { total: number; awaitingDecision: number; missingRequirements: number; byStage: { stage: string; count: number }[] };
      page: number;
      pageSize: number;
      filteredTotal: number;
      hasMore: boolean;
    };

    expect(result.rows).toHaveLength(1);
    expect(result.summary).toMatchObject({ total: 201, awaitingDecision: 174, missingRequirements: 207 });
    expect(result.summary.byStage).toContainEqual({ stage: "inquiry", count: 27 });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(40);
    expect(result.filteredTotal).toBe(83);
    expect(result.hasMore).toBe(false);

    const pageQuery = state.queries[2];
    const names = pageQuery?.calls.map(call => call.name);
    expect(names?.indexOf("where")).toBeLessThan(names?.indexOf("limit") ?? -1);
    expect(names?.indexOf("orderBy")).toBeLessThan(names?.indexOf("limit") ?? -1);
    expect(pageQuery?.calls.find(call => call.name === "limit")?.args).toEqual([40]);
    expect(pageQuery?.calls.find(call => call.name === "offset")?.args).toEqual([80]);
    expect(sqlParameterValues(pageQuery?.calls.find(call => call.name === "where")?.args)).toContain("application");
  });

  it("clamps requests beyond the final filtered page", async () => {
    queueQueries(
      [{ stage: "application", count: 41 }],
      [{ count: 2 }],
      [applicationRecord("00000000-0000-4000-8000-000000000203")],
      [],
      [],
      [],
      [],
      [],
    );

    const result = await getAdmissionsDashboard({ data: { page: 10, stage: "application" } }) as {
      page: number;
      hasMore: boolean;
      filteredTotal: number;
    };

    expect(result).toMatchObject({ page: 2, hasMore: false, filteredTotal: 41 });
    expect(state.queries[2]?.calls.find(call => call.name === "offset")?.args).toEqual([40]);
  });
});
