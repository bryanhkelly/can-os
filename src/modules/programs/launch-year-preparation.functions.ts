import { and, eq, isNull, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client";
import { gradeScales, programs, schoolYears, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { launchOpeningDate } from "@/domain/launch-opening-date";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";
import { requireActor } from "@/modules/identity/actors.server";
import { createSchoolYear, prepareSchoolYearBasics } from "@/modules/academic-time/school-year-service";
import { ensureStandardGradeScale } from "@/modules/academic-time/standard-grade-scale.server";

const uuid = z.string().uuid();

/** Prepare saved school-year records from a Program's stored launch intent.
 * No school-year activation, attendance authority, or institutional approval.
 */
export const prepareLaunchAcademicYear = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ programId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], "academic_year.manage");
    const [program] = await db.select({
      id: programs.id, name: programs.name, status: programs.status,
      organizationId: programs.organizationId, siteId: programs.siteId,
      metadata: programs.metadata,
    }).from(programs).where(eq(programs.id, data.programId)).limit(1);
    if (!program || !program.siteId ||
        !actor.scope.organizationIds?.includes(program.organizationId) ||
        !actor.scope.siteIds?.includes(program.siteId) ||
        !actor.scope.programIds?.includes(program.id))
      throw new AuthorizationError("verified school launch and site scope");
    if (!["draft", "launching", "ready"].includes(program.status))
      throw new Error("A school year can only be prepared from a pre-opening launch");
    const [site] = await db.select({ timezone: sites.timezone,
      organizationId: sites.organizationId }).from(sites)
      .where(eq(sites.id, program.siteId)).limit(1);
    if (!site || site.organizationId !== program.organizationId)
      throw new AuthorizationError("current host Site");
    const suggested = suggestedSchoolYear(new Date(), launchOpeningDate(program.metadata));
    const [existing] = await db.select({ id: schoolYears.id, status: schoolYears.status })
      .from(schoolYears).where(and(
        eq(schoolYears.organizationId, program.organizationId),
        eq(schoolYears.siteId, program.siteId),
        eq(schoolYears.key, suggested.key),
        or(isNull(schoolYears.programId),eq(schoolYears.programId,program.id)),
      )).limit(1);
    if (existing?.status === "active")
      return { schoolYearId: existing.id, calendarId: null, reused: true, status: "active" as const };

    let yearId = existing?.id;
    if (!yearId) {
      const grades = await db.select({ id: gradeScales.id, name: gradeScales.name })
        .from(gradeScales).where(and(
          eq(gradeScales.owningOrganizationId, program.organizationId),
          eq(gradeScales.active, true),
        ));
      const standard = grades.find(row => row.name === "Standard A–F");
      const selected = standard ?? (grades.length === 1 ? grades[0] : null);
      const gradeScaleId = selected?.id ?? await ensureStandardGradeScale(actor, {
        organizationId: program.organizationId, name: "Standard A–F",
      });
      yearId = await createSchoolYear(actor, {
        organizationId: program.organizationId, programId: program.id,
        siteId: program.siteId, timezone: site.timezone,
        key: suggested.key, name: suggested.name,
        startsOn: suggested.startsOn, endsOn: suggested.endsOn, gradeScaleId,
      });
    }
    // Real terms, grading periods and an active calendar DRAFT. Days, teacher
    // schedules, closures and opening decisions remain independently reviewed.
    const result = await prepareSchoolYearBasics(actor, {
      schoolYearId: yearId, structure: "semesters",
    });
    return { ...result, reused: Boolean(existing), status: "draft" as const };
  });
