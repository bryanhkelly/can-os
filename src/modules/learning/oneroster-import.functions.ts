import { createHash } from "node:crypto";
import { and,eq,inArray,sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client";
import { curriculumImportJobs,curriculumInteropMappings,programs,sections,terms,schoolYears,studentProfiles,people,enrollments } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { previewOneRosterBundle } from "@/domain/oneroster-csv";
import { planOneRosterReconciliation } from "@/domain/oneroster-reconciliation";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "./curriculum-marketplace.server";
import { writeAudit,emitEvent } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
import { activateSectionEnrollment } from "@/modules/enrollment/section-allocation.service";
/** Stages a roster *validation report*, never syncs live enrollments. */
const csv=z.string().min(1).max(500_000);
const files=z.object({
 orgs:csv.optional(),users:csv.optional(),courses:csv.optional(),classes:csv.optional(),
 enrollments:csv.optional(),academicSessions:csv.optional(),lineItems:csv.optional(),results:csv.optional(),
}).strict().refine(o=>Object.values(o).some(Boolean),"At least one OneRoster CSV file is required.");
const input=z.object({programId:z.string().uuid(),files}).strict();
/** Import identity includes the institutional Program, preventing cross-Program digest reuse. */
const bundleDigest=(programId:string,bundle:z.infer<typeof files>)=>
 createHash("sha256").update(JSON.stringify({programId,files:bundle})).digest("hex");
export const validateOneRosterCsvBundle=createServerFn({method:"POST"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"curriculum.publish");
  await readMarketplace(actor,data.programId);
  const [program]=await db.select({id:programs.id,organizationId:programs.organizationId,siteId:programs.siteId})
   .from(programs).where(eq(programs.id,data.programId)).limit(1);
  if(!program||!program.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
     !actor.scope.siteIds?.includes(program.siteId)||!actor.scope.programIds?.includes(program.id))
   throw new AuthorizationError("same-program institutional OneRoster preview");
  const report=previewOneRosterBundle(data.files);
  const digest=bundleDigest(data.programId,data.files);
  const reconciliation=planOneRosterReconciliation(report.previews,new Map());
  const serialized={
   reconciliation,
   kinds:report.previews.map(p=>({kind:p.kind,rows:p.rows.length,headers:p.headers,
     errors:p.errors,warnings:p.warnings})),
   warnings:report.warnings,valid:report.valid,format:"OneRoster 1.2 CSV",
   policy:"read_only_preview_no_roster_or_grade_mutations",
  };
  return db.transaction(async tx=>{
   const [prior]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status})
    .from(curriculumImportJobs).where(and(
      eq(curriculumImportJobs.organizationId,program.organizationId),
      eq(curriculumImportJobs.format,"oneroster"),eq(curriculumImportJobs.sha256,digest))).limit(1);
   if(prior)return {importId:prior.id,status:prior.status,report:serialized,previouslyValidated:true};
   const [job]=await tx.insert(curriculumImportJobs).values({
     organizationId:program.organizationId,format:"oneroster",formatVersion:"1.2",
     sourceName:"OneRoster CSV bundle",sha256:digest,
     status:serialized.valid?"validated":"rejected",report:serialized,
     metadata:{programId:data.programId,submittedByPersonId:actor.actorPersonId,previewOnly:true},
   }).returning({id:curriculumImportJobs.id});
   if(!job)throw new Error("Unable to record OneRoster validation.");
   await writeAudit(tx,actor,{action:"curriculum.interop.oneroster.validate",
     entityType:"curriculum_import_job",entityId:job.id,
     scope:{organizationId:program.organizationId,programId:data.programId},
     after:{format:"oneroster",sha256:digest,valid:serialized.valid}});
   await emitEvent(tx,{eventType:EventTypes.OneRosterCsvValidated,
     aggregateType:"curriculum_import_job",aggregateId:job.id,
     actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:data.programId});
   return {importId:job.id,status:serialized.valid?"validated":"rejected",
     report:serialized,previouslyValidated:false};
  });
 });

