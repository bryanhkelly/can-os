import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { curriculumImportJobs, curriculumInteropMappings, curriculumOverlays, curriculumResources, documents, programs, sections } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { inspectCommonCartridgeZip, extractCommonCartridgeWebLink, extractCommonCartridgeStaticLesson } from "@/domain/common-cartridge";
import { requireActor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { readMarketplace } from "./curriculum-marketplace.server";
import { writeAudit, emitEvent } from "@/platform/mutation";

import { createPrivateUploadUrl, verifyPrivateObject, resolveR2Config, signPrivateObjectUrl } from "@/platform/storage/r2";
import { EventTypes } from "@/domain/event-types";
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
  await emitEvent(tx,{eventType:EventTypes.CurriculumCartridgeValidated,
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

/** Publish only verified external web links into a chosen existing Section.
 * QTI, LTI launch objects, HTML packages and binary content are deliberately
 * excluded: treating those as ordinary links would silently lose semantics.
 */
const linkMappingInput=incoming.extend({
  sectionId:z.string().uuid(),
  linkIdentifiers:z.array(z.string().trim().min(1).max(256)).min(1).max(30),
  rightsConfirmed:z.literal(true),
}).strict();

export const importCommonCartridgeSectionLinks=createServerFn({method:"POST"})
 .validator((value:unknown)=>linkMappingInput.parse(value))
 .handler(async({data})=>{
   const {actor,program}=await authorize(data.programId);
   if(!actor.actorPersonId||!program.siteId||!actor.scope.programIds?.includes(program.id)||
      !actor.scope.siteIds?.includes(program.siteId))
     throw new AuthorizationError("same-site institutional publisher");
   const [section]=await db.select({id:sections.id,title:sections.title,
     courseVersionId:sections.courseTemplateVersionId,active:sections.active})
     .from(sections).where(and(eq(sections.id,data.sectionId),
       eq(sections.programId,program.id),eq(sections.siteId,program.siteId))).limit(1);
   if(!section?.active)throw new AuthorizationError("active Section of this Program and Site");
   const bytes=Buffer.from(data.base64,"base64");
   if(!bytes.length||bytes.length>2_000_000||bytes.toString("base64")!==data.base64)
     throw new Error("Cartridge must be an exact base64 archive of at most 2 MB.");
   const preview=inspectCommonCartridgeZip(bytes);
   const digest=createHash("sha256").update(bytes).digest("hex");
   const requested=new Set(data.linkIdentifiers);
   if(requested.size!==data.linkIdentifiers.length)
     throw new Error("Duplicate web-link identifier.");
   const links=data.linkIdentifiers.map(identifier=>{
     const resource=preview.resources.find(r=>r.identifier===identifier);
     if(!resource||!/weblink|imswl/i.test(resource.type))
       throw new Error("Only explicit IMS web-link resources can be imported as links.");
     const href=resource.href??resource.files[0];
     if(!href)throw new Error("Web-link descriptor file is required.");
     return {identifier,...extractCommonCartridgeWebLink(bytes,href)};
   });
   return db.transaction(async tx=>{
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"cartridge-links:"+program.organizationId+":"+digest}))`);
     const [job]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status,
       metadata:curriculumImportJobs.metadata}).from(curriculumImportJobs)
       .where(and(eq(curriculumImportJobs.organizationId,program.organizationId),
         eq(curriculumImportJobs.format,preview.profile),eq(curriculumImportJobs.sha256,digest)))
       .for("update").limit(1);
     if(!job||job.status==="rejected"||job.metadata.programId!==program.id)
       throw new Error("Validate this exact cartridge in the selected Program before import.");
     const existing=await tx.select({externalIdentifier:curriculumInteropMappings.externalIdentifier,
       entityId:curriculumInteropMappings.entityId,metadata:curriculumInteropMappings.metadata})
       .from(curriculumInteropMappings).where(and(
         eq(curriculumInteropMappings.organizationId,program.organizationId),
         eq(curriculumInteropMappings.format,preview.profile),
         eq(curriculumInteropMappings.sourceSystem,digest),
         inArray(curriculumInteropMappings.externalIdentifier,data.linkIdentifiers)));
     for(const previous of existing)if(previous.metadata.sectionId!==section.id)
       throw new Error("A source link was already assigned to a different Section.");
     const mapped=new Set(existing.map(row=>row.externalIdentifier));
     let imported=0;
     for(const link of links){
       if(mapped.has(link.identifier))continue;
       const [resource]=await tx.insert(curriculumResources).values({
         ownerOrganizationId:program.organizationId,
         kind:"link",title:link.title,url:link.url,
         licenseCode:"LINK-ONLY",sourceUrl:link.url,
         sourceFormat:preview.profile,sourceIdentifier:link.identifier,
         metadata:{importJobId:job.id,programId:program.id,sectionId:section.id,
           sourceHash:digest,rightsConfirmed:true,source:"common_cartridge_web_link"},
       }).returning({id:curriculumResources.id});
       if(!resource)throw new Error("Could not create canonical curriculum link.");
       const [overlay]=await tx.insert(curriculumOverlays).values({
         organizationId:program.organizationId,programId:program.id,
         siteId:program.siteId,sectionId:section.id,
         courseTemplateVersionId:section.courseVersionId,
         title:link.title,kind:"link",resourceId:resource.id,
         createdByPersonId:actor.actorPersonId,
         metadata:{source:"common_cartridge",importJobId:job.id,
           externalIdentifier:link.identifier,sourceHash:digest,scope:"section"},
       }).returning({id:curriculumOverlays.id});
       if(!overlay)throw new Error("Could not add imported link to Section.");
       await tx.insert(curriculumInteropMappings).values({
         organizationId:program.organizationId,importJobId:job.id,
         format:preview.profile,sourceSystem:digest,
         externalIdentifier:link.identifier,entityType:"curriculum_resource",
         entityId:resource.id,
         metadata:{programId:program.id,sectionId:section.id,overlayId:overlay.id,
           sourceUrl:link.url},
       });
       imported++;
     }
     await tx.update(curriculumImportJobs).set({
       status:"mapped",updatedAt:new Date(),
       metadata:{...job.metadata,sectionId:section.id,
         supportedMapping:"external_web_links",rightsConfirmed:true},
     }).where(eq(curriculumImportJobs.id,job.id));
     await writeAudit(tx,actor,{action:"curriculum.interop.cartridge.web_links.import",
       entityType:"curriculum_import_job",entityId:job.id,
       scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id,
         sectionId:section.id},
       after:{sourceHash:digest,requested:links.length,imported,
         unsupportedTypesExcluded:true,rightsConfirmed:true}});
     return {importId:job.id,status:"mapped" as const,imported,
       linkedResources:links.length,sectionId:section.id};
   });
 });

/** The uploaded HTML is a sealed single-file lesson in private storage. This
 * two-step flow binds a signed single-object upload to the exact sanitized bytes.
 * No HTML is published as an external URL or inline script. */
const htmlImportInput=incoming.extend({
 sectionId:z.string().uuid(),
 resourceIdentifier:z.string().trim().min(1).max(256),
 rightsConfirmed:z.literal(true),
 licenseCode:z.string().trim().min(2).max(80),
 attribution:z.string().trim().min(1).max(500),
}).strict();
const htmlKeyPattern=/^learning\/cartridge-static\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
function inspectHtmlInput(data:z.infer<typeof htmlImportInput>){
 const bytes=Buffer.from(data.base64,"base64");
 if(!bytes.length||bytes.length>2_000_000||bytes.toString("base64")!==data.base64)
  throw new Error("Cartridge must be an exact base64 archive of at most 2 MB.");
 const preview=inspectCommonCartridgeZip(bytes);
 if(preview.resources.filter(r=>r.identifier===data.resourceIdentifier).length!==1)
  throw new Error("Cartridge resource identifier is missing or duplicated.");
 const entry=preview.resources.find(r=>r.identifier===data.resourceIdentifier)!;
 const lesson=extractCommonCartridgeStaticLesson(bytes,entry);
 const digest=createHash("sha256").update(bytes).digest("hex");
 const htmlBytes=Buffer.from(lesson.html,"utf8");
 const htmlHash=createHash("sha256").update(htmlBytes).digest("hex");
 return {preview,lesson,digest,htmlBytes,htmlHash};
}
async function authorizeHtmlSection(programId:string,sectionId:string){
 const {actor,program}=await authorize(programId);
 if(!actor.actorPersonId||!program.siteId||!actor.scope.programIds?.includes(program.id)||
   !actor.scope.siteIds?.includes(program.siteId))
  throw new AuthorizationError("same-site institutional publisher");
 const [section]=await db.select({id:sections.id,courseVersionId:sections.courseTemplateVersionId,active:sections.active})
   .from(sections).where(and(eq(sections.id,sectionId),eq(sections.programId,program.id),
     eq(sections.siteId,program.siteId))).limit(1);
 if(!section?.active)throw new AuthorizationError("active Section of this Program and Site");
 return {actor,program,section};
}
export const beginCommonCartridgeStaticLessonImport=createServerFn({method:"POST"})
 .validator((input:unknown)=>htmlImportInput.parse(input))
 .handler(async({data})=>{
  await authorizeHtmlSection(data.programId,data.sectionId);
  if(process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED!=="true")
   throw new Error("Private curriculum uploads are not enabled.");
  resolveR2Config();
  const {lesson,digest,htmlBytes,htmlHash}=inspectHtmlInput(data);
  if(htmlBytes.length<16)throw new Error("Static HTML lesson must contain at least 16 bytes.");
  const resourceId=randomUUID(),key=`learning/cartridge-static/${resourceId}/${randomUUID()}`;
  return {resourceId,key,content:htmlBytes.toString("base64"),contentType:"text/html",
   contentLength:htmlBytes.length,htmlSha256:htmlHash,cartridgeSha256:digest,
   preview:{title:lesson.title,html:lesson.html},expiresInSeconds:180,
   uploadUrl:createPrivateUploadUrl({key,keyPattern:htmlKeyPattern,contentType:"text/html",
     contentLength:htmlBytes.length,minContentLength:1,maxContentLength:128*1024,
     expiresSeconds:180,preventOverwrite:true})};
 });
const finishHtmlInput=htmlImportInput.extend({
 resourceId:z.string().uuid(),
 key:z.string().regex(htmlKeyPattern),
 htmlSha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const finishCommonCartridgeStaticLessonImport=createServerFn({method:"POST"})
 .validator((input:unknown)=>finishHtmlInput.parse(input))
 .handler(async({data})=>{
  const {actor,program,section}=await authorizeHtmlSection(data.programId,data.sectionId);
  if(process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED!=="true")
   throw new Error("Private curriculum uploads are not enabled.");
  resolveR2Config();
  const {preview,lesson,digest,htmlBytes,htmlHash}=inspectHtmlInput(data);
  if(htmlBytes.length<16)throw new Error("Static HTML lesson must contain at least 16 bytes.");
  if(data.htmlSha256!==htmlHash||!data.key.startsWith(`learning/cartridge-static/${data.resourceId}/`))
   throw new AuthorizationError("matching sanitized lesson upload");
  await verifyPrivateObject({key:data.key,keyPattern:htmlKeyPattern,
   expectedSize:htmlBytes.length,expectedContentType:"text/html"});
  // Verify the exact stored bytes, not only HEAD metadata. Fail closed if
  // storage cannot return a bounded, identity-preserving object response.
  const response=await fetch(signPrivateObjectUrl({method:"GET",key:data.key,
    keyPattern:htmlKeyPattern,expiresSeconds:30}),{headers:{Range:`bytes=0-${htmlBytes.length-1}`}});
  if(response.status!==206||
    response.headers.get("content-range")!==`bytes 0-${htmlBytes.length-1}/${htmlBytes.length}`)
   throw new Error("Private lesson storage did not honor bounded verification.");
  const reader=response.body?.getReader();
  if(!reader)throw new Error("Stored lesson verification has no response body.");
  const received=Buffer.alloc(htmlBytes.length);
  let offset=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    if(offset+value.length>received.length)
     throw new Error("Stored lesson exceeded the declared size.");
    received.set(value,offset);
    offset+=value.length;
   }
  }finally{
   await reader.cancel();
   reader.releaseLock();
  }
  if(offset!==received.length||
     createHash("sha256").update(received).digest("hex")!==htmlHash)
   throw new Error("Stored lesson does not match sanitized HTML.");
  return db.transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"cartridge-html:"+program.organizationId+":"+digest}))`);
   const [job]=await tx.select({id:curriculumImportJobs.id,status:curriculumImportJobs.status,
    metadata:curriculumImportJobs.metadata}).from(curriculumImportJobs)
    .where(and(eq(curriculumImportJobs.organizationId,program.organizationId),
      eq(curriculumImportJobs.format,preview.profile),eq(curriculumImportJobs.sha256,digest)))
    .for("update").limit(1);
   if(!job||job.status==="rejected"||job.metadata.programId!==program.id)
    throw new Error("Validate this exact cartridge in the selected Program before import.");
   const existing=await tx.select({externalIdentifier:curriculumInteropMappings.externalIdentifier,
    metadata:curriculumInteropMappings.metadata,entityId:curriculumInteropMappings.entityId})
    .from(curriculumInteropMappings).where(and(
      eq(curriculumInteropMappings.organizationId,program.organizationId),
      eq(curriculumInteropMappings.format,preview.profile),
      eq(curriculumInteropMappings.sourceSystem,digest),
      eq(curriculumInteropMappings.externalIdentifier,data.resourceIdentifier))).limit(1);
   if(existing.length){
    if(existing[0]!.metadata.sectionId!==section.id)
     throw new Error("Source content already belongs to another Section.");
    return {importId:job.id,status:"mapped" as const,imported:0,resourceId:existing[0]!.entityId};
   }
   const [doc]=await tx.insert(documents).values({
    subjectType:"curriculum_resource",subjectId:data.resourceId,
    category:"curriculum_supplement",fileName:lesson.sourcePath.split("/").at(-1)!,
    storageProvider:"cloudflare_r2",storageKey:data.key,mimeType:"text/html",
    sensitivityTier:"standard",verifiedAt:new Date(),verifiedByPersonId:actor.actorPersonId,
    uploadedByPersonId:actor.actorPersonId,
    metadata:{size:htmlBytes.length,sanitizedSha256:htmlHash,sourceHash:digest,
      htmlProfile:"static_text_only",rightsConfirmed:true,licenseCode:data.licenseCode,
      attribution:data.attribution},
   }).returning({id:documents.id});
   if(!doc)throw new Error("Could not record imported lesson.");
   await tx.insert(curriculumResources).values({
    id:data.resourceId,ownerOrganizationId:program.organizationId,
    kind:"html",title:lesson.title,documentId:doc.id,
    licenseCode:data.licenseCode,attribution:data.attribution,
    sourceFormat:preview.profile,sourceIdentifier:data.resourceIdentifier,
    metadata:{importJobId:job.id,programId:program.id,sectionId:section.id,
      sourceHash:digest,sanitizedSha256:htmlHash,rightsConfirmed:true,
      source:"common_cartridge_static_html",aiProcessingAllowed:false},
   });
   const [overlay]=await tx.insert(curriculumOverlays).values({
    organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
    sectionId:section.id,courseTemplateVersionId:section.courseVersionId,
    title:lesson.title,kind:"html",resourceId:data.resourceId,
    createdByPersonId:actor.actorPersonId,
    metadata:{source:"common_cartridge",importJobId:job.id,
      externalIdentifier:data.resourceIdentifier,sourceHash:digest,scope:"section"},
   }).returning({id:curriculumOverlays.id});
   if(!overlay)throw new Error("Could not place imported lesson in Section.");
   await tx.insert(curriculumInteropMappings).values({
    organizationId:program.organizationId,importJobId:job.id,
    format:preview.profile,sourceSystem:digest,externalIdentifier:data.resourceIdentifier,
    entityType:"curriculum_resource",entityId:data.resourceId,
    metadata:{programId:program.id,sectionId:section.id,overlayId:overlay.id,
     sanitizedSha256:htmlHash},
   });
   await tx.update(curriculumImportJobs).set({status:"mapped",updatedAt:new Date(),
    metadata:{...job.metadata,sectionId:section.id,supportedMapping:"static_html",
     rightsConfirmed:true}}).where(eq(curriculumImportJobs.id,job.id));
   await writeAudit(tx,actor,{action:"curriculum.interop.cartridge.static_html.import",
    entityType:"curriculum_import_job",entityId:job.id,
    scope:{organizationId:program.organizationId,siteId:program.siteId,
      programId:program.id,sectionId:section.id},
    after:{sourceHash:digest,resourceIdentifier:data.resourceIdentifier,
      resourceId:data.resourceId,htmlSha256:htmlHash,rightsConfirmed:true}});
   return {importId:job.id,status:"mapped" as const,imported:1,resourceId:data.resourceId};
  });
 });

