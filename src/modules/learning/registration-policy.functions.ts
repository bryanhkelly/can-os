import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {and,asc,eq,inArray} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {sections,terms,programs,auditEvents,domainEvents} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
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
});
export const listCoursePolicies=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await registrar();
 const ids=actor.scope.programIds??[];
 if(!ids.length)return [];
 const rows=await db.select({
  id:sections.id,code:sections.code,title:sections.title,metadata:sections.metadata,
  programId:sections.programId,programName:programs.name,
  siteId:sections.siteId,organizationId:programs.organizationId,
  startsOn:terms.startsOn,endsOn:terms.endsOn,
 }).from(sections)
  .innerJoin(programs,eq(programs.id,sections.programId))
  .innerJoin(terms,eq(terms.id,sections.termId))
  .where(inArray(sections.programId,ids)).orderBy(asc(programs.name),asc(sections.title));
 return rows.filter(r=>actor.scope.organizationIds?.includes(r.organizationId)&&
  (!actor.scope.siteIds?.length||!!r.siteId&&actor.scope.siteIds.includes(r.siteId)))
 .map(r=>({
  ...r,policy:{
   capacity:typeof r.metadata.registrationPolicy==="object"&&r.metadata.registrationPolicy!==null&&
    typeof (r.metadata.registrationPolicy as Record<string,unknown>).capacity==="number"?
    Number((r.metadata.registrationPolicy as Record<string,unknown>).capacity):30,
   prerequisites:Array.isArray((r.metadata.registrationPolicy as Record<string,unknown>|undefined)?.prerequisites)?
    (r.metadata.registrationPolicy as {prerequisites:string[]}).prerequisites:[],
   addDropEndsOn:String((r.metadata.registrationPolicy as Record<string,unknown>|undefined)?.addDropEndsOn??r.startsOn),
   withdrawalEndsOn:String((r.metadata.registrationPolicy as Record<string,unknown>|undefined)?.withdrawalEndsOn??r.endsOn),
   meetingKey:typeof (r.metadata.registrationPolicy as Record<string,unknown>|undefined)?.meetingKey==="string"?
    String((r.metadata.registrationPolicy as Record<string,unknown>).meetingKey):null,
   credits:typeof r.metadata.credits==="number"?r.metadata.credits:1,
   maxCreditsPerTerm:typeof r.metadata.maxCreditsPerTerm==="number"?r.metadata.maxCreditsPerTerm:7,
  },
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
      data.policy.addDropEndsOn<section.startsOn||
      data.policy.withdrawalEndsOn>section.endsOn)
    throw new Error("Registration deadlines must be ordered and inside the academic term");
   if(data.policy.credits>data.policy.maxCreditsPerTerm)
    throw new Error("Course credit exceeds the allowed term maximum");
   const before=section.metadata;
   const after={...before,credits:data.policy.credits,maxCreditsPerTerm:data.policy.maxCreditsPerTerm,
    registrationPolicy:{
     capacity:data.policy.capacity,prerequisites:data.policy.prerequisites,
     addDropEndsOn:data.policy.addDropEndsOn,
     withdrawalEndsOn:data.policy.withdrawalEndsOn,meetingKey:data.policy.meetingKey,
    }};
   await tx.update(sections).set({metadata:after,updatedAt:new Date()})
    .where(eq(sections.id,section.id));
   await tx.insert(domainEvents).values({eventType:"CourseRegistrationPolicyChanged",
    aggregateType:"section",aggregateId:section.id,actorPersonId:actor.actorPersonId,
    payload:{programId:section.programId,siteId:section.siteId}});
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    action:"course_registration.policy.update",resourceType:"section",resourceId:section.id,
    scope:{organizationId:section.organizationId,siteId:section.siteId,programId:section.programId},
    before,after});
   return {saved:true};
  });
 });
