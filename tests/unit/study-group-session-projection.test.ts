import { beforeEach, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import type { Actor } from "@/modules/identity/actors.server";
import { createCanonicalGroupSession } from "@/modules/study-groups/canonical-sessions.functions";
import { reviseGroupSessionForActor } from "@/modules/study-groups/canonical-sessions.server";

const {
  transaction, select, insert, update, values, set, requireActor, recordAudit,
  facilitatedGroup, publishProjection, rescheduleProjection, cancelProjection, emitEvent, notifyMany,
} = vi.hoisted(() => ({
  transaction: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(),
  values: vi.fn(), set: vi.fn(), requireActor: vi.fn(), recordAudit: vi.fn(),
  facilitatedGroup: vi.fn(), publishProjection: vi.fn(), rescheduleProjection: vi.fn(),
  cancelProjection: vi.fn(), emitEvent: vi.fn(), notifyMany: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction } }));
vi.mock("@/modules/identity/actors.server", () => ({ requireActor, recordAudit }));
vi.mock("@/modules/study-groups/canonical-membership.server", () => ({
  facilitatedGroup, assertGroupScope: vi.fn(), eligibleStudent: vi.fn(),
}));
vi.mock("@/platform/calendar/projection", () => ({
  publishProjection, rescheduleProjection, cancelProjection,
}));
vi.mock("@/platform/mutation", () => ({ emitEvent, notifyMany }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: unknown) { return callback; },
  }),
}));

function rows(data: unknown[]) {
  const result = Promise.resolve(data);
  return {
    from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
}

const actor: Actor = {
  accountId: "account", sessionId: "auth-session", grantId: "grant",
  actorPersonId: "teacher", role: "teacher", capabilities: new Set(),
  scope: { siteIds: ["site"], programIds: ["program"] }, requestId: "request",
};
const group = { id: "group", siteId: "site", programId: "program", sectionId: "section" };
const startsAt = new Date(Date.now() + 86400000);
const endsAt = new Date(startsAt.getTime() + 3600000);
const session = { id: "session", groupId: group.id, title: "Study session", startsAt, endsAt };
const tx = { select, insert, update };
const source = { sourceType: "study_group_session", sourceId: session.id };
const reschedule = {
  action: "reschedule" as const, sessionId: session.id,
  startsAt: new Date(startsAt.getTime() + 86400000).toISOString(),
  endsAt: new Date(endsAt.getTime() + 86400000).toISOString(),
};

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(callback => callback(tx));
  requireActor.mockResolvedValue(actor);
  facilitatedGroup.mockResolvedValue(group);
  insert.mockReturnValue({ values });
  values.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: session.id }]) });
  update.mockReturnValue({ set });
  set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  publishProjection.mockResolvedValue("calendar-event");
  rescheduleProjection.mockResolvedValue("calendar-event");
  cancelProjection.mockResolvedValue(true);
});

function revisionRows(metadata: Record<string, unknown> = {}) {
  select.mockReturnValueOnce(rows([{ groupId: group.id }]))
    .mockReturnValueOnce(rows([session]))
    .mockReturnValueOnce(rows([{ id: "calendar-event", metadata }]))
    .mockReturnValueOnce(rows([{ personId: "member" }]));
}

describe("study group session calendar projections", () => {
  it("publishes with source identity, scope and timezone in the session transaction", async () => {
    select.mockReturnValueOnce(rows([{ timezone: "America/Los_Angeles" }]))
      .mockReturnValueOnce(rows([{ personId: "member" }]));
    await expect(createCanonicalGroupSession({ data: {
      groupId: group.id, title: session.title, agenda: "Review", location: "Room 1",
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    } })).resolves.toEqual({ sessionId: session.id });
    expect(facilitatedGroup).toHaveBeenCalledWith(tx, actor, group.id);
    expect(insert).toHaveBeenCalledExactlyOnceWith(s.studyGroupSessions);
    expect(publishProjection).toHaveBeenCalledExactlyOnceWith(tx, {
      ...source, type: "study_group", title: session.title, description: "Review",
      startsAt, endsAt, timezone: "America/Los_Angeles",
      scope: { siteId: group.siteId, programId: group.programId, sectionId: group.sectionId },
      createdByPersonId: actor.actorPersonId,
    });
    expect(recordAudit).toHaveBeenCalledWith(tx, actor, expect.objectContaining({
      action: "study_group.session.create",
      after: expect.objectContaining({ calendarEventId: "calendar-event" }),
    }));
    expect(emitEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "StudyGroupSessionCreated",
      payload: { groupId: group.id, calendarEventId: "calendar-event" },
    }));
    expect(notifyMany).toHaveBeenCalledOnce();
  });

  it("reschedules through the projection service without directly updating calendar rows", async () => {
    revisionRows();
    await expect(reviseGroupSessionForActor(actor, reschedule)).resolves.toEqual({ saved: true });
    expect(rescheduleProjection).toHaveBeenCalledExactlyOnceWith(tx, {
      ...source, startsAt: new Date(reschedule.startsAt), endsAt: new Date(reschedule.endsAt),
    });
    expect(update).toHaveBeenCalledExactlyOnceWith(s.studyGroupSessions);
    expect(cancelProjection).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledOnce();
    expect(emitEvent).toHaveBeenCalledOnce();
    expect(notifyMany).toHaveBeenCalledOnce();
  });

  it("cancels through the projection service and retains owning-workflow evidence", async () => {
    revisionRows();
    await reviseGroupSessionForActor(actor, { action: "cancel", sessionId: session.id });
    expect(cancelProjection).toHaveBeenCalledExactlyOnceWith(tx, source);
    expect(update).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(tx, actor, expect.objectContaining({
      action: "study_group.session.cancel", after: { cancelled: true },
    }));
    expect(emitEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "StudyGroupSessionCancelled",
      payload: { groupId: group.id, calendarEventId: "calendar-event" },
    }));
    expect(notifyMany).toHaveBeenCalledOnce();
  });

  it("keeps an identical reschedule a no-op", async () => {
    revisionRows();
    await reviseGroupSessionForActor(actor, {
      action: "reschedule", sessionId: session.id,
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    });
    expect(rescheduleProjection).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it.each(["cancel", "reschedule"] as const)("rejects %s of a cancelled event", async action => {
    revisionRows({ cancelled: true });
    await expect(reviseGroupSessionForActor(actor, { ...reschedule, action }))
      .rejects.toThrow("Session already cancelled or missing calendar event");
    expect(cancelProjection).not.toHaveBeenCalled();
    expect(rescheduleProjection).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["cancel", "reschedule"] as const)("fails explicitly when the %s projection is missing", async action => {
    revisionRows();
    cancelProjection.mockResolvedValue(false);
    rescheduleProjection.mockResolvedValue(false);
    await expect(reviseGroupSessionForActor(actor, { ...reschedule, action }))
      .rejects.toThrow("Session calendar event missing");
    expect(recordAudit).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it("propagates publication errors before notifications or success evidence", async () => {
    select.mockReturnValueOnce(rows([{ timezone: "UTC" }]));
    publishProjection.mockRejectedValue(new Error("Projection failed"));
    await expect(createCanonicalGroupSession({ data: {
      groupId: group.id, title: session.title, agenda: "", location: "",
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    } })).rejects.toThrow("Projection failed");
    expect(recordAudit).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });
});
