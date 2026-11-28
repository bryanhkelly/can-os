import { canonicalJson } from "@/lib/canonical-json";
import { siteBrandVersions, siteArtifactReleases, siteLocalContentVersions } from "@/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import {z} from "zod";
import {siteInput,recordInput,revisionInput,createInput,saveInput,archiveInput,brandInput,pageInput} from "./site-marketing-packages-v61.inputs";
import {parseCommandInput} from "@/domain/command-input";
import { db } from "@/db/client";
import { sites, siteMarketingPackages } from "@/db/schema";
import { readStoredSitePackage } from "@/modules/sites/site-content-package.server";
import { projectSiteContentBriefV61 } from "@/domain/site-content-brief-v61";
import { readPublishedBlueprintReferences } from "@/modules/blueprints/blueprint-reference-catalog.server";
import { normalizeSiteLocalContent } from "@/domain/site-local-content";
import { suggestMarketingStarterV61, type MarketingStarterSourcesV61 } from "@/domain/site-marketing-suggestions-v61";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import {
  marketingPackageContentSchema, marketingPurposeIds,
} from "@/domain/marketing-package-v61";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import { emitReportableChange } from "@/platform/reportable-event";

function toView(row: typeof siteMarketingPackages.$inferSelect) {
  return {
    id: row.id, siteId: row.siteId, title: row.title,
    status: row.status, brandVersionId:row.brandVersionId, content: marketingPackageContentSchema.parse(row.content),
    revision: row.revision, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Verified server session + exact active registrar/Site scope; never a client Site hint. */
async function authorizedSite(
  request:Request, siteId: string, capability: "program.read" | "program.launch.start",
  executor: Pick<typeof db,"select"> = db,
) {
  const actor = await getCommandContext(request);
  const [site] = await executor.select({
    id: sites.id, organizationId: sites.organizationId, name: sites.name, metadata: sites.metadata,
    timezone: sites.timezone, updatedAt: sites.updatedAt, currentBrandVersionId: sites.currentBrandVersionId,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, capability);
  return { actor, site };
}

/**
 * Authorized projection of previously saved Shape information.
 * Only purpose-specific editorial suggestions leave the server; raw private
 * Story answers are never added to package metadata, audit or analytics.
 */
type MarketingSourceTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function marketingSource(
  site:{id:string;name:string;timezone:string;updatedAt:Date;
    currentBrandVersionId:string|null;metadata:typeof sites.$inferSelect.metadata},
  reader:MarketingSourceTx,
):Promise<MarketingStarterSourcesV61>{
  const [savedWebsite]=await reader.select({
    content:siteLocalContentVersions.content,revision:siteLocalContentVersions.revision,
  })
    .from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId,site.id))
    .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
  const copy=savedWebsite
    ? normalizeSiteLocalContent(savedWebsite.content,{allowIncompleteImage:true})
    : null;
  const brief=projectSiteContentBriefV61({
    siteId:site.id,siteName:site.name,siteRevision:site.updatedAt.toISOString(),
    timezone:site.timezone,metadata:site.metadata,
    brandVersionId:site.currentBrandVersionId,
    websiteContent:copy,websiteContentRevision:savedWebsite?.revision??null,
  });
  const intent=brief.planning;
  // A saved Program code represents intent, not a commissioned Solution.
  // Only active published catalog names are suitable for editorial suggestions.
  // Catalog unavailability does not prevent safe, generic Site outreach.
  const publishedPrograms=intent?.programCodes?.length
    ? await readPublishedBlueprintReferences(reader)
        .then(items=>items.filter(item=>item.kind==="program_model" &&
          intent.programCodes!.includes(item.code))
          .map(item=>({code:item.code,title:item.title})))
        .catch(()=>[])
    : [];
  const reuseAllowed=brief.consent.contentReuseAllowed;
  return {reuseAllowed,story:brief.story,identity:reuseAllowed?brief.identity:null,
    intent:reuseAllowed?intent:null,
    experiences:reuseAllowed?brief.experiences:[],
    publishedPrograms:reuseAllowed?publishedPrograms:[],websiteCopy:brief.websiteCopy};
}

export const readSiteMarketingSuggestionsV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(siteInput,raw);return (async()=>{
    const {site,source,stored}=await db.transaction(async tx=>{
      const {actor,site}=await authorizedSite(request,data.siteId,"program.read",tx);
      const source=await marketingSource(site,tx);
      const stored=source.reuseAllowed?await readStoredSitePackage(actor,site.id,"outreach",tx):null;
      return {site,source,stored};
    });
    return Object.fromEntries(marketingPurposeIds.map(purpose=>{
      const base=suggestMarketingStarterV61(site.name,purpose,source);
      const generated=stored?.package;
      const copy=generated&&!generated.stale?generated.marketing?.[purpose]:null;
      return [purpose,copy?{...base,content:{...base.content,...copy},sources:[...base.sources,"Stored Site Intelligence v"+generated!.revision],generatedVersion:generated!.revision}:base];
    })) as Record<(typeof marketingPurposeIds)[number],ReturnType<typeof suggestMarketingStarterV61>&{generatedVersion?:number}>;
  })();
};

