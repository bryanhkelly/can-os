import {createServerFn} from "@tanstack/react-start";
import {eq,inArray} from "drizzle-orm";
type ProgramPreview={id:string;name:string;status:string;type:string;organizationName:string;siteName:string|null;gradeRange:{min:string;max:string};deliveryModel:{onsite?:boolean;asynchronous?:boolean;liveOnline?:boolean;onsiteDaysPerWeek?:number};counts:{sections:number;enrollments:number;teachers:number;calendarDays:number}};
/** Read only. Never expose a real program or its operational counts in the public demo. */
export const getSyntheticPrograms=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [] as ProgramPreview[];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const records=await db.select({id:s.programs.id,name:s.programs.name,status:s.programs.status,type:s.programs.type,gradeRange:s.programs.gradeRange,deliveryModel:s.programs.deliveryModel,metadata:s.programs.metadata,organizationName:s.organizations.name})
 .from(s.programs).innerJoin(s.organizations,eq(s.programs.organizationId,s.organizations.id)).limit(100);
 const synthetic=records.filter(p=>p.metadata.synthetic===true);
 if(!synthetic.length)return [];
 const ids=synthetic.map(x=>x.id);
 const sections=await db.select({id:s.sections.id,programId:s.sections.programId}).from(s.sections).where(inArray(s.sections.programId,ids));
 const enrollments=await db.select({id:s.enrollments.id,programId:s.enrollments.programId}).from(s.enrollments).where(inArray(s.enrollments.programId,ids));
 const sectionIds=sections.map(x=>x.id);
 const teachers=sectionIds.length?await db.select({sectionId:s.sectionTeachers.sectionId}).from(s.sectionTeachers).where(inArray(s.sectionTeachers.sectionId,sectionIds)):[];
 return synthetic.map(p=>({id:p.id,name:p.name,status:p.status,type:p.type,organizationName:p.organizationName,siteName:null,gradeRange:p.gradeRange,deliveryModel:p.deliveryModel,counts:{sections:sections.filter(x=>x.programId===p.id).length,enrollments:enrollments.filter(x=>x.programId===p.id).length,teachers:teachers.filter(x=>sections.some(sec=>sec.id===x.sectionId&&sec.programId===p.id)).length,calendarDays:0}}));
});
