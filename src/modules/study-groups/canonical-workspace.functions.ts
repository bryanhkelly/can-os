import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray, or, isNull, desc } from "drizzle-orm";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";

/** Deployment feature flags for the study-group pages. */
export const getStudyGroupAvailability = createServerFn({ method: "GET" }).handler(async () => ({
  enabled: true, writesEnabled: true, membershipEnabled: true,
  creationEnabled: true, contentEnabled: true, moderationEnabled: true,
}));

/** Canonical read projection for the temporary Phase 3 /groups entry point. */
export const getCanonicalGroupWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["student", "teacher"]);
  setResponseHeader("Cache-Control", "private, no-store");
  const sites = actorSiteIds(actor);
  const programs = actor.scope.programIds ?? [];
  if (!programs.length) return { role: actor.role, groups: [], sections: [] };
  const groups = await db.select({
    id: s.studyGroups.id, siteId: s.studyGroups.siteId, programId: s.studyGroups.programId,
    sectionId: s.studyGroups.sectionId, facilitatorPersonId: s.studyGroups.facilitatorPersonId,
    title: s.studyGroups.title, description: s.studyGroups.description,
    kind: s.studyGroups.kind,
    maxMembers: s.studyGroups.maxMembers,
  }).from(s.studyGroups).where(and(
    eq(s.studyGroups.status, "active"), inArray(s.studyGroups.siteId, sites),
    or(isNull(s.studyGroups.programId), inArray(s.studyGroups.programId, programs)),
  )).orderBy(desc(s.studyGroups.createdAt)).limit(100);

  const teaching = actor.role === "teacher" ? await db.select({
    id: s.sections.id, title: s.sections.title, siteId: s.sections.siteId,
    programId: s.sections.programId,
  }).from(s.sectionTeachers)
    .innerJoin(s.sections, eq(s.sections.id, s.sectionTeachers.sectionId))
    .where(and(eq(s.sectionTeachers.personId, actor.actorPersonId),
      eq(s.sections.active, true), inArray(s.sections.siteId, sites),
      inArray(s.sections.programId, programs)))
    .orderBy(asc(s.sections.title)).limit(100) : [];

  const studentPrograms = actor.role === "student" ? await db.select({
    id: s.studentProfiles.id, siteId: s.programs.siteId,
    programId: s.programs.id,
  }).from(s.studentProfiles)
    .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
    .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
    .where(and(eq(s.studentProfiles.personId, actor.actorPersonId),
      eq(s.enrollments.status, "active"), eq(s.enrollments.kind, "program"),
      inArray(s.programs.siteId, sites), inArray(s.programs.id, programs))) : [];
  const studentSectionIds = actor.role === "student" && studentPrograms.length
    ? new Set((await db.select({ sectionId: s.enrollments.sectionId })
      .from(s.enrollments).where(and(
        inArray(s.enrollments.studentProfileId, studentPrograms.map(x => x.id)),
        eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"))))
      .map(x => x.sectionId)) : new Set<string | null>();
  const allowed = groups.filter(g => actor.role === "teacher"
    ? g.facilitatorPersonId === actor.actorPersonId &&
      (!g.sectionId || teaching.some(section => section.id === g.sectionId))
    : studentPrograms.some(p => p.siteId === g.siteId &&
      (!g.programId || p.programId === g.programId)) &&
      (!g.sectionId || studentSectionIds.has(g.sectionId)));
  if (!allowed.length) return { role: actor.role, groups: [], sections: teaching };

  const ids = allowed.map(x => x.id);
  const [memberships, sessions, pendingMembers, posts, reports, roster] = await Promise.all([
    db.select({
      id: s.studyGroupMemberships.id, groupId: s.studyGroupMemberships.groupId,
      personId: s.studyGroupMemberships.personId, status: s.studyGroupMemberships.status,
    }).from(s.studyGroupMemberships)
      .where(and(inArray(s.studyGroupMemberships.groupId, ids),
        actor.role === "student"
          ? eq(s.studyGroupMemberships.personId, actor.actorPersonId)
          : undefined)),
    db.select({
      id: s.studyGroupSessions.id, groupId: s.studyGroupSessions.groupId,
      title: s.studyGroupSessions.title, startsAt: s.studyGroupSessions.startsAt,
      endsAt: s.studyGroupSessions.endsAt, agenda: s.studyGroupSessions.agenda,
      location: s.studyGroupSessions.location,
      eventMetadata: s.calendarEvents.metadata,
      rsvp: s.studyGroupSessionAttendance.rsvp,
      attended: s.studyGroupSessionAttendance.attended,
    }).from(s.studyGroupSessions)
      .leftJoin(s.calendarEvents, and(eq(s.calendarEvents.sourceType, "study_group_session"),
        eq(s.calendarEvents.sourceId, s.studyGroupSessions.id)))
      .leftJoin(s.studyGroupSessionAttendance, and(
        eq(s.studyGroupSessionAttendance.sessionId, s.studyGroupSessions.id),
        eq(s.studyGroupSessionAttendance.personId, actor.actorPersonId)))
      .where(inArray(s.studyGroupSessions.groupId, ids))
      .orderBy(asc(s.studyGroupSessions.startsAt)).limit(300),
    actor.role === "teacher" ? db.select({
      id: s.studyGroupMemberships.id, groupId: s.studyGroupMemberships.groupId,
      studentPersonId: s.studyGroupMemberships.personId,
      firstName: s.people.legalFirstName, lastName: s.people.legalLastName,
    }).from(s.studyGroupMemberships)
      .innerJoin(s.people, eq(s.people.id, s.studyGroupMemberships.personId))
      .where(and(inArray(s.studyGroupMemberships.groupId, ids),
        eq(s.studyGroupMemberships.status, "pending"))) : Promise.resolve([]),
    db.select({ id: s.studyGroupPosts.id, groupId: s.studyGroupPosts.groupId,
      authorPersonId: s.studyGroupPosts.authorPersonId, body: s.studyGroupPosts.body,
      createdAt: s.studyGroupPosts.createdAt,
    }).from(s.studyGroupPosts).where(and(inArray(s.studyGroupPosts.groupId, ids),
      eq(s.studyGroupPosts.hidden, false))).orderBy(desc(s.studyGroupPosts.createdAt)).limit(300),
    actor.role === "teacher" ? db.select({
      id: s.studyGroupReports.id, groupId: s.studyGroupReports.groupId,
      postId: s.studyGroupReports.postId, reason: s.studyGroupReports.reason,
      postBody: s.studyGroupPosts.body, postHidden: s.studyGroupPosts.hidden,
    }).from(s.studyGroupReports)
      .leftJoin(s.studyGroupPosts, eq(s.studyGroupPosts.id, s.studyGroupReports.postId))
      .where(and(
      inArray(s.studyGroupReports.groupId, ids),
      eq(s.studyGroupReports.status, "open"))).limit(200) : Promise.resolve([]),
    actor.role === "teacher" ? db.select({
      groupId: s.studyGroupMemberships.groupId,
      studentPersonId: s.studyGroupMemberships.personId,
      firstName: s.people.legalFirstName, lastName: s.people.legalLastName,
    }).from(s.studyGroupMemberships)
      .innerJoin(s.people, eq(s.people.id, s.studyGroupMemberships.personId))
      .where(and(inArray(s.studyGroupMemberships.groupId, ids),
        eq(s.studyGroupMemberships.status, "approved"))).limit(300) : Promise.resolve([]),
  ]);
  const attendance = actor.role === "teacher" && sessions.length
    ? await db.select({ sessionId: s.studyGroupSessionAttendance.sessionId,
        personId: s.studyGroupSessionAttendance.personId,
        attended: s.studyGroupSessionAttendance.attended,
      }).from(s.studyGroupSessionAttendance).where(inArray(
        s.studyGroupSessionAttendance.sessionId, sessions.map(session => session.id),
      )) : [];

  const pendingStudentIds = pendingMembers.map(x => x.studentPersonId);
  const [guardianRows, consentActions, consentEvidence] = pendingMembers.length
    ? await Promise.all([
      db.select({ studentPersonId: s.guardianRelationships.studentPersonId,
        guardianPersonId: s.guardianRelationships.guardianPersonId })
        .from(s.guardianRelationships).where(and(
          inArray(s.guardianRelationships.studentPersonId, pendingStudentIds),
          eq(s.guardianRelationships.canManageEnrollment, true))),
      db.select({ groupId: s.actions.subjectId, ownerPersonId: s.actions.ownerPersonId,
        status: s.actions.status, metadata: s.actions.metadata })
        .from(s.actions).where(and(eq(s.actions.type, "study_group_consent"),
          inArray(s.actions.subjectId, ids))),
      db.select({ subjectId: s.consentRecords.subjectId,
        signerPersonId: s.consentRecords.signerPersonId,
        evidence: s.consentRecords.signatureEvidence })
        .from(s.consentRecords).where(and(
          eq(s.consentRecords.subjectType, "study_group_membership"),
          eq(s.consentRecords.consentType, "study_group_participation"),
          eq(s.consentRecords.version, "study-group/v1"),
          isNull(s.consentRecords.revokedAt),
          inArray(s.consentRecords.subjectId, pendingMembers.map(m => m.id))))
        .orderBy(desc(s.consentRecords.signedAt), desc(s.consentRecords.createdAt)),
    ]) : [[], [], []];

  const canReview = (m: (typeof pendingMembers)[number]) => {
    const guardians = guardianRows.filter(g => g.studentPersonId === m.studentPersonId);
    if (!guardians.length) return false;
    return guardians.every(g => {
      const action = consentActions.find(a => a.groupId === m.groupId &&
        a.ownerPersonId === g.guardianPersonId &&
        a.metadata.studentPersonId === m.studentPersonId &&
        a.metadata.membershipId === m.id);
      const decision = consentEvidence.find(e => e.subjectId === m.id &&
        e.signerPersonId === g.guardianPersonId &&
        e.evidence.studentPersonId === m.studentPersonId &&
        e.evidence.groupId === m.groupId);
      return action?.status === "resolved" && action.metadata.decision === "approve" &&
        decision?.evidence.decision === "approve" &&
        decision.evidence.acknowledged === true;
    });
  };

  return {
    role: actor.role,
    sections: teaching,
    groups: allowed.map(g => {
      const own = memberships.find(m => m.groupId === g.id && m.personId === actor.actorPersonId);
      const mayReadSessions = actor.role === "teacher" || own?.status === "approved";
      const groupSessions = mayReadSessions ? sessions
        .filter(row => row.groupId === g.id)
        .map(row => ({
          id: row.id, title: row.title, agenda: row.agenda, location: row.location,
          startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
          cancelled: !row.eventMetadata || row.eventMetadata.cancelled === true,
          rsvp: row.rsvp, attended: row.attended,
          attendance: actor.role === "teacher" ? attendance.filter(a => a.sessionId === row.id) : [],
        })) : [];
      return {
        id: g.id, title: g.title, description: g.description,
        kind: g.kind,
        maxMembers: g.maxMembers,
        membershipStatus: own?.status ?? null,
        approvedCount: actor.role === "teacher"
          ? roster.filter(m => m.groupId === g.id).length
          : 0,
        sessions: groupSessions,
        posts: mayReadSessions ? posts.filter(post => post.groupId === g.id)
          .map(post => ({ id: post.id, authorPersonId: post.authorPersonId,
            body: post.body, createdAt: post.createdAt.toISOString() })) : [],
        reports: actor.role === "teacher" ? reports.filter(r => r.groupId === g.id) : [],
        roster: actor.role === "teacher" ? roster.filter(r => r.groupId === g.id)
          .map(r => ({ personId: r.studentPersonId,
            studentName: r.firstName + " " + r.lastName })) : [],
        pendingMembers: actor.role === "teacher"
          ? pendingMembers.filter(m => m.groupId === g.id).map(m => ({
            id: m.id, studentPersonId: m.studentPersonId,
            studentName: m.firstName + " " + m.lastName, guardianReady: canReview(m),
          })) : [],
      };
    }),
  };
});

/** Guardian-owned consent Actions sourced from the same group membership lifecycle. */
export const listCanonicalGuardianGroupConsents = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["guardian"]);
  setResponseHeader("Cache-Control", "private, no-store");
  const sites = actorSiteIds(actor);
  const rows = await db.select({
    id: s.actions.id, status: s.actions.status, metadata: s.actions.metadata,
    groupId: s.studyGroups.id, groupTitle: s.studyGroups.title,
    siteId: s.studyGroups.siteId, programId: s.studyGroups.programId,
    groupStatus: s.studyGroups.status,
  }).from(s.actions)
    .innerJoin(s.studyGroups, eq(s.studyGroups.id, s.actions.subjectId))
    .where(and(eq(s.actions.type, "study_group_consent"),
      eq(s.actions.subjectType, "study_group"),
      eq(s.actions.ownerPersonId, actor.actorPersonId),
      inArray(s.actions.status, ["open", "resolved"]),
      inArray(s.studyGroups.siteId, sites),
      or(isNull(s.studyGroups.programId), inArray(s.studyGroups.programId, actor.scope.programIds ?? []))))
    .orderBy(desc(s.actions.createdAt)).limit(100);
  if (!rows.length) return [];
  const guardians = await db.select({ studentPersonId: s.guardianRelationships.studentPersonId })
    .from(s.guardianRelationships)
    .where(and(eq(s.guardianRelationships.guardianPersonId, actor.actorPersonId),
      eq(s.guardianRelationships.canManageEnrollment, true)));
  const studentIds = new Set(guardians.map(g => g.studentPersonId));
  const filtered = rows.filter(row => row.groupStatus === "active" &&
    typeof row.metadata.studentPersonId === "string" &&
    studentIds.has(row.metadata.studentPersonId) &&
    (!row.programId || actor.scope.programIds?.includes(row.programId)));
  if (!filtered.length) return [];
  const memberships = await db.select({
    id: s.studyGroupMemberships.id, groupId: s.studyGroupMemberships.groupId,
    personId: s.studyGroupMemberships.personId, status: s.studyGroupMemberships.status,
  }).from(s.studyGroupMemberships).where(and(
    inArray(s.studyGroupMemberships.groupId, filtered.map(r => r.groupId)),
    inArray(s.studyGroupMemberships.personId, [...studentIds])));
  return filtered.flatMap(row => {
    const pending = memberships.some(m =>
      m.groupId === row.groupId && m.personId === row.metadata.studentPersonId &&
      m.status === "pending" && (!row.metadata.membershipId || row.metadata.membershipId === m.id));
    // Legacy actions carry no membershipId: surface them as obsolete when the
    // student's pending membership no longer exists instead of hiding them.
    const obsolete = !pending && !row.metadata.membershipId && row.status === "open";
    if (!pending && !obsolete) return [];
    return [{
      id: row.id, status: row.status, groupTitle: row.groupTitle,
      studentPersonId: String(row.metadata.studentPersonId),
      decision: row.metadata.decision === "approve" ? "approve" :
        row.metadata.decision === "decline" ? "decline" : null,
      obsolete,
    }];
  });
});
