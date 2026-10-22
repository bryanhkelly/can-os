import { describe, expect, it } from "vitest";
import { auditEvents, domainEvents, notifications } from "@/db/schema";
import type { CommandContext } from "@/domain/command-context";
import { emitEvent, notify, notifyMany, writeAudit, type InsertChain, type MutationTx } from "@/platform/mutation";

type InsertCall = { table: unknown; values: unknown };

function makeFakeTx(returnedId = "11111111-1111-1111-1111-111111111111") {
  const calls: InsertCall[] = [];
  const tx: MutationTx = {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) {
          calls.push({ table, values });
          const chain: InsertChain = {
            returning() {
              return Promise.resolve((Array.isArray(values) ? values : [values]).map(() => ({ id: returnedId })));
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

const context: CommandContext = {
  actorPersonId: "person-1",
  capabilities: new Set(),
  scope: {},
  requestId: "req-1",
};

describe("emitEvent", () => {
  it("inserts a domain_events row from its inputs and returns the id", async () => {
    const { tx, calls } = makeFakeTx("event-1");
    const id = await emitEvent(tx, {
      eventType: "FieldTripApproved",
      aggregateType: "field_trip",
      aggregateId: "trip-1",
      actorPersonId: "person-1",
      payload: { siteId: "site-1" },
    });
    expect(id).toBe("event-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(domainEvents);
    expect(calls[0].values).toEqual({
      eventType: "FieldTripApproved",
      aggregateType: "field_trip",
      aggregateId: "trip-1",
      actorPersonId: "person-1",
      payload: { siteId: "site-1" },
    });
  });

  it("merges provided scope ids into the payload, with explicit payload keys winning", async () => {
    const { tx, calls } = makeFakeTx();
    await emitEvent(tx, {
      eventType: "StudentMarkedAbsent",
      aggregateType: "attendance_event",
      aggregateId: "att-1",
      siteId: "site-9",
      programId: "prog-9",
      payload: { siteId: "site-1", status: "absent" },
    });
    expect(calls[0].values).toMatchObject({
      actorPersonId: null,
      payload: { siteId: "site-1", programId: "prog-9", status: "absent" },
    });
  });
});

describe("writeAudit", () => {
  it("preserves exact verified identity attribution without inventing request context", async () => {
    const { tx, calls } = makeFakeTx();
    const entry = {
      actorPersonId: "person-1", action: "identity.session.started",
      resourceType: "account", resourceId: "account-1",
      context: { accountId: "account-1", sessionId: "session-1", role: "teacher" },
    };
    await writeAudit(tx, entry);
    expect(calls[0]?.values).toEqual(entry);
  });
  it("inserts an audit_events row carrying actor, scope and request context", async () => {
    const { tx, calls } = makeFakeTx();
    await writeAudit(tx, context, {
      action: "field_trip.approve",
      entityType: "field_trip",
      entityId: "trip-1",
      scope: { siteId: "site-1" },
      before: { status: "proposed" },
      after: { status: "approved" },
      contextExtras: { sourceKey: "abc" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(auditEvents);
    expect(calls[0].values).toEqual({
      actorPersonId: "person-1",
      action: "field_trip.approve",
      resourceType: "field_trip",
      resourceId: "trip-1",
      scope: { siteId: "site-1" },
      before: { status: "proposed" },
      after: { status: "approved" },
      context: { requestId: "req-1", sourceKey: "abc" },
    });
  });

  it("attributes authenticated generic mutations without letting caller extras spoof verified identity", async () => {
    const { tx, calls } = makeFakeTx();
    await writeAudit(tx, {
      ...context, accountId: "account-1", sessionId: "session-1",
      grantId: "grant-1", role: "teacher",
    }, {
      action: "classroom.assignment.grade", entityType: "submission",
      entityId: "submission-1",
      contextExtras: { accountId: "spoofed", sessionId: "spoofed",
        grantId: "spoofed", role: "registrar", requestId: "spoofed", legitimate: true },
    });
    expect(calls[0]?.values).toMatchObject({
      actorPersonId: "person-1",
      context: { accountId: "account-1", sessionId: "session-1",
        grantId: "grant-1", role: "teacher", requestId: "req-1", legitimate: true },
    });
  });
  it("defaults scope to {}, before/after to null and requestId to null", async () => {
    const { tx, calls } = makeFakeTx();
    await writeAudit(
      tx,
      { actorPersonId: "person-2", capabilities: new Set(), scope: {} },
      { action: "attendance.excuse.submit", entityType: "attendance_excuse", entityId: "exc-1" },
    );
    expect(calls[0].values).toEqual({
      actorPersonId: "person-2",
      action: "attendance.excuse.submit",
      resourceType: "attendance_excuse",
      resourceId: "exc-1",
      scope: {},
      before: null,
      after: null,
      context: { requestId: null },
    });
  });
});

describe("notify", () => {
  it("inserts a notifications row from its inputs and returns the id", async () => {
    const { tx, calls } = makeFakeTx("notif-1");
    const id = await notify(tx, {
      recipientPersonId: "guardian-1",
      type: "student_absent",
      title: "Attendance needs your attention",
      body: "Your student was marked absent.",
      resourceType: "attendance_event",
      resourceId: "att-1",
    });
    expect(id).toBe("notif-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(notifications);
    expect(calls[0].values).toEqual([{
      recipientPersonId: "guardian-1",
      type: "student_absent",
      title: "Attendance needs your attention",
      body: "Your student was marked absent.",
      resourceType: "attendance_event",
      resourceId: "att-1",
      eventId: null,
    }]);
  });

  it("defaults optional columns to null", async () => {
    const { tx, calls } = makeFakeTx();
    await notify(tx, {
      recipientPersonId: "guardian-2",
      type: "generic",
      title: "Hello",
    });
    expect(calls[0].values).toEqual([{
      recipientPersonId: "guardian-2",
      type: "generic",
      title: "Hello",
      body: null,
      resourceType: null,
      resourceId: null,
      eventId: null,
    }]);
  });
});

describe("notifyMany", () => {
  it("fails explicitly instead of dropping missing notification IDs", async () => {
    const { tx } = makeFakeTx();
    tx.insert = () => ({ values: () => ({
      returning: () => Promise.resolve([{}]),
      then: Promise.resolve(undefined).then.bind(Promise.resolve(undefined)),
    }) });
    await expect(notifyMany(tx, [{ recipientPersonId: "p-1", type: "t", title: "One" }]))
      .rejects.toThrow("did not return an id");
  });
  it("inserts one row per recipient in a single call and returns ids", async () => {
    const { tx, calls } = makeFakeTx();
    const ids = await notifyMany(tx, [
      { recipientPersonId: "p-1", type: "t", title: "One" },
      { recipientPersonId: "p-2", type: "t", title: "Two", eventId: "evt-1" },
    ]);
    expect(ids).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "11111111-1111-1111-1111-111111111111",
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toHaveLength(2);
  });

  it("skips the insert entirely for an empty batch", async () => {
    const { tx, calls } = makeFakeTx();
    expect(await notifyMany(tx, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
