import {createServerFn} from "@tanstack/react-start";
import {and,eq,sql,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {applications,admissionOffers,admissionSeatPools,guardianRelationships,studentProfiles,schoolYears} from "@/db/schema";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {issueSyntheticAdmissionOffer,respondToSyntheticAdmissionOffer,activateSyntheticOfferedEnrollment} from "./admissions-offer-service";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,assertProgramScope,AuthorizationError} from "@/domain/command-context";

async function authorizedActor(role:"registrar"|"guardian",capability:string,programId:string){
 const actor=await getCommandContext(getRequest());
 if(actor.role!==role||!actor.actorPersonId)throw new AuthorizationError(role+" admission access");
 assertCapability(actor,capability);
 if(!actor.scope.programIds?.includes(programId))throw new AuthorizationError("admissions program membership");
 assertProgramScope(actor,programId);
 return actor;
}

export const getSyntheticAdmissionOfferOptions=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.programIds?.length)throw new AuthorizationError("registrar offer options");
 assertCapability(actor,"enrollment.decide");
 if(!process.env.DATABASE_URL)return [];
 const apps=await db.select({id:applications.id,programId:applications.programId,metadata:applications.metadata}).from(applications).where(and(sql`${applications.metadata}->>'synthetic' = 'true'`,inArray(applications.programId,actor.scope.programIds))).limit(150);
 const synthetic=apps.filter(a=>a.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const pools=await db.select({programId:admissionSeatPools.programId,schoolYearId:admissionSeatPools.schoolYearId,capacity:admissionSeatPools.capacity,name:schoolYears.name}).from(admissionSeatPools).innerJoin(schoolYears,eq(schoolYears.id,admissionSeatPools.schoolYearId)).where(inArray(admissionSeatPools.programId,actor.scope.programIds));
 return synthetic.map(app=>({applicationId:app.id,years:pools.filter(p=>p.programId===app.programId).map(p=>({id:p.schoolYearId,name:p.name,capacity:p.capacity}))}));
});

async function syntheticApplication(id:string){
 const [app]=await db.select({id:applications.id,programId:applications.programId,studentProfileId:applications.studentProfileId,metadata:applications.metadata}).from(applications).where(eq(applications.id,id)).limit(1);
 if(!app||app.metadata.synthetic!==true)throw new Error("Synthetic application not found");
 return app;
}
async function syntheticOffer(id:string){
 const [offer]=await db.select({id:admissionOffers.id,applicationId:admissionOffers.applicationId,programId:admissionOffers.programId}).from(admissionOffers).where(eq(admissionOffers.id,id)).limit(1);
 if(!offer)throw new Error("Offer not found");
 const app=await syntheticApplication(offer.applicationId);
 if(app.programId!==offer.programId)throw new Error("Offer program mismatch");
 return {offer,app};
}
export const issueSyntheticOfferFromDemo=createServerFn({method:"POST"})
.validator((data:{applicationId:string;schoolYearId:string})=>data).handler(async({data})=>{
 assertSyntheticMutation("registrar");
 const app=await syntheticApplication(data.applicationId);
 const actor=await authorizedActor("registrar","enrollment.decide",app.programId);
 const previous=await db.select({id:admissionOffers.id,status:admissionOffers.status}).from(admissionOffers).where(and(eq(admissionOffers.applicationId,app.id),eq(admissionOffers.schoolYearId,data.schoolYearId)));
 const key="synthetic-offer:"+app.id+":"+data.schoolYearId+":attempt-"+(previous.length+1);
 const expiresAt=new Date(Date.now()+14*24*60*60*1000);
 return {offerId:await issueSyntheticAdmissionOffer(actor,{applicationId:app.id,schoolYearId:data.schoolYearId,idempotencyKey:key,expiresAt})};
});
export const respondSyntheticOfferFromDemo=createServerFn({method:"POST"})
.validator((data:{offerId:string;decision:"accept"|"decline"})=>data).handler(async({data})=>{
 assertSyntheticMutation("guardian");
 if(!["accept","decline"].includes(data.decision))throw new Error("Invalid decision");
 const {offer,app}=await syntheticOffer(data.offerId);
 const actor=await authorizedActor("guardian","enrollment.apply",app.programId);
 const [profile]=await db.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
 if(!profile)throw new Error("Student profile missing");
 const [guardian]=await db.select({id:guardianRelationships.guardianPersonId}).from(guardianRelationships).where(and(eq(guardianRelationships.studentPersonId,profile.personId),eq(guardianRelationships.canManageEnrollment,true),eq(guardianRelationships.guardianPersonId,actor.actorPersonId!))).limit(1);
 if(!guardian)throw new Error("Synthetic guardian relationship missing");
 return {offerId:await respondToSyntheticAdmissionOffer(actor,offer.id,data.decision)};
});
export const activateSyntheticOfferFromDemo=createServerFn({method:"POST"})
.validator((data:{offerId:string})=>data).handler(async({data})=>{
 assertSyntheticMutation("registrar");
 const {offer,app}=await syntheticOffer(data.offerId);
 const actor=await authorizedActor("registrar","enrollment.activate",app.programId);
 return {enrollmentId:await activateSyntheticOfferedEnrollment(actor,offer.id)};
});
