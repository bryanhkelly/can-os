import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/db/client";
import { siteArtifactReleases, siteArtifactReleaseAccess, siteMarketingPackageReleases,
  sites, siteMarketingPackages, sitePublications, siteBrandAssets } from "@/db/schema";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { marketingPackageContentSchema, marketingFormatIds, marketingStepIssue } from "@/domain/marketing-package-v61";
import { containsProtectedInstitutionalClaim } from "@/domain/site-local-content";
import { renderSiteMarketingArtifact } from "@/domain/site-artifact-renderer";
import { assertSiteBrandMediaRights } from "@/domain/site-brand";
import { publicSiteHost } from "@/domain/public-site-address";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readSavedBrandVersion } from "@/modules/sites/site-brand.functions";
import { writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const scope=z.object({siteId:uuid,packageId:uuid}).strict();
const releaseSchema=z.object({siteId:uuid,releaseId:uuid}).strict();

async function checkSite(siteId:string,write:boolean,reader:Pick<typeof db,"select">=db){
  const actor=await getCommandContext(getRequest());
  const [site]=await reader.select({id:sites.id,organizationId:sites.organizationId,name:sites.name})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  assertSiteSetupScope(actor,site,write?"program.launch.start":"program.read");
  return {site,actor};
}

/**
 * Read-only, brand-correct working preview using the exact final artifact renderer.
 * A preview is not a release, distribution, publication or proof of approval.
 * POST keeps private draft messages out of URLs and server-side caches.
 */
const previewInputSchema=z.object({
  siteId:uuid,
  brandVersionId:uuid.nullable().optional(),
  format:z.enum(marketingFormatIds),
  content:marketingPackageContentSchema,
}).strict();

export const previewSiteMarketingArtifact=createServerFn({method:"POST"})
  .validator((value:unknown)=>previewInputSchema.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site}=await checkSite(data.siteId,false);
    const brand=await readSavedBrandVersion(site.id,data.brandVersionId??null);
    if(!brand)return {state:"missing-brand" as const};
    // Never preview unpublished claims or unconsented media as if distributable.
    const copy=[data.content.headline,data.content.message,data.content.callToAction].join(" ");
    if(containsProtectedInstitutionalClaim(copy))
      return {state:"claims-review-required" as const};
    const resolvedBrand={...brand.resolved,
      logo:assertSiteBrandMediaRights(brand.resolved.logo)?brand.resolved.logo:null,
      hero:assertSiteBrandMediaRights(brand.resolved.hero)?brand.resolved.hero:null,
    };
    const [publication]=await db.select({status:sitePublications.status,slug:sitePublications.slug})
      .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
    const websiteUrl=publication?.status==="published"&&publication.slug
      ? "https://"+publicSiteHost(publication.slug):null;
    if(data.format==="qr-card"&&!websiteUrl)
      return {state:"requires-public-destination" as const};
    const qrSvg=data.format==="qr-card"&&websiteUrl
      ? await QRCode.toString(websiteUrl,{type:"svg",margin:2,
          color:{dark:resolvedBrand.theme.ink,light:"#ffffff"}}):undefined;
    const rendered=renderSiteMarketingArtifact({
      format:data.format,brand:resolvedBrand,content:data.content,websiteUrl,qrSvg,
    });
    return {state:"ready" as const,format:rendered.format,
      mimeType:rendered.mimeType,body:rendered.body,
      brandRevision:brand.version.revision,templateVersion:rendered.templateVersion};
  });


/** One click releases all selected output formats in a single DB transaction.
 * Retries with the same requestId return the exact same parent release.
 */
const packageReleaseInput=scope.extend({
  expectedPackageRevision:z.number().int().positive(),
  requestId:uuid,
}).strict();

