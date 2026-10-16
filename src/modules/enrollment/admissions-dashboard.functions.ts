import {createServerFn} from "@tanstack/react-start";
import {eq,inArray,sql,and} from "drizzle-orm";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import type {AdmissionsPipelineItem} from "@/domain/admissions-pipeline";
/** This deliberately surfaces non-PII records explicitly marked synthetic. */
export const getSyntheticAdmissionsDashboard=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.programIds?.length)throw new AuthorizationError("registrar admissions dashboard");
 assertCapability(actor,"enrollment.decide");
 if(!process.env.DATABASE_URL)return [] as (AdmissionsPipelineItem & {offers:{id:string;status:string;expiresAt:string|null;schoolYearId:string}[];enrollments:{schoolYearId:string;status:string}[]})[];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const records=await db.select({id:s.applications.id,stage:s.applications.stage,metadata:s.applications.metadata,submittedAt:s.applications.submittedAt,program:s.programs.name,programId:s.applications.programId,studentProfileId:s.applications.studentProfileId}).from(s.applications).innerJoin(s.programs,eq(s.applications.programId,s.programs.id)).where(and(sql`${s.applications.metadata}->>'synthetic' = 'true'`,inArray(s.applications.programId,actor.scope.programIds))).limit(150);
 const synthetic=records.filter(r=>r.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const ids=synthetic.map(x=>x.id);
 const journeys=await db.select({id:s.journeys.id,participantId:s.journeys.participantId}).from(s.journeys).where(inArray(s.journeys.participantId,ids));
 const offers=await db.select({id:s.admissionOffers.id,applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt,schoolYearId:s.admissionOffers.schoolYearId,createdAt:s.admissionOffers.createdAt}).from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId,ids));
 const enrollmentRows=await db.select({studentProfileId:s.enrollments.studentProfileId,programId:s.enrollments.programId,schoolYearId:s.enrollments.schoolYearId,status:s.enrollments.status,kind:s.enrollments.kind}).from(s.enrollments).where(inArray(s.enrollments.studentProfileId,[...new Set(synthetic.map(x=>x.studentProfileId))]));
 const requirements=journeys.length?await db.select({journeyId:s.journeyRequirements.journeyId,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 return synthetic.map(x=>({id:x.id,program:x.program,stage:x.stage,submittedAt:x.submittedAt?.toISOString()??null,outstandingRequirements:requirements.filter(req=>req.blocking&&req.status!=="complete"&&journeys.some(j=>j.id===req.journeyId&&j.participantId===x.id)).length,enrollments:enrollmentRows.filter(e=>e.studentProfileId===x.studentProfileId&&e.programId===x.programId&&e.kind==="program"&&e.status==="active").map(e=>({schoolYearId:e.schoolYearId,status:e.status})),offers:offers.filter(o=>o.applicationId===x.id).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).map(o=>({id:o.id,status:o.status,expiresAt:o.expiresAt?.toISOString()??null,schoolYearId:o.schoolYearId}))}));
});
