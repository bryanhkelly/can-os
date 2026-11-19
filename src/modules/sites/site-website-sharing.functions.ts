import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteWebsitePreviewShares } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { getPartnerWebsitePreview } from "./site-website-preview.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { DomainError } from "@/domain/errors";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";
import { type PublicSitePage } from "@/domain/public-site-html";
import { normalizeSiteLocalContent, classifySiteLocalContent } from "@/domain/site-local-content";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { websiteShareExpiryDays, websiteSharePageUrl } from "@/domain/website-share-preview";

/** Mint only on deliberate operator action. Snapshots never reference the draft reader or public Site publication. */
export const createWebsitePreviewShare=createServerFn({method:"POST"})
  .validator((data:unknown)=>z.object({
    siteId:z.string().uuid(), expectedRevision:z.number().int().positive(),
    confirmedPublicSharing:z.literal(true),
  }).strict().parse(data))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const site=await requirePartnerWebsiteEditor(actor,db,siteWebsiteLocalPublishCapability);
    if(site.id!==data.siteId || !actor.actorPersonId)
      throw new DomainError("FORBIDDEN","A verified Site website editor is required.");
    const view=await getPartnerWebsitePreview(actor);
    if(view.siteId!==site.id || view.currentRevision!==data.expectedRevision || !view.editingContent)
      throw new DomainError("CONFLICT","Save the latest website draft before making a shared preview.");
    // Fail closed: unlike private working previews, any publicly visible images
    // must already have complete rights/consent, and copy may not assert protected claims.
    const content=normalizeSiteLocalContent(view.editingContent);
    if(classifySiteLocalContent(content).status!=="published")
      throw new DomainError("VALIDATION_FAILED","Remove protected institutional claims before publicly sharing your draft.");
    if(!view.host)throw new DomainError("UNAVAILABLE","Prepare a private Site website address first.");
    const active=await db.select({id:siteWebsitePreviewShares.id}).from(siteWebsitePreviewShares)
      .where(and(eq(siteWebsitePreviewShares.siteId,site.id),
        isNull(siteWebsitePreviewShares.revokedAt),gt(siteWebsitePreviewShares.expiresAt,new Date())))
      .limit(5);
    if(active.length>=5)
      throw new DomainError("VALIDATION_FAILED","Revoke an older preview link before creating another.");
    // Use the same public-safe canonical engine. Deliberately omit unpublished
    // content-channel drafts, private Story records, enrollment links and unapproved Site claims.
    const [academicPrograms,offerings]=await Promise.all([
      readAcademicProgramCatalog(site.id),
      readEnrichmentCatalog(site.id),
    ]);
    const page:PublicSitePage={
      host:view.host,site:{name:view.siteName,organizationName:view.organizationName},
      academicPrograms,offerings:offerings.map(toPublicSiteEnrichment),
      localContent:content,parentInformation:view.parentInformation,
      enrollmentOpportunities:[],
    };
    const pages=Object.fromEntries(availablePublicSitePaths(page).map(path=>[
      path,renderPublicSiteHtml(page,{path,localPreview:true}),
    ]));
    const token=randomBytes(32).toString("hex");
    const tokenSha256=createHash("sha256").update(token).digest("hex");
    const expiry=new Date(Date.now()+websiteShareExpiryDays*86400000);
    const [row]=await db.insert(siteWebsitePreviewShares).values({
      siteId:site.id,websiteRevision:view.currentRevision,tokenSha256,pages,
      createdByPersonId:actor.actorPersonId,expiresAt:expiry,
    }).returning({id:siteWebsitePreviewShares.id});
    if(!row)throw new DomainError("UNAVAILABLE","Unable to create a shared preview.");
    return {id:row.id,url:websiteSharePageUrl(token),expiresAt:expiry.toISOString(),
      revision:view.currentRevision};
  });

export const listWebsitePreviewShares=createServerFn({method:"GET"})
  .validator((data:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(data))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const site=await requirePartnerWebsiteEditor(actor,db,siteWebsiteLocalPublishCapability);
    if(site.id!==data.siteId)throw new DomainError("FORBIDDEN","Site access required.");
    const rows=await db.select({
      id:siteWebsitePreviewShares.id,revision:siteWebsitePreviewShares.websiteRevision,
      createdAt:siteWebsitePreviewShares.createdAt,expiresAt:siteWebsitePreviewShares.expiresAt,
      revokedAt:siteWebsitePreviewShares.revokedAt,
    }).from(siteWebsitePreviewShares)
      .where(eq(siteWebsitePreviewShares.siteId,site.id))
      .orderBy(desc(siteWebsitePreviewShares.createdAt)).limit(25);
    return rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),
      expiresAt:row.expiresAt.toISOString(),revokedAt:row.revokedAt?.toISOString()??null}));
  });

export const revokeWebsitePreviewShare=createServerFn({method:"POST"})
  .validator((data:unknown)=>z.object({siteId:z.string().uuid(),id:z.string().uuid()}).strict().parse(data))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const site=await requirePartnerWebsiteEditor(actor,db,siteWebsiteLocalPublishCapability);
    if(site.id!==data.siteId)throw new DomainError("FORBIDDEN","Site access required.");
    const rows=await db.update(siteWebsitePreviewShares).set({revokedAt:new Date()})
      .where(and(eq(siteWebsitePreviewShares.id,data.id),eq(siteWebsitePreviewShares.siteId,site.id),
        isNull(siteWebsitePreviewShares.revokedAt)))
      .returning({id:siteWebsitePreviewShares.id});
    return {revoked:rows.length===1};
  });
