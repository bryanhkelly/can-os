import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/db/client";
import { siteArtifactReleases, siteArtifactReleaseAccess, sites, siteMarketingPackages,
  sitePublications, siteBrandAssets } from "@/db/schema";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { marketingPackageContentSchema, marketingFormatIds } from "@/domain/marketing-package-v61";
import { containsProtectedInstitutionalClaim } from "@/domain/site-local-content";
import { renderSiteMarketingArtifact } from "@/domain/site-artifact-renderer";
import { assertSiteBrandMediaRights } from "@/domain/site-brand";
import { publicSiteHost } from "@/domain/public-site-address";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readSavedBrandVersion } from "@/modules/sites/site-brand.functions";
import { writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const scope=z.object({siteId:uuid,packageId:uuid}).strict();
const createSchema=scope.extend({expectedPackageRevision:z.number().int().positive(),
  format:z.enum(marketingFormatIds)}).strict();
const releaseSchema=z.object({siteId:uuid,releaseId:uuid}).strict();

async function checkSite(siteId:string,write:boolean,reader:Pick<typeof db,"select">=db){
  const actor=await getCommandContext(getRequest());
  const [site]=await reader.select({id:sites.id,organizationId:sites.organizationId,name:sites.name})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  assertSiteSetupScope(actor,site,write?"program.launch.start":"program.read");
  return {site,actor};
}
/** Release format inputs are snapshotted with the exact frozen Brand and immutable media IDs. */
export const createSiteMarketingRelease=createServerFn({method:"POST"})
  .validator((value:unknown)=>createSchema.parse(value))
  .handler(async ({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site,actor}=await checkSite(data.siteId,true,tx);
    const [pkg]=await tx.select().from(siteMarketingPackages).where(and(
      eq(siteMarketingPackages.siteId,site.id),eq(siteMarketingPackages.id,data.packageId)))
      .for("update").limit(1);
    if(!pkg || pkg.status!=="draft")throw new DomainError("UNAVAILABLE","Active package required.");
    if(pkg.revision!==data.expectedPackageRevision)
      throw new DomainError("CONFLICT","Package changed since you opened it. Review and save first.");
    if(!pkg.brandVersionId)throw new DomainError("UNAVAILABLE","Select a saved Site Brand before generating.");
    const brand=await readSavedBrandVersion(site.id,pkg.brandVersionId,tx);
    if(!brand)throw new DomainError("UNAVAILABLE","Selected Site Brand could not be resolved.");
    // Reuse the approved identity even if a draft logo is still awaiting
    // rights/alt-text confirmation. Unapproved media is excluded, never copied.
    const resolvedBrand={...brand.resolved,
      logo:assertSiteBrandMediaRights(brand.resolved.logo)?brand.resolved.logo:null,
      hero:assertSiteBrandMediaRights(brand.resolved.hero)?brand.resolved.hero:null,
    };
    const content=marketingPackageContentSchema.parse(pkg.content);
    if(!content.formats.includes(data.format))throw new DomainError("VALIDATION_FAILED",
      "Select this output format in the saved package first.");
    if(!content.audiences.length || !content.headline.trim() || !content.message.trim())
      throw new DomainError("VALIDATION_FAILED","Review the audience, headline and message before generating materials.");
    const allText=[pkg.title,content.headline,content.message,content.callToAction].join(" ");
    if(containsProtectedInstitutionalClaim(allText))
      throw new DomainError("VALIDATION_FAILED",
        "Remove unverified institutional, tuition or enrollment claims before creating materials.");
    const [publication]=await tx.select({status:sitePublications.status,slug:sitePublications.slug})
      .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
    const destination=publication?.status==="published"&&publication.slug
      ? "https://"+publicSiteHost(publication.slug):null;
    if(data.format==="qr-card" && !destination)
      throw new DomainError("VALIDATION_FAILED",
        "A printed QR card needs a durable approved public destination. A short-lived preview link is not suitable.");
    const qrSvg=data.format==="qr-card" && destination
      ? await QRCode.toString(destination,{type:"svg",margin:2,
          color:{dark:brand.resolved.theme.ink,light:"#ffffff"}}):undefined;
    const rendered=renderSiteMarketingArtifact({
      format:data.format,brand:resolvedBrand,content,websiteUrl:destination,qrSvg,
    });
    const outputChecksum=createHash("sha256").update(rendered.body).digest("hex");
    const assetManifest={
      logo:resolvedBrand.logo?{id:resolvedBrand.logo.id,sha256:resolvedBrand.logo.checksum}:null,
      hero:resolvedBrand.hero?{id:resolvedBrand.hero.id,sha256:resolvedBrand.hero.checksum}:null,
    };
    const outputManifest={mimeType:rendered.mimeType,extension:rendered.extension,
      body:rendered.body,plainText:rendered.plainText??null,contentLength:Buffer.byteLength(rendered.body)};
    const [release]=await tx.insert(siteArtifactReleases).values({
      siteId:site.id,packageId:pkg.id,brandVersionId:brand.version.id,
      sourcePackageRevision:pkg.revision,
      artifactKind:data.format,templateId:rendered.templateId,
      templateVersion:rendered.templateVersion,
      contentSnapshot:{title:pkg.title,...content},assetManifest,outputManifest,
      outputChecksum,createdByPersonId:actor.actorPersonId!,
    }).returning({id:siteArtifactReleases.id});
    if(!release)throw new DomainError("UNAVAILABLE","Unable to create immutable artifact.");
    await writeAudit(tx,actor,{action:"site.marketing_artifact.generated",
      entityType:"site",entityId:site.id,
      scope:{siteId:site.id,organizationId:site.organizationId},
      after:{releaseId:release.id,packageId:pkg.id,packageRevision:pkg.revision,
        brandVersionId:brand.version.id,format:data.format,outputChecksum}});
    return {id:release.id,format:rendered.format,
      brandVersionId:brand.version.id,packageRevision:pkg.revision};
  }));

