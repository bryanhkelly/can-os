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
 const offers=await db.select({applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status,schoolYearId:s.admissionOffers.schoolYearId,respondedAt:s.admissionOffers.respondedAt,expiresAt:s.admissionOffers.expiresAt}).from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId,synthetic.map(x=>x.id)));
 const requirements=journeys.length?await db.select({id:s.journeyRequirements.id,journeyId:s.journeyRequirements.journeyId,title:s.journeyRequirements.title,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking,evidence:s.journeyRequirements.evidence}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 return synthetic.map(app=>{const journeyIds=new Set(journeys.filter(j=>j.participantId===app.id).map(j=>j.id));return {id:app.id,householdId:app.householdId,program:app.program,stage:app.stage,journeyStatus:journeys.find(j=>j.participantId===app.id)?.status??null,activeSchoolYears:enrollmentRows.filter(e=>e.studentProfileId===app.studentProfileId&&e.programId===app.programId&&e.kind==="program"&&e.status==="active").map(e=>e.schoolYearId),offers:offers.filter(o=>o.applicationId===app.id).map(o=>({...o,respondedAt:o.respondedAt?.toISOString()??null,expiresAt:o.expiresAt?.toISOString()??null})),requirements:requirements.filter(r=>journeyIds.has(r.journeyId)).map(r=>({...r,evidence:r.evidence.filter(e=>(e.kind==="registrar_note"&&typeof e.text==="string")||(e.kind==="document_review"&&typeof e.status==="string")).map(e=>({kind:String(e.kind),text:typeof e.text==="string"?e.text:"",status:typeof e.status==="string"?e.status:"",reviewedAt:typeof e.reviewedAt==="string"?e.reviewedAt:""}))})),readiness:enrollmentReadiness(requirements.filter(r=>journeyIds.has(r.journeyId)))};});
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

/** Synthetic registrar checklist review note; not a document upload or guardian signature. */
export const addSyntheticRequirementReviewNote=createServerFn({method:"POST"})
 .validator((data:{applicationId:string;requirementId:string;note:string})=>data)
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  const note=data.note.trim();
  if(note.length<5||note.length>500)throw new Error("Review note must be 5–500 characters");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [app]=await tx.select({id:s.applications.id,metadata:s.applications.metadata})
    .from(s.applications).where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app||app.metadata.synthetic!==true)throw new Error("Synthetic application not found");
   const [journey]=await tx.select({id:s.journeys.id,status:s.journeys.status}).from(s.journeys)
    .where(and(eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,app.id))).limit(1);
   if(!journey)throw new Error("Enrollment journey not found");
   const [requirement]=await tx.select({id:s.journeyRequirements.id,evidence:s.journeyRequirements.evidence})
    .from(s.journeyRequirements).where(and(eq(s.journeyRequirements.id,data.requirementId),eq(s.journeyRequirements.journeyId,journey.id))).for("update").limit(1);
   if(!requirement)throw new Error("Requirement does not belong to this application");
   const entry={kind:"registrar_note",text:note,createdAt:new Date().toISOString(),synthetic:true};
   await tx.update(s.journeyRequirements).set({evidence:[...requirement.evidence,entry],updatedAt:new Date()}).where(eq(s.journeyRequirements.id,requirement.id));
   await tx.insert(s.auditEvents).values({action:"synthetic.enrollment.requirement.note",resourceType:"journey_requirement",resourceId:requirement.id,after:{kind:entry.kind},context:{synthetic:true,applicationId:app.id}});
   return {saved:true};
  });
 });

/** Review state for synthetic document requirements. Does not upload or validate real files. */
export const reviewSyntheticRequirementDocument=createServerFn({method:"POST"})
 .validator((data:{applicationId:string;requirementId:string;status:"requested"|"received"|"accepted"|"rejected";reason:string})=>data)
 .handler(async({data})=>{
  assertSyntheticMutation("registrar");
  if(!["requested","received","accepted","rejected"].includes(data.status))throw new Error("Invalid review status");
  const reason=data.reason.trim();
  if(reason.length>400||(data.status==="rejected"&&reason.length<5))throw new Error("Rejection requires a 5–400 character reason");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [app]=await tx.select({id:s.applications.id,metadata:s.applications.metadata}).from(s.applications).where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app||app.metadata.synthetic!==true)throw new Error("Synthetic application not found");
   const [journey]=await tx.select({id:s.journeys.id,status:s.journeys.status}).from(s.journeys).where(and(eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,app.id))).for("update").limit(1);
   if(!journey||["active","complete","cancelled"].includes(journey.status))throw new Error("Journey cannot be edited");
   const [requirement]=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status,evidence:s.journeyRequirements.evidence}).from(s.journeyRequirements).where(and(eq(s.journeyRequirements.id,data.requirementId),eq(s.journeyRequirements.journeyId,journey.id))).for("update").limit(1);
   if(!requirement)throw new Error("Requirement does not belong to this application");
   const previous=[...requirement.evidence].reverse().find(e=>e.kind==="document_review");
   if(previous?.status===data.status&&previous?.text===reason)return {saved:true};
   const now=new Date(),next=data.status==="accepted"?"complete":"needs_you";
   const entry={kind:"document_review",status:data.status,text:reason,reviewedAt:now.toISOString(),synthetic:true};
   await tx.update(s.journeyRequirements).set({evidence:[...requirement.evidence,entry],status:next,completedAt:next==="complete"?now:null,updatedAt:now}).where(eq(s.journeyRequirements.id,requirement.id));
   const all=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(eq(s.journeyRequirements.journeyId,journey.id));
   const ready=all.every(r=>!r.blocking||(r.id===requirement.id?next:r.status)==="complete");
   await tx.update(s.journeys).set({status:ready?"ready":"in_progress",updatedAt:now}).where(eq(s.journeys.id,journey.id));
   if(data.status==="rejected"||data.status==="requested"){
    const [profile]=await tx.select({personId:s.studentProfiles.personId}).from(s.studentProfiles)
     .innerJoin(s.applications,eq(s.applications.studentProfileId,s.studentProfiles.id))
     .where(eq(s.applications.id,app.id)).limit(1);
    if(!profile)throw new Error("Student profile missing");
    const guardians=await tx.select({personId:s.guardianRelationships.guardianPersonId,metadata:s.people.metadata})
     .from(s.guardianRelationships).innerJoin(s.people,eq(s.people.id,s.guardianRelationships.guardianPersonId))
     .where(and(eq(s.guardianRelationships.studentPersonId,profile.personId),eq(s.guardianRelationships.canManageEnrollment,true)));
    const syntheticGuardians=[...new Set(guardians.filter(g=>g.metadata.synthetic===true).map(g=>g.personId))];
    if(syntheticGuardians.length)await tx.insert(s.notifications).values(syntheticGuardians.map(recipientPersonId=>({
      recipientPersonId,type:"enrollment_document_"+data.status,status:"unread" as const,
      title:data.status==="rejected"?"Enrollment document needs correction":"Enrollment document requested",
      body:data.status==="rejected"?"Please review the enrollment checklist and resubmit the requested information. "+reason:"Please review the outstanding requirement in the enrollment checklist.",
      resourceType:"application",resourceId:app.id
    })));
   }
   await tx.insert(s.auditEvents).values({action:"synthetic.enrollment.document.review",resourceType:"journey_requirement",resourceId:requirement.id,before:{status:previous?.status??null},after:{status:data.status,reason},context:{synthetic:true,applicationId:app.id}});
   return {saved:true};
  });
 });
