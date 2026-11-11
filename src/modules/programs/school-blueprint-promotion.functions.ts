import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  activities, programs, sites, siteBlueprints, siteBlueprintRevisions, siteProgramPlans,
  siteBlueprintItems, siteBlueprintApprovedVersions, siteBlueprintApprovalDecisions,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { assertBlueprintApprovedForPreparation, blueprintOperationalProgramType } from "@/domain/blueprint-operational-readiness";
import type { ApprovedBlueprintSnapshot, BlueprintApprovedDecision } from "@/domain/blueprint-operational-readiness";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const linkProgram=z.object({
  siteId:uuid,planId:uuid,programId:uuid,expectedRevision:z.number().int().min(1),
}).strict();
const prepareActivity=z.object({
  siteId:uuid,itemId:uuid,expectedRevision:z.number().int().min(1),
  programId:uuid.nullable(),
}).strict();
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

async function authorizedSite(tx:Tx,actor:AccessContext,siteId:string){
  if(!hasRegistrarAuthority(actor.role)||!actor.actorPersonId)
    throw new AuthorizationError("verified school registrar");
  const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,siteId)).for("update").limit(1);
  if(!site || !actor.scope.siteIds?.includes(site.id) ||
     !actor.scope.organizationIds?.includes(site.organizationId))
    throw new AuthorizationError("authorized school Site and Organization");
  return site;
}

async function currentApproved(tx:Tx,siteId:string,
  subjectKind:"program"|"item",subjectId:string){
  const [scope]=await tx.select().from(siteBlueprintApprovedVersions)
    .where(eq(siteBlueprintApprovedVersions.siteId,siteId))
    .orderBy(desc(siteBlueprintApprovedVersions.version)).limit(1);
  if(!scope)throw new DomainError("CONFLICT","CAN has not approved this School Blueprint.");
  const [decision]=await tx.select().from(siteBlueprintApprovalDecisions)
    .where(and(eq(siteBlueprintApprovalDecisions.approvalVersionId,scope.id),
      eq(siteBlueprintApprovalDecisions.subjectKind,subjectKind),
      eq(siteBlueprintApprovalDecisions.subjectId,subjectId))).limit(1);
  return {scope,decision};
}
async function bumpBlueprint(tx:Tx,actor:AccessContext,site:{id:string;organizationId:string},
  expectedRevision:number,change:Record<string,unknown>){
  const [head]=await tx.select().from(siteBlueprints)
    .where(eq(siteBlueprints.siteId,site.id)).limit(1);
  if(!head || head.currentRevision!==expectedRevision)
    throw new DomainError("CONFLICT","The School Blueprint changed. Refresh before preparing this offering.");
  const [programPlans,itemPlans]=await Promise.all([
    tx.select().from(siteProgramPlans).where(and(eq(siteProgramPlans.siteId,site.id),
      ne(siteProgramPlans.status,"retired"))),
    tx.select().from(siteBlueprintItems).where(and(eq(siteBlueprintItems.siteId,site.id),
      ne(siteBlueprintItems.status,"retired"))),
  ]);
  const revision=expectedRevision+1;
  await tx.insert(siteBlueprintRevisions).values({
    siteId:site.id,revision,schemaVersion:1,
    snapshot:{
      identity:{religiousAffiliationCode:head.religiousAffiliationCode,
        editorialIdentity:head.editorialIdentity,culturalContext:head.culturalContext},
      programs:programPlans.map(p=>({
        id:p.id,siteId:p.siteId,catalogVersionId:p.catalogVersionId,
        name:p.name,kind:p.kind,gradeRange:p.gradeRange,deliveryModel:p.deliveryModel,
        religiousAffiliationCode:p.religiousAffiliationCode,status:p.status,revision:p.revision,
      })),
      items:itemPlans.map(i=>({
        id:i.id,siteId:i.siteId,programPlanId:i.programPlanId,catalogVersionId:i.catalogVersionId,
        kind:i.kind,title:i.title,summary:i.summary,configuration:i.configuration,
        status:i.status,revision:i.revision,
      })),
      change,
    },
    createdByPersonId:actor.actorPersonId!,
  });
  await tx.update(siteBlueprints).set({currentRevision:revision,
    updatedAt:new Date(),updatedByPersonId:actor.actorPersonId!})
    .where(eq(siteBlueprints.siteId,site.id));
  return revision;
}

/** Link the approved plan to the *existing* canonical launching Program.
 * Creation stays with the current registrar Wizard and its jurisdiction,
 * academic-provider, school-year and operating-agreement checks. */
