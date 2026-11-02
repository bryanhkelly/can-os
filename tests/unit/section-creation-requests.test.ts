import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireActor: vi.fn(),
  audit: vi.fn(),
  event: vi.fn(),
  selectRows: [] as unknown[][],
  insertRows: [] as unknown[][],
  insertValues: vi.fn(),
  tx: null as any,
}));

function selectChain() {
  const chain: any = {
    from() { return this; },
    where() { return this; },
    for() { return this; },
    limit() { return Promise.resolve(state.selectRows.shift() ?? []); },
  };
  return chain;
}

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: unknown) { return callback; },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: { transaction: (callback: (tx: unknown) => unknown) => callback(state.tx) },
}));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: state.requireActor,
  recordAudit: state.audit,
}));
vi.mock("@/platform/mutation", () => ({ emitEvent: state.event }));

import { submitTeacherClassRequest } from "@/modules/programs/section-creation-requests.functions";

const actor = {
  actorPersonId: "teacher",
  role: "teacher",
  accountId: "account",
  sessionId: "session",
  capabilities: new Set(["class.request"]),
  scope: {
    organizationIds: ["org"],
    siteIds: ["site"],
    programIds: ["20000000-0000-4000-8000-000000000002"],
  },
};
const input = {
  requestId: "10000000-0000-4000-8000-000000000001",
  programId: "20000000-0000-4000-8000-000000000002",
  requestedClassTitle: "Biology Lab",
  requestedCourseOrSubject: "Biology",
  desiredTerm: "Fall 2027",
  schedulePreference: "Mornings",
  notes: "Please consider a lab period.",
};
const program = { id: input.programId, name: "North School", siteId: "site", organizationId: "org" };

beforeEach(() => {
  vi.clearAllMocks();
  state.selectRows = [];
  state.insertRows = [];
  state.requireActor.mockResolvedValue(actor);
  state.tx = {
    select: vi.fn(() => selectChain()),
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        state.insertValues(values);
        const result = {
          onConflictDoNothing() { return result; },
          returning: () => Promise.resolve(state.insertRows.shift() ?? []),
        };
        return result;
      },
    })),
  };
});

describe("teacher Section creation requests", () => {
  it("submits a registrar request instead of creating a Section", async () => {
    state.selectRows = [[program]];
    state.insertRows = [[{ id: input.requestId }]];

    await expect(submitTeacherClassRequest({ data: input })).resolves.toEqual({
      requestId: input.requestId,
      replayed: false,
    });

    expect(state.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      id: input.requestId,
      type: "section_creation_request",
      status: "open",
      ownerPersonId: actor.actorPersonId,
      programId: input.programId,
      siteId: "site",
      organizationId: "org",
      subjectType: "program",
      subjectId: input.programId,
      metadata: expect.objectContaining({
        requestedClassTitle: input.requestedClassTitle,
        requestedCourseOrSubject: input.requestedCourseOrSubject,
        desiredTerm: input.desiredTerm,
      }),
    }));
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledOnce();
  });

  it("rejects a program outside the teacher's explicit scope", async () => {
    state.requireActor.mockResolvedValue({
      ...actor,
      scope: { ...actor.scope, programIds: [] },
    });

    await expect(submitTeacherClassRequest({ data: input }))
      .rejects.toThrow("teacher class request program, site and organization scope");
    expect(state.tx.select).not.toHaveBeenCalled();
    expect(state.tx.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });

  it("treats a repeated request ID as an idempotent replay", async () => {
    const metadata = {
      requestedClassTitle: input.requestedClassTitle,
      requestedCourseOrSubject: input.requestedCourseOrSubject,
      desiredTerm: input.desiredTerm,
      schedulePreference: input.schedulePreference,
      notes: input.notes,
      requestOrigin: "teacher_classes",
    };
    state.selectRows = [[program], [{
      id: input.requestId,
      type: "section_creation_request",
      status: "open",
      ownerPersonId: actor.actorPersonId,
      programId: input.programId,
      subjectType: "program",
      subjectId: input.programId,
      metadata,
    }]];

    await expect(submitTeacherClassRequest({ data: input })).resolves.toEqual({
      requestId: input.requestId,
      replayed: true,
    });
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });

  it("rejects reusing a request ID for different class details", async () => {
    state.selectRows = [[program], [{
      id: input.requestId,
      type: "section_creation_request",
      status: "open",
      ownerPersonId: actor.actorPersonId,
      programId: input.programId,
      subjectType: "program",
      subjectId: input.programId,
      metadata: {
        requestedClassTitle: "Different class",
        requestedCourseOrSubject: input.requestedCourseOrSubject,
        desiredTerm: input.desiredTerm,
      },
    }]];

    await expect(submitTeacherClassRequest({ data: input }))
      .rejects.toThrow("Request identifier was already used for a different command");
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
});
