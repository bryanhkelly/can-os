import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  engagementDefinitions, engagementDefinitionVersions, organizations, programs,
  siteGoLinks, siteMarketingPackages, siteBrandVersions, sites,
} from "@/db/schema";
import {
  engagementDefinitionSchema, engagementOwnerSchema,
  engagementContextSummary, engagementRequiresClaimReview, type EngagementOwner,
} from "@/domain/engagement-definition";
import { inspectEngagementDestination } from "./go-destination-registry.server";
import { engagementActionAvailable, engagementDestination } from "@/domain/engagement-action-policy";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { assertSiteSetupScope, assertWholeSiteProgramsInScope } from "@/domain/site-setup-scope";
import { DomainError } from "@/domain/errors";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { resolveGoExperience } from "./engagement-go.server";
import { buildEngagementInvitation } from "@/domain/engagement-distribution";
import { readAuthorizedGoLinkEvidence } from "./go-link-evidence.server";
import { writeAudit } from "@/platform/mutation";

type Reader = Pick<typeof db, "select">;
const uuid = z.string().uuid();
const createDefinitionInput = z.object({
  owner: engagementOwnerSchema,
  definition: engagementDefinitionSchema,
}).strict();
const engagementInput = z.object({engagementId:uuid}).strict();
const createLinkInput = engagementInput.extend({
  versionId:uuid,
  channel:z.enum(["email","sms","qr","social","partner","web","other"]).optional(),
}).strict();
const linkInput = engagementInput.extend({linkId:uuid}).strict();

type OwnerRecord = {
  ownerKind:"platform"|"organization"|"site"|"program";
  organizationId:string|null;siteId:string|null;programId:string|null;
};

function isReadOnlyDelegation(actor:AccessContext) {
  return actor.delegationMode === "view";
}
function requireCurrentOperator(actor:AccessContext,write:boolean){
  if(!actor.actorPersonId || (write && isReadOnlyDelegation(actor)))
    throw new AuthorizationError("active authoring identity");
}
function assertOrganizationAuthor(actor:AccessContext,organizationId:string,write:boolean){
  requireCurrentOperator(actor,write);
  if(actor.grantSiteId !== null || !actor.scope.organizationIds?.includes(organizationId))
    throw new AuthorizationError("exact organization-wide engagement scope");
  if(!(actor.capabilities.has("program.launch.start") || actor.capabilities.has("network.sites.manage")))
    throw new AuthorizationError("organization engagement authoring");
}

