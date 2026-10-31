import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents, domainEvents, insights } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { handleAcademicInterventionEvent } from "@/modules/learning/missing-assignment-event-handler";

const state = vi.hoisted(() => ({
  event: undefined as Record<string, unknown> | undefined,
  inserted: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  updated: [] as Array<unknown>,
  context: {
    studentName: "Ada",
    assessmentTitle: "Essay",
    studentProfileId: "sp1",
    studentPersonId: "p1",
    organizationId: "org",
    siteId: "site",
    programId: "prog",
    sectionId: "sec",
    submissionId: "sub",
    assessmentId: "ass",
    guardianPersonIds: [] as string[],
  },
}));

vi.mock("@/db/client", () => ({
  db: {
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => (state.event ? [state.event] : []) }),
          }),
        }),
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            state.inserted.push({ table, values });
            return {
              returning: async () => [{ id: "00000000-0000-4000-8000-0000000000aa" }],
            };
          },
        }),
        update: () => ({
          set: (values: unknown) => {
            state.updated.push(values);
            return { where: async () => [] };
          },
        }),
      }),
  },
}));
vi.mock("@/platform/notifications", () => ({
  applyNotificationPolicy: vi.fn(async () => undefined),
}));
vi.mock("@/platform/notifications/policies", () => ({
  assignmentMissingPolicy: { load: async () => state.context },
}));
vi.mock("@/modules/communication/notification-email.server", () => ({
  emailNotificationRecipients: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));

beforeEach(() => {
  state.event = {
    id: "evt-1",
    status: "processing",
    eventType: EventTypes.AssignmentBecameMissing,
  };
  state.inserted = [];
  state.updated = [];
});

describe("missing-assignment insight evidence", () => {
  it("writes an audit row and emits InsightCreated alongside the insight", async () => {
    await handleAcademicInterventionEvent("evt-1");

    const insightInsert = state.inserted.find((row) => row.table === insights);
    expect(insightInsert?.values).toMatchObject({
      type: "missing_assignment",
      subjectType: "student_profile",
      subjectId: "sp1",
    });

    const eventInsert = state.inserted.find((row) => row.table === domainEvents);
    expect(eventInsert?.values).toMatchObject({
      eventType: EventTypes.InsightCreated,
      aggregateType: "insight",
      aggregateId: "00000000-0000-4000-8000-0000000000aa",
      actorPersonId: null,
    });
    expect(eventInsert?.values.payload).toMatchObject({
      insightType: "missing_assignment",
      subjectId: "sp1",
      sourceEventId: "evt-1",
      organizationId: "org",
    });

    const auditInsert = state.inserted.find((row) => row.table === auditEvents);
    expect(auditInsert?.values).toMatchObject({
      action: "insight.created",
      resourceType: "insight",
      resourceId: "00000000-0000-4000-8000-0000000000aa",
      actorPersonId: null,
    });
  });

  it("does not emit evidence for an already-processed event", async () => {
    state.event = {
      id: "evt-1",
      status: "processed",
      eventType: EventTypes.AssignmentBecameMissing,
    };
    await handleAcademicInterventionEvent("evt-1");
    expect(state.inserted).toEqual([]);
  });
});
