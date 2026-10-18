import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";

type Actor = Awaited<ReturnType<typeof requireActor>>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type GroupScope = { id: string; siteId: string | null; programId: string | null; sectionId: string | null };

export function assertGroupScope(actor: Actor, group: GroupScope) {
  if (!group.siteId || !actorSiteIds(actor).includes(group.siteId) ||
      (group.programId && !(actor.scope.programIds ?? []).includes(group.programId))) {
    throw new AuthorizationError("study group school/program grant");
  }
}

/** Active enrollment in the group's school/program and, for course groups, section. */
export async function eligibleStudent(tx: Tx, studentPersonId: string, group: GroupScope, grantedPrograms: string[]) {
  if (!group.siteId) throw new AuthorizationError("group site");
  const [membership] = await tx.select({ studentProfileId: s.studentProfiles.id })
    .from(s.studentProfiles)
    .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
    .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
    .where(and(
      eq(s.studentProfiles.personId, studentPersonId),
      eq(s.enrollments.kind, "program"), eq(s.enrollments.status, "active"),
      eq(s.programs.siteId, group.siteId),
      inArray(s.programs.id, grantedPrograms),
      group.programId ? eq(s.enrollments.programId, group.programId) : undefined,
    )).limit(1);
  if (!membership) throw new AuthorizationError("active student program enrollment");
  if (group.sectionId) {
    const [section] = await tx.select({ id: s.enrollments.id }).from(s.enrollments)
      .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
      .where(and(
        eq(s.enrollments.studentProfileId, membership.studentProfileId),
        eq(s.enrollments.sectionId, group.sectionId),
        eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"),
        eq(s.sections.active, true), eq(s.sections.siteId, group.siteId),
        group.programId ? eq(s.sections.programId, group.programId) : undefined,
        inArray(s.sections.programId, grantedPrograms),
      )).limit(1);
    if (!section) throw new AuthorizationError("active course section enrollment at this group school");
  }
  return membership.studentProfileId;
}

/** Locked, scope-verified group owned by this facilitator (teacher). */
export async function facilitatedGroup(tx: Tx, actor: Actor, groupId: string) {
  const [group] = await tx.select().from(s.studyGroups)
    .where(and(eq(s.studyGroups.id, groupId),
      eq(s.studyGroups.status, "active"),
      eq(s.studyGroups.facilitatorPersonId, actor.actorPersonId)))
    .for("update").limit(1);
  if (!group) throw new AuthorizationError("active facilitated group");
  assertGroupScope(actor, group);
  if (group.sectionId) {
    const [assignment] = await tx.select({ id: s.sectionTeachers.id })
      .from(s.sectionTeachers)
      .innerJoin(s.sections, eq(s.sections.id, s.sectionTeachers.sectionId))
      .where(and(eq(s.sectionTeachers.sectionId, group.sectionId),
        eq(s.sectionTeachers.personId, actor.actorPersonId),
        eq(s.sections.active, true))).limit(1);
    if (!assignment) throw new AuthorizationError("current group teaching assignment");
  }
  return group;
}

/** Scope-verified group with this student's approved membership. */
export async function participatingStudent(tx: Tx, actor: Actor, groupId: string) {
  const [group] = await tx.select().from(s.studyGroups)
    .where(and(eq(s.studyGroups.id, groupId), eq(s.studyGroups.status, "active")))
    .limit(1);
  if (!group) throw new Error("Group not found");
  assertGroupScope(actor, group);
  await eligibleStudent(tx, actor.actorPersonId, group, actor.scope.programIds ?? []);
  const [member] = await tx.select({ id: s.studyGroupMemberships.id })
    .from(s.studyGroupMemberships).where(and(
      eq(s.studyGroupMemberships.groupId, groupId),
      eq(s.studyGroupMemberships.personId, actor.actorPersonId),
      eq(s.studyGroupMemberships.status, "approved"))).limit(1);
  if (!member) throw new AuthorizationError("approved group membership");
  return group;
}
