import { launchOpeningDate } from "@/domain/launch-opening-date";
import { db } from "@/db/client";
import { academicCalendarDays,academicCalendars,gradeScales,gradingPeriods,organizations,programs,scheduleTemplatePeriods,scheduleTemplates,schoolYears,sites,terms } from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { ensureStandardGradeScale } from "./standard-grade-scale.server";
import { getRequest } from "@tanstack/react-start/server";
import { and,asc,eq,inArray } from "drizzle-orm";
import { z } from "zod";
import { activateSchoolYear,createAcademicCalendar,createGradingPeriod,createScheduleTemplate,createSchoolYear,createTerm,setAcademicCalendarDay,prepareSchoolYearBasics,populateSchoolYearInstructionalDays } from "./school-year-service";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.object({ schoolYearId: uuid });
async function operator(capability = "academic_year.manage") {
 const context = await getCommandContext(getRequest());
 if (!context.actorPersonId || context.role !== "registrar" || !context.scope.organizationIds?.length) throw new AuthorizationError("academic year operator");
 assertCapability(context, capability);
 // A verified organization-wide grant has no site filter. Preserve narrow
 // site-scoped grants unchanged, but do not treat an empty list as denial.
 return context.scope.siteIds?.length ? context :
  {...context,scope:{...context.scope,siteIds:undefined}};
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
  const dayRows=calendarRows.length?await db.select({
    id:academicCalendarDays.id,academicCalendarId:academicCalendarDays.academicCalendarId,
    calendarDate:academicCalendarDays.calendarDate,type:academicCalendarDays.type,
    title:academicCalendarDays.title,instructionalMinutes:academicCalendarDays.instructionalMinutes,
  }).from(academicCalendarDays).where(inArray(academicCalendarDays.academicCalendarId,
    calendarRows.map(c=>c.id))).orderBy(asc(academicCalendarDays.calendarDate)):[];
  const schedulePeriods=scheduleRows.length?await db.select({
    scheduleTemplateId:scheduleTemplatePeriods.scheduleTemplateId,
    dayOfWeek:scheduleTemplatePeriods.dayOfWeek,sequence:scheduleTemplatePeriods.sequence,
    label:scheduleTemplatePeriods.label,startsAtLocal:scheduleTemplatePeriods.startsAtLocal,
    endsAtLocal:scheduleTemplatePeriods.endsAtLocal,type:scheduleTemplatePeriods.type,
  }).from(scheduleTemplatePeriods).where(inArray(scheduleTemplatePeriods.scheduleTemplateId,
    scheduleRows.map(s=>s.id))):[];
  const periods = termRows.length ? await db.select({termId:gradingPeriods.termId,id:gradingPeriods.id,name:gradingPeriods.name})
    .from(gradingPeriods).where(inArray(gradingPeriods.termId,termRows.map(t=>t.id))) : [];
  return {...y,terms:termRows.map(t=>({...t,periods:periods.filter(p=>p.termId===t.id)})),
   calendars:calendarRows.map(cal=>({...cal,days:dayRows.filter(d=>d.academicCalendarId===cal.id)})),schedules:scheduleRows.map(s=>({...s,periods:schedulePeriods.filter(p=>p.scheduleTemplateId===s.id)}))};
 }));
 const programRows = actor.scope.programIds?.length ? await db.select({id:programs.id,name:programs.name,siteId:programs.siteId,organizationId:programs.organizationId,metadata:programs.metadata})
  .from(programs).where(inArray(programs.id,actor.scope.programIds)) : [];
 return {sites:siteRows,years,gradeScales:scaleRows,programs:programRows.map(({metadata,...program})=>{
  const targetOpeningDate=launchOpeningDate(metadata);
  return {...program,...(targetOpeningDate?{targetOpeningDate}:{})};
 })};
});
export const createStudioGradeScale = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({organizationId:uuid,name:z.string().trim().min(2).max(80)}).strict().parse(v))
 .handler(async({data})=>({
   gradeScaleId:await ensureStandardGradeScale(await operator(),data),
 }));
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
export const prepareStudioYear = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({schoolYearId:uuid,structure:z.enum(["full_year","semesters"]),
  instructionalDays:z.object({weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),
   instructionalMinutes:z.number().int().min(1).max(1440)}).strict().optional(),
 }).strict().parse(v))
 .handler(async({data})=>prepareSchoolYearBasics(await operator(),data));
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

