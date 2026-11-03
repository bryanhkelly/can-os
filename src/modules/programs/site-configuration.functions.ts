import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { db } from "@/db/client";
import { sites, programs, actions, sitePublications } from "@/db/schema";
import { writeAudit } from "@/platform/mutation";

/** Church-entered location, not jurisdiction certification or an approved public claim. */
export const physicalSiteAddressSchema = z.object({
  street1: z.string().trim().min(2).max(200),
  street2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(24),
  country: z.string().trim().min(2).max(80).default("US"),
  county: z.string().trim().max(120).optional(),
}).strict();

const updateSiteConfigurationInput = z.object({
  siteId: z.string().uuid(),
  expectedRevision: z.string().datetime({offset:true}),
  address: physicalSiteAddressSchema,
  changeReason: z.string().trim().min(5).max(1000),
}).strict();

/** A mutation is scoped to a verified registrar and one canonical Site. */
export const updateLaunchSiteAddress = createServerFn({method:"POST"})
  .validator((v:unknown)=>updateSiteConfigurationInput.parse(v))
  .handler(async ({data})=>{
    const actor = await getCommandContext(getRequest());
    assertCapability(actor,"program.launch.start");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified school configuration editor");
    return db.transaction(async tx=>{
      const [site] = await tx.select().from(sites)
        .where(eq(sites.id,data.siteId)).for("update").limit(1);
      if(!site || !actor.scope.organizationIds?.includes(site.organizationId) ||
        (actor.grantSiteId !== null && actor.grantSiteId !== site.id) ||
        (actor.scope.siteIds?.length && !actor.scope.siteIds.includes(site.id)))
        throw new AuthorizationError("Site configuration scope");
      if(site.updatedAt.toISOString()!==data.expectedRevision)
        throw new Error("This Site changed since you opened it. Refresh before saving to avoid overwriting another editor.");
      const oldAddress=site.address??null;
      const address=data.address;
      const same=JSON.stringify(oldAddress)===JSON.stringify(address);
      if(same)return {siteId:site.id,updated:false,revision:site.updatedAt.toISOString(),reviewRequested:false};
      const [changed]=await tx.update(sites).set({address,updatedAt:new Date()})
        .where(eq(sites.id,site.id)).returning({updatedAt:sites.updatedAt});
      if(!changed)throw new Error("Unable to save Site configuration");
      const attached=await tx.select({id:programs.id,status:programs.status}).from(programs)
        .where(eq(programs.siteId,site.id));
      const [publication]=await tx.select({status:sitePublications.status})
        .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
      if(publication?.status==="published" || attached.some(p=>p.status==="active" || p.status==="ready"))
        throw new Error("An active or approved school/publication needs institutional review before its authoritative address can change.");
      // Every location revision can change locality requirements or eligibility.
      // Keep prior legal decisions untouched; flag them for independent review.
      for(const program of attached){
        const [prior]=await tx.select({id:actions.id,status:actions.status,metadata:actions.metadata})
          .from(actions).where(and(
            eq(actions.type,"site_location_change_review"),
            eq(actions.subjectType,"program"),eq(actions.subjectId,program.id),
            eq(actions.siteId,site.id),
          )).limit(1);
        const metadata={...(prior?.metadata??{}),reviewState:"needs_independent_review",
          siteAddressRevision:changed.updatedAt.toISOString(),changeReason:data.changeReason,
          requestedByPersonId:actor.actorPersonId};
        if(prior){
          await tx.update(actions).set({
            status:"open",resolvedAt:null,resolutionNote:null,metadata,
            updatedAt:new Date(),
          }).where(eq(actions.id,prior.id));
        }else{
          await tx.insert(actions).values({
            type:"site_location_change_review",status:"open",priority:"high",
            title:"Review updated school physical location",
            description:"School location changed. Recheck jurisdiction, locality, published claims, and opening approval against authoritative records. This task does not grant authorization.",
            subjectType:"program",subjectId:program.id,
            organizationId:site.organizationId,siteId:site.id,programId:program.id,
            metadata,
          });
        }
      }
      await writeAudit(tx,actor,{
        action:"site.location.update",entityType:"site",entityId:site.id,
        scope:{organizationId:site.organizationId,siteId:site.id},
        before:{address:oldAddress},after:{address,reason:data.changeReason,
          reviewRequired:attached.length>0},
      });
      return {siteId:site.id,updated:true,revision:changed.updatedAt.toISOString(),
        reviewRequested:attached.length>0};
    });
  });
