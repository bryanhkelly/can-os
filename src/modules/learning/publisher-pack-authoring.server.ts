import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courseTemplates, courseTemplateVersions, curriculumPackItems,
  curriculumPacks, curriculumPackVersions, programs,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { Actor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PublisherProgram = { id:string; organizationId:string; siteId:string|null };

async function authorize(actor:Actor, programId:string, tx:Pick<Transaction,"select">):Promise<PublisherProgram>{
  const [program]=await tx.select({
    id:programs.id,organizationId:programs.organizationId,siteId:programs.siteId,
  }).from(programs).where(eq(programs.id,programId)).limit(1);
  if(!program||!await hasInstitutionalProgramCapability(actor,program,"curriculum.publish",tx))
    throw new AuthorizationError("explicit publisher authority for this program");
  return program;
}

export function packCompositionRevision(versionId:string, courseVersionIds:string[]):string {
  return createHash("sha256").update(JSON.stringify({
    versionId,courseVersionIds:[...courseVersionIds],
  })).digest("hex");
}

export function validatePackCourseSelection(ids:string[]):void {
  if(ids.length<1||ids.length>200)throw new Error("Select between 1 and 200 published publisher-owned course releases.");
  if(new Set(ids).size!==ids.length)throw new Error("Do not include the same course release twice.");
}

async function ownedPack(tx:Pick<Transaction,"select">, packId:string, orgId:string){
  const [pack]=await tx.select().from(curriculumPacks).where(eq(curriculumPacks.id,packId)).limit(1);
  if(!pack||pack.publisherOrganizationId!==orgId)throw new AuthorizationError("publisher owns this pack");
  return pack;
}

async function packVersion(tx:Pick<Transaction,"select">, versionId:string, orgId:string){
  const [release]=await tx.select().from(curriculumPackVersions)
    .where(eq(curriculumPackVersions.id,versionId)).limit(1);
  if(!release)throw new Error("Publisher pack version not found.");
  await ownedPack(tx,release.packId,orgId);
  return release;
}

async function courseIds(tx:Pick<Transaction,"select">, versionId:string){
  const rows=await tx.select({courseVersionId:curriculumPackItems.courseTemplateVersionId})
    .from(curriculumPackItems).where(eq(curriculumPackItems.packVersionId,versionId))
    .orderBy(asc(curriculumPackItems.position));
  return rows.map(row=>row.courseVersionId);
}

export async function readPublisherPackStudio(actor:Actor,programId:string){
  const program=await authorize(actor,programId,db);
  const courses=await db.select({
    courseId:courseTemplates.id,courseVersionId:courseTemplateVersions.id,
    title:courseTemplates.title,code:courseTemplates.code,subject:courseTemplates.subject,
    version:courseTemplateVersions.version,
  }).from(courseTemplateVersions)
    .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
    .where(and(eq(courseTemplates.owningOrganizationId,program.organizationId),
      eq(courseTemplateVersions.status,"published")))
    .orderBy(asc(courseTemplates.title),desc(courseTemplateVersions.version));
  const packs=await db.select().from(curriculumPacks)
    .where(eq(curriculumPacks.publisherOrganizationId,program.organizationId))
    .orderBy(asc(curriculumPacks.name));
  const releases=packs.length?await db.select().from(curriculumPackVersions)
    .where(inArray(curriculumPackVersions.packId,packs.map(p=>p.id)))
    .orderBy(desc(curriculumPackVersions.version)):[];
  const items=releases.length?await db.select({
    packVersionId:curriculumPackItems.packVersionId,
    courseVersionId:curriculumPackItems.courseTemplateVersionId,
    position:curriculumPackItems.position,
  }).from(curriculumPackItems)
    .where(inArray(curriculumPackItems.packVersionId,releases.map(r=>r.id)))
    .orderBy(asc(curriculumPackItems.position)):[];
  return {programId,courses,packs:packs.map(pack=>({
    id:pack.id,name:pack.name,slug:pack.slug,description:pack.description,
    visibility:pack.visibility,licenseCode:pack.licenseCode,
    releases:releases.filter(v=>v.packId===pack.id).map(v=>{
      const courseVersionIds=items.filter(item=>item.packVersionId===v.id).map(i=>i.courseVersionId);
      return {id:v.id,version:v.version,status:v.status,courseVersionIds,
        revision:packCompositionRevision(v.id,courseVersionIds),
        publishedAt:v.publishedAt?.toISOString()??null};
    }),
  }))};
}

export async function createPublisherPack(actor:Actor,input:{
  programId:string;slug:string;name:string;description:string;
  visibility:"public"|"private";licenseCode:"CC0"|"CC-BY-4.0"|"COMMERCIAL";
  requestId:string;
}){
  return db.transaction(async tx=>{
    const program=await authorize(actor,input.programId,tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"publisher-pack:"+program.organizationId+":"+input.slug}))`);
    const [existing]=await tx.select().from(curriculumPacks).where(and(
      eq(curriculumPacks.publisherOrganizationId,program.organizationId),
      eq(curriculumPacks.slug,input.slug))).limit(1);
    if(existing){
      if(existing.metadata.authoringRequestId!==input.requestId)
        throw new Error("This publisher already uses that pack slug.");
      const [draft]=await tx.select().from(curriculumPackVersions).where(and(
        eq(curriculumPackVersions.packId,existing.id),eq(curriculumPackVersions.version,1))).limit(1);
      if(!draft)throw new Error("Publisher pack must have a first release.");
      return {packId:existing.id,versionId:draft.id,created:false};
    }
    const [pack]=await tx.insert(curriculumPacks).values({
      publisherOrganizationId:program.organizationId,slug:input.slug,
      name:input.name,description:input.description,visibility:input.visibility,
      licenseCode:input.licenseCode,metadata:{authoringRequestId:input.requestId},
    }).returning({id:curriculumPacks.id});
    if(!pack)throw new Error("Unable to create publisher pack.");
    const [draft]=await tx.insert(curriculumPackVersions).values({
      packId:pack.id,version:1,status:"draft",metadata:{authoringRequestId:input.requestId},
    }).returning({id:curriculumPackVersions.id});
    if(!draft)throw new Error("Unable to create pack draft.");
    await writeAudit(tx,actor,{action:"curriculum.pack.create",entityType:"curriculum_pack",
      entityId:pack.id,scope:{organizationId:program.organizationId,programId:program.id},
      after:{name:input.name,slug:input.slug,visibility:input.visibility,licenseCode:input.licenseCode}});
    await emitEvent(tx,{eventType:EventTypes.CurriculumPublisherPackCreated,aggregateType:"curriculum_pack",
      aggregateId:pack.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:program.id});
    return {packId:pack.id,versionId:draft.id,created:true};
  });
}

export async function createPublisherPackDraft(actor:Actor,input:{
  programId:string;packId:string;requestId:string;
}){
  return db.transaction(async tx=>{
    const program=await authorize(actor,input.programId,tx);
    const pack=await ownedPack(tx,input.packId,program.organizationId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"publisher-pack-release:"+pack.id}))`);
    const releases=await tx.select().from(curriculumPackVersions)
      .where(eq(curriculumPackVersions.packId,pack.id))
      .orderBy(desc(curriculumPackVersions.version));
    const retry=releases.find(v=>v.metadata.authoringRequestId===input.requestId);
    if(retry)return {versionId:retry.id,created:false};
    if(releases.some(v=>v.status==="draft"))throw new Error("This pack already has an editable draft.");
    const published=releases.find(v=>v.status==="published");
    if(!published)throw new Error("First publish an initial release.");
    const [draft]=await tx.insert(curriculumPackVersions).values({
      packId:pack.id,version:releases[0]!.version+1,status:"draft",
      metadata:{sourceVersionId:published.id,authoringRequestId:input.requestId},
    }).returning({id:curriculumPackVersions.id});
    if(!draft)throw new Error("Unable to create next pack draft.");
    const ids=await courseIds(tx,published.id);
    if(ids.length)await tx.insert(curriculumPackItems).values(ids.map((id,i)=>({
      packVersionId:draft.id,courseTemplateVersionId:id,position:i+1,
    })));
    await writeAudit(tx,actor,{action:"curriculum.pack.draft.create",entityType:"curriculum_pack_version",
      entityId:draft.id,scope:{organizationId:program.organizationId,programId:program.id},
      after:{sourceVersionId:published.id,version:releases[0]!.version+1}});
    await emitEvent(tx,{eventType:EventTypes.CurriculumPublisherPackDraftCreated,aggregateType:"curriculum_pack_version",
      aggregateId:draft.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:program.id});
    return {versionId:draft.id,created:true};
  });
}

