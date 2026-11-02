import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { validateSession } from "@/domain/study-groups";
import { recordAudit,requireActor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { publishProjection } from "@/platform/calendar/projection";
import { createServerFn } from "@tanstack/react-start";
import { and,eq } from "drizzle-orm";
import { z } from "zod";
import { assertGroupScope,eligibleStudent,facilitatedGroup } from "./canonical-membership.server";
import { notifyMembers,reviseGroupSessionForActor } from "./canonical-sessions.server";

import { EventTypes } from "@/domain/event-types";
const uuid = z.string().uuid();
const time = z.string().datetime({ offset: true });

/** Facilitator-facing roster for one session: every approved member, with any RSVP/attendance row. */
export const listCanonicalGroupAttendance = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ sessionId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"]);
    return db.transaction(async tx => {
      const [owner] = await tx.select({ groupId: s.studyGroupSessions.groupId })
        .from(s.studyGroupSessions).where(eq(s.studyGroupSessions.id, data.sessionId)).limit(1);
      if (!owner) throw new Error("Session not found");
      const group = await facilitatedGroup(tx, actor, owner.groupId);
      // The roster includes every approved member, even when they never RSVP'd.
      // Attendance recording must not depend on having an existing RSVP row.
      return tx.select({
        personId: s.studyGroupMemberships.personId,
        rsvp: s.studyGroupSessionAttendance.rsvp,
        attended: s.studyGroupSessionAttendance.attended,
      }).from(s.studyGroupMemberships)
        .leftJoin(s.studyGroupSessionAttendance, and(
          eq(s.studyGroupSessionAttendance.personId, s.studyGroupMemberships.personId),
          eq(s.studyGroupSessionAttendance.sessionId, data.sessionId)))
        .where(and(eq(s.studyGroupMemberships.groupId, group.id),
          eq(s.studyGroupMemberships.status, "approved")));
    });
  });

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
      const calendarEventId = await publishProjection(tx, {
        type: "study_group", title: data.title, description: data.agenda,
        startsAt: times.start, endsAt: times.end, timezone: site.timezone,
        scope: { siteId: group.siteId, programId: group.programId, sectionId: group.sectionId },
        sourceType: "study_group_session",
        sourceId: session.id, createdByPersonId: actor.actorPersonId,
      });
      await notifyMembers(tx, group.id, "New study group session",
        "Your facilitator scheduled " + data.title + ".", session.id);
      await recordAudit(tx, actor, {
        action: "study_group.session.create", resourceType: "study_group_session",
        resourceId: session.id, scope: { siteId: group.siteId, programId: group.programId },
        after: { startsAt: times.start.toISOString(), endsAt: times.end.toISOString(), calendarEventId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupSessionCreated, aggregateType: "study_group_session",
        aggregateId: session.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, calendarEventId },
      });
      return { sessionId: session.id };
    });
  });

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
