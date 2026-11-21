import { canonicalJson } from "@/lib/canonical-json";
import { siteBrandVersions, siteArtifactReleases, siteLocalContentVersions } from "@/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sites, siteMarketingPackages } from "@/db/schema";
import { siteStorySourceV61Schema } from "@/domain/site-information-v61";
import { readSiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import { readPublishedBlueprintReferences } from "@/modules/blueprints/blueprint-reference-catalog.server";
import { normalizeSiteLocalContent } from "@/domain/site-local-content";
import { suggestMarketingStarterV61, type MarketingStarterSourcesV61 } from "@/domain/site-marketing-suggestions-v61";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import {
  marketingPackageContentSchema, marketingPurposeIds,
} from "@/domain/marketing-package-v61";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const siteInput = z.object({ siteId: uuid }).strict();
const recordInput = siteInput.extend({ packageId: uuid });
const revisionInput = recordInput.extend({ expectedRevision: z.number().int().positive() });
const createInput = siteInput.extend({
  title: z.string().trim().min(2).max(120),
  purpose: z.enum(marketingPurposeIds),
});
const saveInput = revisionInput.extend({
  title: z.string().trim().min(2).max(120),
  content: marketingPackageContentSchema,
});
const archiveInput = revisionInput.extend({ archived: z.boolean() });



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
  siteId: string, capability: "program.read" | "program.launch.start",
  executor: Pick<typeof db,"select"> = db,
) {
  const actor = await getCommandContext(getRequest());
  const [site] = await executor.select({
    id: sites.id, organizationId: sites.organizationId, name: sites.name, metadata: sites.metadata,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  assertSiteSetupScope(actor, site, capability);
  return { actor, site };
}

/**
 * Authorized projection of previously saved Establish information.
 * Only purpose-specific editorial suggestions leave the server; raw private
 * Story answers are never added to package metadata, audit or analytics.
 */
type MarketingSourceTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function marketingSource(
  site:{id:string;metadata:typeof sites.$inferSelect.metadata},
  reader:MarketingSourceTx,
):Promise<MarketingStarterSourcesV61>{
  const source=site.metadata.siteStoryV61;
  const story=source == null ? null : siteStorySourceV61Schema.parse(source).answers;
  const plan=site.metadata.launchPreferences;
  const intent=plan == null ? null : readSiteProgramsAudiencesV61(plan);
  const [savedWebsite]=await reader.select({content:siteLocalContentVersions.content})
    .from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId,site.id))
    .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
  const copy=savedWebsite
    ? normalizeSiteLocalContent(savedWebsite.content,{allowIncompleteImage:true})
    : null;
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
  const reuseAllowed=copy?.contentReuseConsent === "granted";
  return {reuseAllowed,story:reuseAllowed?story:null,intent:reuseAllowed?intent:null,
    publishedPrograms:reuseAllowed?publishedPrograms:[],websiteCopy:reuseAllowed&&copy
    ? {heroHeadline:copy.heroHeadline,welcomeMessage:copy.welcomeMessage,
        schoolVision:copy.schoolVision,communityOutreach:copy.communityOutreach}
    : null};
}

export const readSiteMarketingSuggestionsV61=createServerFn({method:"GET"})
  .validator((input:unknown)=>siteInput.parse(input))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site,source}=await db.transaction(async tx=>{
      const {site}=await authorizedSite(data.siteId,"program.read",tx);
      return {site,source:await marketingSource(site,tx)};
    });
    return Object.fromEntries(marketingPurposeIds.map(purpose=>
      [purpose,suggestMarketingStarterV61(site.name,purpose,source)])) as
      Record<(typeof marketingPurposeIds)[number],
        ReturnType<typeof suggestMarketingStarterV61>>;
  });

const scopedPackage = (siteId:string,packageId:string) => and(
  eq(siteMarketingPackages.siteId,siteId), eq(siteMarketingPackages.id,packageId),
);

export const listSiteMarketingPackagesV61 = createServerFn({method:"GET"})
  .validator((input:unknown)=>siteInput.parse(input))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    await authorizedSite(data.siteId,"program.read");
    const rows = await db.select().from(siteMarketingPackages)
      .where(eq(siteMarketingPackages.siteId,data.siteId))
      .orderBy(desc(siteMarketingPackages.updatedAt),desc(siteMarketingPackages.createdAt));
    return rows.map(toView);
  });

export const createSiteMarketingPackageV61 = createServerFn({method:"POST"})
  .validator((input:unknown)=>createInput.parse(input))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(data.siteId,"program.launch.start",tx);
    const [currentBrand]=await tx.select({id:sites.currentBrandVersionId}).from(sites)
      .where(eq(sites.id,site.id)).limit(1);
    if(!currentBrand?.id)
      throw new DomainError("UNAVAILABLE","Save your Site identity in Establish → Website & Brand before creating Marketing Packages.");
    const [created]=await tx.insert(siteMarketingPackages).values({
      siteId:site.id,organizationId:site.organizationId,
      createdByPersonId:actor.actorPersonId!,title:data.title,
      brandVersionId:currentBrand.id,
      content:suggestMarketingStarterV61(site.name,data.purpose,await marketingSource(site,tx)).content,
    }).returning();
    if(!created)throw new DomainError("UNAVAILABLE","Unable to create package");
    await writeAudit(tx,actor,{
      action:"site.marketing_package.create",entityType:"site_marketing_package",
      entityId:created.id,scope:{siteId:site.id,organizationId:site.organizationId},
      after:{purpose:data.purpose,revision:created.revision},
    });
    await emitEvent(tx,{
      eventType:"SiteMarketingPackageCreated",aggregateType:"site_marketing_package",
      aggregateId:created.id,actorPersonId:actor.actorPersonId,
      siteId:site.id,organizationId:site.organizationId,payload:{revision:created.revision},
    });
    return toView(created);
  }));

export const saveSiteMarketingPackageV61 = createServerFn({method:"POST"})
  .validator((input:unknown)=>saveInput.parse(input))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(data.siteId,"program.launch.start",tx);
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
    return toView(saved);
  }));

export const duplicateSiteMarketingPackageV61 = createServerFn({method:"POST"})
  .validator((input:unknown)=>recordInput.parse(input))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(data.siteId,"program.launch.start",tx);
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
    return toView(copy);
  }));

export const archiveSiteMarketingPackageV61 = createServerFn({method:"POST"})
  .validator((input:unknown)=>archiveInput.parse(input))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(data.siteId,"program.launch.start",tx);
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
    return toView(saved);
  }));

/** A Package selects an immutable saved Brand. Updating that selection is explicit. */
export const selectSiteMarketingPackageBrandV61=createServerFn({method:"POST"})
  .validator((input:unknown)=>revisionInput.extend({
    brandVersionId:z.string().uuid(),
  }).strict().parse(input))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(data.siteId,"program.launch.start",tx);
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
    return toView(saved);
  }));

export const deleteSiteMarketingPackageV61 = createServerFn({method:"POST"})
  .validator((input:unknown)=>revisionInput.parse(input))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {actor,site}=await authorizedSite(data.siteId,"program.launch.start",tx);
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
    return {deleted:true,id:current.id};
  }));
