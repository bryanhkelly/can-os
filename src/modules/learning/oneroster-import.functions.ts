import { createHash } from "node:crypto";
import { and,eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client";
import { curriculumImportJobs,programs } from "@/db/schema";
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
