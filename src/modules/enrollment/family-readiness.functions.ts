import { enrollmentReadiness } from "@/domain/enrollment-readiness";
import { assertProgramGranted,recordAudit,requireActor } from "@/modules/identity/actors.server";
import { operationsSelectionSchema,resolveOperationsSelection } from "@/modules/operations/operations-scope.server";
import { emitEvent,notifyMany } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { authorizeEnrollmentApplication } from "./enrollment-access.server";
import { enrollmentFormState } from "@/domain/enrollment-form";
import { enrollmentFormRevision } from "./enrollment-form.server";
import { enrollmentDocumentStorageVerified } from "@/domain/r2-document-access";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,eq,inArray,asc } from "drizzle-orm";
import { z } from "zod";
const registrar=()=>requireActor(["registrar"],"enrollment.decide");
const requirementInput=z.object({applicationId:z.string().uuid(),requirementId:z.string().uuid()});
export const getFamilyReadiness=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.extend({page:z.coerce.number().int().min(1).max(10000).default(1),applicationId:z.string().uuid().optional()}).parse(value??{}))
 .handler(async({data})=>{
 const actor=await registrar();
 setResponseHeader("Cache-Control","private, no-store");
 const scoped=await resolveOperationsSelection(actor,data);
 if(!scoped.programIds.length)return {items:[],hasMore:false,nextPage:null};
 if(!process.env.DATABASE_URL)return {items:[],hasMore:false,nextPage:null};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const apps=await db.select({id:s.applications.id,householdId:s.applications.householdId,stage:s.applications.stage,metadata:s.applications.metadata,program:s.programs.name,programId:s.applications.programId,studentProfileId:s.applications.studentProfileId}).from(s.applications).innerJoin(s.programs,eq(s.programs.id,s.applications.programId)).where(and(inArray(s.applications.programId,scoped.programIds),data.applicationId?eq(s.applications.id,data.applicationId):undefined)).orderBy(asc(s.applications.id)).limit(41).offset(data.applicationId?0:(data.page-1)*40);
 const hasMore=!data.applicationId&&apps.length>40;
 apps.splice(40);
 const synthetic=apps;
 if(!synthetic.length)return {items:[],hasMore:false,nextPage:null};
 const journeys=await db.select({id:s.journeys.id,participantId:s.journeys.participantId,status:s.journeys.status}).from(s.journeys).where(and(eq(s.journeys.participantType,"application"),inArray(s.journeys.participantId,synthetic.map(x=>x.id))));
 const enrollmentRows=await db.select({studentProfileId:s.enrollments.studentProfileId,programId:s.enrollments.programId,schoolYearId:s.enrollments.schoolYearId,status:s.enrollments.status,kind:s.enrollments.kind}).from(s.enrollments).where(inArray(s.enrollments.studentProfileId,[...new Set(synthetic.map(a=>a.studentProfileId))]));
 const offers=await db.select({applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status,schoolYearId:s.admissionOffers.schoolYearId,respondedAt:s.admissionOffers.respondedAt,expiresAt:s.admissionOffers.expiresAt}).from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId,synthetic.map(x=>x.id)));
 const requirements=journeys.length?await db.select({id:s.journeyRequirements.id,journeyId:s.journeyRequirements.journeyId,title:s.journeyRequirements.title,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking,evidence:s.journeyRequirements.evidence,metadata:s.journeyRequirements.metadata}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 const withForms=requirements.map(requirement=>{
  const state=enrollmentFormState(requirement.metadata,requirement.evidence);
  return {...requirement,form:state?{...state,revision:enrollmentFormRevision(state.form)}:null};
 });
 const requirementIds=requirements.map(r=>r.id);
 const uploadedDocuments=requirementIds.length?await db.select({id:s.documents.id,subjectId:s.documents.subjectId,fileName:s.documents.fileName,createdAt:s.documents.createdAt,metadata:s.documents.metadata})
  .from(s.documents).where(and(eq(s.documents.subjectType,"journey_requirement"),eq(s.documents.storageProvider,"cloudflare_r2"),inArray(s.documents.subjectId,requirementIds))):[];
 const items=synthetic.map(app=>{const isFixture=app.metadata.synthetic===true;const journeyIds=new Set(journeys.filter(j=>j.participantId===app.id).map(j=>j.id));return {id:app.id,isFixture,householdId:app.householdId,program:app.program,stage:app.stage,journeyStatus:journeys.find(j=>j.participantId===app.id)?.status??null,activeSchoolYears:enrollmentRows.filter(e=>e.studentProfileId===app.studentProfileId&&e.programId===app.programId&&e.kind==="program"&&e.status==="active").map(e=>e.schoolYearId),offers:offers.filter(o=>o.applicationId===app.id).map(o=>({...o,respondedAt:o.respondedAt?.toISOString()??null,expiresAt:o.expiresAt?.toISOString()??null})),requirements:withForms.filter(r=>journeyIds.has(r.journeyId)).map(({metadata,...r})=>({...r,documents:uploadedDocuments.filter(d=>d.subjectId===r.id&&d.metadata.applicationId===app.id).map(d=>({id:d.id,fileName:d.fileName,uploadedAt:d.createdAt.toISOString(),reviewStatus:typeof d.metadata.reviewStatus==="string"?d.metadata.reviewStatus:"received",version:typeof d.metadata.version==="number"?d.metadata.version:1,isCurrent:d.metadata.isCurrent!==false})),evidence:r.evidence.filter(e=>(e.kind==="registrar_note"&&typeof e.text==="string")||(e.kind==="document_review"&&typeof e.status==="string")).map(e=>({kind:String(e.kind),text:typeof e.text==="string"?e.text:"",status:typeof e.status==="string"?e.status:"",reviewedAt:typeof e.reviewedAt==="string"?e.reviewedAt:"",documentId:typeof e.documentId==="string"?e.documentId:""}))})),readiness:enrollmentReadiness(requirements.filter(r=>journeyIds.has(r.journeyId)))};});
 return {items,hasMore,nextPage:hasMore?data.page+1:null};
});

