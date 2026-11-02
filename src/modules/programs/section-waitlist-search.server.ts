import { and, eq, exists, inArray, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Database } from "@/db/client";
import { actions, enrollments, people, programs, sections, studentProfiles, terms } from "@/db/schema";
import { assertCapability, assertProgramScope, assertSectionScope, assertSiteScope, AuthorizationError,
  type CommandContext } from "@/domain/command-context";
import { personDisplayName } from "@/domain/person-name";

/** A section-restricted grant must not discover the rest of a Program's students. */
export function waitlistStudentVisibility(database: Pick<Database, "select">, context: CommandContext,
  programId: string, schoolYearId: string) {
  if (!context.scope.sectionIds) return undefined;
  const roster = alias(enrollments, "waitlist_visible_enrollment");
  const visibleSection = alias(sections, "waitlist_visible_section");
  return exists(database.select({ id: roster.id }).from(roster)
    .innerJoin(visibleSection, eq(visibleSection.id, roster.sectionId))
    .where(and(eq(roster.studentProfileId, studentProfiles.id), eq(roster.kind, "section"),
      eq(roster.status, "active"), eq(roster.programId, programId), eq(roster.schoolYearId, schoolYearId),
      eq(visibleSection.programId, programId), inArray(visibleSection.id, context.scope.sectionIds),
      ...(context.scope.siteIds ? [inArray(visibleSection.siteId, context.scope.siteIds)] : []))));
}

/** Minimal identity choices for an already-authorized section, never a global directory. */
export async function searchSectionWaitlistStudents(context: CommandContext, sectionId: string, query: string) {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "program.launch.start");
  assertCapability(context, "enrollment:manage");
  const [section] = await db.select({ id: sections.id, active: sections.active, programId: sections.programId,
    siteId: sections.siteId, organizationId: programs.organizationId, schoolYearId: terms.schoolYearId })
    .from(sections).innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(terms, eq(terms.id, sections.termId)).where(eq(sections.id, sectionId)).limit(1);
  if (!section || !context.scope.organizationIds?.includes(section.organizationId))
    throw new AuthorizationError("section organization");
  assertProgramScope(context, section.programId);
  assertSectionScope(context, section.id);
  assertSiteScope(context, section.siteId);
  if (!section.active) return { students: [], hasMore: false };
  const search = query.trim();
  if (search.length < 2 || search.length > 100) return { students: [], hasMore: false };
  // Escape LIKE metacharacters so a literal search cannot become a wildcard directory dump.
  const pattern = `%${search.replace(/[!%_]/g, "!$&")}%`;
  const enrolled = alias(enrollments, "waitlist_already_enrolled");
  const rows = await db.selectDistinct({ studentProfileId: studentProfiles.id,
    legalFirstName: people.legalFirstName, legalLastName: people.legalLastName,
    preferredName: people.preferredName, gradeLevel: studentProfiles.gradeLevel,
    studentNumber: studentProfiles.studentNumber })
    .from(studentProfiles).innerJoin(people, eq(people.id, studentProfiles.personId))
    .innerJoin(enrollments, eq(enrollments.studentProfileId, studentProfiles.id))
    .where(and(eq(enrollments.programId, section.programId), eq(enrollments.organizationId, section.organizationId),
      eq(enrollments.schoolYearId, section.schoolYearId), eq(enrollments.kind, "program"),
      eq(enrollments.status, "active"), eq(people.active, true),
      waitlistStudentVisibility(db, context, section.programId, section.schoolYearId),
      sql`concat_ws(' ', ${people.preferredName}, ${people.legalFirstName}, ${people.legalLastName}, ${studentProfiles.studentNumber}) ilike ${pattern} escape '!'`,
      notExists(db.select({ id: enrolled.id }).from(enrolled).where(and(
        eq(enrolled.studentProfileId, studentProfiles.id), eq(enrolled.sectionId, section.id),
        eq(enrolled.kind, "section"), eq(enrolled.status, "active")))),
      notExists(db.select({ id: actions.id }).from(actions).where(and(
        eq(actions.type, "section_waitlist"), eq(actions.sectionId, section.id),
        eq(actions.subjectId, studentProfiles.id), inArray(actions.status, ["open", "waiting", "in_progress"]))))
    )).orderBy(people.legalLastName, people.legalFirstName, studentProfiles.id).limit(26);
  return { students: rows.slice(0, 25).map(row => ({ studentProfileId: row.studentProfileId,
    name: personDisplayName(row), gradeLevel: row.gradeLevel, studentNumber: row.studentNumber })),
    hasMore: rows.length > 25 };
}
