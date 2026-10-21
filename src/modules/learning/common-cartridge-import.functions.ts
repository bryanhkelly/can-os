import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { curriculumImportJobs, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { inspectCommonCartridgeZip } from "@/domain/common-cartridge";
import { requireActor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { readMarketplace } from "./curriculum-marketplace.server";
import { writeAudit, emitEvent } from "@/platform/mutation";

const context=z.object({programId:z.string().uuid()}).strict();
const incoming=context.extend({
 fileName:z.string().trim().min(1).max(150).regex(/\.(imscc|zip)$/i),
 base64:z.string().max(3_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();

async function authorize(programId:string){
 const actor=await requireActor(["registrar"],"curriculum.publish");
 await readMarketplace(actor,programId);
 const [program]=await db.select({id:programs.id,organizationId:programs.organizationId,siteId:programs.siteId})
   .from(programs).where(eq(programs.id,programId)).limit(1);
 if(!program||!actor.scope.organizationIds?.includes(program.organizationId)||
   !await hasInstitutionalProgramCapability(actor,program,"curriculum.publish"))
   throw new AuthorizationError("explicit publisher authority for curriculum import");
 return {actor,program};
}

/** Audit-staged 1EdTech CC/Thin CC intake. Does not pretend unsupported resource
 * types (especially QTI and LTI) have been faithfully converted or published. */
export const validateCommonCartridgeImport=createServerFn({method:"POST"})
.validator((input:unknown)=>incoming.parse(input))
.handler(async({data})=>{
 const {actor,program}=await authorize(data.programId);
 const bytes=Buffer.from(data.base64,"base64");
 if(bytes.length===0||bytes.length>2_000_000||bytes.toString("base64")!==data.base64)
   throw new Error("Cartridge must be an exact base64 ZIP of at most 2 MB for direct upload.");
 const preview=inspectCommonCartridgeZip(bytes);
 const hash=createHash("sha256").update(bytes).digest("hex");
 const report={
  profile:preview.profile,
  resources:preview.resources.map(r=>({
    identifier:r.identifier,type:r.type,href:r.href,files:r.files,
  })),
  outline:preview.outline,notices:preview.notices,
  needsResourceReview:preview.resources.some(r=>r.files.length>0),
  supportedAction:"validation_only",
 };
 return db.transaction(async tx=>{
  const [previous]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status})
   .from(curriculumImportJobs).where(and(eq(curriculumImportJobs.organizationId,program.organizationId),
    eq(curriculumImportJobs.format,preview.profile),eq(curriculumImportJobs.sha256,hash))).limit(1);
  if(previous)return {importId:previous.id,status:previous.status,preview:report,previouslyValidated:true};
  const [job]=await tx.insert(curriculumImportJobs).values({
    organizationId:program.organizationId,format:preview.profile,formatVersion:"1.3",
    sourceName:data.fileName,sha256:hash,status:"validated",
    report,metadata:{programId:data.programId,submittedByPersonId:actor.actorPersonId},
  }).returning({id:curriculumImportJobs.id});
  if(!job)throw new Error("Unable to stage the Common Cartridge import.");
  await writeAudit(tx,actor,{action:"curriculum.interop.cartridge.validate",
    entityType:"curriculum_import_job",entityId:job.id,
    scope:{organizationId:program.organizationId,programId:data.programId},
    after:{format:preview.profile,sha256:hash,resourceCount:preview.resources.length,
      noticeCount:preview.notices.length}});
  await emitEvent(tx,{eventType:"CurriculumCartridgeValidated",
    aggregateType:"curriculum_import_job",aggregateId:job.id,
    actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:data.programId});
  return {importId:job.id,status:"validated",preview:report,previouslyValidated:false};
 });
});

export const listCommonCartridgeImports=createServerFn({method:"GET"})
.validator((input:unknown)=>context.parse(input))
.handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 const {program}=await authorize(data.programId);
 const jobs=await db.select({id:curriculumImportJobs.id,sourceName:curriculumImportJobs.sourceName,
  status:curriculumImportJobs.status,format:curriculumImportJobs.format,
  report:curriculumImportJobs.report,createdAt:curriculumImportJobs.createdAt})
 .from(curriculumImportJobs).where(eq(curriculumImportJobs.organizationId,program.organizationId))
 .orderBy(desc(curriculumImportJobs.createdAt)).limit(10);
 return jobs.map(j=>({id:j.id,sourceName:j.sourceName,status:j.status,format:j.format,
  createdAt:j.createdAt.toISOString(),
  resourceCount:Array.isArray(j.report.resources)?j.report.resources.length:0,
  noticeCount:Array.isArray(j.report.notices)?j.report.notices.length:0}));
});
