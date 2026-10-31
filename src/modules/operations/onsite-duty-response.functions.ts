import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import {
  isOnsiteDutySubstitution, selectAuthorizedOnsiteDuty, resolveOnsiteDutyRetry, summarizeNamedDutyResponses,
} from "@/domain/onsite-duty-policy";
import { siteDate } from "@/domain/expected-attendance";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  getOnsiteSupervisionPlan, loadOnsiteSupervisionPlanForActor,
  type OnsiteOperationalSupervisionPlan,
} from "./onsite-supervision.functions";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import {
  currentSiteDirectorPersonId, requireCurrentSiteLocalDelegate,
} from "./site-local-delegation.server";
import { requireCurrentSectionFacilitator } from "./site-section-facilitators.server";
import { requireCurrentOnsiteAdultSafety } from "./onsite-block-safety.server";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";

const dutyType = "onsite_instruction_duty_response";
const gapActionType = "onsite_coverage_gap";
const daySchema = z.object({
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
    const stamp=new Date(value+"T12:00:00Z");
    return Number.isFinite(stamp.getTime())&&stamp.toISOString().slice(0,10)===value;
  }),
}).strict();
const respondSchema = daySchema.extend({
  sectionId:z.string().uuid(),periodId:z.string().uuid(),
  response:z.enum(["accepted","cannot_cover"]),
  // This is staff-only operational availability, not a child or medical case.
  reason:z.enum(["schedule_conflict","unavailable","other"]).optional(),
  confirmed:z.literal(true),
}).strict();

async function currentActorSite() {
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  assertOnsiteAttendanceScope(actor);
  const [site]=await db.select({id:sites.id,timezone:sites.timezone,
    organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,actor.grantSiteId!)).limit(1);
  if(!site||!actor.scope.organizationIds?.includes(site.organizationId))
    throw new AuthorizationError("active original onsite staff site");
  return {actor,site};
}