/** Runtime account identity, not a request-supplied creator or implicit Site grant. */
export async function authorizeEngagementOwner(
  owner:EngagementOwner, actor:AccessContext, write:boolean,reader:Reader,
):Promise<OwnerRecord>{
  requireCurrentOperator(actor,write);
  if(owner.kind === "platform"){
    assertCapability(actor,"platform.admin");
    if(actor.role !== "app_admin" && actor.role !== "platform_owner")
      throw new AuthorizationError("verified platform engagement owner");
    return {ownerKind:"platform",organizationId:null,siteId:null,programId:null};
  }
  if(owner.kind === "organization"){
    const [org]=await reader.select({
      id:organizations.id,status:organizations.lifecycleStatus,
    }).from(organizations).where(eq(organizations.id,owner.organizationId)).limit(1);
    if(!org || org.status==="closed" || org.status==="inactive")
      throw new AuthorizationError("active organization owner");
    assertOrganizationAuthor(actor,org.id,write);
    return {ownerKind:"organization",organizationId:org.id,siteId:null,programId:null};
  }
  if(owner.kind === "site"){
    const [site]=await reader.select({
      id:sites.id,organizationId:sites.organizationId,status:sites.lifecycleStatus,
    }).from(sites).where(eq(sites.id,owner.siteId)).limit(1);
    if(!site || site.status==="closed")throw new AuthorizationError("active Site owner");
    assertSiteSetupScope(actor,site,write?"program.launch.start":"program.read");
    const attached=await reader.select({id:programs.id}).from(programs)
      .where(and(eq(programs.siteId,site.id),
        eq(programs.organizationId,site.organizationId)));
    assertWholeSiteProgramsInScope(actor,attached.map(row=>row.id),"Site link management");
    return {ownerKind:"site",organizationId:site.organizationId,siteId:site.id,programId:null};
  }
  const [program]=await reader.select({
    id:programs.id,organizationId:programs.organizationId,siteId:programs.siteId,status:programs.status,
  }).from(programs).where(eq(programs.id,owner.programId)).limit(1);
  if(!program || program.status==="closed")throw new AuthorizationError("existing active Program owner");
  assertCapability(actor,write?"program.launch.start":"program.read");
  if(!actor.scope.programIds?.includes(program.id) ||
      !actor.scope.organizationIds?.includes(program.organizationId) ||
      (program.siteId && !actor.scope.siteIds?.includes(program.siteId) && actor.grantSiteId!==null))
    throw new AuthorizationError("exact Program engagement scope");
  return {ownerKind:"program",organizationId:program.organizationId,siteId:program.siteId,programId:program.id};
}
function ownerFromRow(row:OwnerRecord):EngagementOwner{
  if(row.ownerKind==="platform")return {kind:"platform"};
  if(row.ownerKind==="organization")return {kind:"organization",organizationId:row.organizationId!};
  if(row.ownerKind==="site")return {kind:"site",siteId:row.siteId!};
  return {kind:"program",programId:row.programId!};
}
async function authorizedDefinition(
  engagementId:string,actor:AccessContext,write:boolean,reader:Reader,
){
  const [record]=await reader.select().from(engagementDefinitions)
    .where(eq(engagementDefinitions.id,engagementId)).limit(1);
  if(!record)throw new DomainError("UNAVAILABLE","Engagement unavailable.");
  await authorizeEngagementOwner(ownerFromRow({
    ownerKind:record.ownerKind,organizationId:record.organizationId,
    siteId:record.siteId,programId:record.programId,
  }),actor,write,reader);
  return record;
}
async function assertDestinationReady(
  definition:z.infer<typeof engagementDefinitionSchema>,
  owner:OwnerRecord,reader:Reader,
){
  const destination=engagementDestination(definition);
  const outcome=await inspectEngagementDestination(
    owner,destination,"0123456789ab",reader,
  );
  if(!outcome.available || !outcome.href)
    throw new DomainError("UNAVAILABLE",
      "The selected opportunity is not currently published, eligible, or owned by this engagement.");
}

