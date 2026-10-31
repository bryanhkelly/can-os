import { and, eq, isNull, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
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

async function launchYearContext(programId:string){
 const actor=await requireActor(["registrar"],"academic_year.manage");
 const [program]=await db.select({id:programs.id,name:programs.name,status:programs.status,
  organizationId:programs.organizationId,siteId:programs.siteId,metadata:programs.metadata,
  gradeRange:programs.gradeRange,
 }).from(programs).where(eq(programs.id,programId)).limit(1);
 if(!program?.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
  !actor.scope.siteIds?.includes(program.siteId)||!actor.scope.programIds?.includes(program.id))
  throw new AuthorizationError("verified school launch and site scope");
 return {actor,program:{...program,siteId:program.siteId}};
}

/** Small, scoped proposal for the launch step; no faculty or child data. */
export const getLaunchAcademicYearPlan=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({programId:uuid}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const {program}=await launchYearContext(data.programId);
  const suggested=suggestedSchoolYear(new Date(),launchOpeningDate(program.metadata));
  const grades=await db.select({id:gradeScales.id,name:gradeScales.name}).from(gradeScales)
   .where(and(eq(gradeScales.owningOrganizationId,program.organizationId),eq(gradeScales.active,true)));
  const years=await db.select({id:schoolYears.id,name:schoolYears.name,status:schoolYears.status,
   startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn}).from(schoolYears).where(and(
    eq(schoolYears.organizationId,program.organizationId),eq(schoolYears.siteId,program.siteId!),
    eq(schoolYears.key,suggested.key),or(isNull(schoolYears.programId),eq(schoolYears.programId,program.id)),
   ));
  return {programId:program.id,programName:program.name,siteId:program.siteId!,suggested,gradeScales:grades,years,
   recommendedStructure:["9","10","11","12"].includes(program.gradeRange.max)?"semesters" as const:"full_year" as const};
 });

/** Prepare saved school-year records from a Program's stored launch intent.
 * No school-year activation, attendance authority, or institutional approval.
 */
export const prepareLaunchAcademicYear = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ programId: uuid,schoolYearId:uuid.optional(),gradeScaleId:uuid.optional(),useStandardGradeScale:z.boolean().optional(),
    structure:z.enum(["full_year","semesters"]).optional(),
    instructionalDays:z.object({weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),
      instructionalMinutes:z.number().int().min(1).max(1440)}).strict().optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const {actor,program}=await launchYearContext(data.programId);
    if (!["draft", "launching", "ready"].includes(program.status))
      throw new Error("A school year can only be prepared from a pre-opening launch");
    const [site] = await db.select({ timezone: sites.timezone,
      organizationId: sites.organizationId }).from(sites)
      .where(eq(sites.id, program.siteId)).limit(1);
    if (!site || site.organizationId !== program.organizationId)
      throw new AuthorizationError("current host Site");
    const suggested = suggestedSchoolYear(new Date(), launchOpeningDate(program.metadata));
    const matchingYears = await db.select({ id: schoolYears.id, status: schoolYears.status })
      .from(schoolYears).where(and(
        eq(schoolYears.organizationId, program.organizationId),
        eq(schoolYears.siteId, program.siteId),
        eq(schoolYears.key, suggested.key),
        or(isNull(schoolYears.programId),eq(schoolYears.programId,program.id)),
      ));
    const existing=data.schoolYearId?matchingYears.find(year=>year.id===data.schoolYearId):
      matchingYears.length===1?matchingYears[0]:undefined;
    if(data.schoolYearId&&!existing)throw new AuthorizationError("selected school year belongs to this launch");
    if(!data.schoolYearId&&matchingYears.length>1)throw new Error("Choose which existing school year this launch should use");
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
      if(data.gradeScaleId&&!grades.some(grade=>grade.id===data.gradeScaleId))
        throw new AuthorizationError("school-owned active grading scale");
      const gradeScaleId = (!data.useStandardGradeScale&&(data.gradeScaleId??selected?.id)) || await ensureStandardGradeScale(actor, {
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
      schoolYearId: yearId, structure: data.structure??"semesters",
      ...(data.instructionalDays?{instructionalDays:data.instructionalDays}:{}),
    });
    return { ...result, reused: Boolean(existing), status: "draft" as const };
  });
