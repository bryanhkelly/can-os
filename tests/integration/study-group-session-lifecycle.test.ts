import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  calendarEvents,
  domainEvents,
  notifications,
  organizations,
  people,
  sites,
  studyGroups,
  studyGroupMemberships,
  studyGroupSessions,
} from "@/db/schema";
import { reviseGroupSessionForActor } from "@/modules/study-groups/canonical-sessions.server";
import type { Actor } from "@/modules/identity/actors.server";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * GF26 canonical session lifecycle: reschedule propagates to the canonical
 * calendar event and notifies approved members exactly once, cancellation
 * marks the calendar event and blocks further changes, and a non-facilitator
 * teacher is denied before any mutation. Self-contained fixtures; safe to
 * re-run on the disposable branch.
 */
integration("GF26 real Neon session lifecycle", () => {
  it("reschedules with matching calendar, sends one notice, then cancels and blocks repeat changes", async () => {
    if (process.env.APP_ENV !== "test" || process.env.CAN_TEST_DB_WRITES_ENABLED !== "true")
      throw new Error("Disposable test branch required");

    const suffix = crypto.randomUUID().slice(0, 8);

    const [org] = await db.insert(organizations).values({
      type: "christian_school", name: `GF26 School ${suffix}`, slug: `gf26-${suffix}`,
    }).returning();
    const [site] = await db.insert(sites).values({
      organizationId: org!.id, name: "Main Campus", slug: `gf26-main-${suffix}`,
    }).returning();
    const [facilitator, member, otherTeacher] = await db.insert(people).values([
      { legalFirstName: "Riley", legalLastName: `Facilitator-${suffix}` },
      { legalFirstName: "Jordan", legalLastName: `Member-${suffix}` },
      { legalFirstName: "Alex", legalLastName: `Outsider-${suffix}` },
    ]).returning();

    const [group] = await db.insert(studyGroups).values({
      title: `GF26 Group ${suffix}`, description: "Synthetic lifecycle group",
      kind: "study", siteId: site!.id, facilitatorPersonId: facilitator!.id,
      metadata: { synthetic: true, fixture: "gf26-lifecycle" },
    }).returning();

    const startsAt = new Date(Date.now() + 14 * 86400000);
    const endsAt = new Date(startsAt.getTime() + 3600000);
    const [session] = await db.insert(studyGroupSessions).values({
      groupId: group!.id, title: "Lifecycle session", agenda: "Review",
      startsAt, endsAt,
    }).returning();
    const [event] = await db.insert(calendarEvents).values({
      type: "study_group", title: "Lifecycle session",
      startsAt, endsAt, timezone: site!.timezone,
      siteId: site!.id, sourceType: "study_group_session", sourceId: session!.id,
      createdByPersonId: facilitator!.id,
    }).returning();
    await db.insert(studyGroupMemberships).values({
      groupId: group!.id, personId: member!.id, role: "member", status: "approved",
    });

    const actor: Actor = {
      accountId: `acct-${suffix}`, sessionId: `sess-${suffix}`, grantId: `grant-${suffix}`,
      actorPersonId: facilitator!.id, role: "teacher",
      capabilities: new Set(["study-groups:facilitate"]),
      scope: { siteIds: [site!.id] },
      requestId: `gf26-${suffix}`,
    };
    const outsiderActor: Actor = { ...actor, actorPersonId: otherTeacher!.id };

    // A teacher who does not facilitate the group is denied before any mutation.
    await expect(
      reviseGroupSessionForActor(outsiderActor, { action: "cancel", sessionId: session!.id }),
    ).rejects.toThrow("active facilitated group");

    const newStart = new Date(startsAt.getTime() + 7 * 86400000);
    const newEnd = new Date(endsAt.getTime() + 7 * 86400000);
    await reviseGroupSessionForActor(actor, {
      action: "reschedule", sessionId: session!.id,
      startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(),
    });

    const [updated] = await db.select().from(studyGroupSessions)
      .where(eq(studyGroupSessions.id, session!.id));
    expect(updated!.startsAt.toISOString()).toBe(newStart.toISOString());
    expect(updated!.endsAt.toISOString()).toBe(newEnd.toISOString());
    const [movedEvent] = await db.select().from(calendarEvents)
      .where(eq(calendarEvents.id, event!.id));
    expect(movedEvent!.startsAt.toISOString()).toBe(newStart.toISOString());
    expect(movedEvent!.endsAt?.toISOString()).toBe(newEnd.toISOString());

    const memberNotices = () => db.select().from(notifications).where(and(
      eq(notifications.resourceType, "study_group_session"),
      eq(notifications.resourceId, session!.id),
      eq(notifications.recipientPersonId, member!.id),
    ));
    const afterReschedule = await memberNotices();
    expect(afterReschedule).toHaveLength(1);
    expect(afterReschedule[0]!.type).toBe("study_group_session_update");
    expect(afterReschedule[0]!.title).toBe("Study group session rescheduled");

    // Repeating the same reschedule is a no-op: no duplicate notice.
    await reviseGroupSessionForActor(actor, {
      action: "reschedule", sessionId: session!.id,
      startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(),
    });
    expect(await memberNotices()).toHaveLength(1);

    await reviseGroupSessionForActor(actor, { action: "cancel", sessionId: session!.id });
    const [cancelledEvent] = await db.select().from(calendarEvents)
      .where(eq(calendarEvents.id, event!.id));
    expect(cancelledEvent!.metadata.cancelled).toBe(true);
    const afterCancel = await memberNotices();
    expect(afterCancel).toHaveLength(2);
    expect(afterCancel.map((n) => n.title).sort()).toEqual([
      "Study group session cancelled", "Study group session rescheduled",
    ]);

    await expect(
      reviseGroupSessionForActor(actor, { action: "cancel", sessionId: session!.id }),
    ).rejects.toThrow("Session already cancelled or missing calendar event");

    // Every mutation left an audit row and a domain event.
    const audits = await db.select().from(auditEvents).where(and(
      eq(auditEvents.resourceType, "study_group_session"),
      eq(auditEvents.resourceId, session!.id),
    ));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "study_group.session.cancel", "study_group.session.reschedule",
    ]);
    const events = await db.select().from(domainEvents).where(and(
      eq(domainEvents.aggregateType, "study_group_session"),
      eq(domainEvents.aggregateId, session!.id),
    ));
    expect(events.map((e) => e.eventType).sort()).toEqual([
      "StudyGroupSessionCancelled", "StudyGroupSessionRescheduled",
    ]);
  });
});
