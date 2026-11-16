import { and, asc, eq, inArray, isNotNull, notExists } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassSurveyCampaigns, surveyCampaigns,
  surveyDefinitions, surveyVersions, surveyInvitations, surveyResponses,
  evidenceDocumentVersions, auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { validateClassAuthority } from "./unified-class.functions";

const uuid=z.string().uuid();
const select=z.object({classId:uuid}).strict();
const link=select.extend({campaignId:uuid}).strict();
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An independently operated Site can associate an already approved
 * *local* identified campaign with its own Class. It never acquires
 * rights to edit the publisher's Survey version or another Site's replies.
 */
async function authorizeClassSurveyOperator(tx:Tx,classId:string){
  if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
    throw new AuthorizationError("native Class release not activated");
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCanonicalCommandContext(getRequest());
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
    throw new AuthorizationError("current Class survey registrar");
  assertCapability(actor,"class.manage");
  const organizationId=actor.scope.organizationIds?.[0];
  if(!organizationId||actor.scope.organizationIds?.length!==1)
    throw new AuthorizationError("exact active operator organization");
  const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,classId)).limit(1);
  if(!cls||cls.operatingOrganizationId!==organizationId||
    !["approved","active"].includes(cls.state)||
    (cls.siteId?!actor.scope.siteIds?.includes(cls.siteId):
     cls.createdByPersonId!==actor.actorPersonId))
    throw new AuthorizationError("exact governed Class and Site");
  await validateClassAuthority(tx,{actor,organizationId,
    siteIds:actor.scope.siteIds??[]},{
    deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
    offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
    operatingOrganizationId:organizationId,siteId:cls.siteId,
    title:cls.title,deliveryMode:cls.deliveryMode,
  });
  return {actor,cls,organizationId};
}

async function eligibleCampaign(tx:Tx,classId:string,organizationId:string,
  deploymentId:string,campaignId:string){
  const [row]=await tx.select({
    campaign:surveyCampaigns,title:surveyDefinitions.title,
    version:surveyVersions.lifecycle,
  }).from(surveyCampaigns)
    .innerJoin(surveyVersions,eq(surveyVersions.id,surveyCampaigns.surveyVersionId))
    .innerJoin(surveyDefinitions,eq(surveyDefinitions.id,surveyVersions.surveyId))
    .where(and(
      eq(surveyCampaigns.id,campaignId),
      eq(surveyCampaigns.deploymentId,deploymentId),
      eq(surveyCampaigns.operatingOrganizationId,organizationId),
      eq(surveyCampaigns.responseMode,"identified"),
      inArray(surveyCampaigns.status,["scheduled","active"]),
      eq(surveyVersions.lifecycle,"published"),
      eq(surveyDefinitions.status,"active"),
      inArray(surveyDefinitions.intendedAudience,["learner","any"]),
      isNotNull(surveyCampaigns.surveyPermissionEvidenceId),
    )).limit(1);
  if(!row)throw new AuthorizationError("approved matching local Class survey campaign");
  const now=new Date(),today=now.toISOString().slice(0,10);
  const [permission]=await tx.select().from(evidenceDocumentVersions)
    .where(eq(evidenceDocumentVersions.id,row.campaign.surveyPermissionEvidenceId!)).limit(1);
  if(!permission||!permission.verifiedAt||!permission.verifiedByPersonId||
      permission.verifiedAt>now||
      (permission.validFrom&&permission.validFrom>today)||
      (permission.validThrough&&permission.validThrough<today))
    throw new AuthorizationError("current verified identified-survey permission");
  const [existing]=await tx.select().from(canonicalClassSurveyCampaigns)
    .where(eq(canonicalClassSurveyCampaigns.campaignId,campaignId)).limit(1);
  if(existing&&existing.classId!==classId)
    throw new AuthorizationError("survey campaign already belongs to another Class");
  return {row,existing};
}