const scopedPackage = (siteId:string,packageId:string) => and(
  eq(siteMarketingPackages.siteId,siteId), eq(siteMarketingPackages.id,packageId),
);

export const listSiteMarketingPackagesV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(siteInput,raw);return (async()=>{
    await authorizedSite(request,data.siteId,"program.read");
    const rows = await db.select().from(siteMarketingPackages)
      .where(eq(siteMarketingPackages.siteId,data.siteId))
      .orderBy(desc(siteMarketingPackages.updatedAt),desc(siteMarketingPackages.createdAt));
    return rows.map(toView);
  })();
};

export const createSiteMarketingPackageV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(createInput,raw);return db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(request,data.siteId,"program.launch.start",tx);
    const [currentBrand]=await tx.select({id:sites.currentBrandVersionId}).from(sites)
      .where(eq(sites.id,site.id)).limit(1);
    if(!currentBrand?.id)
      throw new DomainError("UNAVAILABLE","Save your Site Brand in Shape → Website & Brand before creating outreach materials.");
    const source=await marketingSource(site,tx);
    const starter=suggestMarketingStarterV61(site.name,data.purpose,source).content;
    const generated=source.reuseAllowed?(await readStoredSitePackage(actor,site.id,"outreach",tx)).package:null;
    const generatedCopy=generated&&!generated.stale?generated.marketing?.[data.purpose]:null;
    const [created]=await tx.insert(siteMarketingPackages).values({
      siteId:site.id,organizationId:site.organizationId,
      createdByPersonId:actor.actorPersonId!,title:data.title,
      brandVersionId:currentBrand.id,
      content:generatedCopy?{...starter,...generatedCopy}:starter,
    }).returning();
    if(!created)throw new DomainError("UNAVAILABLE","Unable to create package");
    await writeAudit(tx,actor,{
      action:"site.marketing_package.create",entityType:"site_marketing_package",
      entityId:created.id,scope:{siteId:site.id,organizationId:site.organizationId},
      after:{purpose:data.purpose,revision:created.revision,...(generatedCopy&&generated?{sourceGeneratedContentId:generated.id,sourceGeneratedRevision:generated.revision}:{})},
    });
    await emitReportableChange(tx,{
      eventType:EventTypes.SiteMarketingPackageCreated,
      sourceId:created.id,sourceVersion:String(created.revision),
      actorPersonId:actor.actorPersonId,occurredAt:created.createdAt,
      dimensions:{organizationId:site.organizationId,siteId:site.id},
      payload:{revision:created.revision},
    });
    return toView(created);
  });
};

