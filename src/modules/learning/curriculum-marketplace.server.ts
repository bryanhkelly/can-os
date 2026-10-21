import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
 curriculumAdoptions, curriculumEntitlements, curriculumOverlays, curriculumPackItems,
 curriculumPacks, curriculumPackVersions, courseTemplates, courseTemplateVersions,
 programs, sections,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { readClassContent } from "@/domain/class-content";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import type { Actor } from "@/modules/identity/actors.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const publishCapability = "curriculum.publish";

async function authorizedProgram(actor: Actor, programId: string, tx: Pick<Tx, "select"> = db) {
 const [program] = await tx.select().from(programs).where(eq(programs.id,programId)).limit(1);
 if (!program || !await hasInstitutionalProgramCapability(actor,program,publishCapability,tx))
  throw new AuthorizationError("institutional curriculum publishing capability and program scope");
 return program;
}

export async function readMarketplace(actor: Actor, programId: string) {
 const program = await authorizedProgram(actor,programId);
 const packs = await db.select({
  id: curriculumPacks.id, slug: curriculumPacks.slug, name: curriculumPacks.name,
  description: curriculumPacks.description, publisherOrganizationId: curriculumPacks.publisherOrganizationId,
  licenseCode: curriculumPacks.licenseCode, versionId: curriculumPackVersions.id,
  version: curriculumPackVersions.version, metadata: curriculumPacks.metadata,
 }).from(curriculumPacks).innerJoin(curriculumPackVersions,eq(curriculumPackVersions.packId,curriculumPacks.id))
  .where(and(eq(curriculumPackVersions.status,"published"),
   or(eq(curriculumPacks.visibility,"public"),
      eq(curriculumPacks.publisherOrganizationId,program.organizationId))))
  .orderBy(asc(curriculumPacks.name),asc(curriculumPackVersions.version));
 const versionIds = packs.map(p=>p.versionId);
 const items = versionIds.length ? await db.select({
  packVersionId: curriculumPackItems.packVersionId, courseVersionId: courseTemplateVersions.id,
  code: courseTemplates.code, title: courseTemplates.title, subject: courseTemplates.subject,
  position: curriculumPackItems.position,
 }).from(curriculumPackItems)
  .innerJoin(courseTemplateVersions,eq(courseTemplateVersions.id,curriculumPackItems.courseTemplateVersionId))
  .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
  .where(inArray(curriculumPackItems.packVersionId,versionIds))
  .orderBy(asc(curriculumPackItems.position)) : [];
 const entitlements=await db.select().from(curriculumEntitlements)
  .where(eq(curriculumEntitlements.organizationId,program.organizationId));
 const adoptions=await db.select().from(curriculumAdoptions)
  .where(eq(curriculumAdoptions.programId,program.id));
 const overlays=await db.select({
  id:curriculumOverlays.id,courseTemplateVersionId:curriculumOverlays.courseTemplateVersionId,
  sectionId:curriculumOverlays.sectionId,siteId:curriculumOverlays.siteId,
  lessonId:curriculumOverlays.lessonId,title:curriculumOverlays.title,
  kind:curriculumOverlays.kind,url:curriculumOverlays.url,
  status:curriculumOverlays.status,
 }).from(curriculumOverlays).where(and(eq(curriculumOverlays.programId,program.id),
  eq(curriculumOverlays.status,"active"))).orderBy(asc(curriculumOverlays.createdAt));
 const classSections=await db.select({id:sections.id,title:sections.title,courseVersionId:sections.courseTemplateVersionId})
  .from(sections).where(eq(sections.programId,program.id)).orderBy(asc(sections.title));
 return {
  program:{id:program.id,name:program.name,siteId:program.siteId},
  packs:packs.map(pack=>({
   ...pack,courses:items.filter(item=>item.packVersionId===pack.versionId),
   entitlement:entitlements.find(e=>e.packId===pack.id)?.status??null,
   adoption:adoptions.find(a=>a.packId===pack.id)
    ? {versionId:adoptions.find(a=>a.packId===pack.id)!.packVersionId,
       status:adoptions.find(a=>a.packId===pack.id)!.status} : null,
  })),
  overlays, sections:classSections,
 };
}

