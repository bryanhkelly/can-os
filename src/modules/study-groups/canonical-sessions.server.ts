import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { recordAudit, type Actor } from "@/modules/identity/actors.server";
import { validateSession } from "@/domain/study-groups";
import { facilitatedGroup } from "./canonical-membership.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function notifyMembers(tx: Tx, groupId: string, title: string, body: string, sessionId: string) {
  const members = await tx.select({ personId: s.studyGroupMemberships.personId })
    .from(s.studyGroupMemberships).where(and(
      eq(s.studyGroupMemberships.groupId, groupId),
      eq(s.studyGroupMemberships.status, "approved")));
  if (!members.length) return;
  await tx.insert(s.notifications).values(members.map(member => ({
    recipientPersonId: member.personId, status: "unread" as const,
    type: "study_group_session_update", title, body,
    resourceType: "study_group_session", resourceId: sessionId,
  })));
}

export type ReviseGroupSessionInput =
  | { action: "cancel"; sessionId: string }
  | { action: "reschedule"; sessionId: string; startsAt: string; endsAt: string };

/** Session reschedule/cancel core, callable by the server boundary and by integration tests with a verified actor. */
export async function reviseGroupSessionForActor(actor: Actor, data: ReviseGroupSessionInput) {
  const times = data.action === "reschedule"
    ? validateSession(data.startsAt, data.endsAt) : null;
  if (times && times.start <= new Date()) throw new Error("Choose a future session.");
  return db.transaction(async tx => {
    // Lock the canonical group first, then the session and event consistently
    // with session creation and roster decisions.
    const [owner] = await tx.select({ groupId: s.studyGroupSessions.groupId })
      .from(s.studyGroupSessions).where(eq(s.studyGroupSessions.id, data.sessionId)).limit(1);
    if (!owner) throw new Error("Session not found");
    const group = await facilitatedGroup(tx, actor, owner.groupId);
    const [session] = await tx.select().from(s.studyGroupSessions)
      .where(and(eq(s.studyGroupSessions.id, data.sessionId),
        eq(s.studyGroupSessions.groupId, group.id))).for("update").limit(1);
    if (!session || session.startsAt <= new Date()) throw new Error("Only future sessions can be changed");
    const [event] = await tx.select().from(s.calendarEvents)
      .where(and(eq(s.calendarEvents.sourceType, "study_group_session"),
        eq(s.calendarEvents.sourceId, session.id))).for("update").limit(1);
    if (!event || event.metadata.cancelled === true) throw new Error("Session already cancelled or missing calendar event");
    if (data.action === "reschedule" && times) {
      if (times.start.getTime() === session.startsAt.getTime() &&
          times.end.getTime() === session.endsAt.getTime()) return { saved: true };
      await tx.update(s.studyGroupSessions).set({
        startsAt: times.start, endsAt: times.end, updatedAt: new Date(),
      }).where(eq(s.studyGroupSessions.id, session.id));
      await tx.update(s.calendarEvents).set({
        startsAt: times.start, endsAt: times.end, updatedAt: new Date(),
      }).where(eq(s.calendarEvents.id, event.id));
    } else {
      await tx.update(s.calendarEvents).set({
        metadata: { ...event.metadata, cancelled: true, cancelledAt: new Date().toISOString() },
        updatedAt: new Date(),
      }).where(eq(s.calendarEvents.id, event.id));
    }
    await notifyMembers(tx, group.id,
      data.action === "cancel" ? "Study group session cancelled" : "Study group session rescheduled",
      data.action === "cancel"
        ? "Your facilitator cancelled " + session.title + "."
        : "New start time: " + times!.start.toISOString(), session.id);
    await recordAudit(tx, actor, {
      action: "study_group.session." + data.action, resourceType: "study_group_session",
      resourceId: session.id, scope: { siteId: group.siteId, programId: group.programId },
      before: { startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString() },
      after: data.action === "cancel" ? { cancelled: true } : {
        startsAt: times!.start.toISOString(), endsAt: times!.end.toISOString(),
      },
    });
    await tx.insert(s.domainEvents).values({
      eventType: data.action === "cancel" ? "StudyGroupSessionCancelled" : "StudyGroupSessionRescheduled",
      aggregateType: "study_group_session", aggregateId: session.id,
      actorPersonId: actor.actorPersonId, payload: { groupId: group.id, calendarEventId: event.id },
    });
    return { saved: true };
  });
}