/** Delete only a specifically scoped calendar override; other dates remain untouched. */
export const removeStudioCalendarDay=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({dayId:uuid}).parse(v))
 .handler(async({data})=>{
  const actor=await operator();
  return db.transaction(async tx=>{
   const [record]=await tx.select({
    id:academicCalendarDays.id,date:academicCalendarDays.calendarDate,
    calendarId:academicCalendars.id,organizationId:schoolYears.organizationId,
    siteId:schoolYears.siteId,programId:schoolYears.programId,
   }).from(academicCalendarDays)
    .innerJoin(academicCalendars,eq(academicCalendars.id,academicCalendarDays.academicCalendarId))
    .innerJoin(schoolYears,eq(schoolYears.id,academicCalendars.schoolYearId))
    .where(eq(academicCalendarDays.id,data.dayId)).limit(1);
   if(!record||!actor.scope.organizationIds?.includes(record.organizationId)||
     (actor.scope.siteIds?.length&&!actor.scope.siteIds.includes(record.siteId))||
     (record.programId&&!actor.scope.programIds?.includes(record.programId)))
    throw new AuthorizationError("calendar day access");
   await lockAttendanceConfigurationAtSite(tx,record.siteId);
   await tx.delete(academicCalendarDays).where(eq(academicCalendarDays.id,record.id));
   await emitEvent(tx,{
    eventType:EventTypes.AcademicCalendarChanged,aggregateType:"academic_calendar",
    aggregateId:record.calendarId,actorPersonId:actor.actorPersonId,
    payload:{calendarDate:record.date,operation:"delete",siteId:record.siteId},
   });
   await writeAudit(tx,actor,{
    action:"academic_calendar.day.remove",entityType:"academic_calendar_day",
    entityId:record.id,scope:{organizationId:record.organizationId,siteId:record.siteId},
    before:{calendarDate:record.date}});
   return {removed:true};
  });
 });
export const replaceStudioSchedulePeriods=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({scheduleTemplateId:uuid,periods:z.array(z.object({
  dayOfWeek:z.number().int().min(0).max(6),sequence:z.number().int().positive(),
  label:z.string().trim().min(1).max(80),
  startsAtLocal:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAtLocal:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  type:z.enum(["instruction","break","lunch","chapel","advisory"]),
 })).min(1).max(80)}).parse(v))
 .handler(async({data})=>{
  const actor=await operator();
  const keys=new Set<string>();
  for(const p of data.periods){
   if(p.startsAtLocal>=p.endsAtLocal)throw new Error("Period must end after it starts");
   const key=p.dayOfWeek+":"+p.sequence;
   if(keys.has(key))throw new Error("Duplicate day and sequence");
   keys.add(key);
  }
  for(const dayOfWeek of new Set(data.periods.map(p=>p.dayOfWeek))){
   const rows=data.periods.filter(p=>p.dayOfWeek===dayOfWeek)
    .sort((a,b)=>a.startsAtLocal.localeCompare(b.startsAtLocal));
   for(let i=1;i<rows.length;i++)
    if(rows[i]!.startsAtLocal<rows[i-1]!.endsAtLocal)
     throw new Error("Schedule periods overlap on day "+dayOfWeek);
  }
  return db.transaction(async tx=>{
   const [record]=await tx.select({
    id:scheduleTemplates.id,siteId:scheduleTemplates.siteId,
    programId:scheduleTemplates.programId,organizationId:schoolYears.organizationId,
   }).from(scheduleTemplates).innerJoin(schoolYears,
     eq(schoolYears.id,scheduleTemplates.schoolYearId))
    .where(eq(scheduleTemplates.id,data.scheduleTemplateId)).limit(1);
   if(!record||!actor.scope.organizationIds?.includes(record.organizationId)||
    (actor.scope.siteIds?.length&&!actor.scope.siteIds.includes(record.siteId))||
    (record.programId&&!actor.scope.programIds?.includes(record.programId)))
    throw new AuthorizationError("schedule edit");
   await lockAttendanceConfigurationAtSite(tx,record.siteId);
   await tx.delete(scheduleTemplatePeriods)
    .where(eq(scheduleTemplatePeriods.scheduleTemplateId,record.id));
   await tx.insert(scheduleTemplatePeriods).values(data.periods.map(p=>({
    ...p,scheduleTemplateId:record.id,
   })));
   await emitEvent(tx,{eventType:EventTypes.ScheduleTemplateChanged,
    aggregateType:"schedule_template",aggregateId:record.id,actorPersonId:actor.actorPersonId,
    payload:{siteId:record.siteId,programId:record.programId,periodCount:data.periods.length}});
   await writeAudit(tx,actor,{
    action:"schedule.periods.replace",entityType:"schedule_template",entityId:record.id,
    scope:{organizationId:record.organizationId,siteId:record.siteId,programId:record.programId},
    after:{periods:data.periods}});
   return {updated:true};
  });
 });

/** Build the ordinary instructional calendar in one operation, preserving all
 * existing overrides (closures, holidays and specially scheduled days). */
export const populateStudioInstructionalDays=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
  academicCalendarId:uuid,weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),
  instructionalMinutes:z.number().int().min(1).max(1440),
 }).parse(v))
 .handler(async({data})=>populateSchoolYearInstructionalDays(await operator(),data));
