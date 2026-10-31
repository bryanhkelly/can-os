import { db } from "@/db/client";
import {
complianceFrameworks,complianceFrameworkVersions,compliancePolicyApplicability,compliancePolicyRules,
people,
programs,roleAssignments,schoolYears,
qualificationDefinitions,
sections,
sectionGrades,
sectionTeachers,
scheduleTemplates,scheduleTemplatePeriods,courseTemplateVersions,
terms
} from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { verifiedSectionCreditUnits } from "@/domain/section-credit-policy";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { and,asc,eq,inArray,isNull,or } from "drizzle-orm";
import { z } from "zod";
import { evaluateSectionReadiness } from "./section-readiness-service";
import { assignLaunchInstructor,evaluateLaunchTeacher,launchTeacherRolePredicate } from "@/modules/staffing/launch-staffing.server";
import { canAuthorQualificationCatalog } from "@/modules/profiles/qualification-catalog.server";
import { requireActor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { listLaunchTeacherPolicies,teacherPolicyPublisherCapability } from "./teacher-policy.server";
import { listLaunchEligibleCourses, assertLaunchEligibleCourse } from "./launch-curriculum-eligibility.server";
import { requireChurchHostedOperatingServices } from "./program-site-authorization.server";
import { requireAccessibleFirstLesson } from "@/domain/first-class-lesson";
import { readFirstClassrooms } from "@/modules/learning/first-classroom.server";
const uuid=z.string().uuid();

const instructionalServices=["academic_instruction","curriculum"] as const;
const creditServices=["school_of_record","academic_records","credit_issuance"] as const;

async function currentServices(programId:string,services:readonly ("academic_instruction"|"curriculum"|"school_of_record"|"academic_records"|"credit_issuance")[]){
 try{
  await requireChurchHostedOperatingServices(db,programId,services);
  return true;
 }catch(error){
  if(!(error instanceof AuthorizationError))throw error;
  return false;
 }
}

async function setupContext(programId:string){
 const actor=await requireActor(["registrar"],"program.launch.start");
 if(!actor.scope.programIds?.includes(programId))throw new AuthorizationError("launch program scope");
 const [program]=await db.select({
  id:programs.id,name:programs.name,status:programs.status,siteId:programs.siteId,
  organizationId:programs.organizationId,academicProviderOrganizationId:programs.academicProviderOrganizationId,
  deliveryModel:programs.deliveryModel,
 }).from(programs).where(eq(programs.id,programId)).limit(1);
 if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
  (actor.scope.siteIds?.length&&(!program.siteId||!actor.scope.siteIds.includes(program.siteId))))
  throw new AuthorizationError("launch organization/site scope");
 return {actor,program};
}