export const listSiteMarketingReleases=createServerFn({method:"GET"})
  .validator((value:unknown)=>scope.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site}=await checkSite(data.siteId,false);
    const releases=await db.select({
      id:siteArtifactReleases.id,format:siteArtifactReleases.artifactKind,
      brandVersionId:siteArtifactReleases.brandVersionId,
      packageRevision:siteArtifactReleases.sourcePackageRevision,
      createdAt:siteArtifactReleases.createdAt,
      checksum:siteArtifactReleases.outputChecksum,
      withdrawnAt:siteArtifactReleaseAccess.withdrawnAt,
    }).from(siteArtifactReleases)
      .leftJoin(siteArtifactReleaseAccess,
        eq(siteArtifactReleases.id,siteArtifactReleaseAccess.releaseId))
      .where(and(eq(siteArtifactReleases.siteId,site.id),eq(siteArtifactReleases.packageId,data.packageId)))
      .orderBy(desc(siteArtifactReleases.createdAt)).limit(40);
    return releases.map(item=>({...item,createdAt:item.createdAt.toISOString(),
      withdrawnAt:item.withdrawnAt?.toISOString()??null}));
  });

/** Authenticated download of the original rendered bytes. Never re-resolve current Brand. */
export const getSiteMarketingReleaseOutput=createServerFn({method:"GET"})
  .validator((value:unknown)=>releaseSchema.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site}=await checkSite(data.siteId,false);
    const [release]=await db.select().from(siteArtifactReleases).where(and(
      eq(siteArtifactReleases.id,data.releaseId),
      eq(siteArtifactReleases.siteId,site.id))).limit(1);
    if(!release)throw new DomainError("UNAVAILABLE","Artifact not found in this Site.");
    const [access]=await db.select().from(siteArtifactReleaseAccess)
      .where(eq(siteArtifactReleaseAccess.releaseId,release.id)).limit(1);
    if(access?.withdrawnAt)throw new DomainError("FORBIDDEN","This artifact was withdrawn.");
    const manifest=release.assetManifest as {logo?:{id:string}|null;hero?:{id:string}|null};
    for(const media of [manifest.logo,manifest.hero].filter((v):v is {id:string}=>Boolean(v))){
      const [asset]=await db.select({revoked:siteBrandAssets.revokedAt}).from(siteBrandAssets)
        .where(and(eq(siteBrandAssets.id,media.id),eq(siteBrandAssets.siteId,site.id))).limit(1);
      if(!asset || asset.revoked)
        throw new DomainError("FORBIDDEN","An image's usage rights have been withdrawn.");
    }
    const output=release.outputManifest as {body:string;mimeType:string;extension:string;plainText?:string|null};
    const originalChecksum=createHash("sha256").update(output.body).digest("hex");
    if(originalChecksum!==release.outputChecksum)throw new DomainError("UNAVAILABLE","Artifact checksum mismatch.");
    return {format:release.artifactKind,content:output.body,mimeType:output.mimeType,
      fileName:"site-"+release.artifactKind+"-"+release.id+"."+output.extension,
      plainText:output.plainText??null};
  });

export const withdrawSiteMarketingRelease=createServerFn({method:"POST"})
  .validator((value:unknown)=>releaseSchema.extend({
    reason:z.string().trim().min(8).max(300),
  }).strict().parse(value))
  .handler(async ({data})=>db.transaction(async tx=>{
    const {site,actor}=await checkSite(data.siteId,true,tx);
    const [release]=await tx.select({id:siteArtifactReleases.id}).from(siteArtifactReleases)
      .where(and(eq(siteArtifactReleases.id,data.releaseId),
        eq(siteArtifactReleases.siteId,site.id))).limit(1);
    if(!release)throw new DomainError("UNAVAILABLE","Artifact unavailable.");
    await tx.insert(siteArtifactReleaseAccess).values({
      releaseId:release.id,withdrawnAt:new Date(),withdrawnReason:data.reason,
    }).onConflictDoNothing();
    await writeAudit(tx,actor,{action:"site.marketing_artifact.withdrawn",
      entityType:"site",entityId:site.id,scope:{siteId:site.id,organizationId:site.organizationId},
      after:{releaseId:release.id,reason:data.reason}});
    return {withdrawn:true};
  }));