/** Publishes one immutable, source-neutral definition. No enrollment or contact record. */
export const createEngagementDefinition=createServerFn({method:"POST"})
  .validator((input:unknown)=>createDefinitionInput.parse(input))
  .handler(async({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const owner=await authorizeEngagementOwner(data.owner,actor,true,tx);
    if(!engagementActionAvailable(data.definition.interaction,engagementDestination(data.definition)))
      throw new DomainError("VALIDATION_FAILED","Selected destination does not support the requested interaction.");
    if(engagementRequiresClaimReview(data.definition))
      throw new DomainError("VALIDATION_FAILED",
        "Public claims about licensing, funding, admissions, affiliation or institutional approval require separate authoritative review.");
    await assertDestinationReady(data.definition,owner,tx);
    if(data.definition.source?.marketingPackageId){
      const [pkg]=await tx.select({
        id:siteMarketingPackages.id,siteId:siteMarketingPackages.siteId,
        organizationId:siteMarketingPackages.organizationId,
        status:siteMarketingPackages.status,
      }).from(siteMarketingPackages).where(eq(
        siteMarketingPackages.id,data.definition.source.marketingPackageId,
      )).limit(1);
      if(!pkg || pkg.status!=="draft" || !owner.siteId || pkg.siteId!==owner.siteId ||
          pkg.organizationId!==owner.organizationId)
        throw new AuthorizationError("owned marketing package attribution");
    }
    // Pin the current, Site-owned immutable Brand version at publication.
    // A client-supplied Brand pointer never establishes ownership.
    let brandVersionId:string|undefined;
    if(owner.siteId){
      const [site]=await tx.select({brandId:sites.currentBrandVersionId})
        .from(sites).where(eq(sites.id,owner.siteId)).limit(1);
      if(site?.brandId){
        const [brand]=await tx.select({id:siteBrandVersions.id})
          .from(siteBrandVersions).where(and(
            eq(siteBrandVersions.id,site.brandId),
            eq(siteBrandVersions.siteId,owner.siteId),
          )).limit(1);
        if(!brand)throw new DomainError("UNAVAILABLE","Current Site Brand version is not accessible.");
        brandVersionId=brand.id;
      }
    }
    const content={
      ...data.definition,
      presentation:{
        headline:data.definition.presentation.headline,
        summary:data.definition.presentation.summary,
        ...(data.definition.presentation.detail
          ?{detail:data.definition.presentation.detail}:{}),
        ...(brandVersionId?{brandVersionId}:{}),
      },
    };
    const [record]=await tx.insert(engagementDefinitions).values({
      ...owner,createdByPersonId:actor.actorPersonId!,
    }).returning({id:engagementDefinitions.id});
    if(!record)throw new DomainError("UNAVAILABLE","Unable to create engagement.");
    const [version]=await tx.insert(engagementDefinitionVersions).values({
      engagementId:record.id,version:1,content,
      createdByPersonId:actor.actorPersonId!,
    }).returning({id:engagementDefinitionVersions.id});
    if(!version)throw new DomainError("UNAVAILABLE","Unable to publish engagement.");
    await writeAudit(tx,actor,{
      action:"engagement.definition.publish",entityType:"engagement_definition",entityId:record.id,
      scope:{organizationId:owner.organizationId,siteId:owner.siteId},
      after:{version:1,ownerKind:owner.ownerKind,...engagementContextSummary(data.definition)},
    });
    return {engagementId:record.id,versionId:version.id,version:1};
  }));

/** Multiple channels can use distinct links to the very same immutable version. */
export const createEngagementGoLink=createServerFn({method:"POST"})
  .validator((input:unknown)=>createLinkInput.parse(input))
  .handler(async({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const record=await authorizedDefinition(data.engagementId,actor,true,tx);
    if(record.status!=="active")throw new DomainError("CONFLICT","This engagement is retired.");
    const [version]=await tx.select({
      id:engagementDefinitionVersions.id,content:engagementDefinitionVersions.content,
    }).from(engagementDefinitionVersions).where(and(
      eq(engagementDefinitionVersions.engagementId,record.id),
      eq(engagementDefinitionVersions.id,data.versionId),
    )).limit(1);
    if(!version)throw new DomainError("UNAVAILABLE","Published engagement version unavailable.");
    const definition=engagementDefinitionSchema.parse(version.content);
    await assertDestinationReady(definition,record,tx);
    for(let attempt=0;attempt<5;attempt++){
      const code=randomBytes(9).toString("base64url");
      const [link]=await tx.insert(siteGoLinks).values({
        code,createdByPersonId:actor.actorPersonId!,
        organizationId:record.organizationId,siteId:record.siteId,
        engagementVersionId:version.id,destination:null,
        packageId:null,channel:data.channel??null,
      }).onConflictDoNothing({target:siteGoLinks.code}).returning({
        id:siteGoLinks.id,code:siteGoLinks.code,
      });
      if(!link)continue;
      await writeAudit(tx,actor,{
        action:"engagement.go_link.create",entityType:"site_go_link",entityId:link.id,
        scope:{organizationId:record.organizationId,siteId:record.siteId},
        after:{engagementId:record.id,versionId:version.id,channel:data.channel??null},
      });
      return {linkId:link.id,code:link.code};
    }
    throw new DomainError("CONFLICT","Unable to allocate a Go code.");
  }));