export const saveSiteMarketingPackageV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(saveInput,raw);return db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(request,data.siteId,"program.launch.start",tx);
    const [current]=await tx.select().from(siteMarketingPackages)
      .where(scopedPackage(site.id,data.packageId)).for("update").limit(1);
    if(!current)throw new DomainError("UNAVAILABLE","Package unavailable in this Site");
    if(current.revision!==data.expectedRevision)throw new DomainError("CONFLICT");
    if(current.status==="archived")throw new DomainError("CONFLICT","Restore the package before editing.");
    if(current.title===data.title&&canonicalJson(current.content)===canonicalJson(data.content))
      return toView(current);
    const [saved]=await tx.update(siteMarketingPackages).set({
      title:data.title,content:data.content,revision:current.revision+1,updatedAt:new Date(),
    }).where(scopedPackage(site.id,current.id)).returning();
    if(!saved)throw new DomainError("UNAVAILABLE","Unable to save package");
    await writeAudit(tx,actor,{
      action:"site.marketing_package.update",entityType:"site_marketing_package",
      entityId:current.id,scope:{siteId:site.id,organizationId:site.organizationId},
      before:{revision:current.revision},after:{revision:saved.revision},
    });
    await emitReportableChange(tx,{
      eventType:EventTypes.SiteMarketingPackageUpdated,
      sourceId:saved.id,sourceVersion:String(saved.revision),
      actorPersonId:actor.actorPersonId,occurredAt:saved.updatedAt,
      dimensions:{organizationId:site.organizationId,siteId:site.id},
      payload:{revision:saved.revision,previousRevision:current.revision},
    });
    return toView(saved);
  });
};

export const duplicateSiteMarketingPackageV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(recordInput,raw);return db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(request,data.siteId,"program.launch.start",tx);
    const [original]=await tx.select().from(siteMarketingPackages)
      .where(scopedPackage(site.id,data.packageId)).limit(1);
    if(!original)throw new DomainError("UNAVAILABLE","Package unavailable in this Site");
    const [copy]=await tx.insert(siteMarketingPackages).values({
      siteId:site.id,organizationId:site.organizationId,createdByPersonId:actor.actorPersonId!,
      title:(original.title.slice(0,113)+" (copy)").slice(0,120),
      content:marketingPackageContentSchema.parse(original.content),
      brandVersionId:original.brandVersionId,
    }).returning();
    if(!copy)throw new DomainError("UNAVAILABLE","Unable to duplicate package");
    await writeAudit(tx,actor,{
      action:"site.marketing_package.duplicate",entityType:"site_marketing_package",
      entityId:copy.id,scope:{siteId:site.id,organizationId:site.organizationId},
      after:{sourceId:original.id,revision:copy.revision},
    });
    await emitReportableChange(tx,{
      eventType:EventTypes.SiteMarketingPackageDuplicated,
      sourceId:copy.id,sourceVersion:String(copy.revision),
      actorPersonId:actor.actorPersonId,occurredAt:copy.createdAt,
      dimensions:{organizationId:site.organizationId,siteId:site.id},
      payload:{sourcePackageId:original.id,revision:copy.revision},
    });
    return toView(copy);
  });
};

export const archiveSiteMarketingPackageV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(archiveInput,raw);return db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(request,data.siteId,"program.launch.start",tx);
    const [current]=await tx.select().from(siteMarketingPackages)
      .where(scopedPackage(site.id,data.packageId)).for("update").limit(1);
    if(!current)throw new DomainError("UNAVAILABLE","Package unavailable in this Site");
    if(current.revision!==data.expectedRevision)throw new DomainError("CONFLICT");
    const status=data.archived?"archived":"draft";
    if(current.status===status)return toView(current);
    const [saved]=await tx.update(siteMarketingPackages).set({
      status,revision:current.revision+1,updatedAt:new Date(),
    }).where(scopedPackage(site.id,current.id)).returning();
    if(!saved)throw new DomainError("UNAVAILABLE","Unable to update package");
    await writeAudit(tx,actor,{
      action:data.archived?"site.marketing_package.archive":"site.marketing_package.restore",
      entityType:"site_marketing_package",entityId:current.id,
      scope:{siteId:site.id,organizationId:site.organizationId},
      before:{status:current.status},after:{status:saved.status},
    });
    await emitReportableChange(tx,{
      eventType:EventTypes.SiteMarketingPackageStatusChanged,
      sourceId:saved.id,sourceVersion:String(saved.revision),
      actorPersonId:actor.actorPersonId,occurredAt:saved.updatedAt,
      dimensions:{organizationId:site.organizationId,siteId:site.id},
      payload:{previousStatus:current.status,status:saved.status,
        previousRevision:current.revision,revision:saved.revision},
    });
    return toView(saved);
  });
};