export const getNativeClassSurveyCampaignOptions=createServerFn({method:"GET"})
  .validator((raw:unknown)=>select.parse(raw))
  .handler(async({data})=>db.transaction(async tx=>{
    const {cls,organizationId}=await authorizeClassSurveyOperator(tx,data.classId);
    const rows=await tx.select({
      campaignId:surveyCampaigns.id,title:surveyDefinitions.title,
      status:surveyCampaigns.status,
      classId:canonicalClassSurveyCampaigns.classId,
    }).from(surveyCampaigns)
      .innerJoin(surveyVersions,eq(surveyVersions.id,surveyCampaigns.surveyVersionId))
      .innerJoin(surveyDefinitions,eq(surveyDefinitions.id,surveyVersions.surveyId))
      .leftJoin(canonicalClassSurveyCampaigns,
        eq(canonicalClassSurveyCampaigns.campaignId,surveyCampaigns.id))
      .where(and(
        eq(surveyCampaigns.deploymentId,cls.deploymentId),
        eq(surveyCampaigns.operatingOrganizationId,organizationId),
        eq(surveyCampaigns.responseMode,"identified"),
        inArray(surveyCampaigns.status,["scheduled","active"]),
        eq(surveyVersions.lifecycle,"published"),
        eq(surveyDefinitions.status,"active"),
        inArray(surveyDefinitions.intendedAudience,["learner","any"]),
        isNotNull(surveyCampaigns.surveyPermissionEvidenceId),
      )).orderBy(asc(surveyDefinitions.title)).limit(101);
    if(rows.length>100)throw new AuthorizationError("Class survey campaign choices require pagination");
    const candidates=[];
    for(const row of rows){
      if(row.classId&&row.classId!==cls.id)continue;
      try{
        await eligibleCampaign(tx,cls.id,organizationId,cls.deploymentId,row.campaignId);
        const [sent]=await tx.select({id:surveyInvitations.id}).from(surveyInvitations)
          .where(eq(surveyInvitations.campaignId,row.campaignId)).limit(1);
        if(sent&&!row.classId)continue;
        const [response]=await tx.select({id:surveyResponses.id}).from(surveyResponses)
          .where(eq(surveyResponses.campaignId,row.campaignId)).limit(1);
        if(response&&!row.classId)continue;
        candidates.push({campaignId:row.campaignId,title:row.title,
          status:row.status,linked:row.classId===cls.id});
      }catch(error){if(!(error instanceof AuthorizationError))throw error;}
    }
    return {campaigns:candidates,linked:candidates.filter(c=>c.linked).length};
  }));

export const linkNativeClassSurveyCampaign=createServerFn({method:"POST"})
  .validator((raw:unknown)=>link.parse(raw))
  .handler(async({data})=>db.transaction(async tx=>{
    const {actor,cls,organizationId}=await authorizeClassSurveyOperator(tx,data.classId);
    const {existing}=await eligibleCampaign(tx,cls.id,organizationId,
      cls.deploymentId,data.campaignId);
    await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
    if(existing)return {campaignId:existing.campaignId,alreadyLinked:true};
    const [sent]=await tx.select({id:surveyInvitations.id}).from(surveyInvitations)
      .where(eq(surveyInvitations.campaignId,data.campaignId)).limit(1);
    const [response]=await tx.select({id:surveyResponses.id}).from(surveyResponses)
      .where(eq(surveyResponses.campaignId,data.campaignId)).limit(1);
    if(sent||response)throw new AuthorizationError("link the Class before inviting survey participants");
    await tx.insert(canonicalClassSurveyCampaigns).values({
      classId:cls.id,campaignId:data.campaignId,
      linkedByPersonId:actor.actorPersonId!,
    });
    const payload={classId:cls.id,siteId:cls.siteId,
      deploymentId:cls.deploymentId,campaignId:data.campaignId};
    await tx.insert(auditEvents).values({
      actorPersonId:actor.actorPersonId!,owningOrganizationId:organizationId,
      eventCode:"class.survey_campaign.linked",entityKind:"survey_campaign",
      entityId:data.campaignId,payload,
    });
    await tx.insert(domainEvents).values({
      actorPersonId:actor.actorPersonId!,eventType:"ClassSurveyCampaignLinked",
      aggregateType:"survey_campaign",aggregateId:data.campaignId,payload,
    });
    return {campaignId:data.campaignId,alreadyLinked:false};
  }));
