import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { physicalSiteAddressSchema, draftSiteContactSchema, siteInformationSchema, siteTimezoneSchema, nextSiteConfigurationRevision, samePhysicalSiteAddress, sameDraftSiteContact, sameSiteInformation, readSitePhysicalAddress } from "@/domain/site-setup-configuration";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { assertSiteSetupScope, assertSiteLocationProgramScope, siteSetupReadableProgramIds } from "@/domain/site-setup-scope";
import { db } from "@/db/client";
import { resolveSiteGeographicAreaId } from "./site-geographic-area.server";
import { sites, programs, sitePublications, organizations, schoolConfigurationVersions, programPublications, programSiteAuthorizations } from "@/db/schema";
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

const updateSiteConfigurationInput = z.object({
  siteId: z.string().uuid(),
  expectedRevision: z.string().datetime({offset:true}),
  address: physicalSiteAddressSchema.nullable(),
  changeReason: z.string().trim().min(5).max(1000).optional(),
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
      assertSiteSetupScope(actor,site,"program.launch.start");
      const oldAddress=site.address??null;
      const address=data.address;
      const geographicAreaId=address?await resolveSiteGeographicAreaId(tx,address):null;
      const same=oldAddress===null&&address===null ||
        oldAddress!==null&&address!==null&&samePhysicalSiteAddress(oldAddress,address);
      if(same && site.geographicAreaId===geographicAreaId &&
          typeof site.metadata.sitePhysicalAddressRevision==="string")
        return {siteId:site.id,updated:false,revision:site.updatedAt.toISOString(),reviewRequested:false};
      if(site.updatedAt.toISOString()!==data.expectedRevision)
        throw new DomainError("CONFLICT", "Site revision has changed.");
      const attached=await tx.select({id:programs.id,status:programs.status}).from(programs)
        .where(eq(programs.siteId,site.id));
      const attachedIds=attached.map(item=>item.id);
      assertSiteLocationProgramScope(actor,attachedIds);
      const [publication,approvedConfigurations,publishedPrograms,approvedServices]=await Promise.all([
        tx.select({status:sitePublications.status})
          .from(sitePublications).where(eq(sitePublications.siteId,site.id))
          .for("update").limit(1),
        attachedIds.length?tx.select({id:schoolConfigurationVersions.id})
          .from(schoolConfigurationVersions)
          .where(and(inArray(schoolConfigurationVersions.programId,attachedIds),
            inArray(schoolConfigurationVersions.status,["approved","suspended"]))).limit(1):Promise.resolve([]),
        attachedIds.length?tx.select({programId:programPublications.programId})
          .from(programPublications)
          .where(and(inArray(programPublications.programId,attachedIds),
            eq(programPublications.status,"published"))).limit(1):Promise.resolve([]),
        attachedIds.length?tx.select({id:programSiteAuthorizations.id})
          .from(programSiteAuthorizations)
          .where(and(inArray(programSiteAuthorizations.programId,attachedIds),
            inArray(programSiteAuthorizations.status,["approved","suspended"]))).limit(1):Promise.resolve([]),
      ]);
      // Fail closed even if a Program still says "launching". Independent
      // authorization and marketing can already have been approved.
      if(publication[0]?.status==="published" ||
        attached.some(p=>p.status==="active" || p.status==="ready") ||
        approvedConfigurations.length>0 || publishedPrograms.length>0 ||
        approvedServices.length>0)
        throw new DomainError("SITE_LOCATION_AMENDMENT_REQUIRED");
      const nextRevision=nextSiteConfigurationRevision(site.updatedAt);
      const [changed]=await tx.update(sites).set({
        address,geographicAreaId,
        metadata:{...site.metadata,sitePhysicalAddressRevision:nextRevision.toISOString()},
        updatedAt:nextRevision,
      }).where(eq(sites.id,site.id)).returning({updatedAt:sites.updatedAt});
      if(!changed)throw new Error("Unable to save Site configuration");
      // Unapproved Site location edits are saved as normal, audited draft revisions.
      // Any already approved or published operation was denied above.
      await writeAudit(tx,actor,{
        action:"site.location.update",entityType:"site",entityId:site.id,
        scope:{organizationId:site.organizationId,siteId:site.id},
        before:{address:oldAddress,geographicAreaId:site.geographicAreaId},
        after:{address,geographicAreaId,
          ...(data.changeReason?{reason:data.changeReason}:{}),
          reviewRequired:false,planningRevision:true},
      });
      return {siteId:site.id,updated:true,revision:changed.updatedAt.toISOString(),
        reviewRequested:false};
    });
  });

