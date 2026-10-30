import { describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import {
  applyNotificationPolicy,
  getNotificationPolicy,
  type DomainEventRecord,
} from "@/platform/notifications";
import {
  assignmentMissingPolicy,
  type AssignmentMissingContext,
} from "@/platform/notifications/policies/assignment-missing";
import "@/platform/notifications/policies";
import type { InsertChain, MutationTx } from "@/platform/mutation";

const event = {
  id: "evt-1",
  eventType: EventTypes.AssignmentBecameMissing,
} as DomainEventRecord;

const context: AssignmentMissingContext = {
  submissionId: "sub-1",
  assessmentId: "assess-1",
  assessmentTitle: "Algebra Quiz",
  sectionId: "section-1",
  organizationId: "org-1",
  siteId: "site-1",
  programId: "program-1",
  studentProfileId: "profile-1",
  studentPersonId: "student-1",
  studentName: "Avery",
  guardianPersonIds: ["guardian-1", "guardian-2"],
  teacherPersonIds: ["teacher-1"],
};

describe("assignmentMissingPolicy.plans", () => {
  it("notifies student, guardians, and teachers with role-appropriate copy", () => {
    const plans = assignmentMissingPolicy.plans(context, event);
    expect(plans).toHaveLength(4);

    const student = plans.find((p) => p.recipientPersonId === "student-1");
    expect(student).toMatchObject({
      type: "missing_assignment",
      title: "Algebra Quiz is missing",
      body: "Submit the assignment when ready. If you need help, contact your teacher.",
      resourceType: "submission",
      resourceId: "sub-1",
    });

    const guardian = plans.find((p) => p.recipientPersonId === "guardian-1");
    expect(guardian?.body).toBe(
      "Avery has a missing assignment that may need follow-up.",
    );

    const teacher = plans.find((p) => p.recipientPersonId === "teacher-1");
    expect(teacher?.body).toBe(guardian?.body);
  });

  it("deduplicates a person who is both guardian and teacher", () => {
    const plans = assignmentMissingPolicy.plans(
      { ...context, teacherPersonIds: ["guardian-1"] },
      event,
    );
    expect(plans.map((p) => p.recipientPersonId).sort()).toEqual([
      "guardian-1",
      "guardian-2",
      "student-1",
    ]);
  });
});

describe("applyNotificationPolicy", () => {
  function makeFakeTx() {
    const calls: Array<{ table: unknown; values: unknown }> = [];
    const tx: MutationTx = {
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) {
            calls.push({ table, values });
            const list = Array.isArray(values) ? values : [values];
            const chain: InsertChain = {
              returning() {
                return Promise.resolve(list.map((_, i) => ({ id: `notif-${i}` })));
              },
              then(onfulfilled, onrejected) {
                return Promise.resolve(undefined).then(onfulfilled, onrejected);
              },
            };
            return chain;
          },
        };
      },
    };
    return { tx, calls };
  }

  it("writes one notification per plan, linked to the originating event", async () => {
    const { tx, calls } = makeFakeTx();
    const ids = await applyNotificationPolicy(
      tx as Parameters<typeof applyNotificationPolicy>[0],
      event,
      assignmentMissingPolicy,
      context,
    );
    expect(ids).toHaveLength(4);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(notifications);
    const rows = calls[0].values as Array<Record<string, unknown>>;
    expect(rows.every((row) => row.eventId === "evt-1")).toBe(true);
    expect(rows.every((row) => row.type === "missing_assignment")).toBe(true);
  });

  it("writes nothing when the policy produces no plans", async () => {
    const { tx, calls } = makeFakeTx();
    const ids = await applyNotificationPolicy(
      tx as Parameters<typeof applyNotificationPolicy>[0],
      event,
      { eventType: event.eventType, load: async () => ({}), plans: () => [] },
      {},
    );
    expect(ids).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("policy registry", () => {
  it("resolves the registered assignment-missing policy by event type", () => {
    expect(getNotificationPolicy(EventTypes.AssignmentBecameMissing)).toBe(
      assignmentMissingPolicy,
    );
  });

  it("returns undefined for event types without a policy", () => {
    expect(getNotificationPolicy("NoSuchEvent")).toBeUndefined();
  });
});
