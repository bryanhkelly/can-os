import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/identity/actors.server";
import { persistCurriculumImportJob } from "@/modules/learning/curriculum-import-job.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const state = vi.hoisted(() => ({
  prior: null as { id: string; status: string } | null,
  inserted: null as Record<string, unknown> | null,
  insertReturnsNoJob: false,
  order: [] as string[],
}));

vi.mock("@/db/schema", () => ({
  curriculumImportJobs: { id: {}, status: {}, organizationId: {}, format: {}, sha256: {} },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(() => ({})), eq: vi.fn(() => ({})) }));
vi.mock("@/db/client", () => ({
  db: {
    transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => state.prior ? [state.prior] : [] }) }) }),
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          state.inserted = value;
          return { returning: async () => state.insertReturnsNoJob ? [] : [{ id: "import-job" }] };
        },
      }),
    })),
  },
}));
vi.mock("@/platform/mutation", () => ({
  writeAudit: vi.fn(async () => { state.order.push("audit"); }),
  emitEvent: vi.fn(async () => { state.order.push("event"); }),
}));

const actor = {
  actorPersonId: "registrar-person",
  capabilities: new Set<string>(),
  scope: {},
} as Actor;
const baseInput = {
  actor,
  organizationId: "organization",
  programId: "program",
  format: "oneroster",
  formatVersion: "1.2",
  sourceName: "OneRoster CSV bundle",
  sha256: "bundle-digest",
  status: "validated",
  report: { valid: true },
  metadata: { programId: "program", previewOnly: true },
  auditAction: "curriculum.interop.oneroster.validate",
  auditAfter: { format: "oneroster", sha256: "bundle-digest", valid: true },
  eventType: "OneRosterCsvValidated",
};

describe("curriculum import job persistence", () => {
  beforeEach(() => {
    state.prior = null;
    state.inserted = null;
    state.insertReturnsNoJob = false;
    state.order = [];
    vi.clearAllMocks();
  });

  it("reuses a matching job without inserting or duplicating audit and event records", async () => {
    state.prior = { id: "existing-job", status: "rejected" };
    await expect(persistCurriculumImportJob(baseInput)).resolves.toEqual({
      importId: "existing-job", status: "rejected", previouslyValidated: true,
    });
    expect(state.inserted).toBeNull();
    expect(state.order).toEqual([]);
  });

  it("writes the exact domain job and audit/event evidence in its transaction", async () => {
    await expect(persistCurriculumImportJob(baseInput)).resolves.toEqual({
      importId: "import-job", status: "validated", previouslyValidated: false,
    });
    expect(state.inserted).toEqual({
      organizationId: "organization",
      format: "oneroster",
      formatVersion: "1.2",
      sourceName: "OneRoster CSV bundle",
      sha256: "bundle-digest",
      status: "validated",
      report: { valid: true },
      metadata: { programId: "program", previewOnly: true },
    });
    expect(state.order).toEqual(["audit", "event"]);
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(), actor, {
      action: "curriculum.interop.oneroster.validate",
      entityType: "curriculum_import_job",
      entityId: "import-job",
      scope: { organizationId: "organization", programId: "program" },
      after: { format: "oneroster", sha256: "bundle-digest", valid: true },
    });
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(), {
      eventType: "OneRosterCsvValidated",
      aggregateType: "curriculum_import_job",
      aggregateId: "import-job",
      actorPersonId: "registrar-person",
      organizationId: "organization",
      programId: "program",
    });
  });

  it("preserves rejected validation status when creating a job", async () => {
    await persistCurriculumImportJob({ ...baseInput, status: "rejected", report: { valid: false } });
    expect(state.inserted).toMatchObject({ status: "rejected", report: { valid: false } });
  });

  it("surfaces an incomplete insert without fabricating audit or event success", async () => {
    state.insertReturnsNoJob = true;
    await expect(persistCurriculumImportJob(baseInput)).rejects.toThrow("Unable to record curriculum import.");
    expect(state.order).toEqual([]);
  });
});
