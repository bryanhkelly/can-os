import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { siteBrandVersions, siteLocalContentVersions, sites } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { projectSiteContentBriefV61 } from "@/domain/site-content-brief-v61";
import { normalizeSiteLocalContent } from "@/domain/site-local-content";
import { getCommandContext } from "@/modules/identity/command-context.server";

/** Authorized, on-demand Site Brief. No duplicate persistent copy of Establish. */
export const readSiteContentBriefV61=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.read");
    if(!actor.actorPersonId||!hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("Site Content Brief registrar access");
    return db.transaction(async tx=>{
      const [site]=await tx.select({
        id:sites.id,name:sites.name,timezone:sites.timezone,
        updatedAt:sites.updatedAt,metadata:sites.metadata,
        currentBrandVersionId:sites.currentBrandVersionId,
      }).from(sites).where(eq(sites.id,data.siteId)).limit(1);
      assertSiteSetupScope(actor,site,"program.read");
      const [website]=await tx.select({
        revision:siteLocalContentVersions.revision,content:siteLocalContentVersions.content,
      }).from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId,site.id))
        .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
      const [brand]=site.currentBrandVersionId
        ? await tx.select({revision:siteBrandVersions.revision})
          .from(siteBrandVersions).where(eq(siteBrandVersions.id,site.currentBrandVersionId)).limit(1)
        : [];
      const copy=website?normalizeSiteLocalContent(website.content,{allowIncompleteImage:true}):null;
      return projectSiteContentBriefV61({
        siteId:site.id,siteName:site.name,timezone:site.timezone,
        siteRevision:site.updatedAt.toISOString(),metadata:site.metadata,
        brandVersionId:site.currentBrandVersionId,brandRevision:brand?.revision??null,
        websiteContent:copy,websiteContentRevision:website?.revision??null,
      });
    });
  });
