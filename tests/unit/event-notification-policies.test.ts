import { describe, expect, it } from "vitest";
import { EventTypes } from "@/domain/event-types";
import {
  getNotificationPolicy,
  type DomainEventRecord,
} from "@/platform/notifications";
import {
  admissionsStageChangedPolicy,
  type AdmissionsStageChangedContext,
} from "@/platform/notifications/policies/admissions-stage-changed";
import {
  classAnnouncementPublishedPolicy,
  type ClassAnnouncementPublishedContext,
} from "@/platform/notifications/policies/class-announcement-published";
import {
  communicationMessageSentPolicy,
  type CommunicationMessageSentContext,
} from "@/platform/notifications/policies/communication-message-sent";
import "@/platform/notifications/policies";

/**
 * Minimal stand-in for the policy transaction: each select() consumes the
 * next queued row set; the chain is awaitable and limit() resolves the rows.
 */
function fakeTx(queue: unknown[][]) {
  const run = () => {
    const rows = queue.shift() ?? [];
    const builder: Record<string, unknown> = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => Promise.resolve(rows),
      then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return builder;
  };
  return { select: run } as never;
}

function event(partial: Partial<DomainEventRecord>): DomainEventRecord {
  return {
    id: "evt-1",
    aggregateType: "communication_thread",
    aggregateId: "thread-1",
    actorPersonId: "sender-1",
    payload: {},
    ...partial,
  } as DomainEventRecord;
}

describe("communicationMessageSentPolicy", () => {
  const context: CommunicationMessageSentContext = {
    threadId: "thread-1",
    threadSubject: "Placement question",
    senderPersonId: "sender-1",
    participantPersonIds: ["sender-1", "guardian-1", "teacher-1"],
  };

  it("notifies every thread participant except the sender with a thread deep link", () => {
    const plans = communicationMessageSentPolicy.plans(context, event({}));
    expect(plans.map((plan) => plan.recipientPersonId).sort()).toEqual(["guardian-1", "teacher-1"]);
    for (const plan of plans) {
      expect(plan).toMatchObject({
        type: "communication_message_received",
        resourceType: "communication_thread",
        resourceId: "thread-1",
      });
      expect(plan.title).toContain("Placement question");
    }
  });

  it("notifies all participants when the sender is unknown", () => {
    const plans = communicationMessageSentPolicy.plans(
      { ...context, senderPersonId: null },
      event({ actorPersonId: null }),
    );
    expect(plans).toHaveLength(3);
  });

  it("loads context from the common subset shared by all emission sites", async () => {
    const loaded = await communicationMessageSentPolicy.load(
      fakeTx([
        [{ id: "thread-1", subject: "Placement question" }],
        [{ personId: "sender-1" }, { personId: "guardian-1" }],
      ]),
      event({}),
    );
    expect(loaded).toEqual({
      threadId: "thread-1",
      threadSubject: "Placement question",
      senderPersonId: "sender-1",
      participantPersonIds: ["sender-1", "guardian-1"],
    });
  });

  it("fails soft when the aggregate is not a communication thread", async () => {
    await expect(
      communicationMessageSentPolicy.load(fakeTx([]), event({ aggregateType: "submission" })),
    ).resolves.toBeNull();
  });

  it("fails soft when the thread no longer exists", async () => {
    await expect(
      communicationMessageSentPolicy.load(fakeTx([[]]), event({})),
    ).resolves.toBeNull();
  });
});