/** Explicitly reconcile external OneRoster classes to existing canonical Sections.
 * This does NOT provision people, grant access, or auto-enroll children.
 * Every sourcedId requires a registrar-chosen, same-program Section, and
 * mappings are immutable across retries (changes need a supervised review).
 */
const classMappingInput=input.extend({
  sourceSystem:z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9._:-]+$/),
  classMappings:z.array(z.object({
    sourcedId:z.string().trim().min(1).max(256),
    sectionId:z.string().uuid(),
  }).strict()).min(1).max(500),
}).strict();

/** Read-only registrar review of explicit proposed Section mappings. No identity linking. */
const reconciliationInput=input.extend({
  classMappings:z.array(z.object({
    sourcedId:z.string().trim().min(1).max(256),
    sectionId:z.string().uuid(),
  }).strict()).max(500),
}).strict();
export const previewOneRosterReconciliation=createServerFn({method:"POST"})
 .validator((value:unknown)=>reconciliationInput.parse(value))
 .handler(async({data})=>{
   const actor=await requireActor(["registrar"],"curriculum.publish");
   await readMarketplace(actor,data.programId);
   const [program]=await db.select({id:programs.id,organizationId:programs.organizationId,
     siteId:programs.siteId}).from(programs).where(eq(programs.id,data.programId)).limit(1);
   if(!program||!program.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
       !actor.scope.siteIds?.includes(program.siteId)||!actor.scope.programIds?.includes(program.id))
     throw new AuthorizationError("same-program OneRoster reconciliation preview");
   const report=previewOneRosterBundle(data.files);
   const bySource=new Map(data.classMappings.map(m=>[m.sourcedId,m.sectionId]));
   if(bySource.size!==data.classMappings.length)throw new Error("Duplicate external class mapping.");
   const externalClasses=new Set(report.previews.find(p=>p.kind==="classes")?.rows.map(r=>r.sourcedId)??[]);
   if(data.classMappings.some(m=>!externalClasses.has(m.sourcedId)))
     throw new Error("Mapped sourcedId must occur in the supplied classes CSV.");
   const ids=[...new Set(data.classMappings.map(m=>m.sectionId))];
   if(ids.length!==data.classMappings.length)throw new Error("Each external class must map to a distinct Section.");
   if(ids.length){
     const owned=await db.select({id:sections.id,active:sections.active}).from(sections)
       .where(and(inArray(sections.id,ids),eq(sections.programId,program.id),eq(sections.siteId,program.siteId)));
     if(owned.length!==ids.length||owned.some(s=>!s.active))
       throw new AuthorizationError("active Section owned by the selected Program and Site");
   }
   return {valid:report.valid,errors:report.previews.flatMap(p=>p.errors),warnings:report.warnings,
     reconciliation:planOneRosterReconciliation(report.previews,bySource)};
 });


/** Registrar selects an existing CAN Student Profile, never a sourcedId-derived identity.
 * The student must already have a live Program enrollment. This records a scoped
 * identity assertion only; it never creates a Person, account or enrollment.
 */
const studentMappingInput=input.extend({
 sourceSystem:z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9._:-]+$/),
 externalSchoolSourcedId:z.string().trim().min(1).max(256),
 studentMappings:z.array(z.object({
  sourcedId:z.string().trim().min(1).max(256),
  studentProfileId:z.string().uuid(),
 }).strict()).min(1).max(500),
}).strict();

