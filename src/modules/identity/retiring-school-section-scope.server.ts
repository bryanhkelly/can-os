/**
 * RETIRING LEGACY ACADEMIC PATH ONLY.
 *
 * This is the remaining school Section projection for old, not-yet-migrated
 * academic screens. It is never part of the native Class identity resolver.
 * Do not add Class, canonical learner, or new authorization responsibilities.
 * Delete after academic enrollment/evidence migration is reconciled.
 */
import { and, eq, inArray, not } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, sectionTeachers, sections } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { programTeacherDelegationPredicate } from "./teaching-eligibility.server";
import { listInstitutionallyAuthorizedAcademicProgramIds } from
  "@/modules/programs/institutional-academic-authority-read.server";

export async function projectRetiringSchoolSectionScope(
  context: AccessContext,
): Promise<AccessContext> {
  const organizations = context.scope.organizationIds ?? [];
  if (context.role !== "teacher" || !context.actorPersonId ||
      !organizations.length || context.grantSiteId !== null) return context;

  const assignments = await db.select({
    sectionId: sections.id, programId: sections.programId,
  }).from(sectionTeachers)
    .innerJoin(sections, eq(sections.id, sectionTeachers.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(and(programTeacherDelegationPredicate({
      personId: sectionTeachers.personId,
      providerOrganizationId: programs.academicProviderOrganizationId,
      programId: sections.programId, siteId: sections.siteId,
    }), eq(sectionTeachers.personId, context.actorPersonId),
      eq(sections.active, true),
      inArray(programs.academicProviderOrganizationId, organizations),
      not(inArray(programs.organizationId, organizations))));

  if (!assignments.length) return context;
  const authorized = await listInstitutionallyAuthorizedAcademicProgramIds(
    db, context, assignments.map(row => row.programId),
    ["academic_instruction", "curriculum"],
  );
  context.scope.sectionIds = [...new Set([
    ...(context.scope.sectionIds ?? []),
    ...assignments.filter(row => authorized.has(row.programId))
      .map(row => row.sectionId),
  ])];
  return context;
}
