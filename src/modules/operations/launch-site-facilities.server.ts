import {parseCommandInput} from "@/domain/command-input";
import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { canonicalClasses, siteSpaces } from "@/db/canonical-v301";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { AuthorizationError } from "@/domain/command-context";
import {
  createSiteSpaceV61Schema, saveSiteSpaceV61Schema, readSiteSpacesV61Schema,
  mergeSitePlanningResourcesV61, parseSitePlanningResourcesV61,
} from "@/domain/launch-facilities-v61";
import { writeAudit, emitEvent } from "@/platform/mutation";

async function ownedSite(tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor:Awaited<ReturnType<typeof getCommandContext>>,siteId:string,
  capability:"program.read"|"program.launch.start"){
  const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  assertSiteSetupScope(actor,site,capability);
  return site;
}

export async function readLaunchSiteFacilitiesV61Service(request:Request,raw:unknown){
    const data=parseCommandInput(readSiteSpacesV61Schema,raw);
    const actor=await getCommandContext(request);
    return db.transaction(async tx=>{
      await ownedSite(tx,actor,data.siteId,"program.read");
      const rows=await tx.select().from(siteSpaces)
        .where(eq(siteSpaces.siteId,data.siteId))
        .orderBy(asc(siteSpaces.name),asc(siteSpaces.id)).limit(501);
      if(rows.length>500)throw new DomainError("UNAVAILABLE","Site Space inventory exceeds supported size");
      return {siteId:data.siteId,spaces:rows.map(space=>({
        id:space.id,code:space.code,name:space.name,
        maxOccupancy:space.maxOccupancy,revision:space.revision,
        resources:parseSitePlanningResourcesV61(space.resources),
      }))};
    });
}

export async function createLaunchSiteSpaceV61Service(request:Request,raw:unknown){
    const data=parseCommandInput(createSiteSpaceV61Schema,raw);
    const actor=await getCommandContext(request);
    return db.transaction(async tx=>{
      const site=await ownedSite(tx,actor,data.siteId,"program.launch.start");
      await tx.select({id:sites.id}).from(sites).where(eq(sites.id,data.siteId)).for("update");
      const [prior]=await tx.select().from(siteSpaces).where(eq(siteSpaces.id,data.spaceId)).limit(1);
      const resources=mergeSitePlanningResourcesV61({},data.resources);
      if(prior){
        if(prior.siteId!==data.siteId||prior.name!==data.name||
            prior.maxOccupancy!==data.maxOccupancy||
            JSON.stringify(parseSitePlanningResourcesV61(prior.resources))!==JSON.stringify(data.resources))
          throw new DomainError("CONFLICT","This Site Space ID already identifies a different room");
        return {spaceId:prior.id,revision:prior.revision,created:false};
      }
      const [duplicate]=await tx.select({id:siteSpaces.id}).from(siteSpaces)
        .where(and(eq(siteSpaces.siteId,data.siteId),
          sql`lower(btrim(${siteSpaces.name}))=lower(${data.name})`)).limit(1);
      if(duplicate)throw new DomainError("CONFLICT","This Site already has a room with that name");
      const [space]=await tx.insert(siteSpaces).values({
        id:data.spaceId,siteId:data.siteId,
        code:"room-"+data.spaceId.replaceAll("-",""),name:data.name,
        maxOccupancy:data.maxOccupancy,resources,revision:1,
      }).returning({id:siteSpaces.id,revision:siteSpaces.revision});
      if(!space)throw new Error("Site Space was not saved");
      const eventId=await emitEvent(tx,{eventType:"SiteSpaceCreated",
        aggregateType:"site_space",aggregateId:space.id,
        actorPersonId:actor.actorPersonId,
        payload:{siteId:data.siteId,maxOccupancy:data.maxOccupancy}});
      await writeAudit(tx,actor,{action:"site.space.created",
        entityType:"site_space",entityId:space.id,
        scope:{organizationId:site.organizationId,siteId:site.id},
        after:{name:data.name,maxOccupancy:data.maxOccupancy,resources},
        contextExtras:{domainEventId:eventId}});
      return {spaceId:space.id,revision:space.revision,created:true};
    });
}

export async function saveLaunchSiteSpaceV61Service(request:Request,raw:unknown){
    const data=parseCommandInput(saveSiteSpaceV61Schema,raw);
    const actor=await getCommandContext(request);
    return db.transaction(async tx=>{
      const site=await ownedSite(tx,actor,data.siteId,"program.launch.start");
      await tx.select({id:sites.id}).from(sites).where(eq(sites.id,data.siteId)).for("update");
      const [room]=await tx.select().from(siteSpaces)
        .where(and(eq(siteSpaces.id,data.spaceId),eq(siteSpaces.siteId,data.siteId)))
        .for("update").limit(1);
      if(!room)throw new AuthorizationError("room belonging to the selected Site");
      if(room.revision!==data.expectedRevision)
        throw new DomainError("CONFLICT","This room changed. Reload before saving.");
      const [duplicate]=await tx.select({id:siteSpaces.id}).from(siteSpaces)
        .where(and(eq(siteSpaces.siteId,data.siteId),
          ne(siteSpaces.id,room.id),
          sql`lower(btrim(${siteSpaces.name}))=lower(${data.name})`)).limit(1);
      if(duplicate)throw new DomainError("CONFLICT","A room with that name already exists");
      // A room already selected by a Class cannot have its documented
      // occupancy erased, nor reduced below that Class's planned seats.
      // A null Class capacity is still a planning gap, not a verified limit.
      const [capacityConflict]=await tx.select({id:canonicalClasses.id})
        .from(canonicalClasses).where(and(
          eq(canonicalClasses.physicalSpaceId,room.id),
          data.maxOccupancy===null
            ? undefined
            : gt(canonicalClasses.capacity,data.maxOccupancy),
        )).limit(1);
      if(capacityConflict)
        throw new DomainError("CONFLICT",
          "One or more planned Classes use this room. Keep a sufficient occupancy limit or reassign those Classes first.");
      const merged=mergeSitePlanningResourcesV61(room.resources,data.resources);
      const same=room.name===data.name&&room.maxOccupancy===data.maxOccupancy&&
        JSON.stringify(parseSitePlanningResourcesV61(room.resources))===JSON.stringify(data.resources);
      if(same)return {spaceId:room.id,revision:room.revision,changed:false};
      await tx.update(siteSpaces).set({
        name:data.name,maxOccupancy:data.maxOccupancy,resources:merged,
        revision:room.revision+1,
      }).where(eq(siteSpaces.id,room.id));
      const eventId=await emitEvent(tx,{eventType:"SiteSpacePlanningUpdated",
        aggregateType:"site_space",aggregateId:room.id,actorPersonId:actor.actorPersonId,
        payload:{siteId:data.siteId,revision:room.revision+1}});
      await writeAudit(tx,actor,{action:"site.space.planning_updated",
        entityType:"site_space",entityId:room.id,
        scope:{organizationId:site.organizationId,siteId:site.id},
        before:{name:room.name,maxOccupancy:room.maxOccupancy,
          resources:parseSitePlanningResourcesV61(room.resources),revision:room.revision},
        after:{name:data.name,maxOccupancy:data.maxOccupancy,
          resources:data.resources,revision:room.revision+1},
        contextExtras:{reason:data.reason,domainEventId:eventId}});
      return {spaceId:room.id,revision:room.revision+1,changed:true};
    });
}
