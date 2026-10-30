import { describe, expect, it, vi } from "vitest";
import {
  expectActiveEnrollmentKinds,
  expectAuditActionGroups,
  expectDomainEventsOnceForActors,
  expectNotification,
} from "../e2e/helpers/evidence-assertions";
import type { Sql } from "../e2e/fixture";

function mockSql(...results: unknown[][]) {
  const query = vi.fn();
  for (const result of results) query.mockResolvedValueOnce(result);
  return { sql: { query } as unknown as Sql, query };
}

describe("shared database evidence assertions", () => {
  it("accepts immediate notification evidence with the canonical recipient, type and resource", async () => {
    const { sql, query } = mockSql([{ id: "notification-id" }]);

    await expectNotification(sql, {
      recipientPersonId: "guardian-id",
      type: "missing_assignment",
      resourceId: "submission-id",
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("from notifications"), [
      "guardian-id", "missing_assignment", "submission-id",
    ]);
  });

  it("polls until asynchronous notification evidence arrives", async () => {
    const { sql, query } = mockSql([], [{ id: "notification-id" }]);

    await expectNotification(sql, {
      recipientPersonId: "guardian-id",
      type: "grade_posted",
      resourceId: "submission-id",
    });

    expect(query).toHaveBeenCalledTimes(2);
  });

  it("requires exactly one requested domain event per authorized actor scope", async () => {
    const { sql } = mockSql([
      { event_type: "AdmissionOfferIssued" },
      { event_type: "AdmissionOfferAccepted" },
      { event_type: "EnrollmentActivated" },
      { event_type: "UnrelatedEvent" },
    ]);

    await expect(expectDomainEventsOnceForActors(sql, {
      actorPersonIds: ["guardian-id", "registrar-id"],
      eventTypes: ["AdmissionOfferIssued", "AdmissionOfferAccepted", "EnrollmentActivated"],
    })).resolves.toBeUndefined();
  });

  it("rejects duplicate domain-event evidence instead of merely finding one", async () => {
    const { sql } = mockSql([
      { event_type: "EnrollmentActivated" },
      { event_type: "EnrollmentActivated" },
    ]);

    await expect(expectDomainEventsOnceForActors(sql, {
      actorPersonIds: ["registrar-id"],
      eventTypes: ["EnrollmentActivated"],
    })).rejects.toThrow();
  });

  it("accepts canonical audit-action alternatives without weakening other groups", async () => {
    const { sql, query } = mockSql([
      { action: "submission.submit" },
      { action: "assignment.grade" },
    ]);

    await expectAuditActionGroups(sql, {
      resourceType: "submission",
      resourceIds: ["submission-id"],
      groups: [
        ["assignment.submit", "submission.submit"],
        ["assignment.grade", "submission.grade"],
      ],
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("resource_type = $1"), [
      "submission", ["submission-id"],
    ]);
  });

  it("fails when one logical audit-action group is absent", async () => {
    const { sql } = mockSql([{ action: "submission.submit" }]);

    await expect(expectAuditActionGroups(sql, {
      resourceIds: ["submission-id"],
      groups: [
        ["assignment.submit", "submission.submit"],
        ["assignment.grade", "submission.grade"],
      ],
    })).rejects.toThrow();
  });

  it("requires the exact ordered active enrollment-kind projection", async () => {
    const { sql } = mockSql([{ kind: "program" }, { kind: "section" }]);

    await expect(expectActiveEnrollmentKinds(sql, {
      studentProfileId: "student-profile-id",
      kinds: ["program", "section"],
    })).resolves.toBeUndefined();
  });
});
