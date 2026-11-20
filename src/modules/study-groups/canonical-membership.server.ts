import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { db } from "@/db/client";
import * as s from "@/db/schema";
import { canonicalClasses, canonicalClassEnrollments, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";
import { authorizeClass } from "@/modules/learning/class-access.server";

type Actor = Awaited<ReturnType<typeof requireActor>>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type GroupScope = { id: string; siteId: string | null; programId: string | null; sectionId: string | null; metadata?: unknown };

export function canonicalGroupClassId(group: GroupScope): string | null {
  const meta=group.metadata;
  if(!meta||typeof meta!=="object"||Array.isArray(meta))return null;
  const value=(meta as Record<string,unknown>).canonicalClassId;
  if(value===undefined||value===null)return null;
  if(typeof value!=="string"||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value))
    throw new AuthorizationError("valid canonical Class group binding");
  return value;
}

export function assertGroupScope(actor: Actor, group: GroupScope) {
  if (!group.siteId || !actorSiteIds(actor).includes(group.siteId) ||
      (group.programId && !(actor.scope.programIds ?? []).includes(group.programId))) {
    throw new AuthorizationError("study group school/program grant");
  }
}

/** Active enrollment in the group's school/program and, for course groups, section. */
export async function eligibleStudent(tx: Pick<Tx, "select">, studentPersonId: string, group: GroupScope, grantedPrograms: string[]) {
  if (!group.siteId) throw new AuthorizationError("group site");
  const nativeClassId=canonicalGroupClassId(group);
  if(nativeClassId){
    const [native]=await tx.select({studentProfileId:s.studentProfiles.id})
      .from(canonicalClassEnrollments)
      .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId))
      .innerJoin(s.studentProfiles,eq(s.studentProfiles.personId,canonicalClassEnrollments.learnerPersonId))
      .innerJoin(s.sites,eq(s.sites.id,canonicalClasses.siteId))
      .where(and(eq(canonicalClasses.id,nativeClassId),
        eq(canonicalClasses.siteId,group.siteId),
        eq(canonicalClasses.operatingOrganizationId,s.sites.organizationId),
        eq(canonicalClasses.state,"active"),
        eq(canonicalClassEnrollments.learnerPersonId,studentPersonId),
        eq(canonicalClassEnrollments.status,"active")))
      .limit(1);
    if(!native)throw new AuthorizationError("current canonical Class member");
    return native.studentProfileId;
  }
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
    // Match the classroom's live same-program, same-year enrollment rule.
    // A student's active Program in a later year must not reactivate a stale
    // Section from an earlier year, including when invited by a facilitator.
    const currentProgram = alias(s.enrollments, "group_current_program_enrollment");
    const [section] = await tx.select({ id: s.enrollments.id }).from(s.enrollments)
      .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
      .innerJoin(s.terms, eq(s.terms.id, s.sections.termId))
      .innerJoin(currentProgram, and(
        eq(currentProgram.studentProfileId, s.enrollments.studentProfileId),
        eq(currentProgram.programId, s.sections.programId),
        eq(currentProgram.schoolYearId, s.terms.schoolYearId),
        eq(currentProgram.kind, "program"),
        eq(currentProgram.status, "active"),
      ))
      .where(and(
        eq(s.enrollments.studentProfileId, membership.studentProfileId),
        eq(s.enrollments.sectionId, group.sectionId),
        eq(s.enrollments.programId, s.sections.programId),
        eq(s.enrollments.schoolYearId, s.terms.schoolYearId),
        eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"),
        eq(s.sections.active, true), eq(s.sections.siteId, group.siteId),
        group.programId ? eq(s.sections.programId, group.programId) : undefined,
        inArray(s.sections.programId, grantedPrograms),
      )).limit(1);
    if (!section) throw new AuthorizationError("active current-year course enrollment at this group school");
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
  const nativeClassId=canonicalGroupClassId(group);
  if(nativeClassId){
    assertGroupScope(actor,group);
    const [authorized]=await tx.select({id:canonicalClassStaffAssignments.id})
      .from(canonicalClassStaffAssignments)
      .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassStaffAssignments.classId))
      .where(and(eq(canonicalClassStaffAssignments.classId,nativeClassId),
        eq(canonicalClassStaffAssignments.personId,actor.actorPersonId),
        eq(canonicalClassStaffAssignments.roleCode,"teacher"),
        eq(canonicalClassStaffAssignments.state,"approved"),
        eq(canonicalClasses.siteId,group.siteId),
        eq(canonicalClasses.state,"active")))
      .limit(1);
    if(!authorized)throw new AuthorizationError("current canonical Class teacher");
    return group;
  }
  if (group.sectionId) {
    // Exact delegated Section authority is sufficient for a course group,
    // but a bare assignment is not: validate active qualification, academic
    // provider agreement, and the Section's authoritative Site/Program.
    const { section } = await authorizeClass(actor, group.sectionId, undefined, tx);
    if (section.siteId !== group.siteId || section.programId !== group.programId)
      throw new AuthorizationError("study group current section scope");
  } else {
    // Site-wide interest groups still require the local Site/Program grant.
    assertGroupScope(actor, group);
  }
  return group;
}

/** Scope-verified group with this student's approved membership. */
export async function participatingStudent(tx: Tx, actor: Actor, groupId: string, lock = false) {
  const query = tx.select().from(s.studyGroups)
    .where(and(eq(s.studyGroups.id, groupId), eq(s.studyGroups.status, "active")))
    .limit(1);
  const [group] = await (lock ? query.for("update") : query);
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