export const linkApprovedBlueprintProgram=createServerFn({method:"POST"})
.validator((raw:unknown)=>linkProgram.parse(raw))
.handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  assertCapability(actor,"program.launch.start");
  return db.transaction(async tx=>{
    const site=await authorizedSite(tx,actor,data.siteId);
    const [plan]=await tx.select().from(siteProgramPlans).where(and(
      eq(siteProgramPlans.id,data.planId),eq(siteProgramPlans.siteId,site.id)))
      .for("update").limit(1);
    if(!plan||plan.status==="retired")
      throw new DomainError("CONFLICT","School Blueprint Program is unavailable.");
    if(plan.canonicalProgramId){
      if(plan.canonicalProgramId!==data.programId)
        throw new DomainError("CONFLICT","This approved plan is linked to a different Program.");
      return {programId:data.programId,changed:false};
    }
    const [program]=await tx.select().from(programs)
      .where(and(eq(programs.id,data.programId),eq(programs.siteId,site.id),
        eq(programs.organizationId,site.organizationId))).for("update").limit(1);
    if(!program || ["closed","paused"].includes(program.status))
      throw new DomainError("CONFLICT","Select a current Program belonging to this school.");
    const type=blueprintOperationalProgramType(plan.kind);
    if(!type || program.type!==type || program.name!==plan.name ||
       JSON.stringify(program.gradeRange)!==JSON.stringify(plan.gradeRange))
      throw new DomainError("VALIDATION_FAILED",
        "Program type, name and grade range must match the reviewed plan.");
    const {scope,decision}=await currentApproved(tx,site.id,"program",plan.id);
    assertBlueprintApprovedForPreparation({
      kind:"program",current:plan,approvedSnapshot:scope.approvedSnapshot as ApprovedBlueprintSnapshot,
      decision:decision as BlueprintApprovedDecision|undefined,
    });
    await tx.update(siteProgramPlans).set({
      canonicalProgramId:program.id,status:"linked",revision:plan.revision+1,updatedAt:new Date(),
    }).where(eq(siteProgramPlans.id,plan.id));
    const next=await bumpBlueprint(tx,actor,site,data.expectedRevision,{
      operation:"approved_program_linked",planId:plan.id,programId:program.id,
      canApprovalVersion:scope.version,
    });
    await writeAudit(tx,actor,{action:"school.blueprint.program.link",
      entityType:"site_program_plan",entityId:plan.id,
      scope:{organizationId:site.organizationId,siteId:site.id,programId:program.id},
      after:{canonicalProgramId:program.id,canApprovalVersion:scope.version}});
    await emitEvent(tx,{eventType:"SchoolBlueprintProgramPrepared",
      aggregateType:"SiteBlueprint",aggregateId:site.id,
      actorPersonId:actor.actorPersonId!,siteId:site.id,organizationId:site.organizationId,
      payload:{planId:plan.id,programId:program.id,canApprovalVersion:scope.version}});
    return {programId:program.id,changed:true,revision:next};
  });
});

/** Create a canonical Activity but intentionally no Season or registration.
 * A verified reviewer decision cannot, by itself, open an activity to students. */
export const prepareApprovedBlueprintActivity=createServerFn({method:"POST"})
.validator((raw:unknown)=>prepareActivity.parse(raw))
.handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  assertCapability(actor,"activity.manage");
  return db.transaction(async tx=>{
    const site=await authorizedSite(tx,actor,data.siteId);
    const [item]=await tx.select().from(siteBlueprintItems).where(and(
      eq(siteBlueprintItems.id,data.itemId),eq(siteBlueprintItems.siteId,site.id)))
      .for("update").limit(1);
    if(!item||item.status==="retired"||item.canonicalFieldTripId)
      throw new DomainError("CONFLICT","This planned experience is not eligible for Activity preparation.");
    if(item.canonicalActivityId)return {activityId:item.canonicalActivityId,changed:false};
    if(!["activity","club","community","experience"].includes(item.kind))
      throw new DomainError("VALIDATION_FAILED","This reference is not an Activity.");
    const [program]=data.programId?await tx.select().from(programs)
      .where(and(eq(programs.id,data.programId),eq(programs.siteId,site.id),
        eq(programs.organizationId,site.organizationId))).limit(1):[];
    if(data.programId && (!program || ["closed","paused"].includes(program.status)))
      throw new DomainError("VALIDATION_FAILED","Selected Program must belong to the same school.");
    const {scope,decision}=await currentApproved(tx,site.id,"item",item.id);
    assertBlueprintApprovedForPreparation({
      kind:"item",current:item,approvedSnapshot:scope.approvedSnapshot as ApprovedBlueprintSnapshot,
      decision:decision as BlueprintApprovedDecision|undefined,
    });
    const type=item.kind==="club"?"club":item.kind==="community"?"service":"other";
    const [activity]=await tx.insert(activities).values({
      siteId:site.id,programId:data.programId??null,type,name:item.title,status:"active",
      metadata:{sourceBlueprintItemId:item.id,canApprovalVersion:scope.version,
        preparationOnly:true,registrationAvailable:false},
    }).returning({id:activities.id});
    if(!activity)throw new Error("Unable to prepare CAN-approved Activity");
    await tx.update(siteBlueprintItems).set({
      canonicalActivityId:activity.id,status:"linked",revision:item.revision+1,updatedAt:new Date(),
    }).where(eq(siteBlueprintItems.id,item.id));
    const next=await bumpBlueprint(tx,actor,site,data.expectedRevision,{
      operation:"approved_activity_prepared",itemId:item.id,
      activityId:activity.id,canApprovalVersion:scope.version,
    });
    await writeAudit(tx,actor,{action:"school.blueprint.activity.prepare",
      entityType:"activity",entityId:activity.id,
      scope:{organizationId:site.organizationId,siteId:site.id,programId:data.programId??null},
      after:{sourceBlueprintItemId:item.id,status:"active",seasonsCreated:0,
        registrationAvailable:false,canApprovalVersion:scope.version}});
    await emitEvent(tx,{eventType:"SchoolBlueprintActivityPrepared",
      aggregateType:"SiteBlueprint",aggregateId:site.id,actorPersonId:actor.actorPersonId!,
      siteId:site.id,organizationId:site.organizationId,
      payload:{itemId:item.id,activityId:activity.id,canApprovalVersion:scope.version}});
    return {activityId:activity.id,changed:true,revision:next};
  });
});