export const applyOneRosterStudentMappings=createServerFn({method:"POST"})
 .validator((value:unknown)=>studentMappingInput.parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"curriculum.publish");
  await readMarketplace(actor,data.programId);
  const [program]=await db.select({id:programs.id,organizationId:programs.organizationId,siteId:programs.siteId})
   .from(programs).where(eq(programs.id,data.programId)).limit(1);
  if(!program||!program.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
    !actor.scope.siteIds?.includes(program.siteId)||!actor.scope.programIds?.includes(program.id))
    throw new AuthorizationError("same-program registrar student reconciliation");
  const report=previewOneRosterBundle(data.files);
  if(!report.valid)throw new Error("Resolve all OneRoster source errors before mapping students.");
  const users=report.previews.find(p=>p.kind==="users")?.rows??[];
  const schools=report.previews.find(p=>p.kind==="orgs")?.rows??[];
  if(!schools.length||!schools.some(s=>s.sourcedId===data.externalSchoolSourcedId&&
     s.type?.toLowerCase()==="school"&&(!s.status||s.status.toLowerCase()==="active")))
    throw new Error("External school must exist as an active school in supplied orgs.");
  if(new Set(users.map(u=>u.sourcedId)).size!==users.length)
    throw new Error("Duplicate external user IDs must be resolved before registrar mapping.");
  const byUser=new Map(users.map(u=>[u.sourcedId,u]));
  const externalIds=data.studentMappings.map(m=>m.sourcedId);
  const profileIds=data.studentMappings.map(m=>m.studentProfileId);
  if(new Set(externalIds).size!==externalIds.length||new Set(profileIds).size!==profileIds.length)
    throw new Error("Duplicate external user or CAN student mappings are prohibited.");
  for(const id of externalIds){
   const user=byUser.get(id);
   if(!user||user.role?.toLowerCase()!=="student"||
      user.enabledUser?.toLowerCase()!=="true"||
      (user.status&&user.status.toLowerCase()!=="active")||
      (user.orgSourcedIds&&!user.orgSourcedIds.split(",").map(s=>s.trim()).includes(data.externalSchoolSourcedId)))
     throw new Error("External user must be an active student of the selected external school.");
  }
  const digest=bundleDigest(data.programId,data.files);
  return db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"oneroster-students:"+program.organizationId+":"+data.sourceSystem}))`);
   const [job]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status,metadata:curriculumImportJobs.metadata})
    .from(curriculumImportJobs).where(and(eq(curriculumImportJobs.organizationId,program.organizationId),
      eq(curriculumImportJobs.format,"oneroster"),eq(curriculumImportJobs.sha256,digest))).for("update").limit(1);
   if(!job||job.status==="rejected"||job.metadata.programId!==program.id)
    throw new Error("Validate this exact OneRoster bundle before registrar approval.");
   const existing=await tx.select({id:studentProfiles.id,personId:studentProfiles.personId})
    .from(studentProfiles).innerJoin(people,and(eq(people.id,studentProfiles.personId),eq(people.active,true)))
    .where(inArray(studentProfiles.id,profileIds));
   if(existing.length!==profileIds.length)throw new Error("CAN student profile or active Person not found.");
   const enrolled=await tx.select({studentProfileId:enrollments.studentProfileId})
    .from(enrollments).where(and(inArray(enrollments.studentProfileId,profileIds),
      eq(enrollments.organizationId,program.organizationId),eq(enrollments.programId,program.id),
      eq(enrollments.kind,"program"),eq(enrollments.status,"active")));
   if(new Set(enrolled.map(e=>e.studentProfileId)).size!==profileIds.length)
    throw new Error("CAN student must have a current approved Program enrollment.");
   const identifiers=externalIds.map(id=>"user:"+data.externalSchoolSourcedId+":"+id);
   const otherBindings=await tx.select({entityId:curriculumInteropMappings.entityId,
     externalIdentifier:curriculumInteropMappings.externalIdentifier}).from(curriculumInteropMappings).where(and(
       eq(curriculumInteropMappings.organizationId,program.organizationId),
       eq(curriculumInteropMappings.format,"oneroster"),eq(curriculumInteropMappings.sourceSystem,data.sourceSystem),
       eq(curriculumInteropMappings.entityType,"student_profile"),
       inArray(curriculumInteropMappings.entityId,profileIds)));
   if(otherBindings.some(b=>!identifiers.includes(b.externalIdentifier)))
     throw new Error("CAN student is already bound to a different external identity under this issuer.");
   const previous=await tx.select({externalIdentifier:curriculumInteropMappings.externalIdentifier,
     entityType:curriculumInteropMappings.entityType,entityId:curriculumInteropMappings.entityId,
     metadata:curriculumInteropMappings.metadata}).from(curriculumInteropMappings).where(and(
       eq(curriculumInteropMappings.organizationId,program.organizationId),
       eq(curriculumInteropMappings.format,"oneroster"),eq(curriculumInteropMappings.sourceSystem,data.sourceSystem),
       inArray(curriculumInteropMappings.externalIdentifier,identifiers)));
   const byIdentifier=new Map(data.studentMappings.map(m=>["user:"+data.externalSchoolSourcedId+":"+m.sourcedId,m.studentProfileId]));
   for(const prior of previous)if(prior.entityType!=="student_profile"||
      prior.entityId!==byIdentifier.get(prior.externalIdentifier)||
      prior.metadata.programId!==program.id||prior.metadata.siteId!==program.siteId||
      prior.metadata.sourceHash!==digest)
     throw new Error("Changed or conflicting student identity mapping requires separate registrar re-review.");
   const mapped=new Set(previous.map(p=>p.externalIdentifier));
   let added=0;
   for(const [identifier,profileId] of byIdentifier){
    if(mapped.has(identifier))continue;
    await tx.insert(curriculumInteropMappings).values({
     organizationId:program.organizationId,importJobId:job.id,format:"oneroster",
     sourceSystem:data.sourceSystem,externalIdentifier:identifier,
     entityType:"student_profile",entityId:profileId,
     metadata:{programId:program.id,siteId:program.siteId,sourceHash:digest,
       externalSchoolSourcedId:data.externalSchoolSourcedId,approvedByPersonId:actor.actorPersonId},
    });
    added++;
   }
   await writeAudit(tx,actor,{action:"curriculum.interop.oneroster.students.map",
    entityType:"curriculum_import_job",entityId:job.id,
    scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
    after:{sourceSystem:data.sourceSystem,externalSchoolSourcedId:data.externalSchoolSourcedId,
      added,total:data.studentMappings.length,policy:"existing_active_program_students_only"}});
   return {importId:job.id,added,mappedStudents:data.studentMappings.length,
     policy:"existing_active_program_students_only" as const};
  });
 });

export const applyOneRosterClassMappings=createServerFn({method:"POST"})
 .validator((value:unknown)=>classMappingInput.parse(value))
 .handler(async({data})=>{
   const actor=await requireActor(["registrar"],"curriculum.publish");
   await readMarketplace(actor,data.programId);
   const [program]=await db.select({id:programs.id,organizationId:programs.organizationId,
     siteId:programs.siteId}).from(programs).where(eq(programs.id,data.programId)).limit(1);
   if(!program||!program.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
       !actor.scope.siteIds?.includes(program.siteId)||
       !actor.scope.programIds?.includes(program.id))
     throw new AuthorizationError("same-program institutional class reconciliation");
   const preview=previewOneRosterBundle(data.files);
   if(!preview.valid)throw new Error("Resolve all OneRoster errors before applying mappings.");
   const classes=preview.previews.find(p=>p.kind==="classes");
   if(!classes||!classes.rows.length||classes.rows.length>500)
     throw new Error("Provide 1–500 valid OneRoster classes for canonical reconciliation.");
   // CSV rows are indexable records: require a concrete sourcedId before
   // passing identifiers into Drizzle predicates and persisted mappings.
   const validatedClasses=classes.rows.map(row=>{
     const {sourcedId,classCode,title,courseSourcedId}=row;
     if(!sourcedId||!classCode||!title||!courseSourcedId)
       throw new Error("OneRoster class mapping requires its ID, code, title and course ID.");
     return {sourcedId,classCode,title,courseSourcedId};
   });
   const sourceIds=validatedClasses.map(row=>row.sourcedId);
   const bySource=new Map(data.classMappings.map(row=>[row.sourcedId,row.sectionId]));
   if(bySource.size!==data.classMappings.length||
       sourceIds.length!==bySource.size||sourceIds.some(id=>!bySource.has(id))||
       new Set(data.classMappings.map(m=>m.sectionId)).size!==data.classMappings.length)
     throw new Error("Map every external class exactly once to a distinct Section.");
   const sectionIds=data.classMappings.map(m=>m.sectionId);
   const canonical=await db.select({id:sections.id,code:sections.code,
      title:sections.title,active:sections.active,termId:sections.termId,
      schoolYearKey:schoolYears.key,schoolYearId:schoolYears.id,
      schoolYearStatus:schoolYears.status,termKey:terms.key,yearProgramId:schoolYears.programId}).from(sections)
     .innerJoin(terms,eq(sections.termId,terms.id))
     .innerJoin(schoolYears,eq(terms.schoolYearId,schoolYears.id))
     .where(and(inArray(sections.id,sectionIds),eq(sections.programId,program.id),
       eq(sections.siteId,program.siteId),eq(schoolYears.organizationId,program.organizationId),
       eq(schoolYears.siteId,program.siteId)));
   if(canonical.length!==sectionIds.length||canonical.some(s=>!s.active||s.schoolYearStatus!=="active"||s.schoolYearId===null))
     throw new AuthorizationError("active Section owned by this Program and Site");
   if(canonical.some(s=>s.yearProgramId!==program.id))
     throw new AuthorizationError("SchoolYear must belong to the selected Program");
   const byCanonicalId=new Map(canonical.map(s=>[s.id,s]));
   for(const row of classes.rows){
     const externalId=row.sourcedId;
      if(!externalId)throw new Error("External class identifier is required.");
      const section=byCanonicalId.get(bySource.get(externalId)!);
     if(!section||!row.schoolYear||row.schoolYear!==section.schoolYearKey)
       throw new Error("External class school year must match the canonical Section year.");
     if(!row.termSourcedIds||!row.termSourcedIds.split(",").map(s=>s.trim()).includes(section.termKey))
       throw new Error("External class term must match the canonical Section term key.");
     if(row.status?.toLowerCase()==="tobedeleted")
       throw new Error("Withdrawn external classes cannot be mapped.");
   }
   const digest=bundleDigest(data.programId,data.files);
   return db.transaction(async tx=>{
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"oneroster-map:"+program.organizationId+":"+data.sourceSystem}))`);
     const [job]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status,
       metadata:curriculumImportJobs.metadata}).from(curriculumImportJobs)
       .where(and(eq(curriculumImportJobs.organizationId,program.organizationId),
         eq(curriculumImportJobs.format,"oneroster"),eq(curriculumImportJobs.sha256,digest)))
       .for("update").limit(1);
     if(!job||job.status==="rejected"||job.metadata.programId!==program.id)
       throw new Error("Validate this exact OneRoster bundle for the selected Program first.");
     const previous=await tx.select({externalIdentifier:curriculumInteropMappings.externalIdentifier,
       entityType:curriculumInteropMappings.entityType,entityId:curriculumInteropMappings.entityId,metadata:curriculumInteropMappings.metadata})
       .from(curriculumInteropMappings).where(and(
         eq(curriculumInteropMappings.organizationId,program.organizationId),
         eq(curriculumInteropMappings.format,"oneroster"),
         eq(curriculumInteropMappings.sourceSystem,data.sourceSystem),
         inArray(curriculumInteropMappings.externalIdentifier,sourceIds)));
     for(const prior of previous)if(prior.entityType!=="section"||prior.entityId!==bySource.get(prior.externalIdentifier)||
          prior.metadata.programId!==program.id||prior.metadata.siteId!==program.siteId||prior.metadata.sourceHash!==digest)
       throw new Error("Existing OneRoster sourcedId is bound to a different canonical Section.");
     const alreadyMapped=new Set(previous.map(p=>p.externalIdentifier));
     let mapped=0;
     for(const row of validatedClasses){
       if(alreadyMapped.has(row.sourcedId))continue;
       const [inserted]=await tx.insert(curriculumInteropMappings).values({
         organizationId:program.organizationId,importJobId:job.id,
         format:"oneroster",sourceSystem:data.sourceSystem,
         externalIdentifier:row.sourcedId,entityType:"section",
         entityId:bySource.get(row.sourcedId)!,
         metadata:{programId:program.id,siteId:program.siteId,
           sourceHash:digest,externalClassCode:row.classCode,
           externalTitle:row.title,courseSourcedId:row.courseSourcedId},
       }).returning({id:curriculumInteropMappings.id});
       if(!inserted)throw new Error("Unable to record canonical Section mapping.");
       mapped++;
     }
     await tx.update(curriculumImportJobs).set({
       status:"mapped",updatedAt:new Date(),
       metadata:{...job.metadata,classMappingSourceSystem:data.sourceSystem,
         mappingScope:"existing_sections_only",classCount:classes.rows.length},
     }).where(eq(curriculumImportJobs.id,job.id));
     await writeAudit(tx,actor,{action:"curriculum.interop.oneroster.classes.map",
       entityType:"curriculum_import_job",entityId:job.id,
       scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
       after:{sourceSystem:data.sourceSystem,newMappings:mapped,
         totalMappings:classes.rows.length,policy:"no_student_or_enrollment_mutations"}});
     return {importId:job.id,status:"mapped" as const,added:mapped,
       mappedClasses:classes.rows.length,policy:"existing_sections_only" as const};
   });
 });