/** Save a draft school contact without giving it public-disclosure authority. */
export const updateLaunchSiteContact = createServerFn({method:"POST"})
  .validator((v:unknown)=>z.object({
    siteId:z.string().uuid(),
    expectedRevision:z.string().datetime({offset:true}),
    contact:draftSiteContactSchema.nullable(),
  }).strict().parse(v))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.launch.start");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified school contact editor");
    return db.transaction(async tx=>{
      const [site]=await tx.select().from(sites).where(eq(sites.id,data.siteId))
        .for("update").limit(1);
      assertSiteSetupScope(actor,site,"program.launch.start");
      const before=site.metadata.setupContact??null;
      if(sameDraftSiteContact(before,data.contact))
        return {siteId:site.id,updated:false,revision:site.updatedAt.toISOString()};
      if(site.updatedAt.toISOString()!==data.expectedRevision)
        throw new Error("School configuration changed. Refresh and review the latest information before saving.");
      const nextRevision=nextSiteConfigurationRevision(site.updatedAt);
      const [saved]=await tx.update(sites).set({
        metadata:{...site.metadata,setupContact:data.contact,
          siteContactRevision:nextRevision.toISOString()},
        updatedAt:nextRevision,
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

/** Save private, self-reported Site context without asserting legal status or public authority. */
export const updateLaunchSiteInformation = createServerFn({method:"POST"})
  .validator((v:unknown)=>z.object({
    siteId:z.string().uuid(),
    expectedRevision:z.string().datetime({offset:true}),
    information:siteInformationSchema,
  }).strict().parse(v))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.launch.start");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified Site information editor");
    return db.transaction(async tx=>{
      const [site]=await tx.select().from(sites).where(eq(sites.id,data.siteId))
        .for("update").limit(1);
      assertSiteSetupScope(actor,site,"program.launch.start");
      const before=site.metadata.siteInformation??null;
      if(sameSiteInformation(before,data.information))
        return {siteId:site.id,updated:false,revision:site.updatedAt.toISOString()};
      if(site.updatedAt.toISOString()!==data.expectedRevision)
        throw new Error("Site information changed. Refresh and review the latest values before saving.");
      const nextRevision=nextSiteConfigurationRevision(site.updatedAt);
      const [saved]=await tx.update(sites).set({
        metadata:{...site.metadata,siteInformation:data.information,
          siteInformationRevision:nextRevision.toISOString()},
        updatedAt:nextRevision,
      }).where(eq(sites.id,site.id)).returning({updatedAt:sites.updatedAt});
      if(!saved)throw new Error("Could not save Site information");
      await writeAudit(tx,actor,{
        action:"site.information.draft.update",entityType:"site",entityId:site.id,
        scope:{organizationId:site.organizationId,siteId:site.id},
        before:{information:before},after:{information:data.information,
          selfReported:true,publicApproved:false},
      });
      return {siteId:site.id,updated:true,revision:saved.updatedAt.toISOString()};
    });
  });

/**
 * Edit draft Site identity only. Name/zone are canonical setup metadata, NOT
 * an amendment to independent institutional approval. Public name/host changes
 * and timezone changes after academic scheduling need coordinated review.
 */
export const updateLaunchSiteIdentity=createServerFn({method:"POST"})
  .validator((v:unknown)=>z.object({
    siteId:z.string().uuid(),
    expectedRevision:z.string().datetime({offset:true}),
    name:z.string().trim().min(2).max(160),
    timezone:siteTimezoneSchema,
    changeReason:z.string().trim().min(5).max(1000).optional(),
  }).strict().parse(v))
  .handler(async({data})=>{
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.launch.start");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified Site identity editor");
    return db.transaction(async tx=>{
      const [site]=await tx.select().from(sites)
        .where(eq(sites.id,data.siteId)).for("update").limit(1);
      assertSiteSetupScope(actor,site,"program.launch.start");
      const nameChanged=site.name!==data.name;
      const timezoneChanged=site.timezone!==data.timezone;
      if(!nameChanged&&!timezoneChanged)
        return {siteId:site.id,updated:false,revision:site.updatedAt.toISOString()};
      if(site.updatedAt.toISOString()!==data.expectedRevision)
        throw new Error("This school Site changed. Reload its saved configuration before editing.");
      const attached=await tx.select({id:programs.id,status:programs.status})
        .from(programs).where(eq(programs.siteId,site.id));
      const programIds=attached.map(program=>program.id);
      assertSiteLocationProgramScope(actor,programIds);
      const [sitePublication]=await tx.select({status:sitePublications.status})
        .from(sitePublications).where(eq(sitePublications.siteId,site.id))
        .for("update").limit(1);
      if(sitePublication?.status==="published" || attached.some(program=>
          program.status==="active" || program.status==="ready"))
        throw new Error("An active, ready or publicly published Site requires CAN-coordinated identity amendment.");
      if(programIds.length) {
        const [approved,published,authorized]=await Promise.all([
          tx.select({id:schoolConfigurationVersions.id}).from(schoolConfigurationVersions)
            .where(and(inArray(schoolConfigurationVersions.programId,programIds),
              inArray(schoolConfigurationVersions.status,["approved","suspended"]))).limit(1),
          tx.select({id:programPublications.programId}).from(programPublications)
            .where(and(inArray(programPublications.programId,programIds),
              eq(programPublications.status,"published"))).limit(1),
          tx.select({id:programSiteAuthorizations.id}).from(programSiteAuthorizations)
            .where(and(inArray(programSiteAuthorizations.programId,programIds),
              inArray(programSiteAuthorizations.status,["approved","suspended"]))).limit(1),
        ]);
        if(approved.length || published.length || authorized.length)
          throw new Error("School identity is institutionally approved or published. Request a controlled CAN amendment.");
      }
      // Time zone stays editable before operating approval. Existing scheduled
      // instants are not shifted by this metadata edit; launch checks must
      // reconcile them before the Site becomes operational.
      // Serialize a name correction with Site creation to prevent silent duplicates.
      if(nameChanged) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"site-create:"+site.organizationId+":"+data.name.toLowerCase()}))`);
        const [duplicate]=await tx.select({id:sites.id}).from(sites)
          .where(and(eq(sites.organizationId,site.organizationId),ne(sites.id,site.id),
            sql`lower(${sites.name}) = ${data.name.toLowerCase()}`)).limit(1);
        if(duplicate)throw new Error("Another school Site already uses this name. Choose its saved record.");
      }
      const nextRevision=nextSiteConfigurationRevision(site.updatedAt);
      const [saved]=await tx.update(sites).set({
        name:data.name,timezone:data.timezone,
        metadata:{...site.metadata,siteIdentityRevision:nextRevision.toISOString()},
        updatedAt:nextRevision,
      }).where(eq(sites.id,site.id)).returning({updatedAt:sites.updatedAt});
      if(!saved)throw new Error("School Site identity update failed.");
      await writeAudit(tx,actor,{
        action:"site.identity.draft.update",entityType:"site",entityId:site.id,
        scope:{organizationId:site.organizationId,siteId:site.id},
        before:{name:site.name,timezone:site.timezone},
        after:{name:data.name,timezone:data.timezone,
          ...(data.changeReason?{reason:data.changeReason}:{}),
          publicApproved:false,physicalLocationRevisionUnchanged:true},
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
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    assertCapability(actor,"program.read");
    if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
      throw new AuthorizationError("verified school configuration reader");
    const [site]=await db.select({
      id:sites.id,organizationId:sites.organizationId,name:sites.name,
      slug:sites.slug,address:sites.address,timezone:sites.timezone,
      updatedAt:sites.updatedAt,metadata:sites.metadata,
    }).from(sites).where(eq(sites.id,data.siteId)).limit(1);
    assertSiteSetupScope(actor,site,"program.read");
    const readableProgramIds=siteSetupReadableProgramIds(actor);
    const attached=await db.select({
      id:programs.id,name:programs.name,type:programs.type,
      status:programs.status,jurisdictionId:programs.jurisdictionId,
      hostOrganizationId:programs.hostOrganizationId,
      gradeRange:programs.gradeRange,deliveryModel:programs.deliveryModel,
      academicProviderOrganizationId:programs.academicProviderOrganizationId,
      creditIssuingOrganizationId:programs.creditIssuingOrganizationId,
    }).from(programs).where(and(eq(programs.siteId,site.id),
      ...(readableProgramIds ? [inArray(programs.id,readableProgramIds)] : [])));
    const namedIds=[...new Set([
      site.organizationId,
      ...attached.flatMap(program=>[
        program.hostOrganizationId,program.academicProviderOrganizationId,
        program.creditIssuingOrganizationId,
      ]).filter((id):id is string=>Boolean(id)),
    ])];
    const namedOrganizations=namedIds.length?await db.select({
      id:organizations.id,name:organizations.name,
    }).from(organizations).where(inArray(organizations.id,namedIds)):[];
    const displayName=(organizationId:string|null)=>({
      id:organizationId,
      name:organizationId?namedOrganizations.find(org=>org.id===organizationId)?.name??null:null,
    });
    const [publication]=await db.select({status:sitePublications.status})
      .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
    // Website pages require a separate institutional publisher grant; registrar authority alone is not enough.
    const {requireSitePublisher}=await import("@/modules/sites/site-publication.server");
    const canPublish=await requireSitePublisher(actor,site.id).then(()=>true,(error:unknown)=>{
      if(error instanceof AuthorizationError)return false;
      throw error;
    });
    const {address,metadata,...identity}=site;
    const physical=readSitePhysicalAddress(address);
    const savedIdentityRevision=typeof metadata.siteIdentityRevision==="string"
      ? metadata.siteIdentityRevision:null;
    const savedLocationRevision=typeof metadata.sitePhysicalAddressRevision==="string"
      ? metadata.sitePhysicalAddressRevision:null;
    const savedContactRevision=typeof metadata.siteContactRevision==="string"
      ? metadata.siteContactRevision:null;
    return {
      ...identity,organization:displayName(site.organizationId),
      revision:site.updatedAt.toISOString(),identityRevision:savedIdentityRevision,
      updatedAt:site.updatedAt.toISOString(),
      physicalLocation:{value:physical.value,source:"church_site_record" as const,
        configurationStatus:physical.status,
        revision:savedLocationRevision,
        reviewStatus:"unverified" as const,publicClaimApproved:false},
      programs:attached.map(program=>({
        ...program,
        proposedResponsibilities:{
          source:"program_launch_intent" as const,
          reviewStatus:"unverified" as const,
          churchHost:displayName(program.hostOrganizationId??site.organizationId),
          academicProvider:displayName(program.academicProviderOrganizationId),
          creditIssuer:displayName(program.creditIssuingOrganizationId),
        },
        proposedOnsiteSchedule:{
          onsiteDaysPerWeek:program.deliveryModel.onsiteDaysPerWeek??null,
          daysOfWeek:null,
          reviewStatus:"unconfigured" as const,
          detail:"Approved Program-level academic calendars are owned by academic-time",
        },
        academicProviderApprovalStatus:"not_asserted" as const,
        jurisdictionApprovalStatus:"not_asserted" as const,
        locationReviewState:savedLocationRevision?"independent_review_required" as const:"unverified_legacy" as const,
      })),
      publication:{status:publication?.status??"unconfigured",canPublish,
        publicReachability:"not_asserted" as const},
      contact:{value:serializableJson(draftSiteContactSchema.safeParse(metadata.setupContact).success ? draftSiteContactSchema.parse(metadata.setupContact) : null),
        source:"church_site_draft" as const,revision:savedContactRevision,
        configurationStatus:metadata.setupContact==null?"unconfigured" as const:
          draftSiteContactSchema.safeParse(metadata.setupContact).success?"church_supplied" as const:"legacy_needs_review" as const,
        reviewStatus:"unverified" as const,publicClaimApproved:false},
      calendar:{status:"read_from_academic_program_calendar" as const},
    };
  });