export async function savePublisherPackDraft(actor:Actor,input:{
  programId:string;versionId:string;courseVersionIds:string[];expectedRevision:string;
}){
  validatePackCourseSelection(input.courseVersionIds);
  return db.transaction(async tx=>{
    const program=await authorize(actor,input.programId,tx);
    const version=await packVersion(tx,input.versionId,program.organizationId);
    const [locked]=await tx.select().from(curriculumPackVersions)
      .where(eq(curriculumPackVersions.id,version.id)).for("update").limit(1);
    if(!locked||locked.status!=="draft")throw new Error("Published pack releases are immutable.");
    const previousIds=await courseIds(tx,version.id);
    const current=packCompositionRevision(version.id,previousIds);
    if(current!==input.expectedRevision)throw new Error("This publisher pack draft changed. Reload before saving.");
    const permitted=await tx.select({id:courseTemplateVersions.id,courseId:courseTemplates.id})
      .from(courseTemplateVersions)
      .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
      .where(and(inArray(courseTemplateVersions.id,input.courseVersionIds),
        eq(courseTemplates.owningOrganizationId,program.organizationId),
        eq(courseTemplateVersions.status,"published")));
    if(permitted.length!==input.courseVersionIds.length)
      throw new AuthorizationError("all pack courses must be published and owned by this publisher");
    if(new Set(permitted.map(row=>row.courseId)).size!==permitted.length)
      throw new Error("A pack may contain only one published release of each course.");
    if(JSON.stringify(previousIds)===JSON.stringify(input.courseVersionIds))return {revision:current,changed:false};
    await tx.delete(curriculumPackItems).where(eq(curriculumPackItems.packVersionId,version.id));
    await tx.insert(curriculumPackItems).values(input.courseVersionIds.map((id,i)=>({
      packVersionId:version.id,courseTemplateVersionId:id,position:i+1,
    })));
    await writeAudit(tx,actor,{action:"curriculum.pack.draft.save",entityType:"curriculum_pack_version",
      entityId:version.id,scope:{organizationId:program.organizationId,programId:program.id},
      before:{courseVersionIds:previousIds},after:{courseVersionIds:input.courseVersionIds}});
    await emitEvent(tx,{eventType:EventTypes.CurriculumPublisherPackDraftSaved,aggregateType:"curriculum_pack_version",
      aggregateId:version.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:program.id});
    return {revision:packCompositionRevision(version.id,input.courseVersionIds),changed:true};
  });
}

