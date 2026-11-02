import {createServerFn} from "@tanstack/react-start";
import {and,asc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {applications,admissionOffers,admissionSeatPools,guardianRelationships,studentProfiles,schoolYears} from "@/db/schema";
import {issueAdmissionOfferCommand,respondToAdmissionOfferCommand,activateOfferedEnrollmentCommand,withdrawAdmissionOffer} from "./admissions-offer-service";
import {z} from "zod";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {operationsSelectionSchema,resolveOperationsSelection} from "@/modules/operations/operations-scope.server";
import {assertCapability,assertProgramScope,AuthorizationError} from "@/domain/command-context";
import {familyApplicationSchoolYearId} from "@/domain/family-application-handoff";

async function authorizedActor(role:"registrar"|"guardian",capability:string,programId:string){
 const actor=await getCommandContext(getRequest());
 if(actor.role!==role||!actor.actorPersonId)throw new AuthorizationError(role+" admission access");
 assertCapability(actor,capability);
 if(role==="guardian"){
  // Guardian access remains bound to the explicit Program grant and the
  // verified student relationship checked by the offer command.
  if(!actor.scope.programIds?.includes(programId))throw new AuthorizationError("admissions program membership");
 }else{
  const {programs}=await import("@/db/schema");
  const [program]=await db.select({organizationId:programs.organizationId,siteId:programs.siteId})
   .from(programs).where(eq(programs.id,programId)).limit(1);
  if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
    (actor.scope.siteIds!==undefined&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))
   throw new AuthorizationError("admissions program membership");
 }
 assertProgramScope(actor,programId);
 return actor;
}

export const getAdmissionOfferOptions=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.extend({
  applicationId:z.string().uuid().optional(),
 }).strict().parse(value??{}))
 .handler(async({data})=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.organizationIds?.length)throw new AuthorizationError("registrar offer options");
 assertCapability(actor,"enrollment.decide");
 const scoped=await resolveOperationsSelection(actor,{siteId:data.siteId,programId:data.programId});
 if(!process.env.DATABASE_URL||!data.applicationId||!scoped.programIds.length)return [];
 const apps=await db.select({id:applications.id,programId:applications.programId,metadata:applications.metadata})
  .from(applications).where(and(inArray(applications.programId,scoped.programIds),eq(applications.id,data.applicationId))).limit(1);
 if(!apps.length)return [];
 const pools=await db.select({programId:admissionSeatPools.programId,schoolYearId:admissionSeatPools.schoolYearId,capacity:admissionSeatPools.capacity,name:schoolYears.name})
  .from(admissionSeatPools).innerJoin(schoolYears,eq(schoolYears.id,admissionSeatPools.schoolYearId))
  .where(inArray(admissionSeatPools.programId,scoped.programIds))
  .orderBy(asc(schoolYears.name),asc(schoolYears.id));
 return apps.map(app=>({applicationId:app.id,years:pools.filter(p=>
  p.programId===app.programId&&(!familyApplicationSchoolYearId(app.metadata)||
   familyApplicationSchoolYearId(app.metadata)===p.schoolYearId))
  .map(p=>({id:p.schoolYearId,name:p.name,capacity:p.capacity}))}));
});

async function loadApplication(id:string){
 const [app]=await db.select({id:applications.id,programId:applications.programId,studentProfileId:applications.studentProfileId,metadata:applications.metadata}).from(applications).where(eq(applications.id,id)).limit(1);
 if(!app)throw new Error("Application not found");
 return app;
}
async function loadOffer(id:string){
 const [offer]=await db.select({id:admissionOffers.id,applicationId:admissionOffers.applicationId,programId:admissionOffers.programId}).from(admissionOffers).where(eq(admissionOffers.id,id)).limit(1);
 if(!offer)throw new Error("Offer not found");
 const app=await loadApplication(offer.applicationId);
 if(app.programId!==offer.programId)throw new Error("Offer program mismatch");
 return {offer,app};
}
export const issueAdmissionOffer=createServerFn({method:"POST"})
.validator((data:unknown)=>z.object({applicationId:z.string().uuid(),schoolYearId:z.string().uuid()}).strict().parse(data)).handler(async({data})=>{
 const app=await loadApplication(data.applicationId);
 const actor=await authorizedActor("registrar","enrollment.decide",app.programId);
 // A stable key makes concurrent retries safe; the domain service rejects a second active offer.
 // Explicit reissuance after expiration/decline requires a distinct attempt identifier.
 const previous=await db.select({id:admissionOffers.id,status:admissionOffers.status,idempotencyKey:admissionOffers.idempotencyKey,expiresAt:admissionOffers.expiresAt}).from(admissionOffers).where(and(eq(admissionOffers.applicationId,app.id),eq(admissionOffers.schoolYearId,data.schoolYearId)));
 const active=previous.find(o=>o.status==="accepted"||(o.status==="issued"&&(!o.expiresAt||o.expiresAt.getTime()>Date.now())));
 const key=active?.idempotencyKey??"synthetic-offer:"+app.id+":"+data.schoolYearId+":attempt-"+(previous.length+1);
 const expiresAt=new Date(Date.now()+14*24*60*60*1000);
 return {offerId:await issueAdmissionOfferCommand(actor,{applicationId:app.id,schoolYearId:data.schoolYearId,idempotencyKey:key,expiresAt})};
});
export const respondToAdmissionOffer=createServerFn({method:"POST"})
.validator((data:unknown)=>z.object({offerId:z.string().uuid(),decision:z.enum(["accept","decline"])}).strict().parse(data)).handler(async({data})=>{
 if(!["accept","decline"].includes(data.decision))throw new Error("Invalid decision");
 const {offer,app}=await loadOffer(data.offerId);
 const actor=await authorizedActor("guardian","enrollment.apply",app.programId);
 const [profile]=await db.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
 if(!profile)throw new Error("Student profile missing");
 const [guardian]=await db.select({id:guardianRelationships.guardianPersonId}).from(guardianRelationships).where(and(eq(guardianRelationships.studentPersonId,profile.personId),eq(guardianRelationships.canManageEnrollment,true),eq(guardianRelationships.guardianPersonId,actor.actorPersonId!))).limit(1);
 if(!guardian)throw new Error("Guardian relationship missing");
 return {offerId:await respondToAdmissionOfferCommand(actor,offer.id,data.decision)};
});
export const activateOfferedEnrollment=createServerFn({method:"POST"})
.validator((data:unknown)=>z.object({offerId:z.string().uuid(),sectionId:z.string().uuid().optional()}).strict().parse(data)).handler(async({data})=>{
 const {offer,app}=await loadOffer(data.offerId);
 const actor=await authorizedActor("registrar","enrollment.activate",app.programId);
 return {enrollmentId:await activateOfferedEnrollmentCommand(actor,offer.id,data.sectionId)};
});

export const withdrawIssuedAdmissionOffer=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({offerId:z.string().uuid(),
  reason:z.string().trim().min(10).max(2000),confirmed:z.literal(true)}).strict().parse(value))
 .handler(async({data})=>{
  const {app}=await loadOffer(data.offerId);
  const actor=await authorizedActor("registrar","enrollment.decide",app.programId);
  return withdrawAdmissionOffer(actor,data);
 });
