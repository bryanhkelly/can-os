import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { sections, sectionTeachers } from "@/db/schema";
import {
  evaluateTeachingEligibility, type TeachingEligibilityReader,
} from "@/modules/staffing/teaching-eligibility.server";
import { evaluateInstructionalCoverage } from "@/modules/staffing/instructional-coverage.server";

/** Placement preview and transactional allocation require full-term delivery
 * coverage for the section AND every assigned teacher to independently pass
 * teaching eligibility, matching launch multi-instructor eligibility. One
 * instructor's coverage is never combined with another's qualifications.
 * Contracts, curriculum and student scope remain separate gates in the caller.
 * No readiness result is cached across commands.
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
    .where(and(inArray(sections.id,ids),eq(sections.active,true),eq(sectionTeachers.role,"teacher")))
    .orderBy(sectionTeachers.sectionId,sectionTeachers.personId);
  const coverageBySection=new Map<string,Awaited<ReturnType<typeof evaluateInstructionalCoverage>>>();
  for(const sectionId of new Set(assignments.map(assignment=>assignment.sectionId))){
    coverageBySection.set(sectionId,await evaluateInstructionalCoverage(sectionId,executor));
  }
  const assignmentsBySection=new Map<string,typeof assignments>();
  for(const assignment of assignments){
    const group=assignmentsBySection.get(assignment.sectionId);
    if(group)group.push(assignment);else assignmentsBySection.set(assignment.sectionId,[assignment]);
  }
  const verified=new Set<string>();
  for(const [sectionId,sectionAssignments] of assignmentsBySection){
    const coverage=coverageBySection.get(sectionId);
    if(!coverage?.covered)continue;
    const evaluated=new Set<string>();
    let allEligible=true;
    for(const assignment of sectionAssignments){
      if(evaluated.has(assignment.personId))continue;
      evaluated.add(assignment.personId);
      const result=await evaluateTeachingEligibility(
        sectionId,assignment.personId,executor,{
          horizon:"instructional_window",requireAssignment:true,
        },
      );
      if(!result.eligible){allEligible=false;break;}
    }
    if(allEligible)verified.add(sectionId);
  }
  return verified;
}
