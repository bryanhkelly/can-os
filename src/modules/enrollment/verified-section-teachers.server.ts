import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, people, programs, sections,
  sectionTeachers,
} from "@/db/schema";

/**
 * The same teacher-identity rule must power the registrar's class-placement
 * preview and the transactional enrollment command. A Section assignment
 * alone does not mean a teacher can sign in and teach that class.
 *
 * When academics are provided by a different Organization, ONLY an original
 * academic-provider-wide teacher grant may satisfy instructor staffing.
 * Church-local roles do not become CAN academic instruction assignments.
 * When the host is also the academic provider, its site-scoped teacher
 * grant remains valid. No provider grant becomes church-wide Site access.
 *
 * Academic service-agreement and curriculum checks are intentionally
 * separate: placement and readiness projections apply those as well.
 */
export async function verifiedTeacherSectionIds(
  sectionIds: readonly string[],
  executor: Pick<typeof db, "select"> = db,
): Promise<Set<string>> {
  const ids = [...new Set(sectionIds)];
  if (!ids.length) return new Set();
  const rows = await executor.select({ id: sections.id })
    .from(sections)
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(sectionTeachers, eq(sectionTeachers.sectionId, sections.id))
    .innerJoin(people, eq(people.id, sectionTeachers.personId))
    .innerJoin(accountPersonGrants,
      eq(accountPersonGrants.personId, sectionTeachers.personId))
    .innerJoin(accessAccounts,
      eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      inArray(sections.id, ids),
      eq(sections.active, true),
      // Never use a Section attached to a different canonical Program Site.
      or(eq(sections.siteId, programs.siteId),
        and(isNull(sections.siteId), isNull(programs.siteId))),
      eq(people.active, true),
      eq(accountPersonGrants.active, true),
      eq(accountPersonGrants.isSynthetic, false),
      eq(accountPersonGrants.role, "teacher"),
      eq(accessAccounts.disabled, false),
      isNotNull(accessAccounts.emailVerifiedAt),
      or(
        and(
          // Where the host does NOT operate academics, a host teacher grant
          // cannot satisfy "CAN instructor staffed" for a church-hosted
          // classroom. The original academic provider owns teaching authority.
          eq(programs.academicProviderOrganizationId, programs.organizationId),
          eq(accountPersonGrants.organizationId, programs.organizationId),
          or(isNull(accountPersonGrants.siteId),
            eq(accountPersonGrants.siteId, sections.siteId)),
        ),
        and(
          eq(accountPersonGrants.organizationId,
            programs.academicProviderOrganizationId),
          isNull(accountPersonGrants.siteId),
        ),
      ),
    ));
  return new Set(rows.map(row => row.id));
}
