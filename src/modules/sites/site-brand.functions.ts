import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { sites, siteBrandVersions, siteBrandAssets } from "@/db/schema";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteDraftReadCapability, siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { writeAudit } from "@/platform/mutation";
import {
  initialSiteBrandConfiguration, resolveSiteBrandVersion, siteBrandConfigurationSchema,
  type SiteBrandAsset, type SiteBrandConfiguration, type SavedSiteBrandVersion,
} from "@/domain/site-brand";

type Reader=Pick<typeof db,"select">;
function canonicalJson(value:unknown):string{
  return JSON.stringify(value,(_key,entry:unknown)=>entry&&typeof entry==="object"&&!Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))):entry);
}
export const brandFingerprint=(value:SiteBrandConfiguration)=>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

/** Caller is responsible for exact Site authorization; no anonymous brand-draft reader. */
export async function readSavedBrandVersion(siteId:string,brandVersionId?:string|null,reader:Reader=db){
  const [site]=await reader.select({id:sites.id,currentBrandVersionId:sites.currentBrandVersionId})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  if(!site)return null;
  const id=brandVersionId??site.currentBrandVersionId;
  if(!id)return null;
  const [version]=await reader.select().from(siteBrandVersions)
    .where(and(eq(siteBrandVersions.siteId,siteId),eq(siteBrandVersions.id,id))).limit(1);
  if(!version)return null;
  const c=siteBrandConfigurationSchema.parse(version.configuration);
  const mediaIds=[c.logoAssetId,c.heroAssetId].filter((v):v is string=>Boolean(v));
  const assets=new Map<string,SiteBrandAsset>();
  for(const assetId of [...new Set(mediaIds)]){
    const [asset]=await reader.select().from(siteBrandAssets).where(and(
      eq(siteBrandAssets.siteId,siteId),eq(siteBrandAssets.id,assetId))).limit(1);
    if(!asset)throw new DomainError("UNAVAILABLE","Brand media asset is missing or outside this Site.");
    assets.set(asset.id,{id:asset.id,siteId:asset.siteId,dataUrl:asset.dataUrl,
      checksum:asset.checksum,altText:asset.altText,
      rightsConfirmed:asset.rightsConfirmed==="true",
      childImageConsent:asset.childImageConsent,revokedAt:asset.revokedAt?.toISOString()??null});
  }
  const saved:SavedSiteBrandVersion={id:version.id,siteId:version.siteId,revision:version.revision,
    configuration:c,fingerprint:version.fingerprint,createdAt:version.createdAt.toISOString()};
  return {version:saved,resolved:resolveSiteBrandVersion(saved,assets)};
}

async function authorizeReader(actor:Awaited<ReturnType<typeof getCommandContext>>,
 siteId:string,write:boolean,reader:Reader=db){
  if(actor.role==="site_website_editor" || actor.role==="site_admin"){
    const site=await requirePartnerWebsiteEditor(actor,reader,
      write?siteWebsiteLocalPublishCapability:siteWebsiteDraftReadCapability);
    if(site.id!==siteId)throw new DomainError("FORBIDDEN","Site Brand belongs to another Site.");
    return site;
  }
  const [site]=await reader.select({id:sites.id,organizationId:sites.organizationId,name:sites.name})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  assertSiteSetupScope(actor,site,write?"program.launch.start":"program.read");
  return site;
}

export const readSiteBrandVersionView=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({siteId:z.string().uuid(),
    versionId:z.string().uuid().optional()}).strict().parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const site=await authorizeReader(actor,data.siteId,false);
    const result=await readSavedBrandVersion(site.id,data.versionId);
    return {siteId:site.id,siteName:site.name,current:result,
      initial:initialSiteBrandConfiguration(site.name)};
  });

