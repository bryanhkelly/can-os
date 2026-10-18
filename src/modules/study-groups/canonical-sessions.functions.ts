import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { recordAudit, requireActor, type Actor } from "@/modules/identity/actors.server";
import { validateSession } from "@/domain/study-groups";
import { assertGroupScope, eligibleStudent, facilitatedGroup } from "./canonical-membership.server";

const uuid = z.string().uuid();
const time = z.string().datetime({ offset: true });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function notifyMembers(tx: Tx, groupId: string, title: string, body: string, sessionId: string) {
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

export const createCanonicalGroupSession = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    groupId: uuid, title: z.string().trim().min(3).max(150),
    agenda: z.string().trim().max(2000).default(""),
    location: z.string().trim().max(200).default(""),
    startsAt: time, endsAt: time,
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"]);
    const times = validateSession(data.startsAt, data.endsAt);
    if (times.start <= new Date()) throw new Error("Choose a future session.");
    return db.transaction(async tx => {
      const group = await facilitatedGroup(tx, actor, data.groupId);
      if (!group.siteId) throw new AuthorizationError("school site");
      const [site] = await tx.select({ timezone: s.sites.timezone })
        .from(s.sites).where(eq(s.sites.id, group.siteId)).limit(1);
      if (!site) throw new Error("School timezone unavailable");
      const [session] = await tx.insert(s.studyGroupSessions).values({
        groupId: group.id, title: data.title, agenda: data.agenda,
        location: data.location, startsAt: times.start, endsAt: times.end,
      }).returning({ id: s.studyGroupSessions.id });
      if (!session) throw new Error("Unable to create study session");
      const [event] = await tx.insert(s.calendarEvents).values({
        type: "study_group", title: data.title, description: data.agenda,
        startsAt: times.start, endsAt: times.end, timezone: site.timezone,
        siteId: group.siteId, programId: group.programId,
        sectionId: group.sectionId, sourceType: "study_group_session",
        sourceId: session.id, createdByPersonId: actor.actorPersonId,
      }).returning({ id: s.calendarEvents.id });
      if (!event) throw new Error("Unable to create session calendar event");
      await notifyMembers(tx, group.id, "New study group session",
        "Your facilitator scheduled " + data.title + ".", session.id);
      await recordAudit(tx, actor, {
        action: "study_group.session.create", resourceType: "study_group_session",
        resourceId: session.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { startsAt: times.start.toISOString(), endsAt: times.end.toISOString(), calendarEventId: event.id },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "StudyGroupSessionCreated", aggregateType: "study_group_session",
        aggregateId: session.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, calendarEventId: event.id },
      });
      return { sessionId: session.id };
    });
  });

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

export const reviseCanonicalGroupSession = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.discriminatedUnion("action", [
    z.object({ action: z.literal("cancel"), sessionId: uuid }),
    z.object({ action: z.literal("reschedule"), sessionId: uuid,
      startsAt: time, endsAt: time }),
  ]).parse(value))
  .handler(async ({ data }) =>
    reviseGroupSessionForActor(await requireActor(["teacher"]), data));

