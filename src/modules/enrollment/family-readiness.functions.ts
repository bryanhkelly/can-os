import {createServerFn} from "@tanstack/react-start";
import {eq,inArray} from "drizzle-orm";
import {enrollmentReadiness} from "@/domain/enrollment-readiness";
export const getSyntheticFamilyReadiness=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const apps=await db.select({id:s.applications.id,householdId:s.applications.householdId,stage:s.applications.stage,metadata:s.applications.metadata,program:s.programs.name}).from(s.applications).innerJoin(s.programs,eq(s.programs.id,s.applications.programId)).limit(150);
 const synthetic=apps.filter(x=>x.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const journeys=await db.select({id:s.journeys.id,participantId:s.journeys.participantId}).from(s.journeys).where(inArray(s.journeys.participantId,synthetic.map(x=>x.id)));
 const requirements=journeys.length?await db.select({journeyId:s.journeyRequirements.journeyId,title:s.journeyRequirements.title,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 return synthetic.map(app=>{const journeyIds=new Set(journeys.filter(j=>j.participantId===app.id).map(j=>j.id));return {id:app.id,householdId:app.householdId,program:app.program,stage:app.stage,readiness:enrollmentReadiness(requirements.filter(r=>journeyIds.has(r.journeyId)))};});
});
