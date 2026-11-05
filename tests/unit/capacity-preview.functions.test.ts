import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeLoader } from "@/lib/safe-loader";
import {
  getAdmissionsCapacity,
  listSeatPoolCandidates,
} from "@/modules/enrollment/capacity-preview.functions";

const state = vi.hoisted(() => ({
  requireActor: vi.fn(),
  resolveOperationsSelection: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { select: state.select } }));
vi.mock("@/modules/identity/actors.server", () => ({ requireActor: state.requireActor }));
vi.mock("@/modules/operations/operations-scope.server", () => ({
  resolveOperationsSelection: state.resolveOperationsSelection,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: (input: unknown) => unknown) { return callback; },
  }),
}));

const registrar = { role: "registrar", scope: { programIds: ["program"] } };

function emptyProgramQuery() {
  return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://test");
  state.requireActor.mockResolvedValue(registrar);
  state.resolveOperationsSelection.mockResolvedValue({ programIds: ["program"] });
  state.select.mockImplementation(emptyProgramQuery);
});

afterEach(() => vi.unstubAllEnvs());

describe("admissions capacity reads", () => {
  it("reports unavailable when capacity database configuration is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const outcome = await safeLoader(() => getAdmissionsCapacity({ data: {} }))();

    expect(outcome).toMatchObject({ ok: false, kind: "unavailable", retryable: true, authError: null });
  });

  it("reports unavailable when seat-pool candidates database configuration is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const outcome = await safeLoader(() => listSeatPoolCandidates({ data: {} }))();

    expect(outcome).toMatchObject({ ok: false, kind: "unavailable", retryable: true, authError: null });
  });

  it("preserves legitimate empty results when the database is configured", async () => {
    await expect(getAdmissionsCapacity({ data: {} })).resolves.toEqual([]);
    await expect(listSeatPoolCandidates({ data: {} })).resolves.toEqual([]);
  });

  it("preserves authorization denial when database configuration is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const denial = new Error("Not authorized");
    state.requireActor.mockRejectedValue(denial);

    await expect(getAdmissionsCapacity({ data: {} })).rejects.toBe(denial);
    await expect(listSeatPoolCandidates({ data: {} })).rejects.toBe(denial);
  });
});