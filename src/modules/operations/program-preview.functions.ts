import {createServerFn} from "@tanstack/react-start";
import {and,eq} from "drizzle-orm";
type ProgramPreview={id:string;name:string;status:string;type:string;organizationName:string;siteName:string|null;gradeRange:{min:string;max:string};deliveryModel:{onsite?:boolean;asynchronous?:boolean;liveOnline?:boolean;onsiteDaysPerWeek?:number}};
/** Read only; only non-sensitive synthetic programs explicitly marked in metadata. */
export const getSyntheticPrograms=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [] as ProgramPreview[];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const records=await db.select({id:s.programs.id,name:s.programs.name,status:s.programs.status,type:s.programs.type,gradeRange:s.programs.gradeRange,deliveryModel:s.programs.deliveryModel,metadata:s.programs.metadata,organizationName:s.organizations.name})
 .from(s.programs).innerJoin(s.organizations,eq(s.programs.organizationId,s.organizations.id)).limit(100);
 return records.filter(p=>p.metadata.synthetic===true).map(p=>({id:p.id,name:p.name,status:p.status,type:p.type,organizationName:p.organizationName,siteName:null,gradeRange:p.gradeRange,deliveryModel:p.deliveryModel}));
});