/** Read a Section's imported static lesson without exposing an R2 URL.
 * The caller must retain institutional publisher access to the same Program
 * and Site; returned text must only be rendered inside a sandboxed iframe. */
export const readCommonCartridgeStaticLesson=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({
   programId:z.string().uuid(),sectionId:z.string().uuid(),resourceId:z.string().uuid(),
 }).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const {program}=await authorizeHtmlSection(data.programId,data.sectionId);
  const [resource]=await db.select({id:curriculumResources.id,
    metadata:curriculumResources.metadata,documentId:curriculumResources.documentId})
    .from(curriculumResources).where(and(eq(curriculumResources.id,data.resourceId),
      eq(curriculumResources.ownerOrganizationId,program.organizationId))).limit(1);
  if(!resource||resource.metadata.sectionId!==data.sectionId||
     resource.metadata.programId!==program.id||
     resource.metadata.source!=="common_cartridge_static_html"||!resource.documentId)
   throw new AuthorizationError("Section-scoped static lesson");
  const [document]=await db.select({storageKey:documents.storageKey,
    mimeType:documents.mimeType}).from(documents)
    .where(eq(documents.id,resource.documentId)).limit(1);
  if(!document?.storageKey||document.mimeType!=="text/html"||
     !htmlKeyPattern.test(document.storageKey))
   throw new Error("Imported lesson storage is unavailable.");
  const response=await fetch(signPrivateObjectUrl({method:"GET",
    key:document.storageKey,keyPattern:htmlKeyPattern,expiresSeconds:30}));
  if(!response.ok)throw new Error("Unable to retrieve private lesson.");
  const declared=Number(response.headers.get("content-length"));
  if(!Number.isInteger(declared)||declared<1||declared>128*1024)
   throw new Error("Stored lesson has invalid size.");
  const reader=response.body?.getReader();
  if(!reader)throw new Error("Stored lesson has no response body.");
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.length;
    if(total>128*1024)throw new Error("Stored lesson exceeds maximum size.");
    chunks.push(value);
   }
  }finally{
   await reader.cancel();
   reader.releaseLock();
  }
  const bytes=Buffer.concat(chunks,total);
  const digest=createHash("sha256").update(bytes).digest("hex");
  if(total!==declared||digest!==resource.metadata.sanitizedSha256)
   throw new Error("Stored lesson integrity verification failed.");
  return {title:"Imported static lesson",html:bytes.toString("utf8"),
    sha256:digest,rendering:"sandboxed-iframe-only" as const};
 });