describe("classAnnouncementPublishedPolicy", () => {
  const context: ClassAnnouncementPublishedContext = {
    threadId: "thread-9",
    announcementTitle: "Field trip Friday",
    sectionId: "section-1",
    sectionTitle: "Algebra I",
    publisherPersonId: "teacher-1",
    studentPersonIds: ["student-1", "student-2"],
    guardianPersonIds: ["guardian-1", "student-1"],
  };

  const threadRow = {
    id: "thread-9",
    subject: "Field trip Friday",
    contextType: "section",
    contextId: "section-1",
    metadata: { kind: "class_announcement" },
  };

  it("notifies the section roster and guardians, excluding the publisher, with the thread deep link", () => {
    const plans = classAnnouncementPublishedPolicy.plans(context, event({ actorPersonId: "teacher-1" }));
    expect(plans.map((plan) => plan.recipientPersonId).sort()).toEqual([
      "guardian-1",
      "student-1",
      "student-2",
    ]);
    for (const plan of plans) {
      expect(plan).toMatchObject({
        type: "class_announcement_published",
        resourceType: "communication_thread",
        resourceId: "thread-9",
      });
      expect(plan.title).toContain("Field trip Friday");
      expect(plan.body).toContain("Algebra I");
    }
  });

  it("resolves the roster through active section enrollments and verified guardians", async () => {
    const loaded = await classAnnouncementPublishedPolicy.load(
      fakeTx([
        [threadRow],
        [{ id: "section-1", title: "Algebra I" }],
        [{ personId: "student-1" }],
        [{ personId: "guardian-1" }],
      ]),
      event({ payload: { sectionId: "section-1" } }),
    );
    expect(loaded).toMatchObject({
      threadId: "thread-9",
      sectionId: "section-1",
      studentPersonIds: ["student-1"],
      guardianPersonIds: ["guardian-1"],
      publisherPersonId: "sender-1",
    });
  });

  it("fails soft for non-announcement threads and payload/section mismatch", async () => {
    await expect(
      classAnnouncementPublishedPolicy.load(
        fakeTx([[{ ...threadRow, metadata: { kind: "academic_conversation" } }]]),
        event({}),
      ),
    ).resolves.toBeNull();
    await expect(
      classAnnouncementPublishedPolicy.load(
        fakeTx([[threadRow]]),
        event({ payload: { sectionId: "section-elsewhere" } }),
      ),
    ).resolves.toBeNull();
  });

  it("fails soft when the thread or section is gone", async () => {
    await expect(classAnnouncementPublishedPolicy.load(fakeTx([[]]), event({}))).resolves.toBeNull();
    await expect(
      classAnnouncementPublishedPolicy.load(fakeTx([[threadRow], []]), event({})),
    ).resolves.toBeNull();
  });
});

describe("admissionsStageChangedPolicy", () => {
  const context: AdmissionsStageChangedContext = {
    applicationId: "app-1",
    programId: "program-1",
    stage: "eligibility",
    decision: "accept",
    fromStage: "application",
    studentPersonId: "student-1",
    studentName: "Avery",
    guardianPersonIds: ["guardian-1", "guardian-1", "guardian-2"],
  };

  const applicationEvent = event({
    aggregateType: "application",
    aggregateId: "app-1",
    payload: { programId: "program-1", from: "application", to: "eligibility", decision: "accept" },
  });

  it("notifies each guardian once with the application deep link", () => {
    const plans = admissionsStageChangedPolicy.plans(context, applicationEvent);
    expect(plans.map((plan) => plan.recipientPersonId).sort()).toEqual(["guardian-1", "guardian-2"]);
    for (const plan of plans) {
      expect(plan).toMatchObject({
        type: "admissions_stage_changed",
        resourceType: "application",
        resourceId: "app-1",
      });
    }
  });

  it("renders decision-specific copy for accept and decline", () => {
    const accepted = admissionsStageChangedPolicy.plans(context, applicationEvent)[0];
    expect(accepted.title).toBe("Avery's application was accepted");
    expect(accepted.body).toContain("Admission offers");

    const declined = admissionsStageChangedPolicy.plans(
      { ...context, decision: "decline", stage: "declined" },
      applicationEvent,
    )[0];
    expect(declined.title).toBe("Avery's application was declined");
  });

  it("falls back to a stage-transition summary for other decisions", () => {
    const plan = admissionsStageChangedPolicy.plans(
      { ...context, decision: "eligibility" },
      applicationEvent,
    )[0];
    expect(plan.title).toBe("Admissions update for Avery");
    expect(plan.body).toContain("application");
    expect(plan.body).toContain("eligibility");
  });

  it("resolves guardians through the verified enrollment relationship", async () => {
    const loaded = await admissionsStageChangedPolicy.load(
      fakeTx([
        [{
          applicationId: "app-1",
          programId: "program-1",
          stage: "eligibility",
          studentPersonId: "student-1",
          studentPreferredName: "Avery",
          studentLegalFirstName: "Avery",
        }],
        [{ personId: "guardian-1" }],
      ]),
      applicationEvent,
    );
    expect(loaded).toMatchObject({
      applicationId: "app-1",
      decision: "accept",
      fromStage: "application",
      guardianPersonIds: ["guardian-1"],
    });
  });

  it("fails soft for non-application aggregates and missing applications", async () => {
    await expect(
      admissionsStageChangedPolicy.load(fakeTx([]), event({ aggregateType: "submission" })),
    ).resolves.toBeNull();
    await expect(
      admissionsStageChangedPolicy.load(fakeTx([[]]), applicationEvent),
    ).resolves.toBeNull();
  });
});

describe("notification policy registry", () => {
  it("resolves every new policy by event type", () => {
    expect(getNotificationPolicy(EventTypes.CommunicationMessageSent)).toBe(communicationMessageSentPolicy);
    expect(getNotificationPolicy(EventTypes.ClassAnnouncementPublished)).toBe(classAnnouncementPublishedPolicy);
    expect(getNotificationPolicy(EventTypes.AdmissionsStageChanged)).toBe(admissionsStageChangedPolicy);
  });
});