export const getLaunchAcademicSetup=createServerFn({method:"GET"})
 .validator((v:unknown)=>z.object({programId:uuid}).parse(v))
 .handler(async({data})=>{
  const {actor,program}=await setupContext(data.programId);
  const [teacherAssignment,creditConfiguration]=await Promise.all([
   currentServices(program.id,instructionalServices),
   currentServices(program.id,creditServices),
  ]);
  const academicAuthority={teacherAssignment,creditConfiguration};
  const canAuthorCatalog=await canAuthorQualificationCatalog(actor,program);
  const teacherPolicies=await listLaunchTeacherPolicies(program.id);
  // Both initial publication and revisions require the same explicit,
  // program-scoped institutional staffing-policy publisher grant.
  const canPublishTeacherPolicy=["draft","launching","ready"].includes(program.status)&&
   await hasInstitutionalProgramCapability(actor,program,teacherPolicyPublisherCapability);
  const canReviseTeacherPolicy=canPublishTeacherPolicy;
  const qualificationCatalog=await db.select({key:qualificationDefinitions.key,title:qualificationDefinitions.title})
   .from(qualificationDefinitions).orderBy(asc(qualificationDefinitions.title));
  const [publishedPolicy]=await db.select({id:complianceFrameworkVersions.id})
   .from(complianceFrameworks)
   .innerJoin(complianceFrameworkVersions,eq(complianceFrameworkVersions.frameworkId,complianceFrameworks.id))
   .where(and(eq(complianceFrameworks.key,"launch-teacher:"+program.id),
    eq(complianceFrameworkVersions.status,"published"))).limit(1);
  const years=program.siteId?await db.select({
   id:schoolYears.id,name:schoolYears.name,status:schoolYears.status,
   siteId:schoolYears.siteId,programId:schoolYears.programId,
  }).from(schoolYears).where(and(eq(schoolYears.siteId,program.siteId),
   eq(schoolYears.organizationId,program.organizationId),
   or(isNull(schoolYears.programId),eq(schoolYears.programId,program.id)))):[];
  const termRows=years.length?await db.select({
   id:terms.id,name:terms.name,schoolYearId:terms.schoolYearId,startsOn:terms.startsOn,
   endsOn:terms.endsOn,
  }).from(terms).where(inArray(terms.schoolYearId,years.map(y=>y.id)))
   .orderBy(asc(terms.startsOn)):[];
  const scheduleOptions=years.length?await db.select({id:scheduleTemplates.id,name:scheduleTemplates.name,schoolYearId:scheduleTemplates.schoolYearId})
   .from(scheduleTemplates).where(inArray(scheduleTemplates.schoolYearId,years.map(year=>year.id))):[];
  const catalog=await listLaunchEligibleCourses({...program,schoolYearId:years.find(y=>y.status==="active")?.id ?? null});
  // Reuse the assignment service's authority rule. A church choosing CAN as
  // provider is NOT entitled to list CAN's organization-wide faculty; the
  // external teacher needs an explicit assignment to this Program.
  const personnel=program.siteId?await db.select({
   personId:roleAssignments.personId,first:people.legalFirstName,last:people.legalLastName,
  }).from(roleAssignments)
   .innerJoin(people,eq(people.id,roleAssignments.personId))
   .where(and(eq(people.active,true),launchTeacherRolePredicate({
    organizationId:program.organizationId,providerId:program.academicProviderOrganizationId,
    programId:program.id,siteId:program.siteId,
   }))):[];
  const teachingStaff=[...new Map(personnel.map(p=>[p.personId,p])).values()];
  const sectionRows=await db.select({
   id:sections.id,title:sections.title,code:sections.code,termId:sections.termId,
   active:sections.active,metadata:sections.metadata,
  }).from(sections).where(eq(sections.programId,program.id)).orderBy(asc(sections.title));
  const assignments=sectionRows.length?await db.select({
   sectionId:sectionTeachers.sectionId,personId:sectionTeachers.personId,
   first:people.legalFirstName,last:people.legalLastName,
  }).from(sectionTeachers).innerJoin(people,eq(people.id,sectionTeachers.personId))
   .where(inArray(sectionTeachers.sectionId,sectionRows.map(s=>s.id))):[];
  const sectionSnapshots=await Promise.all(sectionRows.map(async row=>{
   const readiness=await evaluateSectionReadiness(row.id,db,new Date(),"launch");
   const candidates=await Promise.all(teachingStaff.map(async teacher=>{
    const eligibility=await evaluateLaunchTeacher(row.id,teacher.personId);
    return {personId:teacher.personId,eligible:eligibility.eligible,reasons:eligibility.reasons,
     from:eligibility.window.from.toISOString(),through:eligibility.window.through.toISOString()};
   }));
   const {metadata,...publicRow}=row;
   return {...publicRow,creditUnits:verifiedSectionCreditUnits(metadata),teachers:assignments.filter(a=>a.sectionId===row.id),
    candidates,
    readiness:{...readiness,items:readiness.items.map(({evidence,...item})=>item)}};
  }));
  const classrooms=await readFirstClassrooms(sectionRows.map(row=>row.id),new Map(
   sectionSnapshots.map(section=>[section.id,
    section.readiness.items.find(item=>item.key==="launch_staffing")?.state==="ready"])));
  const classroomSections=sectionSnapshots.map(section=>({...section,
   classroom:classrooms.find(classroom=>classroom.sectionId===section.id)!}));
  return {program,years,terms:termRows,scheduleOptions,catalog,teachingStaff,sections:classroomSections,
   qualificationCatalog,policyPublished:Boolean(publishedPolicy),canAuthorCatalog,teacherPolicies,
   canPublishTeacherPolicy,canReviseTeacherPolicy,academicAuthority};
 });