/** Registrar readiness review over canonical JourneyRequirements. */
export const setFamilyRequirement=createServerFn({method:"POST"})
 .validator((data:unknown)=>requirementInput.extend({complete:z.boolean()}).parse(data))
 .handler(async({data})=>{
  const actor=await registrar();
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [app]=await tx.select({id:s.applications.id,metadata:s.applications.metadata,programId:s.applications.programId})
    .from(s.applications).where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app)throw new Error("Application not found");
   assertProgramGranted(actor,app.programId);
   const [journey]=await tx.select({id:s.journeys.id,status:s.journeys.status})
    .from(s.journeys).where(and(eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,app.id))).for("update").limit(1);
   if(!journey||journey.status==="active"||journey.status==="complete"||journey.status==="cancelled")throw new Error("Journey cannot be edited");
   const [requirement]=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status,evidence:s.journeyRequirements.evidence,metadata:s.journeyRequirements.metadata})
    .from(s.journeyRequirements).where(and(eq(s.journeyRequirements.id,data.requirementId),eq(s.journeyRequirements.journeyId,journey.id))).limit(1);
   if(!requirement)throw new Error("Requirement does not belong to this application");
   if(requirement.metadata.enrollmentForm!==undefined)
    throw new Error("Signed form requirements must be completed through registrar form review, without a checklist waiver");
   const documentReview=[...requirement.evidence].reverse().find(entry=>entry.kind==="document_review");
   if(data.complete&&documentReview&&documentReview.status!=="accepted")
    throw new Error("Review and accept the current enrollment document before completing this requirement");
   const next=data.complete?"complete":"needs_you";
   if(requirement.status===next)return {saved:true};
   await tx.update(s.journeyRequirements).set({status:next,completedAt:data.complete?new Date():null,updatedAt:new Date()}).where(eq(s.journeyRequirements.id,requirement.id));
   const all=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(eq(s.journeyRequirements.journeyId,journey.id));
   const everyBlockingComplete=all.every(r=>!r.blocking||(r.id===requirement.id?next:r.status)==="complete");
   const journeyStatus=everyBlockingComplete?"ready":"in_progress";
   await tx.update(s.journeys).set({status:journeyStatus,updatedAt:new Date()}).where(eq(s.journeys.id,journey.id));
   await recordAudit(tx,actor,{action:"enrollment.requirement.set",resourceType:"journey_requirement",resourceId:requirement.id,before:{status:requirement.status,journeyStatus:journey.status},after:{status:next,journeyStatus},scope:{applicationId:app.id,programId:app.programId,journeyId:journey.id}});
   await emitEvent(tx,{eventType:EventTypes.JourneyRequirementStatusChanged,aggregateType:"journey_requirement",
    aggregateId:requirement.id,actorPersonId:actor.actorPersonId,programId:app.programId,
    payload:{applicationId:app.id,journeyId:journey.id,before:{status:requirement.status,journeyStatus:journey.status},
     after:{status:next,journeyStatus}}});
   return {saved:true};
  });
 });