/** A Package selects an immutable saved Brand. Updating that selection is explicit. */
export const selectSiteMarketingPackageBrandV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(brandInput,raw);return db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(request,data.siteId,"program.launch.start",tx);
    const [current]=await tx.select().from(siteMarketingPackages)
      .where(scopedPackage(site.id,data.packageId)).for("update").limit(1);
    if(!current)throw new DomainError("UNAVAILABLE","Package unavailable in this Site");
    if(current.revision!==data.expectedRevision)throw new DomainError("CONFLICT");
    if(current.status==="archived")throw new DomainError("CONFLICT","Restore this package before updating its identity.");
    const [brand]=await tx.select({id:siteBrandVersions.id}).from(siteBrandVersions)
      .where(and(eq(siteBrandVersions.siteId,site.id),eq(siteBrandVersions.id,data.brandVersionId))).limit(1);
    if(!brand)throw new DomainError("FORBIDDEN","Brand version does not belong to this Site.");
    if(current.brandVersionId===brand.id)return toView(current);
    const [saved]=await tx.update(siteMarketingPackages).set({
      brandVersionId:brand.id,revision:current.revision+1,updatedAt:new Date(),
    }).where(scopedPackage(site.id,current.id)).returning();
    if(!saved)throw new DomainError("UNAVAILABLE","Unable to update package Brand");
    await writeAudit(tx,actor,{action:"site.marketing_package.brand_version.select",
      entityType:"site_marketing_package",entityId:current.id,
      scope:{siteId:site.id,organizationId:site.organizationId},
      before:{brandVersionId:current.brandVersionId,revision:current.revision},
      after:{brandVersionId:brand.id,revision:saved.revision}});
    await emitReportableChange(tx,{
      eventType:EventTypes.SiteMarketingPackageBrandSelected,
      sourceId:saved.id,sourceVersion:String(saved.revision),
      actorPersonId:actor.actorPersonId,occurredAt:saved.updatedAt,
      dimensions:{organizationId:site.organizationId,siteId:site.id},
      payload:{brandVersionId:brand.id,previousRevision:current.revision,revision:saved.revision},
    });
    return toView(saved);
  });
};

export const deleteSiteMarketingPackageV61 = async (request:Request,raw:unknown)=>{const data=parseCommandInput(revisionInput,raw);return db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(request,data.siteId,"program.launch.start",tx);
    const [current]=await tx.select().from(siteMarketingPackages)
      .where(scopedPackage(site.id,data.packageId)).for("update").limit(1);
    if(!current)throw new DomainError("UNAVAILABLE","Package unavailable in this Site");
    if(current.revision!==data.expectedRevision)throw new DomainError("CONFLICT");
    const [released]=await tx.select({id:siteArtifactReleases.id}).from(siteArtifactReleases)
      .where(eq(siteArtifactReleases.packageId,current.id)).limit(1);
    if(released)throw new DomainError("CONFLICT",
      "This package has released materials. Archive it to preserve those releases.");
    await tx.delete(siteMarketingPackages).where(scopedPackage(site.id,current.id));
    await writeAudit(tx,actor,{
      action:"site.marketing_package.delete",entityType:"site_marketing_package",
      entityId:current.id,scope:{siteId:site.id,organizationId:site.organizationId},
      before:{revision:current.revision,status:current.status},after:null,
    });
    // The deletion receipt and audit remain authoritative after the draft is gone.
    await emitReportableChange(tx,{
      eventType:EventTypes.SiteMarketingPackageDeleted,
      sourceId:current.id,sourceVersion:String(current.revision),
      actorPersonId:actor.actorPersonId,occurredAt:new Date(),
      dimensions:{organizationId:site.organizationId,siteId:site.id},
      payload:{lastRevision:current.revision,lastStatus:current.status},
    });
    return {deleted:true,id:current.id};
  });
};

/** Stable ID keyset, scoped to the authorized Site. Legacy UI keeps its existing ordering. */
export async function listSiteMarketingPackagesPageV61(request:Request,raw:unknown){
 const data=parseCommandInput(pageInput,raw);
 await authorizedSite(request,data.siteId,"program.read");
 const rows=await db.select().from(siteMarketingPackages).where(and(eq(siteMarketingPackages.siteId,data.siteId),data.cursor?lt(siteMarketingPackages.id,data.cursor):undefined)).orderBy(desc(siteMarketingPackages.id)).limit(data.limit+1);
 const items=rows.slice(0,data.limit).map(toView);
 return {items,nextCursor:rows.length>data.limit?items.at(-1)!.id:null};
}
