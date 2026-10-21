import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courseTemplates,courseTemplateVersions,curriculumUnitVersions,programs,
  sections,sectionUnitAdoptions,
} from "@/db/schema";
import { classModuleSchema,readClassContent } from "@/domain/class-content";
import { assertUnitPublishable,composeClassUnits,unitDraftSchema,type UnitDraft } from "@/domain/class-unit-releases";
import { AuthorizationError } from "@/domain/command-context";
import type { Actor } from "@/modules/identity/actors.server";
import { authorizeClass } from "./class-access.server";
import { readAdoptedClassUnits } from "./class-units.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { emitEvent,writeAudit } from "@/platform/mutation";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
function revision(input:unknown){
 return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
async function authorizedProgram(actor:Actor,programId:string,tx:Tx){
 const [program]=await tx.select().from(programs).where(eq(programs.id,programId)).limit(1);
 if(!program||!await hasInstitutionalProgramCapability(actor,program,"curriculum.publish",tx))
  throw new AuthorizationError("program curriculum publishing permission");
 return program;
}
async function publisherCourse(tx:Tx,programId:string,courseVersionId:string,actor:Actor){
 const program=await authorizedProgram(actor,programId,tx);
 const [course]=await tx.select({
  version:courseTemplateVersions,
  template:courseTemplates,
 }).from(courseTemplateVersions)
 .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
 .where(eq(courseTemplateVersions.id,courseVersionId)).limit(1);
 if(!course||course.version.status!=="published"||course.template.owningOrganizationId!==program.organizationId)
  throw new AuthorizationError("published institution-owned base course version");
 return {program,course};
}

/** Drafts are independent of course and marketplace pack versions. */
export async function createClassUnitDraft(actor:Actor,input:{
 programId:string;baseCourseVersionId:string;unitKey:string;requestId:string;
}){
 return db.transaction(async tx=>{
  const {program}=await publisherCourse(tx,input.programId,input.baseCourseVersionId,actor);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"unit:"+input.baseCourseVersionId+":"+input.unitKey}))`);
  const versions=await tx.select().from(curriculumUnitVersions)
   .where(and(eq(curriculumUnitVersions.baseCourseVersionId,input.baseCourseVersionId),
     eq(curriculumUnitVersions.unitKey,input.unitKey)))
   .orderBy(desc(curriculumUnitVersions.version));
  const previous=versions.find(v=>v.metadata.requestId===input.requestId);
  if(previous)return {unitVersionId:previous.id,version:previous.version};
  if(versions.some(v=>v.status==="draft"||v.status==="teacher_reviewed"))
   throw new Error("This unit has an unpublished revision. Continue it rather than creating another.");
  const [created]=await tx.insert(curriculumUnitVersions).values({
    owningOrganizationId:program.organizationId,
    baseCourseVersionId:input.baseCourseVersionId,unitKey:input.unitKey,
    version:(versions[0]?.version??0)+1,status:"draft",
    module:{id:input.unitKey,title:"Week in preparation",lessons:[]},
    authoredByPersonId:actor.actorPersonId,
    metadata:{requestId:input.requestId,creditReady:false},
  }).returning({id:curriculumUnitVersions.id,version:curriculumUnitVersions.version});
  if(!created)throw new Error("Failed to create independent unit draft.");
  await writeAudit(tx,actor,{action:"curriculum.unit.draft.create",entityType:"curriculum_unit_version",
    entityId:created.id,scope:{organizationId:program.organizationId,programId:program.id},
    after:{unitKey:input.unitKey,courseVersionId:input.baseCourseVersionId,version:created.version}});
  await emitEvent(tx,{eventType:"CurriculumUnitDraftCreated",aggregateType:"curriculum_unit_version",
    aggregateId:created.id,actorPersonId:actor.actorPersonId,programId:program.id});
  return {unitVersionId:created.id,version:created.version};
 });
}
export async function saveClassUnitDraft(actor:Actor,input:{
 programId:string;unitVersionId:string;expectedRevision:string;draft:UnitDraft;
}){
 const draft=unitDraftSchema.parse(input.draft);
 return db.transaction(async tx=>{
  const [unit]=await tx.select().from(curriculumUnitVersions)
   .where(eq(curriculumUnitVersions.id,input.unitVersionId)).for("update").limit(1);
  if(!unit)throw new Error("Unit version not found.");
  const {program}=await publisherCourse(tx,input.programId,unit.baseCourseVersionId,actor);
  if(program.organizationId!==unit.owningOrganizationId)throw new AuthorizationError("publisher organization");
  if(unit.status!=="draft")throw new Error("Teacher-reviewed or published units are locked. Create a new draft version.");
  const old=revision({module:unit.module,teacherGuide:unit.teacherGuide});
  if(old!==input.expectedRevision)throw new Error("Unit draft changed; reload before editing.");
  if(draft.unitKey!==unit.unitKey)throw new Error("Draft unit identity cannot change.");
  const guide=draft.teacherGuide?{...draft.teacherGuide,reviewStatus:"draft" as const}:null;
  await tx.update(curriculumUnitVersions).set({
    module:draft.module,teacherGuide:guide,updatedAt:new Date(),
  }).where(eq(curriculumUnitVersions.id,unit.id));
  await writeAudit(tx,actor,{action:"curriculum.unit.draft.save",entityType:"curriculum_unit_version",
    entityId:unit.id,scope:{programId:program.id},after:{unitKey:unit.unitKey,revision:revision({module:draft.module,teacherGuide:guide})}});
  await emitEvent(tx,{eventType:"CurriculumUnitDraftSaved",aggregateType:"curriculum_unit_version",
    aggregateId:unit.id,actorPersonId:actor.actorPersonId,programId:program.id});
  return {revision:revision({module:draft.module,teacherGuide:guide})};
 });
}
export async function getClassUnitDraft(actor:Actor,input:{programId:string;unitVersionId:string}){
 const [unit]=await db.select().from(curriculumUnitVersions).where(eq(curriculumUnitVersions.id,input.unitVersionId)).limit(1);
 if(!unit)throw new Error("Unit not found.");
 const program=await db.select().from(programs).where(eq(programs.id,input.programId)).limit(1);
 if(!program[0]||!await hasInstitutionalProgramCapability(actor,program[0],"curriculum.publish")||
   program[0].organizationId!==unit.owningOrganizationId)
   throw new AuthorizationError("institutional unit authoring");
 return {id:unit.id,status:unit.status,unitKey:unit.unitKey,version:unit.version,
  draft: {unitKey:unit.unitKey,module:classModuleSchema.parse(unit.module),teacherGuide:unit.teacherGuide},
  revision:revision({module:unit.module,teacherGuide:unit.teacherGuide})};
}
/** A *real assigned teacher* performs curriculum review, separately from school approval. */
export async function reviewClassUnitDraft(actor:Actor,input:{sectionId:string;unitVersionId:string}){
 if(actor.role!=="teacher")throw new AuthorizationError("assigned teacher reviewer");
 return db.transaction(async tx=>{
  const {section}=await authorizeClass(actor,input.sectionId,undefined,tx);
  const [unit]=await tx.select().from(curriculumUnitVersions)
   .where(eq(curriculumUnitVersions.id,input.unitVersionId)).for("update").limit(1);
  if(!unit||unit.baseCourseVersionId!==section.versionId||unit.status!=="draft")
   throw new Error("The selected unit is not an editable draft for this class.");
  const module=classModuleSchema.parse(unit.module);
  const guide=unit.teacherGuide;
  const parsed=unitDraftSchema.parse({unitKey:unit.unitKey,module,teacherGuide:guide});
  if(!parsed.teacherGuide)throw new Error("Add the complete teacher guide before review.");
  const reviewed={...parsed.teacherGuide,reviewStatus:"teacher_reviewed" as const};
  assertUnitPublishable({...parsed,teacherGuide:reviewed});
  await tx.update(curriculumUnitVersions).set({status:"teacher_reviewed",teacherGuide:reviewed,
    reviewedAt:new Date(),reviewedByPersonId:actor.actorPersonId,updatedAt:new Date()})
    .where(eq(curriculumUnitVersions.id,unit.id));
  await writeAudit(tx,actor,{action:"curriculum.unit.teacher_review",entityType:"curriculum_unit_version",
    entityId:unit.id,scope:{sectionId:section.id,programId:section.programId},
    after:{unitKey:unit.unitKey,reviewedByPersonId:actor.actorPersonId}});
  await emitEvent(tx,{eventType:"CurriculumUnitTeacherReviewed",aggregateType:"curriculum_unit_version",
    aggregateId:unit.id,actorPersonId:actor.actorPersonId,programId:section.programId,sectionId:section.id});
  return {reviewed:true};
 });
}
/** Registrar school approval locks the entire unit and guide without changing the base course. */
export async function publishClassUnit(actor:Actor,input:{programId:string;unitVersionId:string}){
 return db.transaction(async tx=>{
  const [unit]=await tx.select().from(curriculumUnitVersions)
   .where(eq(curriculumUnitVersions.id,input.unitVersionId)).for("update").limit(1);
  if(!unit)throw new Error("Unit not found.");
  const {program}=await publisherCourse(tx,input.programId,unit.baseCourseVersionId,actor);
  if(program.organizationId!==unit.owningOrganizationId)throw new AuthorizationError("publishing organization");
  if(unit.status==="published")return {unitVersionId:unit.id,published:false};
  if(unit.status!=="teacher_reviewed"||!unit.reviewedByPersonId||!unit.reviewedAt)
   throw new Error("An assigned teacher must review the complete unit before school publication.");
  const parsed=unitDraftSchema.parse({unitKey:unit.unitKey,module:unit.module,teacherGuide:unit.teacherGuide});
  assertUnitPublishable(parsed);
  const approved={...parsed.teacherGuide!,reviewStatus:"school_approved" as const};
  await tx.update(curriculumUnitVersions).set({
    status:"published",teacherGuide:approved,approvedByPersonId:actor.actorPersonId,
    publishedAt:new Date(),updatedAt:new Date(),
  }).where(eq(curriculumUnitVersions.id,unit.id));
  await writeAudit(tx,actor,{action:"curriculum.unit.publish",entityType:"curriculum_unit_version",
    entityId:unit.id,scope:{programId:program.id,organizationId:program.organizationId},
    after:{unitKey:unit.unitKey,version:unit.version,teacherReviewer:unit.reviewedByPersonId,creditReady:false}});
  await emitEvent(tx,{eventType:"CurriculumUnitPublished",aggregateType:"curriculum_unit_version",
    aggregateId:unit.id,actorPersonId:actor.actorPersonId,programId:program.id});
  return {unitVersionId:unit.id,published:true};
 });
}
/** Explicit class adoption: section course-version, progress and pack pointers never move. */
export async function adoptClassUnit(actor:Actor,input:{
 programId:string;sectionId:string;unitVersionId:string;availableAt?:Date;
}){
 return db.transaction(async tx=>{
  const program=await authorizedProgram(actor,input.programId,tx);
  const [section]=await tx.select().from(sections).where(eq(sections.id,input.sectionId)).limit(1);
  if(!section||section.programId!==program.id||section.siteId!==program.siteId||!section.active)
   throw new AuthorizationError("active institutional class");
  const [unit]=await tx.select().from(curriculumUnitVersions).where(eq(curriculumUnitVersions.id,input.unitVersionId)).limit(1);
  if(!unit||unit.status!=="published"||unit.baseCourseVersionId!==section.courseTemplateVersionId||
     unit.owningOrganizationId!==program.organizationId||!unit.approvedByPersonId)
   throw new AuthorizationError("school-approved unit for this pinned class release");
  const [existing]=await tx.select().from(sectionUnitAdoptions)
   .where(and(eq(sectionUnitAdoptions.sectionId,section.id),
      eq(sectionUnitAdoptions.unitKey,unit.unitKey))).limit(1);
  if(existing){
   if(existing.unitVersionId===unit.id&&existing.status==="active" &&
      (existing.availableAt?.toISOString()??null)===(input.availableAt?.toISOString()??null))
     return {adoptionId:existing.id,adopted:false};
   throw new Error("This unit is already pinned. Revision requires a separate progress-safe transition.");
  }
  const [base]=await tx.select({curriculum:courseTemplateVersions.curriculum})
   .from(courseTemplateVersions).where(eq(courseTemplateVersions.id,section.courseTemplateVersionId)).limit(1);
  if(!base)throw new Error("Base version not found.");
  const baseContent=readClassContent(base.curriculum);
  const existingUnits=await readAdoptedClassUnits({id:section.id,versionId:section.courseTemplateVersionId},tx,new Date(9999,0,1));
  composeClassUnits(baseContent,[...existingUnits,{
    unitKey:unit.unitKey,unitVersionId:unit.id,status:unit.status,
    module:unit.module,teacherGuide:unit.teacherGuide,availableAt:null,
  }],new Date(9999,0,1));
  const [row]=await tx.insert(sectionUnitAdoptions).values({
    sectionId:section.id,baseCourseVersionId:section.courseTemplateVersionId,
    unitKey:unit.unitKey,unitVersionId:unit.id,adoptedByPersonId:actor.actorPersonId,
    availableAt:input.availableAt??null,
    metadata:{schoolApproved:true,creditReady:false},
  }).returning({id:sectionUnitAdoptions.id});
  if(!row)throw new Error("Unable to adopt class unit.");
  await writeAudit(tx,actor,{action:"curriculum.unit.section_adopt",entityType:"section_unit_adoption",
    entityId:row.id,scope:{sectionId:section.id,programId:program.id},
    after:{unitVersionId:unit.id,unitKey:unit.unitKey,availableAt:input.availableAt?.toISOString()??null,
      baseCourseVersionUnchanged:section.courseTemplateVersionId}});
  await emitEvent(tx,{eventType:"CurriculumUnitAdopted",aggregateType:"section_unit_adoption",
    aggregateId:row.id,actorPersonId:actor.actorPersonId,programId:program.id,sectionId:section.id});
  return {adoptionId:row.id,adopted:true};
 });
}
