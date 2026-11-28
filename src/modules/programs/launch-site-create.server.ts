import {parseCommandInput} from "@/domain/command-input";
import {z} from "zod";
import {schoolPlanningLocationSchema} from "@/domain/school-stub";
import {siteLaunchPreferencesSchema} from "@/domain/site-launch-preferences";
import {physicalSiteAddressSchema,siteTimezoneSchema,samePhysicalSiteAddress} from "@/domain/site-setup-configuration";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import type {AccessContext} from "@/domain/access-context";
import {EventTypes} from "@/domain/event-types";
import {emitEvent,writeAudit} from "@/platform/mutation";
import {resolveSiteGeographicAreaId} from "./site-geographic-area.server";
import {DomainError} from "@/domain/errors";
const uuid=z.string().uuid();
export const createLaunchSiteInput=z.object({
  organizationId:uuid,name:z.string().trim().min(2).max(160),
  slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone:siteTimezoneSchema,
  address:physicalSiteAddressSchema.optional(),
  stubOnly:z.boolean().optional(),
  // One platform Site identity: classify at creation, never allocate a
  // secondary education_v30 Site or infer its identity from a name.
  siteKind:z.enum(["physical","virtual","mobile"]).optional(),
  planningLocation:schoolPlanningLocationSchema.optional(),
  launchPreferences:siteLaunchPreferencesSchema.optional(),
 }).strict().refine(value=>!value.stubOnly||Boolean(value.planningLocation), "A school stub requires city and state");
export async function createLaunchSiteService(actor:AccessContext,raw:unknown){
  const data=parseCommandInput(createLaunchSiteInput,raw);
  assertCapability(actor,"program.launch.start");
  if(!hasRegistrarAuthority(actor.role))throw new AuthorizationError("registrar program launch workspace");
  if(!actor.actorPersonId||!actor.scope.organizationIds?.includes(data.organizationId)||actor.grantSiteId!==null)
   throw new AuthorizationError("organization-wide site creation");
  const [{db},s,{provisionNewSitePublicationDraft,ensureExistingSitePublicationDraftForLaunch},{and,eq,or,sql}]=await Promise.all([
   import("@/db/client"),import("@/db/schema"),
   import("@/modules/sites/site-public-provisioning.server"),
   import("drizzle-orm"),
  ]);
  return db.transaction(async tx=>{
   // Serialize identical retry/submission attempts before checking existing Sites.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"site-create:" + data.organizationId + ":" + data.name.trim().toLowerCase()}))`);
   // The unique index only covers slug; a renamed slug would otherwise fork the campus.
   const [existing]=await tx.select({id:s.sites.id,name:s.sites.name,slug:s.sites.slug,
     timezone:s.sites.timezone,address:s.sites.address,
     siteKind:s.sites.siteKind,metadata:s.sites.metadata})
    .from(s.sites)
    .where(and(eq(s.sites.organizationId,data.organizationId),or(
     eq(s.sites.slug,data.slug),
     sql`lower(${s.sites.name}) = ${data.name.trim().toLowerCase()}`,
    )))
    .for("update").limit(1);
   if(existing) {
    const savedPlanningLocation=schoolPlanningLocationSchema.safeParse(existing.metadata.schoolPlanningLocation);
    // Exact replay returns the original canonical Site and its website reservation;
    // a changed name, timezone or location must be edited, not silently adopted.
    if(existing.slug===data.slug && existing.name.trim().toLowerCase()===data.name.trim().toLowerCase() &&
      existing.timezone===data.timezone &&
      (!data.siteKind || existing.siteKind===data.siteKind) &&
      (data.address ? samePhysicalSiteAddress(existing.address,data.address) : existing.address===null) &&
      (!data.planningLocation || (savedPlanningLocation.success &&
       savedPlanningLocation.data.city === data.planningLocation.city && savedPlanningLocation.data.state === data.planningLocation.state))) {
      const publicSiteDraft=data.stubOnly ? null : await ensureExistingSitePublicationDraftForLaunch(tx,actor,{
        id:existing.id,organizationId:data.organizationId,slug:existing.slug,
      });
      const existingPlanning=siteLaunchPreferencesSchema.safeParse(existing.metadata.launchPreferences);
      // A retried Site-creation command must never overwrite a configured V6.1
      // Programs & Audiences draft. Editing belongs to the canonical Site command.
      if(data.launchPreferences &&
         (existing.metadata.launchPreferences == null ||
           (existingPlanning.success && existingPlanning.data.planningVersion !== 2)) &&
         JSON.stringify(existing.metadata.launchPreferences)!==JSON.stringify(data.launchPreferences)){
        await tx.update(s.sites).set({
          metadata:{...existing.metadata,launchPreferences:data.launchPreferences},
          updatedAt:new Date(),
        }).where(eq(s.sites.id,existing.id));
        await writeAudit(tx,actor,{
          action:"site.launch_preferences.update",entityType:"site",entityId:existing.id,
          scope:{organizationId:data.organizationId,siteId:existing.id},
          before:{preferences:existing.metadata.launchPreferences??null},
          after:{preferences:data.launchPreferences},
        });
      }
      return {siteId:existing.id,publicSiteDraft,replayed:true};
    }
    throw new DomainError("CONFLICT",`This church already has the site "${existing.name}" (${existing.slug}). Select its saved record and edit it instead of creating another Site.`);
   }
   const createdAt=new Date();
   const geographicAreaId=await resolveSiteGeographicAreaId(tx,data.address);
   const [site]=await tx.insert(s.sites).values({organizationId:data.organizationId,name:data.name,
     slug:data.slug,timezone:data.timezone,address:data.address,geographicAreaId,
     siteKind:data.siteKind,lifecycleStatus:"planning",updatedAt:createdAt,
     metadata:{siteIdentityRevision:createdAt.toISOString(),
      ...(data.planningLocation?{schoolPlanningLocation:data.planningLocation}:{}),
      ...(data.launchPreferences?{launchPreferences:data.launchPreferences}:{}),
      ...(data.address?{sitePhysicalAddressRevision:createdAt.toISOString()}:{})}})
     .returning({id:s.sites.id});
   if(!site)throw new Error("Failed to create Site");
   await emitEvent(tx,{
    eventType:EventTypes.SiteCreated,aggregateType:"site",aggregateId:site.id,
    actorPersonId:actor.actorPersonId,organizationId:data.organizationId,
    siteId:site.id,payload:{name:data.name,timezone:data.timezone,
     siteKind:data.siteKind??null,addressProvided:Boolean(data.address),stubOnly:Boolean(data.stubOnly)},
   });
   await writeAudit(tx,actor,{
    action:"site.create",entityType:"site",entityId:site.id,
    scope:{organizationId:data.organizationId,siteId:site.id},
    after:{name:data.name,timezone:data.timezone,siteKind:data.siteKind??null,
      lifecycleStatus:"planning",address:data.address??null,geographicAreaId,
      ...(data.planningLocation?{schoolPlanningLocation:data.planningLocation}:{}),stubOnly:Boolean(data.stubOnly)}});
   // Stub creation has no website reservation dependency. The legacy location
   // flow still reserves a private draft, without publishing or issuing grants.
   const publicSiteDraft=data.stubOnly ? null : await provisionNewSitePublicationDraft(tx,actor,{
    id:site.id,organizationId:data.organizationId,slug:data.slug,
   });
   return {siteId:site.id,publicSiteDraft,replayed:false};
  });
}