/** Synthetic registrar checklist review note; not a document upload or guardian signature. */
export const addRequirementReviewNote=createServerFn({method:"POST"})
 .validator((data:unknown)=>requirementInput.extend({note:z.string().trim().min(5,"Review note must be 5–500 characters").max(500,"Review note must be 5–500 characters")}).parse(data))
 .handler(async({data})=>{
  const actor=await registrar();
  const note=data.note;
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [app]=await tx.select({id:s.applications.id,metadata:s.applications.metadata,programId:s.applications.programId})
    .from(s.applications).where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app)throw new Error("Application not found");
   assertProgramGranted(actor,app.programId);
   const [journey]=await tx.select({id:s.journeys.id,status:s.journeys.status}).from(s.journeys)
    .where(and(eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,app.id))).limit(1);
   if(!journey||["active","complete","cancelled"].includes(journey.status))throw new Error("Enrollment journey cannot be edited");
   const [requirement]=await tx.select({id:s.journeyRequirements.id,evidence:s.journeyRequirements.evidence})
    .from(s.journeyRequirements).where(and(eq(s.journeyRequirements.id,data.requirementId),eq(s.journeyRequirements.journeyId,journey.id))).for("update").limit(1);
   if(!requirement)throw new Error("Requirement does not belong to this application");
   const entry={kind:"registrar_note",text:note,createdAt:new Date().toISOString()};
   await tx.update(s.journeyRequirements).set({evidence:[...requirement.evidence,entry],updatedAt:new Date()}).where(eq(s.journeyRequirements.id,requirement.id));
   await recordAudit(tx,actor,{action:"enrollment.requirement.note",resourceType:"journey_requirement",resourceId:requirement.id,after:{kind:entry.kind},scope:{applicationId:app.id,programId:app.programId}});
   return {saved:true};
  });
 });

