import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getOnsiteSupervisionPlan } from "./onsite-supervision.functions";
import { writeAudit } from "@/platform/mutation";

const dutyType = "onsite_instruction_duty_response";
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

/** The current plan and current actor determine what may be acknowledged.
 * No request-supplied staff member, program, room or site is trusted. */
export const getOnsiteDutyResponses = createServerFn({method:"GET"})
  .validator((value:unknown)=>daySchema.parse(value))
  .handler(async({data})=>{
    const {actor,site}=await currentActorSite();
    const plan=await getOnsiteSupervisionPlan({data:{date:data.date}});
    if(plan.siteId!==site.id)
      throw new AuthorizationError("site duty scope");
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
      const record=!truncated&&block.verifiedSiteStaffGrant
        ? rows.find(row=>row.sectionId===block.sectionId&&
          row.metadata.periodId===block.periodId&&
          row.metadata.planToken===block.planToken&&
          (row.metadata.response==="accepted"||row.metadata.response==="cannot_cover"))
        :undefined;
      return {
        sectionId:block.sectionId,periodId:block.periodId,
        canRespond:block.canRespond&&!truncated,
        canAccept:block.canAccept&&!truncated,
        status:record?.metadata.response==="accepted"?"accepted" as const:
          record?.metadata.response==="cannot_cover"?"cannot_cover" as const:
          "not_reported" as const,
        respondedAt:record?.createdAt.toISOString()??null,
        isOwnResponse:record?.ownerPersonId===actor.actorPersonId,
      };
    });
    return {
      siteId:site.id,date:data.date,
      statuses,
      unacknowledged:statuses.filter(row=>row.status==="not_reported").length,
      coverageExceptions:statuses.filter(row=>row.status==="cannot_cover").length,
      truncated:truncated||plan.projectionTruncated,
      note:"An acknowledgment records one assigned adult's stated availability for a scheduled block, not verified physical presence, room supervision, child custody, or an accepted handoff. Contact the site lead directly for coverage gaps.",
    };
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
    const block=plan.blocks.find(row=>row.sectionId===data.sectionId&&row.periodId===data.periodId);
    if(plan.siteId!==site.id||plan.projectionTruncated||!block||
      !block.canRespond||(data.response==="accepted"&&!block.canAccept))
      throw new AuthorizationError("currently assigned, unconflicted onsite instructional duty");
    if(!actor.scope.programIds?.includes(block.programId))
      throw new AuthorizationError("current program assignment");
    const key=[site.id,data.date,data.sectionId,data.periodId,block.planToken].join(":");
    return db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"onsite-duty:"+key}))`);
      const [prior]=await tx.select({id:actions.id,metadata:actions.metadata})
        .from(actions).where(and(eq(actions.type,dutyType),eq(actions.siteId,site.id),
          eq(actions.sectionId,data.sectionId),eq(actions.subjectType,"section"),
          eq(actions.subjectId,data.sectionId),
          sql`${actions.metadata}->>'date' = ${data.date}`,
          sql`${actions.metadata}->>'periodId' = ${data.periodId}`,
          sql`${actions.metadata}->>'planToken' = ${block.planToken}`))
        .orderBy(desc(actions.createdAt),desc(actions.id)).limit(1);
      if(prior){
        if(prior.metadata.response===data.response)
          return {responseId:prior.id,created:false,response:data.response};
        throw new AuthorizationError("duty already answered; ask site lead to amend assignment");
      }
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
          date:data.date,periodId:data.periodId,planToken:block.planToken,
          response:data.response,
          ...(data.reason?{reason:data.reason}:{}),
          scope:"staff_availability_only",
        },
        resolutionNote:null,
      }).returning({id:actions.id});
      if(!record)throw new Error("Could not save onsite duty response");
      await writeAudit(tx,actor,{
        action:"onsite.instruction_duty.responded",
        entityType:"action",entityId:record.id,
        scope:{organizationId:site.organizationId,siteId:site.id,
          programId:block.programId,sectionId:data.sectionId},
        after:{date:data.date,periodId:data.periodId,response:data.response,
          ...(data.reason?{reason:data.reason}:{}),planToken:block.planToken},
      });
      return {responseId:record.id,created:true,response:data.response};
    });
  });
