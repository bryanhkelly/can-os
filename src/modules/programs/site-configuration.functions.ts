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

type JsonValue = string | number | boolean | null | JsonValue[] | {[key:string]:JsonValue};
function serializableJson(value:unknown):JsonValue {
  if(value===null || typeof value==="string" || typeof value==="boolean")return value;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return value.map(serializableJson);
  if(typeof value==="object")return Object.fromEntries(
    Object.entries(value).map(([key,entry])=>[key,serializableJson(entry)]));
  return null;
}

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

const draftSiteContactSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.union([z.string().trim().email().max(254),z.literal("")]),
  phone: z.string().trim().max(40),
  website: z.union([z.string().trim().url().max(500),z.literal("")]),
}).strict();

/** Save a draft school contact without giving it public-disclosure authority. */
export const updateLaunchSiteContact = createServerFn({method:"POST"})
  .validator((v:unknown)=>z.object({
    siteId:z.string().uuid(),
    expectedRevision:z.string().datetime({offset:true}),
    contact:draftSiteContactSchema,
  }).strict().parse(v))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.launch.start");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified school contact editor");
    return db.transaction(async tx=>{
      const [site]=await tx.select().from(sites).where(eq(sites.id,data.siteId))
        .for("update").limit(1);
      if(!site || !actor.scope.organizationIds?.includes(site.organizationId) ||
        (actor.grantSiteId!==null && actor.grantSiteId!==site.id) ||
        (actor.scope.siteIds?.length && !actor.scope.siteIds.includes(site.id)))
        throw new AuthorizationError("Site contact scope");
      if(site.updatedAt.toISOString()!==data.expectedRevision)
        throw new Error("School configuration changed. Refresh and review the latest information before saving.");
      const before=site.metadata.setupContact??null;
      if(JSON.stringify(before)===JSON.stringify(data.contact))
        return {siteId:site.id,updated:false,revision:site.updatedAt.toISOString()};
      const [saved]=await tx.update(sites).set({
        metadata:{...site.metadata,setupContact:data.contact},
        updatedAt:new Date(),
      }).where(eq(sites.id,site.id)).returning({updatedAt:sites.updatedAt});
      if(!saved)throw new Error("Could not save school contact");
      await writeAudit(tx,actor,{
        action:"site.contact.draft.update",entityType:"site",entityId:site.id,
        scope:{siteId:site.id,organizationId:site.organizationId},
        before:{contact:before},after:{contact:data.contact,publicApproved:false},
      });
      return {siteId:site.id,updated:true,revision:saved.updatedAt.toISOString()};
    });
  });

/**
 * Registrar-only canonical configuration reader.
 * Explicitly not an approved public-school DTO: A/B must use their approved projections.
 */
export const getLaunchSiteConfiguration = createServerFn({method:"GET"})
  .validator((v:unknown)=>z.object({siteId:z.string().uuid()}).strict().parse(v))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.read");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified school configuration reader");
    const [site]=await db.select({
      id:sites.id,organizationId:sites.organizationId,name:sites.name,
      slug:sites.slug,address:sites.address,timezone:sites.timezone,
      updatedAt:sites.updatedAt,metadata:sites.metadata,
    }).from(sites).where(eq(sites.id,data.siteId)).limit(1);
    if(!site || !actor.scope.organizationIds?.includes(site.organizationId) ||
      (actor.grantSiteId!==null && actor.grantSiteId!==site.id) ||
      (actor.scope.siteIds?.length && !actor.scope.siteIds.includes(site.id)))
      throw new AuthorizationError("Site configuration read scope");
    const attached=await db.select({
      id:programs.id,name:programs.name,type:programs.type,
      status:programs.status,jurisdictionId:programs.jurisdictionId,
      gradeRange:programs.gradeRange,deliveryModel:programs.deliveryModel,
      academicProviderOrganizationId:programs.academicProviderOrganizationId,
      creditIssuingOrganizationId:programs.creditIssuingOrganizationId,
    }).from(programs).where(eq(programs.siteId,site.id));
    const [publication]=await db.select({status:sitePublications.status})
      .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
    const {address,metadata,...identity}=site;
    return {
      ...identity,revision:site.updatedAt.toISOString(),
      updatedAt:site.updatedAt.toISOString(),
      physicalLocation:{value:serializableJson(address??null),source:"church_site_record" as const,
        reviewStatus:"unverified" as const,publicClaimApproved:false},
      programs:attached.map(program=>({
        ...program,
        academicProviderApprovalStatus:"not_asserted" as const,
        jurisdictionApprovalStatus:"not_asserted" as const,
      })),
      publication:{status:publication?.status??"unconfigured",
        publicReachability:"not_asserted" as const},
      contact:{value:serializableJson(metadata.setupContact??null),source:"church_site_draft" as const,
        reviewStatus:"unverified" as const,publicClaimApproved:false},
      calendar:{status:"read_from_academic_program_calendar" as const},
    };
  });