export async function publishPublisherPack(actor:Actor,input:{
  programId:string;versionId:string;expectedRevision:string;reason:string;
}){
  return db.transaction(async tx=>{
    const program=await authorize(actor,input.programId,tx);
    const version=await packVersion(tx,input.versionId,program.organizationId);
    const [locked]=await tx.select().from(curriculumPackVersions)
      .where(eq(curriculumPackVersions.id,version.id)).for("update").limit(1);
    if(!locked||locked.status!=="draft")throw new Error("Only draft pack versions can be published.");
    const ids=await courseIds(tx,version.id);
    validatePackCourseSelection(ids);
    if(input.expectedRevision!==packCompositionRevision(version.id,ids))
      throw new Error("This pack composition changed. Reload before publishing.");
    const valid=await tx.select({id:courseTemplateVersions.id,courseId:courseTemplates.id})
      .from(courseTemplateVersions)
      .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
      .where(and(inArray(courseTemplateVersions.id,ids),
        eq(courseTemplates.owningOrganizationId,program.organizationId),
        eq(courseTemplateVersions.status,"published")));
    if(valid.length!==ids.length)throw new Error("Some selected course versions are no longer eligible.");
    if(new Set(valid.map(row=>row.courseId)).size!==valid.length)
      throw new Error("A pack cannot publish two versions of the same course.");
    await tx.update(curriculumPackVersions).set({status:"published",publishedAt:new Date(),updatedAt:new Date()})
      .where(eq(curriculumPackVersions.id,version.id));
    await writeAudit(tx,actor,{action:"curriculum.pack.publish",entityType:"curriculum_pack_version",
      entityId:version.id,scope:{organizationId:program.organizationId,programId:program.id},
      before:{status:"draft"},after:{status:"published",courseVersionIds:ids,reason:input.reason}});
    await emitEvent(tx,{eventType:EventTypes.CurriculumPublisherPackPublished,aggregateType:"curriculum_pack_version",
      aggregateId:version.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,programId:program.id,
      payload:{packId:version.packId,courseVersionIds:ids}});
    return {versionId:version.id,created:true};
  });
}
