import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { academicCalendars, auditEvents, gradeScales, gradingPeriods, organizations, programs, scheduleTemplates, schoolYears, sites, terms } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { activateSchoolYear, createAcademicCalendar, createGradingPeriod, createScheduleTemplate, createSchoolYear, createTerm, setAcademicCalendarDay } from "./school-year-service";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.object({ schoolYearId: uuid });
async function operator(capability = "academic_year.manage") {
 const context = await getCommandContext(getRequest());
 if (!context.actorPersonId || context.role !== "registrar" || !context.scope.organizationIds?.length) throw new AuthorizationError("academic year operator");
 assertCapability(context, capability);
 return context;
}
export const getSchoolYearStudio = createServerFn({method:"GET"}).handler(async () => {
 const actor = await operator();
 const siteIds = actor.scope.siteIds ?? [];
 const orgIds = actor.scope.organizationIds ?? [];
 const [siteRows, yearRows, scaleRows] = await Promise.all([
  db.select({ id:sites.id,name:sites.name,timezone:sites.timezone,organizationId:sites.organizationId,organizationName:organizations.name })
   .from(sites).innerJoin(organizations,eq(organizations.id,sites.organizationId))
   .where(and(...(siteIds.length?[inArray(sites.id,siteIds)]:[]),inArray(sites.organizationId,orgIds))).orderBy(asc(sites.name)),
  db.select({id:schoolYears.id,name:schoolYears.name,key:schoolYears.key,status:schoolYears.status,siteId:schoolYears.siteId,
   organizationId:schoolYears.organizationId,programId:schoolYears.programId,startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn})
   .from(schoolYears).where(and(...(siteIds.length?[inArray(schoolYears.siteId,siteIds)]:[]),inArray(schoolYears.organizationId,orgIds)))
   .orderBy(asc(schoolYears.startsOn)),
  db.select({id:gradeScales.id,name:gradeScales.name,organizationId:gradeScales.owningOrganizationId}).from(gradeScales)
   .where(inArray(gradeScales.owningOrganizationId,orgIds)),
 ]);
 const years = await Promise.all(yearRows.filter(y=> !y.programId || actor.scope.programIds?.includes(y.programId)).map(async y => {
  const [termRows,calendarRows,scheduleRows] = await Promise.all([
   db.select({id:terms.id,name:terms.name,startsOn:terms.startsOn,endsOn:terms.endsOn})
    .from(terms).where(eq(terms.schoolYearId,y.id)).orderBy(asc(terms.startsOn)),
   db.select({id:academicCalendars.id,name:academicCalendars.name}).from(academicCalendars)
    .where(eq(academicCalendars.schoolYearId,y.id)),
   db.select({id:scheduleTemplates.id,name:scheduleTemplates.name}).from(scheduleTemplates)
    .where(eq(scheduleTemplates.schoolYearId,y.id)),
  ]);
  const periods = termRows.length ? await db.select({termId:gradingPeriods.termId,id:gradingPeriods.id,name:gradingPeriods.name})
    .from(gradingPeriods).where(inArray(gradingPeriods.termId,termRows.map(t=>t.id))) : [];
  return {...y,terms:termRows.map(t=>({...t,periods:periods.filter(p=>p.termId===t.id)})),
   calendars:calendarRows,schedules:scheduleRows};
 }));
 const programRows = actor.scope.programIds?.length ? await db.select({id:programs.id,name:programs.name,siteId:programs.siteId,organizationId:programs.organizationId})
  .from(programs).where(inArray(programs.id,actor.scope.programIds)) : [];
 return {sites:siteRows,years,gradeScales:scaleRows,programs:programRows};
});
export const createStudioGradeScale=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({organizationId:uuid,name:z.string().trim().min(2).max(80)}).parse(v))
 .handler(async({data})=>{
  const actor=await operator();
  if(!actor.scope.organizationIds?.includes(data.organizationId))
   throw new AuthorizationError("grading scale organization");
  return db.transaction(async tx=>{
   const [existing]=await tx.select({id:gradeScales.id}).from(gradeScales)
    .where(and(eq(gradeScales.owningOrganizationId,data.organizationId),
     eq(gradeScales.name,data.name),eq(gradeScales.version,1))).limit(1);
   if(existing)return {gradeScaleId:existing.id};
   const [scale]=await tx.insert(gradeScales).values({
    owningOrganizationId:data.organizationId,name:data.name,version:1,active:true,
    configuration:{entries:[
     {label:"A",minPercent:90,maxPercent:100,gpaPoints:4,passing:true},
     {label:"B",minPercent:80,maxPercent:89.99,gpaPoints:3,passing:true},
     {label:"C",minPercent:70,maxPercent:79.99,gpaPoints:2,passing:true},
     {label:"D",minPercent:60,maxPercent:69.99,gpaPoints:1,passing:true},
     {label:"F",minPercent:0,maxPercent:59.99,gpaPoints:0,passing:false},
    ]},
   }).returning({id:gradeScales.id});
   await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
    action:"grade_scale.create",resourceType:"grade_scale",resourceId:scale!.id,
    scope:{organizationId:data.organizationId},after:{name:data.name,version:1}});
   return {gradeScaleId:scale!.id};
  });
 });