export const createSiteMarketingPackageRelease=createServerFn({method:"POST"})
  .validator((value:unknown)=>packageReleaseInput.parse(value))
  .handler(async ({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site,actor}=await checkSite(data.siteId,true,tx);
    const [pkg]=await tx.select().from(siteMarketingPackages).where(and(
      eq(siteMarketingPackages.siteId,site.id),eq(siteMarketingPackages.id,data.packageId)))
      .for("update").limit(1);
    if(!pkg)throw new DomainError("UNAVAILABLE","Marketing Package unavailable.");
    // Check after locking the Package, before revision/status checks. A network
    // retry must not create a second release or fail because edits happened later.
    const [replayed]=await tx.select().from(siteMarketingPackageReleases).where(and(
      eq(siteMarketingPackageReleases.packageId,pkg.id),
      eq(siteMarketingPackageReleases.requestId,data.requestId))).limit(1);
    if(replayed){
      if(replayed.sourcePackageRevision!==data.expectedPackageRevision)
        throw new DomainError("CONFLICT","A package release request ID was reused with different content.");
      return {id:replayed.id,releaseNumber:replayed.releaseNumber,
        formats:replayed.formats,created:false};
    }
    if(pkg.status!=="draft")throw new DomainError("CONFLICT","Restore this Package before releasing it.");
    if(pkg.revision!==data.expectedPackageRevision)
      throw new DomainError("CONFLICT","Package changed. Review the current saved version before releasing.");
    if(!pkg.brandVersionId)throw new DomainError("UNAVAILABLE","Save a Site Brand in Establish first.");

    const content=marketingPackageContentSchema.parse(pkg.content);
    for(const step of ["menu","audience","messages","assets"] as const){
      const issue=marketingStepIssue(step,pkg.title,content);
      if(issue)throw new DomainError("VALIDATION_FAILED",issue);
    }
    if(new Set(content.formats).size!==content.formats.length)
      throw new DomainError("VALIDATION_FAILED","Select each material format only once.");
    const claimText=[pkg.title,content.headline,content.message,content.callToAction].join(" ");
    if(containsProtectedInstitutionalClaim(claimText))
      throw new DomainError("VALIDATION_FAILED",
        "Remove unverified institutional, tuition or enrollment claims before releasing materials.");
    const brand=await readSavedBrandVersion(site.id,pkg.brandVersionId,tx);
    if(!brand)throw new DomainError("UNAVAILABLE","The selected Site Brand is unavailable.");
    const resolvedBrand={...brand.resolved,
      logo:assertSiteBrandMediaRights(brand.resolved.logo)?brand.resolved.logo:null,
      hero:assertSiteBrandMediaRights(brand.resolved.hero)?brand.resolved.hero:null,
    };
    const [publication]=await tx.select({status:sitePublications.status,slug:sitePublications.slug})
      .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
    const destination=publication?.status==="published"&&publication.slug
      ? "https://"+publicSiteHost(publication.slug):null;
    if(content.formats.includes("qr-card")&&!destination)
      throw new DomainError("VALIDATION_FAILED",
        "QR cards require an authorized permanent public destination. Deselect QR card or publish the Site first.");

    // Generate every output before any insert. Failure leaves no partial release.
    const outputs=await Promise.all(content.formats.map(async format=>{
      const qrSvg=format==="qr-card"&&destination
        ? await QRCode.toString(destination,{type:"svg",margin:2,
            color:{dark:resolvedBrand.theme.ink,light:"#ffffff"}}):undefined;
      const rendered=renderSiteMarketingArtifact({
        format,brand:resolvedBrand,content,websiteUrl:destination,qrSvg,
      });
      const logo=format!=="qr-card"&&resolvedBrand.logo
        ? {id:resolvedBrand.logo.id,sha256:resolvedBrand.logo.checksum}:null;
      return {
        format,rendered,checksum:createHash("sha256").update(rendered.body).digest("hex"),
        assetManifest:{logo,hero:null},
        outputManifest:{mimeType:rendered.mimeType,extension:rendered.extension,
          body:rendered.body,plainText:rendered.plainText??null,
          contentLength:Buffer.byteLength(rendered.body)},
      };
    }));
    const [previous]=await tx.select({number:siteMarketingPackageReleases.releaseNumber})
      .from(siteMarketingPackageReleases)
      .where(eq(siteMarketingPackageReleases.packageId,pkg.id))
      .orderBy(desc(siteMarketingPackageReleases.releaseNumber)).limit(1);
    const releaseNumber=(previous?.number??0)+1;
    const [parent]=await tx.insert(siteMarketingPackageReleases).values({
      siteId:site.id,packageId:pkg.id,brandVersionId:brand.version.id,
      sourcePackageRevision:pkg.revision,requestId:data.requestId,
      releaseNumber,formats:[...content.formats],contentSnapshot:{title:pkg.title,...content},
      createdByPersonId:actor.actorPersonId!,
    }).returning({id:siteMarketingPackageReleases.id});
    if(!parent)throw new DomainError("UNAVAILABLE","Could not create Package Release.");
    await tx.insert(siteArtifactReleases).values(outputs.map(output=>({
      siteId:site.id,packageId:pkg.id,packageReleaseId:parent.id,
      brandVersionId:brand.version.id,sourcePackageRevision:pkg.revision,
      artifactKind:output.format,templateId:output.rendered.templateId,
      templateVersion:output.rendered.templateVersion,
      contentSnapshot:{title:pkg.title,...content},
      assetManifest:output.assetManifest,outputManifest:output.outputManifest,
      outputChecksum:output.checksum,createdByPersonId:actor.actorPersonId!,
    })));
    await writeAudit(tx,actor,{action:"site.marketing_package.release",
      entityType:"site",entityId:site.id,
      scope:{siteId:site.id,organizationId:site.organizationId},
      after:{packageId:pkg.id,releaseId:parent.id,releaseNumber,
        packageRevision:pkg.revision,brandVersionId:brand.version.id,
        formats:content.formats,outputChecksums:outputs.map(o=>o.checksum)}});
    return {id:parent.id,releaseNumber,formats:[...content.formats],created:true};
  }));

