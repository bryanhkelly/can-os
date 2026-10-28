import { db } from "@/db/client";
import { enrollments,programs,sections,terms } from "@/db/schema";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and,asc,eq,inArray,sql } from "drizzle-orm";
import { z } from "zod";
import { getSectionRegistrationPolicy,replaceSectionRegistrationPolicy } from "./section-registration-policy-service";
import { EventTypes } from "@/domain/event-types";
const uuid=z.string().uuid(),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
async function registrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId)throw new AuthorizationError("course policy registrar");
 assertCapability(actor,"registrations:approve");
 return actor;
}
const policy=z.object({
 capacity:z.number().int().min(1).max(5000),
 prerequisites:z.array(z.string().trim().min(1).max(40)).max(30),
 addDropEndsOn:date,withdrawalEndsOn:date,
 meetingKey:z.string().trim().max(100).nullable(),
 credits:z.number().min(0).max(20),
 maxCreditsPerTerm:z.number().min(0).max(40),
 guardianApprovalRequired:z.boolean(),
});
export const listCoursePolicies=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await registrar();
 const ids=actor.scope.programIds??[];
 if(!ids.length)return [];
 const rows=await db.select({
  id:sections.id,code:sections.code,title:sections.title,
  programId:sections.programId,programName:programs.name,
  siteId:sections.siteId,organizationId:programs.organizationId,
  startsOn:terms.startsOn,endsOn:terms.endsOn,
 }).from(sections)
  .innerJoin(programs,eq(programs.id,sections.programId))
  .innerJoin(terms,eq(terms.id,sections.termId))
  .where(inArray(sections.programId,ids)).orderBy(asc(programs.name),asc(sections.title));
 const scoped=rows.filter(r=>actor.scope.organizationIds?.includes(r.organizationId)&&
  (!actor.scope.siteIds?.length||!!r.siteId&&actor.scope.siteIds.includes(r.siteId)));
 return Promise.all(scoped.map(async r=>{
  const effective=await getSectionRegistrationPolicy(r.id);
  return {...r,policy:{
   capacity:effective.enrollmentCapacity,
   prerequisites:effective.prerequisites,
   addDropEndsOn:effective.addDropEndsOn,
   withdrawalEndsOn:effective.withdrawalEndsOn,
   meetingKey:null,
   credits:effective.credits,
   maxCreditsPerTerm:effective.maxCreditsPerTerm,
   guardianApprovalRequired:effective.guardianApprovalRequired,
  }};
 }));
});
export const updateCoursePolicy=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({sectionId:uuid,policy}).parse(v))
 .handler(async({data})=>{
  const actor=await registrar();
  return db.transaction(async tx=>{
   const [section]=await tx.select({
    id:sections.id,metadata:sections.metadata,programId:sections.programId,
    siteId:sections.siteId,organizationId:programs.organizationId,
    startsOn:terms.startsOn,endsOn:terms.endsOn,
   }).from(sections).innerJoin(programs,eq(programs.id,sections.programId))
    .innerJoin(terms,eq(terms.id,sections.termId))
    .where(eq(sections.id,data.sectionId)).for("update").limit(1);
   if(!section||!actor.scope.programIds?.includes(section.programId)||
    !actor.scope.organizationIds?.includes(section.organizationId)||
    (actor.scope.siteIds?.length&&(!section.siteId||!actor.scope.siteIds.includes(section.siteId))))
    throw new AuthorizationError("course policy scope");
   if(data.policy.addDropEndsOn>data.policy.withdrawalEndsOn||
      data.policy.addDropEndsOn>section.endsOn||
      data.policy.withdrawalEndsOn>section.endsOn)
    throw new Error("Registration deadlines must be ordered and inside the academic term");
   if(data.policy.credits>data.policy.maxCreditsPerTerm)
    throw new Error("Course credit exceeds the allowed term maximum");
   const [roster]=await tx.select({count:sql<number>`count(*)::int`})
    .from(enrollments).where(and(eq(enrollments.sectionId,section.id),
     eq(enrollments.kind,"section"),eq(enrollments.status,"active")));
   if((roster?.count??0)>data.policy.capacity)
    throw new Error("Cannot set capacity below the existing active roster ("+
      roster!.count+" students)");
   const before=await getSectionRegistrationPolicy(section.id,tx);
   await replaceSectionRegistrationPolicy(tx,{
    sectionId:section.id,enrollmentCapacity:data.policy.capacity,
    prerequisites:data.policy.prerequisites,addDropEndsOn:data.policy.addDropEndsOn,
    withdrawalEndsOn:data.policy.withdrawalEndsOn,credits:data.policy.credits,
    maxCreditsPerTerm:data.policy.maxCreditsPerTerm,
    guardianApprovalRequired:data.policy.guardianApprovalRequired,
   });
   const after=await getSectionRegistrationPolicy(section.id,tx);
   await emitEvent(tx,{eventType:EventTypes.CourseRegistrationPolicyChanged,
    aggregateType:"section",aggregateId:section.id,actorPersonId:actor.actorPersonId,
    payload:{programId:section.programId,siteId:section.siteId}});
   await writeAudit(tx,actor,{
    action:"course_registration.policy.update",entityType:"section",entityId:section.id,
    scope:{organizationId:section.organizationId,siteId:section.siteId,programId:section.programId},
    before,after});
   return {saved:true};
  });
 });
