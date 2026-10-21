import { db } from "@/db/client";
import {
complianceFrameworks,complianceFrameworkVersions,compliancePolicyApplicability,compliancePolicyRules,
people,
programs,roleAssignments,schoolYears,
qualificationDefinitions,
sections,
sectionTeachers,
terms
} from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { and,asc,eq,inArray,isNull,or } from "drizzle-orm";
import { z } from "zod";
import { evaluateSectionReadiness } from "./section-readiness-service";
import { assignLaunchInstructor,evaluateLaunchTeacher } from "@/modules/staffing/launch-staffing.server";
import { canAuthorQualificationCatalog } from "@/modules/profiles/qualification-catalog.server";
import { requireActor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { listLaunchTeacherPolicies,teacherPolicyPublisherCapability } from "./teacher-policy.server";
import { listLaunchEligibleCourses, assertLaunchEligibleCourse } from "./launch-curriculum-eligibility.server";
const uuid=z.string().uuid();

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
  const canAuthorCatalog=await canAuthorQualificationCatalog(actor,program);
  const teacherPolicies=await listLaunchTeacherPolicies(program.id);
  const canReviseTeacherPolicy=["draft","launching","ready"].includes(program.status)&&
   await hasInstitutionalProgramCapability(actor,program,teacherPolicyPublisherCapability);
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
  const catalog=await listLaunchEligibleCourses(program);
  const personnel=await db.select({
   personId:roleAssignments.personId,first:people.legalFirstName,last:people.legalLastName,
  }).from(roleAssignments)
   .innerJoin(people,eq(people.id,roleAssignments.personId))
   .where(and(eq(roleAssignments.roleKey,"teacher"),eq(people.active,true),
    inArray(roleAssignments.organizationId,
     [program.organizationId,program.academicProviderOrganizationId]),
    program.siteId?or(isNull(roleAssignments.siteId),eq(roleAssignments.siteId,program.siteId)):isNull(roleAssignments.siteId),
    or(isNull(roleAssignments.programId),eq(roleAssignments.programId,program.id))));
  const teachingStaff=[...new Map(personnel.map(p=>[p.personId,p])).values()];
  const sectionRows=await db.select({
   id:sections.id,title:sections.title,code:sections.code,termId:sections.termId,
   active:sections.active,
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
   return {...row,teachers:assignments.filter(a=>a.sectionId===row.id),
    candidates,
    readiness:{...readiness,items:readiness.items.map(({evidence,...item})=>item)}};
  }));
  return {program,years,terms:termRows,catalog,teachingStaff,sections:sectionSnapshots,
   qualificationCatalog,policyPublished:Boolean(publishedPolicy),canAuthorCatalog,teacherPolicies,canReviseTeacherPolicy};
 });

export const provisionLaunchSection=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
  programId:uuid,termId:uuid,courseTemplateVersionId:uuid,
  code:z.string().trim().min(2).max(32),title:z.string().trim().min(2).max(160),
  teacherPersonId:uuid.optional(),
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
   await assertLaunchEligibleCourse(program, data.courseTemplateVersionId, tx);
   const [created]=await tx.insert(sections).values({
    programId:program.id,siteId:program.siteId,termId:data.termId,
    courseTemplateVersionId:data.courseTemplateVersionId,
    code:data.code,title:data.title,active:true,
   }).onConflictDoNothing().returning({id:sections.id,versionId:sections.courseTemplateVersionId,title:sections.title});
   const [existing]=created?[created]:await tx.select({id:sections.id,versionId:sections.courseTemplateVersionId,title:sections.title}).from(sections)
    .where(and(eq(sections.programId,program.id),eq(sections.termId,data.termId),
     eq(sections.code,data.code))).limit(1);
   if(!existing)throw new Error("Section code collision");
   if(existing.versionId!==data.courseTemplateVersionId||existing.title!==data.title)
    throw new Error("Section code is already used by a different class or curriculum version");
   if(data.teacherPersonId){
    await assignLaunchInstructor(tx,actor,{programId:program.id,sectionId:existing.id,
     teacherPersonId:data.teacherPersonId});
   }
   if(created){
    await emitEvent(tx, {eventType:"SectionProvisioned",
     aggregateType:"section",aggregateId:existing.id,actorPersonId:actor.actorPersonId,
     payload:{organizationId:program.organizationId,siteId:program.siteId,
      programId:program.id,termId:data.termId}});
    await writeAudit(tx,actor,{
     action:"launch.section.provision",entityType:"section",entityId:existing.id,
     scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
     after:{code:data.code,title:data.title,termId:data.termId,
      teacherPersonId:data.teacherPersonId??null}});
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
  assertCapability(actor,"staffing.policy.publish");
  if(!program.siteId)throw new Error("A school site is required before publishing teacher policy");
  return db.transaction(async tx=>{
   await lockAttendanceConfigurationAtSite(tx,program.siteId!);
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
   await emitEvent(tx,{eventType:"TeacherQualificationPolicyPublished",aggregateType:"compliance_framework_version",
    aggregateId:version.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
    siteId:program.siteId,programId:program.id,payload:{qualificationKeys:keys}});
   await writeAudit(tx,actor,{action:"launch.teacher_policy.publish",entityType:"compliance_framework_version",
    entityId:version.id,scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
    after:{qualificationKeys:keys,version:"1",confirmed:true}});
   return {versionId:version.id};
  });
 });
