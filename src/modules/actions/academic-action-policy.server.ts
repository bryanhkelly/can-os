import { and, eq, or, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, enrollments, programs, sections, sectionTeachers } from "@/db/schema";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AcademicResource = {
  subjectType: string;
  subjectId: string;
  organizationId: string | null;
  siteId: string | null;
  programId: string | null;
  sectionId: string | null;
};

export async function assertAcademicActionAuthority(
  tx: Tx,
  context: CommandContext,
  resource: AcademicResource,
): Promise<void> {
  if (!context.actorPersonId || resource.subjectType !== "student_profile" ||
      !resource.sectionId || !resource.programId || !resource.organizationId ||
      !context.scope.organizationIds?.includes(resource.organizationId) ||
      !context.scope.programIds?.includes(resource.programId) ||
      (resource.siteId !== null && !context.scope.siteIds?.includes(resource.siteId)) ||
      (context.scope.sectionIds !== undefined && !context.scope.sectionIds.includes(resource.sectionId))) {
    throw new AuthorizationError("academic Action scope");
  }
  const [section] = await tx.select({ id: sections.id }).from(sections)
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(enrollments, eq(enrollments.sectionId, sections.id))
    .where(and(
      eq(sections.id, resource.sectionId), eq(sections.active, true),
      eq(sections.programId, resource.programId),
      resource.siteId === null ? isNull(sections.siteId) : eq(sections.siteId, resource.siteId),
      eq(programs.organizationId, resource.organizationId),
      eq(enrollments.studentProfileId, resource.subjectId),
      eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
      eq(enrollments.programId, resource.programId),
    )).limit(1);
  if (!section) throw new AuthorizationError("current academic Action student/section relationship");
  await assertAcademicActionStaff(tx, context.actorPersonId, resource);
}

export async function assertAcademicActionStaff(
  tx: Tx,
  personId: string,
  resource: AcademicResource,
): Promise<void> {
  if (!resource.sectionId || !resource.organizationId) {
    throw new AuthorizationError("academic Action resource");
  }
  const [teacher] = await tx.select({ id: sectionTeachers.id }).from(sectionTeachers)
    .where(and(eq(sectionTeachers.sectionId, resource.sectionId),
      eq(sectionTeachers.personId, personId))).limit(1);
  if (teacher) return;
  const [staff] = await tx.select({ id: accountPersonGrants.id }).from(accountPersonGrants)
    .where(and(
      eq(accountPersonGrants.personId, personId),
      eq(accountPersonGrants.active, true),
      eq(accountPersonGrants.organizationId, resource.organizationId),
      or(eq(accountPersonGrants.role, "registrar"), eq(accountPersonGrants.role, "specialist")),
      resource.siteId === null ? isNull(accountPersonGrants.siteId)
        : or(isNull(accountPersonGrants.siteId), eq(accountPersonGrants.siteId, resource.siteId)),
    )).limit(1);
  if (!staff) throw new AuthorizationError("current academic Action staff relationship");
}