export const listEngagementGoLinks=createServerFn({method:"GET"})
  .validator((input:unknown)=>engagementInput.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const record=await authorizedDefinition(data.engagementId,actor,false,db);
    const versions=await db.select({id:engagementDefinitionVersions.id,content:engagementDefinitionVersions.content})
      .from(engagementDefinitionVersions).where(eq(
        engagementDefinitionVersions.engagementId,record.id));
    const versionIds=versions.map(v=>v.id);
    if(!versionIds.length)return [];
    const links=await db.select({
      id:siteGoLinks.id,code:siteGoLinks.code,channel:siteGoLinks.channel,
      status:siteGoLinks.status,engagementVersionId:siteGoLinks.engagementVersionId,
      createdAt:siteGoLinks.createdAt,siteId:siteGoLinks.siteId,
      organizationId:siteGoLinks.organizationId,
    }).from(siteGoLinks)
      .where(inArray(siteGoLinks.engagementVersionId,versionIds))
      .orderBy(desc(siteGoLinks.createdAt)).limit(500);
    const owned=links.filter(link=>link.siteId===record.siteId&&link.organizationId===record.organizationId);
    const definitions=new Map(versions.map(version=>[version.id,engagementDefinitionSchema.safeParse(version.content)]));
    let evidence:Awaited<ReturnType<typeof readAuthorizedGoLinkEvidence>>=[];
    try{evidence=await readAuthorizedGoLinkEvidence(owned.map(link=>{
      const parsed=definitions.get(link.engagementVersionId??"");
      return {id:link.id,code:link.code,siteId:link.siteId,destination:parsed?.success?engagementDestination(parsed.data):null};
    }));}catch{console.error("Engagement outcome evidence unavailable",{kind:"operational_analytics"});}
    const byId=new Map(evidence.map(item=>[item.linkId,item]));
    return owned.map(({siteId:_siteId,organizationId:_organizationId,...link})=>({...link,createdAt:link.createdAt.toISOString(),evidence:byId.get(link.id)??null}));
  });

export const retireEngagementDefinition=createServerFn({method:"POST"})
  .validator((input:unknown)=>engagementInput.parse(input))
  .handler(async({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const record=await authorizedDefinition(data.engagementId,actor,true,tx);
    if(record.status==="retired")return {retired:true};
    await tx.update(engagementDefinitions).set({status:"retired",updatedAt:new Date()})
      .where(eq(engagementDefinitions.id,record.id));
    await writeAudit(tx,actor,{
      action:"engagement.definition.retire",entityType:"engagement_definition",
      entityId:record.id,scope:{organizationId:record.organizationId,siteId:record.siteId},
      before:{status:record.status},after:{status:"retired"},
    });
    return {retired:true};
  }));

export const revokeEngagementGoLink=createServerFn({method:"POST"})
  .validator((input:unknown)=>linkInput.parse(input))
  .handler(async({data})=>db.transaction(async tx=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const record=await authorizedDefinition(data.engagementId,actor,true,tx);
    const [link]=await tx.select().from(siteGoLinks).where(
      eq(siteGoLinks.id,data.linkId)).for("update").limit(1);
    if(!link?.engagementVersionId)throw new DomainError("UNAVAILABLE","Link unavailable.");
    const [version]=await tx.select({id:engagementDefinitionVersions.id})
      .from(engagementDefinitionVersions).where(and(
        eq(engagementDefinitionVersions.id,link.engagementVersionId),
        eq(engagementDefinitionVersions.engagementId,record.id),
      )).limit(1);
    if(!version)throw new AuthorizationError("exact engagement link owner");
    if(link.status==="revoked")return {revoked:true};
    await tx.update(siteGoLinks).set({status:"revoked",updatedAt:new Date()})
      .where(eq(siteGoLinks.id,link.id));
    await writeAudit(tx,actor,{
      action:"engagement.go_link.revoke",entityType:"site_go_link",
      entityId:link.id,scope:{organizationId:record.organizationId,siteId:record.siteId},
      before:{status:link.status},after:{status:"revoked"},
    });
    return {revoked:true};
  }));