/** Explicitly approved single-student placement, through CAN's canonical allocation
 * service (teacher, curriculum, capacity, add/drop, schedule and prerequisites).
 * Neither an external enrollment row nor an identity mapping grants access alone.
 */
const placementInput=input.extend({
 sourceSystem:z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9._:-]+$/),
 externalSchoolSourcedId:z.string().trim().min(1).max(256),
 externalEnrollmentSourcedId:z.string().trim().min(1).max(256),
 externalClassSourcedId:z.string().trim().min(1).max(256),
 externalUserSourcedId:z.string().trim().min(1).max(256),
 studentProfileId:z.string().uuid(),
 sectionId:z.string().uuid(),
 approved:z.literal(true),
}).strict();
export const approveOneRosterSectionPlacement=createServerFn({method:"POST"})
 .validator((value:unknown)=>placementInput.parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"curriculum.publish");
  await readMarketplace(actor,data.programId);
  const [program]=await db.select({id:programs.id,organizationId:programs.organizationId,siteId:programs.siteId})
   .from(programs).where(eq(programs.id,data.programId)).limit(1);
  if(!program||!program.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
     !actor.scope.siteIds?.includes(program.siteId)||!actor.scope.programIds?.includes(program.id))
    throw new AuthorizationError("same-program OneRoster placement approval");
  const report=previewOneRosterBundle(data.files);
  if(!report.valid)throw new Error("Invalid OneRoster bundle cannot activate placement.");
  const get=(kind:string)=>report.previews.find(p=>p.kind===kind)?.rows??[];
  const enrollment=get("enrollments").find(r=>r.sourcedId===data.externalEnrollmentSourcedId);
  const user=get("users").find(r=>r.sourcedId===data.externalUserSourcedId);
  const klass=get("classes").find(r=>r.sourcedId===data.externalClassSourcedId);
  const school=get("orgs").find(r=>r.sourcedId===data.externalSchoolSourcedId);
  if(!enrollment||!user||!klass||!school||
     school.type?.toLowerCase()!=="school"||
     enrollment.userSourcedId!==user.sourcedId||
     enrollment.classSourcedId!==klass.sourcedId||
     enrollment.schoolSourcedId!==school.sourcedId||
     klass.schoolSourcedId!==school.sourcedId||
     user.role?.toLowerCase()!=="student"||enrollment.role?.toLowerCase()!=="student"||
     user.enabledUser?.toLowerCase()!=="true"||
     (user.orgSourcedIds&&!user.orgSourcedIds.split(",").map(s=>s.trim()).includes(school.sourcedId!))||
     [enrollment,user,klass,school].some(row=>row.status&&row.status.toLowerCase()!=="active"))
    throw new Error("OneRoster student, class, school and enrollment must be active and consistent.");
  const digest=bundleDigest(data.programId,data.files);
  return db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"oneroster-place:"+program.organizationId+":"+data.sourceSystem}))`);
   const [job]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status,metadata:curriculumImportJobs.metadata})
    .from(curriculumImportJobs).where(and(eq(curriculumImportJobs.organizationId,program.organizationId),
      eq(curriculumImportJobs.format,"oneroster"),eq(curriculumImportJobs.sha256,digest))).for("update").limit(1);
   if(!job||job.status==="rejected"||job.metadata.programId!==program.id)
    throw new Error("Validate this exact bundle before registrar placement approval.");
   const identifiers=["user:"+data.externalSchoolSourcedId+":"+data.externalUserSourcedId,data.externalClassSourcedId];
   const mapped=await tx.select({externalIdentifier:curriculumInteropMappings.externalIdentifier,
     entityType:curriculumInteropMappings.entityType,entityId:curriculumInteropMappings.entityId,
     metadata:curriculumInteropMappings.metadata}).from(curriculumInteropMappings).where(and(
      eq(curriculumInteropMappings.organizationId,program.organizationId),
      eq(curriculumInteropMappings.format,"oneroster"),eq(curriculumInteropMappings.sourceSystem,data.sourceSystem),
      inArray(curriculumInteropMappings.externalIdentifier,identifiers)));
   const identity=mapped.find(m=>m.externalIdentifier===identifiers[0]&&m.entityType==="student_profile"&&
     m.entityId===data.studentProfileId&&m.metadata.programId===program.id&&m.metadata.siteId===program.siteId);
   const section=mapped.find(m=>m.externalIdentifier===identifiers[1]&&m.entityType==="section"&&
     m.entityId===data.sectionId&&m.metadata.programId===program.id&&m.metadata.siteId===program.siteId);
   if(!identity||!section)throw new Error("Registrar-approved CAN student and Section mappings are required.");
   const [canonical]=await tx.select({year:schoolYears.key,term:terms.key})
    .from(sections).innerJoin(terms,eq(terms.id,sections.termId))
    .innerJoin(schoolYears,eq(schoolYears.id,terms.schoolYearId))
    .where(and(eq(sections.id,data.sectionId),eq(sections.programId,program.id),
      eq(sections.siteId,program.siteId),eq(schoolYears.programId,program.id),
      eq(schoolYears.status,"active"))).limit(1);
   if(!canonical||klass.schoolYear!==canonical.year||
      !klass.termSourcedIds?.split(",").map(v=>v.trim()).includes(canonical.term))
    throw new Error("External year and term must match the active canonical Section.");
   const placement=await activateSectionEnrollment(tx,{
     actor,studentProfileId:data.studentProfileId,sectionId:data.sectionId,
     source:"oneroster_registrar_approved",
   });
   await writeAudit(tx,actor,{action:"curriculum.interop.oneroster.placement.approve",
    entityType:"enrollment",entityId:placement.enrollmentId,
    scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
    after:{sourceSystem:data.sourceSystem,importJobId:job.id,
      externalEnrollmentSourcedId:data.externalEnrollmentSourcedId,created:placement.created}});
   return {...placement,policy:"canonical_section_allocation" as const};
  });
 });