export const assetInputSchema=z.object({
  dataUrl:z.string().max(220000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  altText:z.string().trim().min(1).max(180),
  rightsConfirmed:z.literal(true),
  childImageConsent:z.enum(["no_identifiable_children","guardian_consent_confirmed"]),
}).strict();
const mutationSchema=z.object({
  siteId:z.string().uuid(),
  expectedBrandVersionId:z.string().uuid().nullable(),
  configuration:siteBrandConfigurationSchema,
  logoImage:assetInputSchema.nullable().optional(),
  heroImage:assetInputSchema.nullable().optional(),
}).strict();

export const saveSiteBrandVersion=createServerFn({method:"POST"})
  .validator((value:unknown)=>mutationSchema.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const authorized=await authorizeReader(actor,data.siteId,true,tx);
      const [site]=await tx.select({id:sites.id,currentBrandVersionId:sites.currentBrandVersionId})
        .from(sites).where(eq(sites.id,data.siteId)).for("update").limit(1);
      if(!site || site.id!==authorized.id || !actor.actorPersonId)
        throw new DomainError("FORBIDDEN","Exact authorized Site Brand edit required.");
      if(site.currentBrandVersionId!==data.expectedBrandVersionId)
        throw new DomainError("CONFLICT","This Site Brand changed. Reload and review before saving.");

      const config:SiteBrandConfiguration={...data.configuration};
      for(const [slot,input] of [["logo",data.logoImage],["hero",data.heroImage]] as const){
        const property=slot==="logo"?"logoAssetId":"heroAssetId";
        if(input===undefined)continue;
        if(input===null){config[property]=null;continue;}
        // Reuse the existing, strictly validated PNG parser, including bounds/chunks.
        // Never accept arbitrary SVG, third-party URL or scriptable image.
        const { validateInlinePng }=await import("@/domain/site-local-content");
        validateInlinePng(input.dataUrl);
        const checksum=createHash("sha256").update(canonicalJson(input)).digest("hex");
        const [existing]=await tx.select().from(siteBrandAssets).where(and(
          eq(siteBrandAssets.siteId,site.id),eq(siteBrandAssets.checksum,checksum))).limit(1);
        if(existing?.revokedAt)
          throw new DomainError("FORBIDDEN","The rights for this media have been withdrawn. Upload an authorized replacement.");
        let assetId=existing?.id;
        if(!assetId){
          const [created]=await tx.insert(siteBrandAssets).values({
            siteId:site.id,dataUrl:input.dataUrl,checksum,altText:input.altText,
            rightsConfirmed:"true",childImageConsent:input.childImageConsent,
            createdByPersonId:actor.actorPersonId,
          }).returning({id:siteBrandAssets.id});
          assetId=created?.id;
        }
        if(!assetId)throw new DomainError("UNAVAILABLE","Brand media could not be saved.");
        config[property]=assetId;
      }
      // Every referenced asset must belong to this Site and retain rights.
      for(const assetId of [config.logoAssetId,config.heroAssetId].filter((id):id is string=>Boolean(id))){
        const [asset]=await tx.select({id:siteBrandAssets.id,rights:siteBrandAssets.rightsConfirmed,
          revoked:siteBrandAssets.revokedAt,consent:siteBrandAssets.childImageConsent})
          .from(siteBrandAssets).where(and(
            eq(siteBrandAssets.id,assetId),eq(siteBrandAssets.siteId,site.id))).limit(1);
        if(!asset || asset.revoked || asset.rights!=="true" || asset.consent==="unconfirmed")
          throw new DomainError("FORBIDDEN","Brand asset is unavailable or lacks current usage permission.");
      }
      const fingerprint=brandFingerprint(config);
      const previous=site.currentBrandVersionId
        ? await tx.select().from(siteBrandVersions).where(and(eq(siteBrandVersions.id,site.currentBrandVersionId),
          eq(siteBrandVersions.siteId,site.id))).limit(1) : [];
      if(previous[0]?.fingerprint===fingerprint)
        return {changed:false,brandVersionId:previous[0].id,revision:previous[0].revision};
      const nextRevision=previous[0]?previous[0].revision+1:1;
      const [saved]=await tx.insert(siteBrandVersions).values({
        siteId:site.id,revision:nextRevision,configuration:config,fingerprint,
        createdByPersonId:actor.actorPersonId,
      }).returning({id:siteBrandVersions.id});
      if(!saved)throw new DomainError("UNAVAILABLE","Unable to save Site Brand.");
      await tx.update(sites).set({currentBrandVersionId:saved.id})
        .where(eq(sites.id,site.id));
      await writeAudit(tx,actor,{
        action:"site.brand.version.saved",entityType:"site",entityId:site.id,
        scope:{siteId:site.id,organizationId:authorized.organizationId},
        before:{brandVersionId:site.currentBrandVersionId,revision:previous[0]?.revision??null},
        after:{brandVersionId:saved.id,revision:nextRevision,fingerprint},
      });
      return {changed:true,brandVersionId:saved.id,revision:nextRevision};
    });
  });