export async function installPack(actor: Actor, input:{programId:string;packId:string;termsAccepted:boolean}) {
 return db.transaction(async tx=>{
  const program=await authorizedProgram(actor,input.programId,tx);
  if(!input.termsAccepted)throw new Error("Accept the pack's stated terms before installation.");
  const [pack]=await tx.select().from(curriculumPacks).where(eq(curriculumPacks.id,input.packId)).limit(1);
  if(!pack || (pack.visibility!=="public" && pack.publisherOrganizationId!==program.organizationId))
   throw new AuthorizationError("published marketplace pack");
  const [published]=await tx.select({id:curriculumPackVersions.id}).from(curriculumPackVersions)
   .where(and(eq(curriculumPackVersions.packId,pack.id),eq(curriculumPackVersions.status,"published"))).limit(1);
  if(!published)throw new Error("Pack is not published.");
  // Restricted and commercial licenses require an external agreement; checkbox is insufficient.
  if(!["CC0","CC-BY-4.0","DEMO-INTERNAL"].includes(pack.licenseCode))
   throw new Error("This publisher requires a verified license agreement before installation.");
  if(pack.licenseCode==="DEMO-INTERNAL" &&
    (program.organizationId!==pack.publisherOrganizationId || pack.metadata.synthetic!==true))
   throw new AuthorizationError("internal synthetic demonstration pack");
  const [existing]=await tx.select().from(curriculumEntitlements)
   .where(and(eq(curriculumEntitlements.organizationId,program.organizationId),
              eq(curriculumEntitlements.packId,pack.id))).limit(1);
  if(existing){if(existing.status!=="active")throw new Error("Revoked entitlement requires a publisher review.");
   return {entitlementId:existing.id,installed:false};}
  const [row]=await tx.insert(curriculumEntitlements).values({
    organizationId:program.organizationId,packId:pack.id,termsAcceptedAt:new Date(),
    acceptedByPersonId:actor.actorPersonId,metadata:{licenseCode:pack.licenseCode}
  }).returning({id:curriculumEntitlements.id});
  if(!row)throw new Error("Unable to install curriculum pack.");
  await writeAudit(tx,actor,{action:"curriculum.marketplace.install",entityType:"curriculum_entitlement",
   entityId:row.id,scope:{organizationId:program.organizationId,programId:program.id},
   after:{packId:pack.id,licenseCode:pack.licenseCode}});
  await emitEvent(tx,{eventType:"CurriculumPackInstalled",aggregateType:"curriculum_entitlement",
   aggregateId:row.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:program.id});
  return {entitlementId:row.id,installed:true};
 });
}

export async function adoptPack(actor: Actor,input:{programId:string;packId:string;versionId:string}) {
 return db.transaction(async tx=>{
  const program=await authorizedProgram(actor,input.programId,tx);
  const [entitlement]=await tx.select().from(curriculumEntitlements).where(and(
    eq(curriculumEntitlements.organizationId,program.organizationId),eq(curriculumEntitlements.packId,input.packId),
    eq(curriculumEntitlements.status,"active"))).limit(1);
  if(!entitlement)throw new AuthorizationError("active curriculum pack entitlement");
  const [release]=await tx.select().from(curriculumPackVersions).where(and(
    eq(curriculumPackVersions.id,input.versionId),eq(curriculumPackVersions.packId,input.packId),
    eq(curriculumPackVersions.status,"published"))).limit(1);
  if(!release)throw new Error("A published release of this pack is required.");
  const [existing]=await tx.select().from(curriculumAdoptions)
    .where(and(eq(curriculumAdoptions.programId,program.id),eq(curriculumAdoptions.packId,input.packId))).limit(1);
  if(existing){
   if(existing.status==="active" && existing.packVersionId===release.id)return {adoptionId:existing.id,adopted:false};
   throw new Error("Existing adoption is pinned. Changing or reactivating it requires an explicit revision workflow.");
  }
  const [row]=await tx.insert(curriculumAdoptions).values({
    organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
    packId:input.packId,packVersionId:release.id,adoptedByPersonId:actor.actorPersonId
  }).returning({id:curriculumAdoptions.id});
  if(!row)throw new Error("Unable to adopt curriculum pack.");
  await writeAudit(tx,actor,{action:"curriculum.marketplace.adopt",entityType:"curriculum_adoption",
   entityId:row.id,scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
   after:{packId:input.packId,versionId:release.id}});
  await emitEvent(tx,{eventType:"CurriculumPackAdopted",aggregateType:"curriculum_adoption",
   aggregateId:row.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
   siteId:program.siteId,programId:program.id});
  return {adoptionId:row.id,adopted:true};
 });
}