/**
 * Site-scoped, package-scoped engagement library. A saved published engagement
 * survives leaving the editor; only the verified Site operator can see it.
 * The JSON source is attribution, never a new authority grant.
 */
export const listSiteEngagementDefinitions=createServerFn({method:"GET"})
  .validator((input:unknown)=>z.object({
    siteId:uuid,packageId:uuid,
  }).strict().parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    await authorizeEngagementOwner({kind:"site",siteId:data.siteId},actor,false,db);
    const [pkg]=await db.select({id:siteMarketingPackages.id})
      .from(siteMarketingPackages).where(and(
        eq(siteMarketingPackages.id,data.packageId),
        eq(siteMarketingPackages.siteId,data.siteId),
      )).limit(1);
    if(!pkg)throw new DomainError("UNAVAILABLE","Outreach package unavailable.");
    const rows=await db.select({
      engagementId:engagementDefinitions.id,
      versionId:engagementDefinitionVersions.id,
      version:engagementDefinitionVersions.version,
      status:engagementDefinitions.status,
      publishedAt:engagementDefinitionVersions.publishedAt,
      content:engagementDefinitionVersions.content,
    }).from(engagementDefinitions)
      .innerJoin(engagementDefinitionVersions,
        eq(engagementDefinitionVersions.engagementId,engagementDefinitions.id))
      .where(and(
        eq(engagementDefinitions.ownerKind,"site"),
        eq(engagementDefinitions.siteId,data.siteId),
        eq(sql<string>`${engagementDefinitionVersions.content} #>> '{source,marketingPackageId}'`,data.packageId),
      ))
      .orderBy(desc(engagementDefinitionVersions.publishedAt))
      .limit(100);
    return rows.flatMap(row=>{
      const parsed=engagementDefinitionSchema.safeParse(row.content);
      if(!parsed.success)return [];
      return [{
        engagementId:row.engagementId,versionId:row.versionId,
        version:row.version,status:row.status,
        headline:parsed.data.presentation.headline,
        domain:parsed.data.domain,
        mode:parsed.data.execution.mode,
        publishedAt:row.publishedAt.toISOString(),
      }];
    });
  });

/** Distribution is a separately authorized action. Build only from an exact
 * saved email-channel link and its immutable definition. No provider send,
 * recipient list, delivery claim or additional visit is produced by this GET. */
export const prepareEngagementEmailDraft=createServerFn({method:"GET"})
  .validator((input:unknown)=>linkInput.parse(input))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    const record=await authorizedDefinition(data.engagementId,actor,true,db);
    assertCapability(actor,"communication.send");
    if(record.status!=="active")throw new DomainError("UNAVAILABLE","Engagement is retired.");
    const [link]=await db.select().from(siteGoLinks).where(eq(siteGoLinks.id,data.linkId)).limit(1);
    if(!link?.engagementVersionId||link.channel!=="email"||
       link.organizationId!==record.organizationId||link.siteId!==record.siteId)
      throw new AuthorizationError("exact email-channel engagement link");
    const [version]=await db.select().from(engagementDefinitionVersions).where(and(
      eq(engagementDefinitionVersions.id,link.engagementVersionId),
      eq(engagementDefinitionVersions.engagementId,record.id))).limit(1);
    if(!version)throw new AuthorizationError("exact published engagement version");
    const definition=engagementDefinitionSchema.parse(version.content);
    const experience=await resolveGoExperience(link.code,"/",false);
    if(!experience||experience.mode==="website-preview")
      throw new DomainError("UNAVAILABLE","The invitation destination is no longer available.");
    const origin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    if(!origin)throw new DomainError("UNAVAILABLE","Approved public sharing origin is not configured.");
    return buildEngagementInvitation(definition,link.code,origin);
  });
