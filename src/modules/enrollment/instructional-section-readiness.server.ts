import type { TeachingEligibilityReader } from "@/modules/staffing/teaching-eligibility.server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { courseTemplateVersions, programs, sections } from "@/db/schema";
import { verifiedTeacherSectionIds } from "./verified-section-teachers.server";
import { AuthorizationError } from "@/domain/command-context";
import { hasAccessibleFirstLesson } from "@/domain/first-class-lesson";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

/**
 * Public status and an assignment row are not proof a learner can enter a
 * staffed class. Always use canonical active teacher identity and permission,
 * alongside a published instructional version. The calling family/offer
 * query must additionally prove its enrolled student and school-year scope.
 */
export async function staffedPublishedSectionIds(
  ids:readonly string[],
  executor:TeachingEligibilityReader=db,
):Promise<Set<string>> {
  if(!ids.length)return new Set();
  const teacherSections=await verifiedTeacherSectionIds(ids,executor);
  if(!teacherSections.size)return new Set();
  const rows=await executor.select({id:sections.id,programId:sections.programId,
    curriculum:courseTemplateVersions.curriculum}).from(sections)
    .innerJoin(programs,eq(programs.id,sections.programId))
    .innerJoin(courseTemplateVersions,eq(courseTemplateVersions.id,sections.courseTemplateVersionId))
    .where(and(
      inArray(sections.id,[...teacherSections]),
      eq(sections.active,true),
      eq(courseTemplateVersions.status,"published"),
    ));
  const permitted=new Set<string>();
  for(const programId of new Set(rows.map(row=>row.programId))){
    try{
      await requireChurchHostedOperatingServices(executor,programId,[
        "academic_instruction","curriculum","school_of_record",
      ]);
      permitted.add(programId);
    }catch(error){
      if(!(error instanceof AuthorizationError))throw error;
      // A revoked, expired or unsigned institution/host agreement cannot
      // support a guardian claim that this is a ready teaching class.
    }
  }
  return new Set(rows.filter(row=>permitted.has(row.programId) &&
    hasAccessibleFirstLesson(row.curriculum)).map(row=>row.id));
}
