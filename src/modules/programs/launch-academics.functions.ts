import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {and,asc,eq,inArray,isNull,or} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {auditEvents,courseTemplates,courseTemplateVersions,domainEvents,notifications,
 programs,roleAssignments,schoolYears,sectionTeachers,sections,terms,people,deliveryArrangements} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {evaluateSectionReadiness} from "./section-readiness-service";
const uuid=z.string().uuid();
function launchModality(delivery:{onsite?:boolean;asynchronous?:boolean;liveOnline?:boolean}){
 if(delivery.liveOnline&&delivery.onsite)return "hybrid";
 if(delivery.liveOnline)return "live_online";
 if(delivery.asynchronous&&!delivery.onsite)return "asynchronous";
 return "onsite";
}

async function setupContext(programId:string){
 const actor=await getCommandContext(getRequest());
 if(!actor.actorPersonId||actor.role!=="registrar")throw new AuthorizationError("launch registrar");
 assertCapability(actor,"program.launch.start");
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
  const {program}=await setupContext(data.programId);
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
  const catalog=await db.select({
   versionId:courseTemplateVersions.id,version:courseTemplateVersions.version,
   title:courseTemplates.title,code:courseTemplates.code,subject:courseTemplates.subject,
  }).from(courseTemplateVersions)
   .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
   .where(and(eq(courseTemplateVersions.status,"published"),
    inArray(courseTemplates.owningOrganizationId,
     [program.organizationId,program.academicProviderOrganizationId])));
  const personnel=await db.select({
   personId:roleAssignments.personId,first:people.legalFirstName,last:people.legalLastName,
  }).from(roleAssignments)
   .innerJoin(people,eq(people.id,roleAssignments.personId))
   .where(and(eq(roleAssignments.roleKey,"teacher"),
    inArray(roleAssignments.organizationId,
     [program.organizationId,program.academicProviderOrganizationId])));
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
   const readiness=await evaluateSectionReadiness(row.id);
   return {...row,teachers:assignments.filter(a=>a.sectionId===row.id),
    readiness:{...readiness,items:readiness.items.map(({evidence,...item})=>item)}};
  }));
  return {program,years,terms:termRows,catalog,teachingStaff,sections:sectionSnapshots};
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
  const [template]=await db.select({orgId:courseTemplates.owningOrganizationId})
   .from(courseTemplateVersions)
   .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
   .where(and(eq(courseTemplateVersions.id,data.courseTemplateVersionId),
    eq(courseTemplateVersions.status,"published"))).limit(1);
  if(!template||![program.organizationId,program.academicProviderOrganizationId].includes(template.orgId))
   throw new AuthorizationError("published curriculum provider");
  if(data.teacherPersonId){
   const [assignment]=await db.select({id:roleAssignments.id}).from(roleAssignments)
    .where(and(eq(roleAssignments.personId,data.teacherPersonId),
     eq(roleAssignments.roleKey,"teacher"),
     inArray(roleAssignments.organizationId,
      [program.organizationId,program.academicProviderOrganizationId]))).limit(1);
   if(!assignment)throw new AuthorizationError("teacher role assignment");
  }
  return db.transaction(async tx=>{
   const [created]=await tx.insert(sections).values({
    programId:program.id,siteId:program.siteId,termId:data.termId,
    courseTemplateVersionId:data.courseTemplateVersionId,
    code:data.code,title:data.title,active:true,
   }).onConflictDoNothing().returning({id:sections.id});
   const [existing]=created?[created]:await tx.select({id:sections.id}).from(sections)
    .where(and(eq(sections.programId,program.id),eq(sections.termId,data.termId),
     eq(sections.code,data.code))).limit(1);
   if(!existing)throw new Error("Section code collision");
   if(data.teacherPersonId){
    await tx.insert(deliveryArrangements).values({
     sectionId:existing.id,academicProviderOrganizationId:program.academicProviderOrganizationId,
     instructorPersonId:data.teacherPersonId,modality:launchModality(program.deliveryModel),
     status:"active",
    });
    await tx.insert(sectionTeachers).values({sectionId:existing.id,
     personId:data.teacherPersonId,role:"teacher"}).onConflictDoNothing();
    await tx.insert(notifications).values({recipientPersonId:data.teacherPersonId,
     type:"teaching_assignment",status:"unread",title:"Teaching assignment",
     body:"You have been assigned to "+data.title,resourceType:"section",resourceId:existing.id});
   }
   if(created){
    await tx.insert(domainEvents).values({eventType:"SectionProvisioned",
     aggregateType:"section",aggregateId:existing.id,actorPersonId:actor.actorPersonId,
     payload:{organizationId:program.organizationId,siteId:program.siteId,
      programId:program.id,termId:data.termId}});
    await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
     action:"launch.section.provision",resourceType:"section",resourceId:existing.id,
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
  const [section]=await db.select({id:sections.id}).from(sections)
   .where(and(eq(sections.id,data.sectionId),eq(sections.programId,program.id))).limit(1);
  const [teacher]=await db.select({id:roleAssignments.id}).from(roleAssignments)
   .where(and(eq(roleAssignments.personId,data.teacherPersonId),eq(roleAssignments.roleKey,"teacher"),
    inArray(roleAssignments.organizationId,
      [program.organizationId,program.academicProviderOrganizationId]))).limit(1);
  if(!section||!teacher)throw new AuthorizationError("section or teacher assignment");
  return db.transaction(async tx=>{
   await tx.update(deliveryArrangements).set({status:"completed",updatedAt:new Date()})
    .where(and(eq(deliveryArrangements.sectionId,section.id),eq(deliveryArrangements.status,"active")));
   await tx.insert(deliveryArrangements).values({
    sectionId:section.id,academicProviderOrganizationId:program.academicProviderOrganizationId,
    instructorPersonId:data.teacherPersonId,modality:launchModality(program.deliveryModel),status:"active",
   });
   const [created]=await tx.insert(sectionTeachers).values({
    sectionId:section.id,personId:data.teacherPersonId,role:"teacher",
   }).onConflictDoNothing().returning({id:sectionTeachers.id});
   if(created){
    await tx.insert(notifications).values({recipientPersonId:data.teacherPersonId,
     type:"teaching_assignment",status:"unread",title:"New teaching assignment",
     body:"You have been assigned to a course at "+program.name,
     resourceType:"section",resourceId:section.id});
    await tx.insert(auditEvents).values({actorPersonId:actor.actorPersonId,
     action:"launch.teacher.assign",resourceType:"section",resourceId:section.id,
     scope:{programId:program.id,siteId:program.siteId},after:{personId:data.teacherPersonId}});
   }
   return {created:Boolean(created)};
  });
 });
