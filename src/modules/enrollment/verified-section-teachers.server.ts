import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { sections, sectionTeachers } from "@/db/schema";
import {
  evaluateTeachingEligibility, type TeachingEligibilityReader,
} from "@/modules/staffing/teaching-eligibility.server";

/** Placement preview and transactional allocation use the same full-term
 * teacher decision as launch. Contracts, curriculum and student scope remain
 * separate gates in the caller. No readiness result is cached across commands.
 */
export async function verifiedTeacherSectionIds(
  sectionIds:readonly string[],executor:TeachingEligibilityReader=db,
):Promise<Set<string>>{
  const ids=[...new Set(sectionIds)];
  if(!ids.length)return new Set();
  const assignments=await executor.select({
    sectionId:sectionTeachers.sectionId,personId:sectionTeachers.personId,
  }).from(sectionTeachers)
    .innerJoin(sections,eq(sections.id,sectionTeachers.sectionId))
    .where(and(inArray(sections.id,ids),eq(sections.active,true)))
    .orderBy(sectionTeachers.sectionId,sectionTeachers.personId);
  const verified=new Set<string>();
  const evaluated=new Set<string>();
  for(const assignment of assignments){
    const key=assignment.sectionId+":"+assignment.personId;
    if(verified.has(assignment.sectionId)||evaluated.has(key))continue;
    evaluated.add(key);
    const result=await evaluateTeachingEligibility(
      assignment.sectionId,assignment.personId,executor,{
        horizon:"instructional_window",requireAssignment:true,
      },
    );
    if(result.eligible)verified.add(assignment.sectionId);
  }
  return verified;
}
