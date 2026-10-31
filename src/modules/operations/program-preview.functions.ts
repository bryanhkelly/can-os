import {createServerFn} from "@tanstack/react-start";
import {and,eq,inArray} from "drizzle-orm";
import {requireActor} from "@/modules/identity/actors.server";
type ProgramPreview={id:string;name:string;status:string;type:string;organizationName:string;siteName:string|null;gradeRange:{min:string;max:string};deliveryModel:{onsite?:boolean;asynchronous?:boolean;liveOnline?:boolean;onsiteDaysPerWeek?:number};counts:{sections:number;enrollments:number;teachers:number;calendarDays:number}};
/** Real program counts require a verified, scoped staff membership. */
export const getScopedPrograms=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await requireActor(["teacher","registrar"],"program.read");
 if(!actor.scope.organizationIds?.length)return [] as ProgramPreview[];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const records=await db.select({id:s.programs.id,name:s.programs.name,status:s.programs.status,type:s.programs.type,gradeRange:s.programs.gradeRange,deliveryModel:s.programs.deliveryModel,metadata:s.programs.metadata,organizationName:s.organizations.name,siteName:s.sites.name})
 .from(s.programs).innerJoin(s.organizations,eq(s.programs.organizationId,s.organizations.id))
 .leftJoin(s.sites,eq(s.programs.siteId,s.sites.id))
 .where(and(inArray(s.programs.organizationId,actor.scope.organizationIds),
  ...(actor.scope.programIds?[inArray(s.programs.id,actor.scope.programIds)]:[]),
  ...(actor.scope.siteIds?[inArray(s.programs.siteId,actor.scope.siteIds)]:[]))).limit(100);
 if(!records.length)return [];
 const visibleIds=records.map(x=>x.id);
 const sections=await db.select({id:s.sections.id,programId:s.sections.programId}).from(s.sections).where(inArray(s.sections.programId,visibleIds));
 const enrollments=await db.select({id:s.enrollments.id,programId:s.enrollments.programId}).from(s.enrollments).where(and(inArray(s.enrollments.programId,visibleIds),eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")));
 const sectionIds=sections.map(x=>x.id);
 const teachers=sectionIds.length?await db.select({sectionId:s.sectionTeachers.sectionId}).from(s.sectionTeachers).where(inArray(s.sectionTeachers.sectionId,sectionIds)):[];
 return records.map(p=>({id:p.id,name:p.name,status:p.status,type:p.type,organizationName:p.organizationName,siteName:p.siteName,gradeRange:p.gradeRange,deliveryModel:p.deliveryModel,counts:{sections:sections.filter(x=>x.programId===p.id).length,enrollments:enrollments.filter(x=>x.programId===p.id).length,teachers:teachers.filter(x=>sections.some(sec=>sec.id===x.sectionId&&sec.programId===p.id)).length,calendarDays:0}}));
});
export const getSyntheticPrograms=getScopedPrograms;