export async function addCurriculumSupplement(actor:Actor,input:{
 programId:string;courseVersionId:string;sectionId?:string;lessonId?:string;
 scope:"program"|"site"|"section";title:string;kind:"link"|"video"|"pdf"|"image"|"audio"|"document";
 url:string;
}){
 return db.transaction(async tx=>{
  const program=await authorizedProgram(actor,input.programId,tx);
  if(input.scope==="site" && !program.siteId)throw new Error("Site supplement requires a site.");
  if(input.scope==="section" && !input.sectionId)throw new Error("Section supplement requires a class.");
  const adoptions=await tx.select({id:curriculumAdoptions.id}).from(curriculumAdoptions)
   .innerJoin(curriculumEntitlements,and(
      eq(curriculumEntitlements.packId,curriculumAdoptions.packId),
      eq(curriculumEntitlements.organizationId,curriculumAdoptions.organizationId)))
   .innerJoin(curriculumPackItems,eq(curriculumPackItems.packVersionId,curriculumAdoptions.packVersionId))
   .where(and(eq(curriculumAdoptions.programId,program.id),eq(curriculumAdoptions.status,"active"),
     eq(curriculumEntitlements.status,"active"),
     eq(curriculumPackItems.courseTemplateVersionId,input.courseVersionId))).limit(1);
  if(!adoptions.length)throw new AuthorizationError("adopted curriculum course");
  if(input.scope==="section"){
   const [section]=await tx.select().from(sections).where(eq(sections.id,input.sectionId!)).limit(1);
   if(!section || section.programId!==program.id || section.siteId!==program.siteId ||
       section.courseTemplateVersionId!==input.courseVersionId)
    throw new AuthorizationError("same-program section using adopted course version");
  }
  if(input.lessonId){
    const [release]=await tx.select({curriculum:courseTemplateVersions.curriculum})
      .from(courseTemplateVersions).where(eq(courseTemplateVersions.id,input.courseVersionId)).limit(1);
    const content=release && readClassContent(release.curriculum);
    if(!content?.modules.some(m=>m.lessons.some(l=>l.id===input.lessonId)))
      throw new Error("The lesson ID must exist in the pinned publisher release.");
  }
  const url=new URL(input.url);
  if(url.protocol!=="https:"||url.username||url.password)throw new Error("Supplement requires a safe HTTPS URL.");
  const [row]=await tx.insert(curriculumOverlays).values({
    organizationId:program.organizationId,programId:program.id,
    siteId:input.scope==="site"||input.scope==="section"?program.siteId:null,
    sectionId:input.scope==="section"?input.sectionId:null,
    courseTemplateVersionId:input.courseVersionId,lessonId:input.lessonId??null,
    title:input.title,kind:input.kind,url:input.url,createdByPersonId:actor.actorPersonId,
    metadata:{scope:input.scope,source:"local_supplement"}
  }).returning({id:curriculumOverlays.id});
  if(!row)throw new Error("Unable to save supplement.");
  await writeAudit(tx,actor,{action:"curriculum.supplement.add",entityType:"curriculum_overlay",
    entityId:row.id,scope:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,sectionId:input.sectionId??null},
    after:{courseVersionId:input.courseVersionId,lessonId:input.lessonId??null,kind:input.kind,title:input.title,scope:input.scope}});
  await emitEvent(tx,{eventType:"CurriculumSupplementAdded",aggregateType:"curriculum_overlay",
   aggregateId:row.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
   programId:program.id,siteId:program.siteId});
  return {supplementId:row.id};
 });
}
