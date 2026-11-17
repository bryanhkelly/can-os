import { describe, expect, it, vi } from "vitest";
import { auditEvents, domainEvents } from "@/db/canonical-v301";
import { emitCanonicalDomainEvent, writeCanonicalAudit } from "@/platform/canonical-mutation.server";

function fakeTransaction() {
  const values = vi.fn(async (_input: unknown) => undefined);
  const insert = vi.fn((_table: unknown) => ({ values }));
  return { tx: { insert } as never, insert, values };
}

describe("canonical mutation evidence writers", () => {
  it("writes audit evidence using the caller's transaction", async () => {
    const { tx, insert, values } = fakeTransaction();
    const entry = {
      actorPersonId: "00000000-0000-4000-8000-000000000001",
      eventCode: "test.audit",
      entityKind: "class_enrollment",
      entityId: "00000000-0000-4000-8000-000000000002",
      payload: { from: "native_class" },
    };
    await writeCanonicalAudit(tx, entry);
    expect(insert).toHaveBeenCalledWith(auditEvents);
    expect(values).toHaveBeenCalledWith(entry);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("emits a domain event using the same transaction", async () => {
    const { tx, insert, values } = fakeTransaction();
    const entry = {
      eventType: "TestEnrollmentCreated",
      aggregateType: "class_enrollment",
      aggregateId: "00000000-0000-4000-8000-000000000003",
      payload: { classId: "00000000-0000-4000-8000-000000000004" },
    };
    await emitCanonicalDomainEvent(tx, entry);
    expect(insert).toHaveBeenCalledWith(domainEvents);
    expect(values).toHaveBeenCalledWith(entry);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("propagates errors to the business transaction", async () => {
    const failure = new Error("transaction aborted");
    const tx = { insert: () => ({ values: async () => { throw failure; } }) } as never;
    await expect(writeCanonicalAudit(tx, {
      eventCode: "test.failure",
      entityKind: "noncredit_registration",
      entityId: "00000000-0000-4000-8000-000000000005",
    })).rejects.toBe(failure);
    await expect(emitCanonicalDomainEvent(tx, {
      eventType: "TestFailure",
      aggregateType: "noncredit_registration",
      aggregateId: "00000000-0000-4000-8000-000000000005",
    })).rejects.toBe(failure);
  });
});