/** Internal projection for callers that already authorized this actor and Site. */
export const loadOnsiteDutyResponsesForActor=createServerOnlyFn(async (actor:AccessContext,site:{
  id:string;timezone:string;organizationId:string;
},data:{date:string},currentPlan?:OnsiteOperationalSupervisionPlan)=>{
    const plan=currentPlan??await loadOnsiteSupervisionPlanForActor(actor,{
      date:data.date,siteId:site.id,
    });
    if(plan.siteId!==site.id)
      throw new AuthorizationError("site duty scope");
    // Keep safety-relevant "cannot cover" available; show affirmative
    // acceptance only with a current named local facilitator delegation.
    const canAcceptPrograms = new Map<string, boolean>();
    const canAcceptSections = new Map<string, boolean>();
    if (actor.role === "site_leader") {
      for (const programId of new Set(plan.blocks.map(block => block.programId))) {
        try {
          await requireCurrentSiteLocalDelegate(db, actor, programId, "site_director");
          canAcceptPrograms.set(programId, true);
        } catch (error) {
          if (!(error instanceof AuthorizationError)) throw error;
          canAcceptPrograms.set(programId, false);
        }
      }
    } else if (actor.role === "room_facilitator") {
      for (const block of plan.blocks) {
        if (canAcceptSections.has(block.sectionId)) continue;
        try {
          await requireCurrentSectionFacilitator(db, actor, block.programId, block.sectionId);
          canAcceptSections.set(block.sectionId, true);
        } catch (error) {
          if (!(error instanceof AuthorizationError)) throw error;
          canAcceptSections.set(block.sectionId, false);
        }
      }
    }
    // Never describe capped or incomplete coverage as fully acknowledged.
    const rows=await db.select({id:actions.id,sectionId:actions.sectionId,
      ownerPersonId:actions.ownerPersonId,metadata:actions.metadata,
      createdAt:actions.createdAt})
      .from(actions).where(and(
        eq(actions.type,dutyType),eq(actions.siteId,site.id),
        eq(actions.subjectType,"section"),
        sql`${actions.metadata}->>'date' = ${data.date}`))
      .orderBy(desc(actions.createdAt),desc(actions.id)).limit(501);
    const truncated=rows.length>500;
    const statuses=plan.blocks.map(block=>{
      const currentlyAuthorized = actor.role === "room_facilitator"
        ? canAcceptSections.get(block.sectionId) === true
        : actor.role === "site_leader"
        ? canAcceptPrograms.get(block.programId) === true : true;
      const exactRecords=!truncated&&block.verifiedSiteStaffGrant?rows.filter(row=>
        row.sectionId===block.sectionId&&row.metadata.periodId===block.periodId&&row.metadata.planToken===block.planToken):[];
      const duty=summarizeNamedDutyResponses({primaryPersonId:block.facilitatorPersonId,
        backupPersonId:block.backupPersonId,requiresBackup:block.requiresSectionDelegation===true,
        actorPersonId:actor.actorPersonId},exactRecords);
      const record=exactRecords.find(row=>row.ownerPersonId===actor.actorPersonId);
      const substitution=!truncated&&rows.some(row=>
        isOnsiteDutySubstitution(block,row));
      return {
        sectionId:block.sectionId,periodId:block.periodId,
        substitution,
        canRespond:block.canRespond&&!truncated,
        canAccept:block.canAccept&&!truncated &&
          (actor.role === "room_facilitator"
            ? canAcceptSections.get(block.sectionId) === true
            : actor.role === "site_leader"
            ? canAcceptPrograms.get(block.programId) === true : true),
        ...duty,
        status:duty.status==="accepted"&&!currentlyAuthorized?"stale_after_delegation" as const:duty.status,
        respondedAt:record?.createdAt.toISOString()??null,
        isOwnResponse:record?.ownerPersonId===actor.actorPersonId,
      };
    });
    return {
      siteId:site.id,date:data.date,
      statuses,
      // A still-unresolved room or backup plan must not hide an otherwise
      // legitimate adult availability response from the site's work queue.
      // Only real instructional blocks with named authorized adults count;
      // they are not physical-coverage confirmations.
      unacknowledged:statuses.filter((row,index)=>
        (row.status==="not_reported" || row.status==="stale_after_delegation") &&
        plan.blocks[index]?.instructionalDayConfirmed===true &&
        plan.blocks[index]?.periodId!==null &&
        plan.blocks[index]?.verifiedSiteStaffGrant===true &&
        plan.blocks[index]?.verifiedSectionDelegation===true &&
        plan.blocks[index]?.authorizedSupervisionService===true).length,
      coverageExceptions:statuses.filter(row=>row.status==="cannot_cover" ||
        row.status==="stale_after_delegation").length,
      truncated:truncated||plan.projectionTruncated,
      note:"An acknowledgment records one assigned adult's stated availability for a scheduled block, not verified physical presence, room supervision, child custody, or an accepted handoff. Contact the site lead directly for coverage gaps.",
    };
});

/** The current plan and current actor determine what may be acknowledged. */
export const getOnsiteDutyResponses = createServerFn({method:"GET"})
  .validator((value:unknown)=>daySchema.parse(value))
  .handler(async({data})=>{
    const {actor,site}=await currentActorSite();
    return loadOnsiteDutyResponsesForActor(actor,site,data);
  });

/**
 * One immutable, audited staff response per exact live duty assignment.
 * A declined duty is not automatically reassigned; a new verified assignment
 * creates a different fingerprint. Staff cannot self-assign to another class.
 */