/** Registrar review of a requested or storage-verified enrollment document. */
export const reviewRequirementDocument=createServerFn({method:"POST"})
 .validator((data:unknown)=>requirementInput.extend({status:z.enum(["requested","received","accepted","rejected"]),reason:z.string().trim().max(400,"Rejection requires a 5–400 character reason"),documentId:z.string().uuid().optional()}).refine(v=>v.status!=="rejected"||v.reason.length>=5,"Rejection requires a 5–400 character reason").parse(data))
 .handler(async({data})=>{
  const actor=await registrar();
  const reason=data.reason;
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const scope=await authorizeEnrollmentApplication(actor,data.applicationId,tx);
   if(["withdrawn","declined"].includes(scope.stage))throw new Error("This application is closed to enrollment document changes");
   const [app]=await tx.select({id:s.applications.id,metadata:s.applications.metadata,programId:s.applications.programId}).from(s.applications).where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app)throw new Error("Application not found");
   assertProgramGranted(actor,app.programId);
   const [journey]=await tx.select({id:s.journeys.id,status:s.journeys.status}).from(s.journeys).where(and(eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,app.id))).for("update").limit(1);
   if(!journey||["active","complete","cancelled"].includes(journey.status))throw new Error("Journey cannot be edited");
   const [requirement]=await tx.select({id:s.journeyRequirements.id,status:s.journeyRequirements.status,evidence:s.journeyRequirements.evidence,metadata:s.journeyRequirements.metadata}).from(s.journeyRequirements).where(and(eq(s.journeyRequirements.id,data.requirementId),eq(s.journeyRequirements.journeyId,journey.id))).for("update").limit(1);
   if(!requirement)throw new Error("Requirement does not belong to this application");
   if(requirement.metadata.enrollmentForm!==undefined)throw new Error("A signed form requires registrar form review, not document approval");
   const documentId=data.documentId??null;
   if(data.status==="accepted"&&!documentId)throw new Error("Select an uploaded document before accepting");
   let reviewedDocument:null|{id:string;metadata:Record<string,unknown>}=null;
   if(documentId){
    const [record]=await tx.select({id:s.documents.id,metadata:s.documents.metadata}).from(s.documents)
      .where(and(eq(s.documents.id,documentId),eq(s.documents.subjectType,"journey_requirement"),eq(s.documents.subjectId,requirement.id),eq(s.documents.storageProvider,"cloudflare_r2"))).for("update").limit(1);
    if(!record||record.metadata.applicationId!==app.id)throw new Error("Document is outside this enrollment requirement");
    if(record.metadata.isCurrent===false)throw new Error("Superseded documents cannot be reviewed");
    if(!enrollmentDocumentStorageVerified(record.metadata,scope.organizationId))
     throw new Error("The uploaded file has not passed storage verification");
    reviewedDocument=record;
   }
   const previous=[...requirement.evidence].reverse().find(e=>e.kind==="document_review");
   if(previous?.status===data.status&&previous?.text===reason&&(previous?.documentId??null)===documentId)return {saved:true};
   const now=new Date(),next=data.status==="accepted"?"complete":"needs_you";
   const entry={kind:"document_review",status:data.status,text:reason,documentId,reviewedAt:now.toISOString()};
   if(reviewedDocument)await tx.update(s.documents).set({metadata:{...reviewedDocument.metadata,reviewStatus:data.status,reviewReason:reason},verifiedAt:data.status==="accepted"?now:null,verifiedByPersonId:data.status==="accepted"?actor.actorPersonId:null,updatedAt:now}).where(eq(s.documents.id,reviewedDocument.id));
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
    const notifiedGuardians=[...new Set(guardians.map(g=>g.personId))];
    if(notifiedGuardians.length)await notifyMany(tx, notifiedGuardians.map(recipientPersonId=>({
      recipientPersonId,type:"enrollment_document_"+data.status,status:"unread" as const,
      title:data.status==="rejected"?"Enrollment document needs correction":"Enrollment document requested",
      body:data.status==="rejected"?"Please review the enrollment checklist and resubmit the requested information. "+reason:"Please review the outstanding requirement in the enrollment checklist.",
      resourceType:"application",resourceId:app.id
    })));
   }
   await recordAudit(tx,actor,{action:"enrollment.document.review",resourceType:"journey_requirement",resourceId:requirement.id,before:{status:previous?.status??null},after:{status:data.status,reason,documentId},scope:{applicationId:app.id,programId:app.programId}});
   await emitEvent(tx,{eventType:EventTypes.EnrollmentDocumentReviewed,aggregateType:"journey_requirement",
    aggregateId:requirement.id,actorPersonId:actor.actorPersonId,organizationId:scope.organizationId,
    siteId:scope.siteId,programId:scope.programId,
    payload:{applicationId:app.id,documentId,status:data.status,journeyStatus:ready?"ready":"in_progress"}});
   return {saved:true};
  });
 });

/** Compatibility for existing route imports while consumers migrate. */
export const getSyntheticFamilyReadiness=getFamilyReadiness;
export const setSyntheticFamilyRequirement=setFamilyRequirement;
export const addSyntheticRequirementReviewNote=addRequirementReviewNote;

/** Compatibility name for existing routes. */
export const reviewSyntheticRequirementDocument=reviewRequirementDocument;