export const provisionLaunchSection=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
  programId:uuid,termId:uuid,courseTemplateVersionId:uuid,
  code:z.string().trim().min(2).max(32),title:z.string().trim().min(2).max(160),
  teacherPersonId:uuid,
  scheduleTemplateId:uuid,
  credits:z.number().positive().max(10).refine(v=>verifiedSectionCreditUnits({credits:v})!==null).optional(),
 }).parse(v))
 .handler(async({data})=>{
  const {actor,program}=await setupContext(data.programId);
  if(!program.siteId)throw new Error("Assign a school site before creating sections");
  const [term]=await db.select({
   id:terms.id,schoolYearId:terms.schoolYearId,siteId:schoolYears.siteId,
   programId:schoolYears.programId,organizationId:schoolYears.organizationId,
  }).from(terms).innerJoin(schoolYears,eq(schoolYears.id,terms.schoolYearId))
   .where(eq(terms.id,data.termId)).limit(1);
  if(!term||term.siteId!==program.siteId||term.organizationId!==program.organizationId||
   (term.programId&&term.programId!==program.id))
   throw new AuthorizationError("academic term does not belong to this launch");
  return db.transaction(async tx=>{
   await lockAttendanceConfigurationAtSite(tx,program.siteId!);
   await assertLaunchEligibleCourse({...program,schoolYearId:term.schoolYearId}, data.courseTemplateVersionId, tx);
   if(data.credits!==undefined)
    await requireChurchHostedOperatingServices(tx,program.id,creditServices);
   {
    const [version]=await tx.select({curriculum:courseTemplateVersions.curriculum}).from(courseTemplateVersions).where(eq(courseTemplateVersions.id,data.courseTemplateVersionId)).limit(1);
    if(!version)throw new Error("Course version unavailable");
    requireAccessibleFirstLesson(version.curriculum);

   }
   {
    const [template]=await tx.select({schoolYearId:scheduleTemplates.schoolYearId}).from(scheduleTemplates).where(eq(scheduleTemplates.id,data.scheduleTemplateId)).limit(1);
    if(!template||template.schoolYearId!==term.schoolYearId)throw new Error("Schedule must belong to the selected school year");
    const periods=await tx.select({dayOfWeek:scheduleTemplatePeriods.dayOfWeek,startsAtLocal:scheduleTemplatePeriods.startsAtLocal,endsAtLocal:scheduleTemplatePeriods.endsAtLocal})
     .from(scheduleTemplatePeriods).where(and(eq(scheduleTemplatePeriods.scheduleTemplateId,data.scheduleTemplateId),eq(scheduleTemplatePeriods.type,"instruction")));
    if(!periods.some(period=>period.dayOfWeek>=1&&period.dayOfWeek<=7&&period.startsAtLocal<period.endsAtLocal))
     throw new Error("Choose a schedule containing at least one valid instructional period");
   }
   const [created]=await tx.insert(sections).values({
    programId:program.id,siteId:program.siteId,termId:data.termId,
    courseTemplateVersionId:data.courseTemplateVersionId,
    code:data.code,title:data.title,active:true,scheduleTemplateId:data.scheduleTemplateId,
    metadata:data.credits!==undefined?{credits:data.credits}:{},
   }).onConflictDoNothing().returning({id:sections.id,versionId:sections.courseTemplateVersionId,title:sections.title,metadata:sections.metadata});
   const [existing]=created?[created]:await tx.select({id:sections.id,versionId:sections.courseTemplateVersionId,title:sections.title,metadata:sections.metadata}).from(sections)
    .where(and(eq(sections.programId,program.id),eq(sections.termId,data.termId),
     eq(sections.code,data.code))).limit(1);
   if(!existing)throw new Error("Section code collision");
   if(existing.versionId!==data.courseTemplateVersionId||existing.title!==data.title)
    throw new Error("Section code is already used by a different class or curriculum version");
   if(data.credits!==undefined&&verifiedSectionCreditUnits(existing.metadata)!==data.credits)
    throw new Error("Existing section code has different academic credit units");
   {
    const [saved]=await tx.select({scheduleTemplateId:sections.scheduleTemplateId}).from(sections).where(eq(sections.id,existing.id)).limit(1);
    if(saved?.scheduleTemplateId!==data.scheduleTemplateId)throw new Error("Existing class has a different schedule; use the audited schedule-change workflow");
   }
   {
    await assignLaunchInstructor(tx,actor,{programId:program.id,sectionId:existing.id,
     teacherPersonId:data.teacherPersonId});
   }
   if(created){
    await emitEvent(tx, {eventType:EventTypes.SectionProvisioned,
     aggregateType:"section",aggregateId:existing.id,actorPersonId:actor.actorPersonId,
     payload:{organizationId:program.organizationId,siteId:program.siteId,
      programId:program.id,termId:data.termId}});
    await writeAudit(tx,actor,{
     action:"launch.section.provision",entityType:"section",entityId:existing.id,
     scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
     after:{code:data.code,title:data.title,termId:data.termId,
      teacherPersonId:data.teacherPersonId,scheduleTemplateId:data.scheduleTemplateId??null,
      courseTemplateVersionId:data.courseTemplateVersionId,firstLessonValidated:true,credits:data.credits??null}});
   }
   return {sectionId:existing.id,created:Boolean(created)};
  });
 });