export const listSiteMarketingPackageReleases=createServerFn({method:"GET"})
  .validator((value:unknown)=>scope.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site}=await checkSite(data.siteId,false);
    const parents=await db.select().from(siteMarketingPackageReleases)
      .where(and(eq(siteMarketingPackageReleases.siteId,site.id),
        eq(siteMarketingPackageReleases.packageId,data.packageId)))
      .orderBy(desc(siteMarketingPackageReleases.releaseNumber)).limit(30);
    if(!parents.length)return [];
    const children=await db.select({
      id:siteArtifactReleases.id,
      packageReleaseId:siteArtifactReleases.packageReleaseId,
      format:siteArtifactReleases.artifactKind,
      templateVersion:siteArtifactReleases.templateVersion,
      checksum:siteArtifactReleases.outputChecksum,
      withdrawnAt:siteArtifactReleaseAccess.withdrawnAt,
    }).from(siteArtifactReleases)
      .leftJoin(siteArtifactReleaseAccess,eq(siteArtifactReleases.id,siteArtifactReleaseAccess.releaseId))
      .where(and(eq(siteArtifactReleases.siteId,site.id),
        inArray(siteArtifactReleases.packageReleaseId,parents.map(p=>p.id))));
    return parents.map(parent=>{
      const {title:releaseTitle,...snapshotContent}=parent.contentSnapshot;
      const content=marketingPackageContentSchema.parse(snapshotContent);
      const formats=z.array(z.enum(marketingFormatIds)).parse(parent.formats);
      const outputs=formats.map(format=>children.find(child=>
        child.packageReleaseId===parent.id&&child.format===format));
      return {
        id:parent.id,releaseNumber:parent.releaseNumber,
        packageRevision:parent.sourcePackageRevision,
        brandVersionId:parent.brandVersionId,
        title:typeof releaseTitle==="string"?releaseTitle:"",
        content,formats,
        createdAt:parent.createdAt.toISOString(),
        outputs:outputs.filter((o):o is NonNullable<typeof o>=>Boolean(o))
          .map(o=>({id:o.id,format:z.enum(marketingFormatIds).parse(o.format),templateVersion:o.templateVersion,
            checksum:o.checksum,
            withdrawnAt:o.withdrawnAt?.toISOString()??null})),
        // Refuse a malformed historical release whose repeated format
        // resolves the same child twice. A complete Package always contains
        // one distinct artifact for each selected format.
        complete:formats.length>0 && new Set(formats).size===formats.length &&
          outputs.length===formats.length && outputs.every(Boolean),
      };
    });
  });

export const listSiteMarketingReleases=createServerFn({method:"GET"})
  .validator((value:unknown)=>scope.parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {site}=await checkSite(data.siteId,false);
    const releases=await db.select({
      id:siteArtifactReleases.id,format:siteArtifactReleases.artifactKind,
      packageReleaseId:siteArtifactReleases.packageReleaseId,
      brandVersionId:siteArtifactReleases.brandVersionId,
      packageRevision:siteArtifactReleases.sourcePackageRevision,
      createdAt:siteArtifactReleases.createdAt,
      checksum:siteArtifactReleases.outputChecksum,
      withdrawnAt:siteArtifactReleaseAccess.withdrawnAt,
    }).from(siteArtifactReleases)
      .leftJoin(siteArtifactReleaseAccess,
        eq(siteArtifactReleases.id,siteArtifactReleaseAccess.releaseId))
      .where(and(eq(siteArtifactReleases.siteId,site.id),eq(siteArtifactReleases.packageId,data.packageId),
        isNull(siteArtifactReleases.packageReleaseId)))
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
