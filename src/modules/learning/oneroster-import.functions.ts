import { createHash } from "node:crypto";
import { and,eq,inArray,sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client";
import { curriculumImportJobs,curriculumInteropMappings,programs,sections } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { previewOneRosterBundle } from "@/domain/oneroster-csv";
import { requireActor } from "@/modules/identity/actors.server";
import { readMarketplace } from "./curriculum-marketplace.server";
import { writeAudit,emitEvent } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
/** Stages a roster *validation report*, never syncs live enrollments. */
const csv=z.string().min(1).max(500_000);
const files=z.object({
 orgs:csv.optional(),users:csv.optional(),courses:csv.optional(),classes:csv.optional(),
 enrollments:csv.optional(),academicSessions:csv.optional(),lineItems:csv.optional(),results:csv.optional(),
}).strict().refine(o=>Object.values(o).some(Boolean),"At least one OneRoster CSV file is required.");
const input=z.object({programId:z.string().uuid(),files}).strict();
export const validateOneRosterCsvBundle=createServerFn({method:"POST"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["registrar"],"curriculum.publish");
  await readMarketplace(actor,data.programId);
  const [program]=await db.select({organizationId:programs.organizationId})
   .from(programs).where(eq(programs.id,data.programId)).limit(1);
  if(!program||!actor.scope.organizationIds?.includes(program.organizationId))
   throw new AuthorizationError("institutional OneRoster preview");
  const report=previewOneRosterBundle(data.files);
  const digest=createHash("sha256").update(JSON.stringify(data.files)).digest("hex");
  const serialized={
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
      title:sections.title,active:sections.active}).from(sections)
     .where(and(inArray(sections.id,sectionIds),eq(sections.programId,program.id),
       eq(sections.siteId,program.siteId)));
   if(canonical.length!==sectionIds.length||canonical.some(s=>!s.active))
     throw new AuthorizationError("active Section owned by this Program and Site");
   const digest=createHash("sha256").update(JSON.stringify(data.files)).digest("hex");
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
       entityId:curriculumInteropMappings.entityId,metadata:curriculumInteropMappings.metadata})
       .from(curriculumInteropMappings).where(and(
         eq(curriculumInteropMappings.organizationId,program.organizationId),
         eq(curriculumInteropMappings.format,"oneroster"),
         eq(curriculumInteropMappings.sourceSystem,data.sourceSystem),
         inArray(curriculumInteropMappings.externalIdentifier,sourceIds)));
     for(const prior of previous)if(prior.entityId!==bySource.get(prior.externalIdentifier)||
          prior.metadata.programId!==program.id)
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