export const assignLaunchTeacher=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({programId:uuid,sectionId:uuid,teacherPersonId:uuid}).parse(v))
 .handler(async({data})=>{
  const {actor,program}=await setupContext(data.programId);
  if(!program.siteId)throw new Error("Teaching assignment requires an onsite school site");
  return db.transaction(tx=>assignLaunchInstructor(tx,actor,data));
 });

export const publishLaunchTeacherPolicy=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({programId:uuid,qualificationKeys:z.array(z.string().min(1)).min(1).max(100),
  confirmed:z.literal(true)}).parse(v))
 .handler(async({data})=>{
  const {actor,program}=await setupContext(data.programId);
  assertCapability(actor,teacherPolicyPublisherCapability);
  if(!program.siteId)throw new Error("A school site is required before publishing teacher policy");
  if(!await hasInstitutionalProgramCapability(actor,program,teacherPolicyPublisherCapability))
   throw new AuthorizationError("explicit staffing policy publisher");
  return db.transaction(async tx=>{
   await lockAttendanceConfigurationAtSite(tx,program.siteId!);
   // Read the effective grant again in the same transaction as the write.
   if(!await hasInstitutionalProgramCapability(actor,program,teacherPolicyPublisherCapability,tx))
    throw new AuthorizationError("explicit staffing policy publisher");
   const [current]=await tx.select({status:programs.status}).from(programs)
    .where(eq(programs.id,program.id)).for("update").limit(1);
   if(!current||!["draft","launching","ready"].includes(current.status))
    throw new Error("Teacher policy publication is limited to pre-opening programs");
   const key="launch-teacher:"+program.id;
   const [existing]=await tx.select({id:complianceFrameworks.id}).from(complianceFrameworks)
    .where(eq(complianceFrameworks.key,key)).limit(1);
   if(existing)throw new Error("This program already has a teacher policy. Policy revisions require a separately reviewed version.");
   const keys=[...new Set(data.qualificationKeys)].sort();
   const definitions=await tx.select({key:qualificationDefinitions.key}).from(qualificationDefinitions)
    .where(inArray(qualificationDefinitions.key,keys));
   if(definitions.length!==keys.length)throw new Error("Choose existing qualification catalog entries");
   const [framework]=await tx.insert(complianceFrameworks).values({
    key,name:program.name+" teacher qualifications",authority:"Program registrar",
   }).returning({id:complianceFrameworks.id});
   if(!framework)throw new Error("Failed to create teacher policy framework");
   const [version]=await tx.insert(complianceFrameworkVersions).values({
    frameworkId:framework.id,version:"1",status:"published",
   }).returning({id:complianceFrameworkVersions.id});
   if(!version)throw new Error("Failed to publish teacher policy");
   await tx.insert(compliancePolicyRules).values({frameworkVersionId:version.id,code:"teacher-qualifications",
    description:"All listed qualifications must be independently verified throughout instruction.",
    expression:{op:"all",rules:keys.map(type=>({op:"credential",type}))}});
   await tx.insert(compliancePolicyApplicability).values({frameworkVersionId:version.id,
    organizationId:program.organizationId,siteId:program.siteId,programId:program.id,roleKey:"teacher"});
   await emitEvent(tx,{eventType:EventTypes.TeacherQualificationPolicyPublished,aggregateType:"compliance_framework_version",
    aggregateId:version.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
    siteId:program.siteId,programId:program.id,payload:{qualificationKeys:keys}});
   await writeAudit(tx,actor,{action:"launch.teacher_policy.publish",entityType:"compliance_framework_version",
    entityId:version.id,scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
    after:{qualificationKeys:keys,version:"1",confirmed:true}});
   return {versionId:version.id};
  });
 });

