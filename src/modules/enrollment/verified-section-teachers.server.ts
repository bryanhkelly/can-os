import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  programs, sections,
  sectionTeachers,
} from "@/db/schema";

import { programTeacherDelegationPredicate, verifiedTeacherAccountPredicate } from "@/modules/identity/teaching-eligibility.server";

/**
 * The same teacher-identity rule must power the registrar's class-placement
 * preview and the transactional enrollment command. A Section assignment
 * alone does not mean a teacher can sign in and teach that class.
 *
 * When academics are provided by a different Organization, ONLY an original
 * academic-provider-wide teacher grant plus exact current Program delegation
 * may satisfy instructor staffing.
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
    .where(and(
      inArray(sections.id, ids),
      eq(sections.active, true),
      // Never use a Section attached to a different canonical Program Site.
      or(eq(sections.siteId, programs.siteId),
        and(isNull(sections.siteId), isNull(programs.siteId))),
      verifiedTeacherAccountPredicate({
        personId:sectionTeachers.personId,
        hostOrganizationId:programs.organizationId,
        providerOrganizationId:programs.academicProviderOrganizationId,
        siteId:sections.siteId,
      }),
      // External providers also need the exact current Program delegation.
      or(
        eq(programs.academicProviderOrganizationId, programs.organizationId),
        programTeacherDelegationPredicate({
          personId: sectionTeachers.personId,
          providerOrganizationId: programs.academicProviderOrganizationId,
          programId: programs.id, siteId: sections.siteId,
        }),
      ),
    ));
  return new Set(rows.map(row => row.id));
}
