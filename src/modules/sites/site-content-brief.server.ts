import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteBrandVersions, siteLocalContentVersions, sites, programs, organizations } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { assertSiteSetupScope, assertWholeSiteProgramsInScope } from "@/domain/site-setup-scope";
import { siteBrandConfigurationSchema } from "@/domain/site-brand";
import { projectSiteContentBriefV61 } from "@/domain/site-content-brief-v61";
import { normalizeSiteLocalContent } from "@/domain/site-local-content";
import type { AccessContext } from "@/domain/access-context";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";


/** Single authorized canonical read used by the private brief and AI boundary. */
export async function readAuthorizedSiteContentBrief(actor:AccessContext,siteId:string,mode:"read"|"website"|"outreach"="read"){
  return db.transaction(async tx=>{
    const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId,name:sites.name,timezone:sites.timezone,updatedAt:sites.updatedAt,metadata:sites.metadata,currentBrandVersionId:sites.currentBrandVersionId}).from(sites).where(eq(sites.id,siteId)).limit(1);
    if(!site)throw new AuthorizationError("Site intelligence scope");
    if(mode==="website"){
      const editor=await requirePartnerWebsiteEditor(actor,tx,"site.website.draft.write");
      if(editor.id!==site.id||actor.delegationMode==="view")throw new AuthorizationError("Site website editorial authority");
    }else assertSiteSetupScope(actor,site,mode==="outreach"?"program.launch.start":"program.read");
    const attached=await tx.select({id:programs.id}).from(programs).where(eq(programs.siteId,site.id));
    // Website editor authority is independently checked against the exact Site.
    if(mode!=="website")assertWholeSiteProgramsInScope(actor,attached.map(p=>p.id),"Site reporting");
    const [website]=await tx.select({revision:siteLocalContentVersions.revision,content:siteLocalContentVersions.content}).from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId,site.id)).orderBy(desc(siteLocalContentVersions.revision)).limit(1);
    const [brand]=site.currentBrandVersionId?await tx.select({revision:siteBrandVersions.revision,siteId:siteBrandVersions.siteId,configuration:siteBrandVersions.configuration}).from(siteBrandVersions).where(eq(siteBrandVersions.id,site.currentBrandVersionId)).limit(1):[];
    if(site.currentBrandVersionId&&brand?.siteId!==site.id)throw new AuthorizationError("Site Brand ownership");
    const copy=website?normalizeSiteLocalContent(website.content,{allowIncompleteImage:true}):null;
    const [org]=await tx.select({name:organizations.name}).from(organizations).where(eq(organizations.id,site.organizationId)).limit(1);
    const savedBrand=brand?siteBrandConfigurationSchema.parse(brand.configuration):null;
    const brief=projectSiteContentBriefV61({siteId:site.id,siteName:site.name,timezone:site.timezone,siteRevision:site.updatedAt.toISOString(),metadata:site.metadata,brandVersionId:site.currentBrandVersionId,brandRevision:brand?.revision??null,websiteContent:copy,websiteContentRevision:website?.revision??null});
    return {...brief,organizationName:org?.name??null,editorialBrand:savedBrand?{displayName:savedBrand.displayName,directionId:savedBrand.directionId}:null};
  });
}