export const respondToOnsiteDuty = createServerFn({method:"POST"})
  .validator((value:unknown)=>respondSchema.parse(value))
  .handler(async({data})=>{
    const {actor,site}=await currentActorSite();
    const today=siteDate(new Date(),site.timezone);
    if(data.date!==today)throw new AuthorizationError("only today's scheduled duty can be answered");
    if(data.response==="cannot_cover"&&!data.reason)
      throw new Error("Select a non-sensitive coverage exception reason");
    if(data.response==="accepted"&&data.reason)
      throw new Error("An accepted duty cannot have an unavailable reason");

    const plan=await getOnsiteSupervisionPlan({data:{date:data.date}});
    const block=selectAuthorizedOnsiteDuty({
      siteMatches:plan.siteId===site.id,projectionTruncated:plan.projectionTruncated,
      scopedProgramIds:actor.scope.programIds??[],
      sectionId:data.sectionId,periodId:data.periodId,response:data.response,
    },plan.blocks);
    const key=[site.id,data.date,data.sectionId,data.periodId,block.planToken].join(":");
    return db.transaction(async tx=>{
      // An affirmative new CAN onsite duty needs a current service agreement.
      // Preserve an assigned adult's ability to report *cannot cover* even
      // after expiry/revocation: suppressing a safety-relevant exception is
      // worse than retaining an accurate operational warning. Neither result
      // certifies child custody or physical presence.
      if (data.response === "accepted") {
        // Serialize a current affirmative duty response against revocation.
        if (actor.role === "room_facilitator" || actor.role === "site_leader") {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + block.programId}))`);
          if (actor.role === "site_leader")
            await requireCurrentSiteLocalDelegate(tx, actor, block.programId, "site_director");
          else
            await requireCurrentSectionFacilitator(tx, actor, block.programId, block.sectionId);
        }
        // A Site role and an instructional plan do not themselves delegate
        // authority to accept onsite coverage for a church/CAN Program.
        await requireChurchHostedOperatingServices(tx, block.programId, ["onsite_supervision"]);
        if (block.requiresSectionDelegation) {
          if(!actor.actorPersonId)
            throw new AuthorizationError("verified named onsite duty adult");
          await requireCurrentOnsiteAdultSafety(tx,{
            personId:actor.actorPersonId,
            date:data.date,timeZone:site.timezone,
            startsAtLocal:block.startsAtLocal,endsAtLocal:block.endsAtLocal,
          });
        }
      }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"onsite-duty:"+key}))`);
      const [prior]=await tx.select({id:actions.id,metadata:actions.metadata})
        .from(actions).where(and(eq(actions.type,dutyType),eq(actions.siteId,site.id),
          eq(actions.sectionId,data.sectionId),eq(actions.subjectType,"section"),
          eq(actions.subjectId,data.sectionId),eq(actions.ownerPersonId,actor.actorPersonId!),
          sql`${actions.metadata}->>'date' = ${data.date}`,
          sql`${actions.metadata}->>'periodId' = ${data.periodId}`,
          sql`${actions.metadata}->>'planToken' = ${block.planToken}`))
        .orderBy(desc(actions.createdAt),desc(actions.id)).limit(1);
      const retry=resolveOnsiteDutyRetry(prior?{
        id:prior.id,response:prior.metadata.response,reason:prior.metadata.reason,
      }:null,{response:data.response,reason:data.reason});
      if(retry)return retry;
      const [record]=await tx.insert(actions).values({
        type:dutyType,status:"resolved",
        priority:data.response==="cannot_cover"?"high":"normal",
        title:"Onsite instructional duty response for "+data.date,
        description:null,
        subjectType:"section",subjectId:data.sectionId,
        organizationId:site.organizationId,siteId:site.id,
        programId:block.programId,sectionId:data.sectionId,
        ownerPersonId:actor.actorPersonId,resolvedAt:new Date(),
        metadata:{
          date:data.date,periodId:data.periodId,planToken:block.planToken,dutyRole:block.ownDutyRole??"primary",
          response:data.response,
          ...(data.reason?{reason:data.reason}:{}),
          scope:"staff_availability_only",
        },
        resolutionNote:null,
      }).returning({id:actions.id});
      if(!record)throw new Error("Could not save onsite duty response");
      // A reported coverage failure is an actionable operating exception.
      // The exact scheduled block and current plan own the follow-up; another
      // period or a statement of availability cannot establish safe coverage.
      let coverageGapActionId:string|null=null;
      if (data.response === "cannot_cover") {
        const [existingGap]=await tx.select({id:actions.id}).from(actions).where(and(
          eq(actions.type,gapActionType),eq(actions.status,"open"),
          eq(actions.siteId,site.id),eq(actions.programId,block.programId),
          eq(actions.sectionId,data.sectionId),
          sql`${actions.metadata}->>'date' = ${data.date}`,
          sql`${actions.metadata}->>'periodId' = ${data.periodId}`,
          sql`${actions.metadata}->>'planToken' = ${block.planToken}`,
        )).limit(1);
        if (existingGap) {
          coverageGapActionId=existingGap.id;
        } else {
          const ownerPersonId=await currentSiteDirectorPersonId(tx,block.programId);
          const [gap]=await tx.insert(actions).values({
            type:gapActionType,status:"open",priority:ownerPersonId?"high":"urgent",
            title:(ownerPersonId?"Coverage gap":"Unassigned coverage escalation")+" for scheduled onsite block on "+data.date,
            description:"The assigned adult reported they cannot cover this scheduled block. Arrange a verified replacement and confirm the reviewed room, backup and qualification plan still holds."+
              (ownerPersonId?"":" No eligible current site director can receive this Action. The host registrar must appoint an eligible local director and assign this unresolved follow-up."),
            subjectType:"section",subjectId:data.sectionId,
            organizationId:site.organizationId,siteId:site.id,
            programId:block.programId,sectionId:data.sectionId,
            ownerPersonId,
            metadata:{date:data.date,periodId:data.periodId,planToken:block.planToken,responseId:record.id,
              reason:data.reason??null,ownerEscalation:ownerPersonId===null},
          }).returning({id:actions.id});
          if(!gap)throw new Error("Could not create coverage gap follow-up");
          coverageGapActionId=gap.id;
          const gapEventId=await emitEvent(tx,{
            eventType:EventTypes.ActionCreated,
            aggregateType:"action",aggregateId:gap.id,
            actorPersonId:actor.actorPersonId,
            organizationId:site.organizationId,siteId:site.id,programId:block.programId,
            payload:{type:gapActionType,sectionId:data.sectionId,date:data.date,
              periodId:data.periodId,planToken:block.planToken,ownerPersonId,responseId:record.id,
              ownerEscalation:ownerPersonId===null},
          });
          if (ownerPersonId && ownerPersonId!==actor.actorPersonId) {
            await notifyMany(tx,[{
              recipientPersonId:ownerPersonId,
              type:"onsite_coverage_gap_assigned",
              title:"Scheduled block coverage gap needs your action",
              body:"An assigned adult reported they cannot cover a scheduled block at your site. Arrange verified replacement coverage in the supervision workspace.",
              resourceType:"action",resourceId:gap.id,eventId:gapEventId,
            }]);
          }
        }
      }
      // Accepted duty is availability, not proof of the reviewed room,
      // primary/backup staffing, current grants, safety evidence or physical
      // arrival. Preserve the accountable gap until investigated resolution
      // through resolveOwnedSiteOperationalAction; never bulk-close it here.
      await writeAudit(tx,actor,{
        action:"onsite.instruction_duty.responded",
        entityType:"action",entityId:record.id,
        scope:{organizationId:site.organizationId,siteId:site.id,
          programId:block.programId,sectionId:data.sectionId},
        after:{date:data.date,periodId:data.periodId,response:data.response,
          ...(data.reason?{reason:data.reason}:{}),planToken:block.planToken,
          coverageGapActionId},
      });
      return {responseId:record.id,created:true,response:data.response,coverageGapActionId};
    });
  });