export const rsvpCanonicalGroupSession = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    sessionId: uuid, rsvp: z.enum(["going", "maybe", "declined"]),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"]);
    return db.transaction(async tx => {
      const [row] = await tx.select({
        sessionId: s.studyGroupSessions.id, startsAt: s.studyGroupSessions.startsAt,
        id: s.studyGroups.id, groupId: s.studyGroups.id, siteId: s.studyGroups.siteId,
        programId: s.studyGroups.programId, sectionId: s.studyGroups.sectionId,
      }).from(s.studyGroupSessions)
        .innerJoin(s.studyGroups, eq(s.studyGroups.id, s.studyGroupSessions.groupId))
        .where(and(eq(s.studyGroupSessions.id, data.sessionId),
          eq(s.studyGroups.status, "active"))).limit(1);
      if (!row || row.startsAt <= new Date()) throw new Error("Upcoming session not found");
      assertGroupScope(actor, row);
      await eligibleStudent(tx, actor.actorPersonId, row, actor.scope.programIds ?? []);
      const [member] = await tx.select({ id: s.studyGroupMemberships.id })
        .from(s.studyGroupMemberships).where(and(
          eq(s.studyGroupMemberships.groupId, row.groupId),
          eq(s.studyGroupMemberships.personId, actor.actorPersonId),
          eq(s.studyGroupMemberships.status, "approved"))).limit(1);
      if (!member) throw new AuthorizationError("approved study group membership");
      const [event] = await tx.select({ metadata: s.calendarEvents.metadata })
        .from(s.calendarEvents).where(and(
          eq(s.calendarEvents.sourceType, "study_group_session"),
          eq(s.calendarEvents.sourceId, row.sessionId))).for("update").limit(1);
      if (!event || event.metadata.cancelled === true) throw new Error("Session cancelled or missing");
      await tx.insert(s.studyGroupSessionAttendance).values({
        sessionId: row.sessionId, personId: actor.actorPersonId, rsvp: data.rsvp,
      }).onConflictDoUpdate({
        target: [s.studyGroupSessionAttendance.sessionId, s.studyGroupSessionAttendance.personId],
        set: { rsvp: data.rsvp, updatedAt: new Date() },
      });
      await recordAudit(tx, actor, {
        action: "study_group.session.rsvp", resourceType: "study_group_session",
        resourceId: row.sessionId, scope: { siteId: row.siteId, programId: row.programId },
        after: { rsvp: data.rsvp },
      });
      return { saved: true };
    });
  });

export const recordCanonicalGroupAttendance = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    sessionId: uuid, studentPersonId: uuid, attended: z.boolean(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"]);
    return db.transaction(async tx => {
      const [owner] = await tx.select({ groupId: s.studyGroupSessions.groupId })
        .from(s.studyGroupSessions).where(eq(s.studyGroupSessions.id, data.sessionId)).limit(1);
      if (!owner) throw new Error("Session not found");
      const group = await facilitatedGroup(tx, actor, owner.groupId);
      const [session] = await tx.select().from(s.studyGroupSessions)
        .where(eq(s.studyGroupSessions.id, data.sessionId)).limit(1);
      if (!session || session.startsAt > new Date()) throw new Error("Attendance can only be recorded after a session starts");
      const [event] = await tx.select({ metadata: s.calendarEvents.metadata })
        .from(s.calendarEvents).where(and(
          eq(s.calendarEvents.sourceType, "study_group_session"),
          eq(s.calendarEvents.sourceId, session.id))).limit(1);
      if (!event || event.metadata.cancelled === true) throw new Error("Session was cancelled");
      const [member] = await tx.select({ id: s.studyGroupMemberships.id })
        .from(s.studyGroupMemberships).where(and(
          eq(s.studyGroupMemberships.groupId, group.id),
          eq(s.studyGroupMemberships.personId, data.studentPersonId),
          eq(s.studyGroupMemberships.status, "approved"))).limit(1);
      if (!member) throw new AuthorizationError("approved roster member");
      await tx.insert(s.studyGroupSessionAttendance).values({
        sessionId: session.id, personId: data.studentPersonId,
        rsvp: "going", attended: data.attended, recordedByPersonId: actor.actorPersonId,
      }).onConflictDoUpdate({
        target: [s.studyGroupSessionAttendance.sessionId, s.studyGroupSessionAttendance.personId],
        set: { attended: data.attended, recordedByPersonId: actor.actorPersonId, updatedAt: new Date() },
      });
      await recordAudit(tx, actor, {
        action: "study_group.session.attendance", resourceType: "study_group_session",
        resourceId: session.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { studentPersonId: data.studentPersonId, attended: data.attended },
      });
      return { saved: true };
    });
  });
