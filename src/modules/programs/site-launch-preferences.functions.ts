import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, sitePublications } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { writeAudit } from "@/platform/mutation";
import { ensureExistingSitePublicationDraftForLaunch } from "@/modules/sites/site-public-provisioning.server";

/**
 * Saves only Site-scoped planning intent. This is not a Program, Offering,
 * curriculum adoption, network grant, website publication or enrollment release.
 */
export const saveSiteLaunchPreferences = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    siteId:z.string().uuid(),
    preferences:siteLaunchPreferencesSchema,
  }).strict().parse(value))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.launch.start");
    if(!actor.actorPersonId||!hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("Site launch planning editor");
    return db.transaction(async tx=>{
      const [site]=await tx.select().from(sites)
        .where(eq(sites.id,data.siteId)).for("update").limit(1);
      assertSiteSetupScope(actor,site,"program.launch.start");
      // A newly created Site already has an address. Avoid requiring a second,
      // differently scoped reservation grant merely to save private interests.
      const [address]=await tx.select({siteId:sitePublications.siteId})
        .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
      if(!address)await ensureExistingSitePublicationDraftForLaunch(tx,actor,{
        id:site.id,organizationId:site.organizationId,slug:site.slug,
      });
      const previous=site.metadata.launchPreferences;
      if(JSON.stringify(previous)===JSON.stringify(data.preferences))
        return {siteId:site.id,updated:false};
      const [updated]=await tx.update(sites).set({
        metadata:{...site.metadata,launchPreferences:data.preferences},
        updatedAt:new Date(),
      }).where(eq(sites.id,site.id)).returning({id:sites.id});
      if(!updated)throw new Error("Unable to save Site launch preferences");
      await writeAudit(tx,actor,{
        action:"site.launch_preferences.update",entityType:"site",entityId:site.id,
        scope:{siteId:site.id,organizationId:site.organizationId},
        before:{preferences:previous??null},
        after:{preferences:data.preferences},
      });
      return {siteId:site.id,updated:true};
    });
  });

export const readSiteLaunchPreferences = createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.read");
    if(!actor.actorPersonId||!hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("Site launch planning reader");
    const [site]=await db.select().from(sites).where(eq(sites.id,data.siteId)).limit(1);
    assertSiteSetupScope(actor,site,"program.read");
    const parsed=siteLaunchPreferencesSchema.safeParse(site.metadata.launchPreferences);
    return parsed.success?parsed.data:null;
  });
