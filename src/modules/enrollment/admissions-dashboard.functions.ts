import {createServerFn} from "@tanstack/react-start";
import {eq,inArray} from "drizzle-orm";
import type {AdmissionsPipelineItem} from "@/domain/admissions-pipeline";
/** This deliberately surfaces non-PII records explicitly marked synthetic. */
export const getSyntheticAdmissionsDashboard=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [] as AdmissionsPipelineItem[];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const records=await db.select({id:s.applications.id,stage:s.applications.stage,metadata:s.applications.metadata,submittedAt:s.applications.submittedAt,program:s.programs.name}).from(s.applications).innerJoin(s.programs,eq(s.applications.programId,s.programs.id)).limit(150);
 const synthetic=records.filter(r=>r.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const ids=synthetic.map(x=>x.id);
 const journeys=await db.select({id:s.journeys.id,participantId:s.journeys.participantId}).from(s.journeys).where(inArray(s.journeys.participantId,ids));
 const requirements=journeys.length?await db.select({journeyId:s.journeyRequirements.journeyId,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 return synthetic.map(x=>({id:x.id,program:x.program,stage:x.stage,submittedAt:x.submittedAt?.toISOString()??null,outstandingRequirements:requirements.filter(req=>req.blocking&&req.status!=="complete"&&journeys.some(j=>j.id===req.journeyId&&j.participantId===x.id)).length}));
});
