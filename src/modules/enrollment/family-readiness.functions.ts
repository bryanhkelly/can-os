import {createServerFn} from "@tanstack/react-start";
import {eq,inArray,and,sql} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {enrollmentReadiness} from "@/domain/enrollment-readiness";
export const getSyntheticFamilyReadiness=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const apps=await db.select({id:s.applications.id,householdId:s.applications.householdId,stage:s.applications.stage,metadata:s.applications.metadata,program:s.programs.name,programId:s.applications.programId,studentProfileId:s.applications.studentProfileId}).from(s.applications).innerJoin(s.programs,eq(s.programs.id,s.applications.programId)).where(sql`${s.applications.metadata}->>'synthetic' = 'true'`).limit(150);
 const synthetic=apps.filter(x=>x.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const journeys=await db.select({id:s.journeys.id,participantId:s.journeys.participantId,status:s.journeys.status}).from(s.journeys).where(inArray(s.journeys.participantId,synthetic.map(x=>x.id)));
 const enrollmentRows=await db.select({studentProfileId:s.enrollments.studentProfileId,programId:s.enrollments.programId,schoolYearId:s.enrollments.schoolYearId,status:s.enrollments.status,kind:s.enrollments.kind}).from(s.enrollments).where(inArray(s.enrollments.studentProfileId,[...new Set(synthetic.map(a=>a.studentProfileId))]));
 const requirements=journeys.length?await db.select({id:s.journeyRequirements.id,journeyId:s.journeyRequirements.journeyId,title:s.journeyRequirements.title,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 return synthetic.map(app=>{const journeyIds=new Set(journeys.filter(j=>j.participantId===app.id).map(j=>j.id));return {id:app.id,householdId:app.householdId,program:app.program,stage:app.stage,journeyStatus:journeys.find(j=>j.participantId===app.id)?.status??null,activeSchoolYears:enrollmentRows.filter(e=>e.studentProfileId===app.studentProfileId&&e.programId===app.programId&&e.kind==="program"&&e.status==="active").map(e=>e.schoolYearId),requirements:requirements.filter(r=>journeyIds.has(r.journeyId)),readiness:enrollmentReadiness(requirements.filter(r=>journeyIds.has(r.journeyId)))};});
});

/** Development-only family checklist. Changes persist in canonical JourneyRequirements. */
export const setSyntheticFamilyRequirement=createServerFn({method:"POST"})
 .validator((data:{applicationId:string;requirementId:string;complete:boolean})=>data)
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  if(!data.applicationId||!data.requirementId)throw new Error("Application and requirement are required");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [app]=await tx.select({id:s.applications.id,metadata:s.applications.metadata})
    .from(s.applications).where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app||app.metadata.synthetic!==true)throw new Error("Synthetic application not found");
   const [journey]=await tx.select({id:s.journeys.id,status:s.journeys.status})
    .from(s.journeys).where(and(eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,app.id))).for("update").limit(1);
   if(!journey||journey.status==="active"||journey.status==="complete"||journey.status==="cancelled")throw new Error("Journey cannot be edited");
   const [requirement]=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status})
    .from(s.journeyRequirements).where(and(eq(s.journeyRequirements.id,data.requirementId),eq(s.journeyRequirements.journeyId,journey.id))).limit(1);
   if(!requirement)throw new Error("Requirement does not belong to this application");
   const next=data.complete?"complete":"needs_you";
   if(requirement.status===next)return {saved:true};
   await tx.update(s.journeyRequirements).set({status:next,completedAt:data.complete?new Date():null,updatedAt:new Date()}).where(eq(s.journeyRequirements.id,requirement.id));
   const all=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(eq(s.journeyRequirements.journeyId,journey.id));
   const everyBlockingComplete=all.every(r=>!r.blocking||(r.id===requirement.id?next:r.status)==="complete");
   await tx.update(s.journeys).set({status:everyBlockingComplete?"ready":"in_progress",updatedAt:new Date()}).where(eq(s.journeys.id,journey.id));
   await tx.insert(s.auditEvents).values({action:"synthetic.enrollment.requirement",resourceType:"journey_requirement",resourceId:requirement.id,before:{status:requirement.status},after:{status:next},context:{synthetic:true,applicationId:app.id}});
   return {saved:true};
  });
 });