export const createStudioYear = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({siteId:uuid,programId:uuid.optional(),gradeScaleId:uuid,
  key:z.string().min(2).max(40),name:z.string().min(3).max(100),startsOn:day,endsOn:day}).parse(v))
 .handler(async({data})=>{
  const actor=await operator();
  const [site]=await db.select().from(sites).where(eq(sites.id,data.siteId)).limit(1);
  if(!site || (actor.scope.siteIds?.length && !actor.scope.siteIds.includes(site.id)) || !actor.scope.organizationIds?.includes(site.organizationId))
   throw new AuthorizationError("site academic year");
  if(data.programId && !actor.scope.programIds?.includes(data.programId)) throw new AuthorizationError("program academic year");
  const effectiveActor=actor.scope.siteIds?.length?actor:{...actor,scope:{...actor.scope,siteIds:undefined}};
  const schoolYearId=await createSchoolYear(effectiveActor,{...data,organizationId:site.organizationId,timezone:site.timezone});
  return {schoolYearId};
 });
export const addStudioTerm = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({schoolYearId:uuid,key:z.string().min(1),name:z.string().min(2),sequence:z.number().int().positive(),startsOn:day,endsOn:day}).parse(v))
 .handler(async({data})=>({termId:await createTerm(await operator(),data)}));
export const addStudioGradingPeriod = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({termId:uuid,key:z.string().min(1),name:z.string().min(2),sequence:z.number().int().positive(),startsOn:day,endsOn:day}).parse(v))
 .handler(async({data})=>({periodId:await createGradingPeriod(await operator(),data)}));
export const addStudioCalendar = createServerFn({method:"POST"}).validator(id.parse)
 .handler(async({data})=>({calendarId:await createAcademicCalendar(await operator(),{schoolYearId:data.schoolYearId,name:"Instructional calendar"})}));
export const addStudioCalendarDay = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({academicCalendarId:uuid,calendarDate:day,type:z.enum(["instructional","holiday","closure","special","makeup"]),title:z.string().max(160).optional(),instructionalMinutes:z.number().int().min(0).max(1440).optional()}).parse(v))
 .handler(async({data})=>({dayId:await setAcademicCalendarDay(await operator(),data)}));
export const addStudioSchedule = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({schoolYearId:uuid,programId:uuid.optional(),name:z.string().min(2).max(100),effectiveFrom:day}).parse(v))
 .handler(async({data})=>({scheduleId:await createScheduleTemplate(await operator(),{...data,periods:[1,2,3,4,5].map(dayOfWeek=>({
  dayOfWeek,sequence:1,label:"Instruction",startsAtLocal:"08:30",endsAtLocal:"15:00",type:"instruction",
 }))})}));
export const activateStudioYear = createServerFn({method:"POST"}).validator(id.parse)
 .handler(async({data})=>{await activateSchoolYear(await operator("academic_year.activate"),data.schoolYearId);return {ok:true}});