/** Registrar explicitly sets course credits before finalized grades exist. */
export const setLaunchSectionCredits=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
   programId:uuid,sectionId:uuid,
   credits:z.number().positive().max(10)
     .refine(units=>verifiedSectionCreditUnits({credits:units})!==null,"Use at most two decimal places"),
   reason:z.string().trim().min(5).max(500),
 }).strict().parse(value))
 .handler(async({data})=>{
   const {actor,program}=await setupContext(data.programId);
   if(!program.siteId)throw new AuthorizationError("school site required");
   return db.transaction(async tx=>{
     const [section]=await tx.select({id:sections.id,programId:sections.programId,
       siteId:sections.siteId,metadata:sections.metadata})
       .from(sections).where(eq(sections.id,data.sectionId)).for("update").limit(1);
     if(!section||section.programId!==program.id||section.siteId!==program.siteId)
       throw new AuthorizationError("authorized school section");
     // Recording issuer-bearing credit is a new academic act, including an
     // idempotent retry. It must not continue after contract expiry/revocation.
     await requireChurchHostedOperatingServices(tx,program.id,creditServices);
     const current=verifiedSectionCreditUnits(section.metadata);
     if(current===data.credits)return {changed:false as const,credits:current};
     const [finalGrade]=await tx.select({id:sectionGrades.id}).from(sectionGrades)
       .where(and(eq(sectionGrades.sectionId,section.id),eq(sectionGrades.status,"finalized")))
       .limit(1);
     if(finalGrade)throw new Error("Course credits are locked after finalized grades");
     await tx.update(sections).set({metadata:{...section.metadata,credits:data.credits},updatedAt:new Date()})
       .where(eq(sections.id,section.id));
     await emitEvent(tx,{eventType:EventTypes.SectionCreditConfigured,
       aggregateType:"section",aggregateId:section.id,actorPersonId:actor.actorPersonId,
       organizationId:program.organizationId,siteId:program.siteId,programId:program.id,
       payload:{before:current,after:data.credits}});
     await writeAudit(tx,actor,{action:"academic.section_credits.configure",
       entityType:"section",entityId:section.id,
       scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
       before:{credits:current},after:{credits:data.credits,reason:data.reason}});
     return {changed:true as const,credits:data.credits};
   });
 });
