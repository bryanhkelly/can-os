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
import { writeAudit } from "@/platform/mutation";
import { getOnsiteSupervisionPlan } from "./onsite-supervision.functions";
import { requireCurrentSectionFacilitator } from "./site-section-facilitators.server";
import { requireCurrentSiteLocalDelegate } from "./site-local-delegation.server";
import { requireCurrentOnsiteAdultSafety } from "./onsite-block-safety.server";
import { fetchRoomPlanEvidence, parseVerifiedRoomPlan } from "./onsite-block-room-plan.server";
import { requireCurrentChurchSchoolOpening } from "./school-opening.server";

const presenceType="onsite_staff_presence_reported";
const witnessType="onsite_block_presence_witnessed";
const todaySchema=z.object({
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
const blockSchema=todaySchema.extend({
  sectionId:z.string().uuid(),periodId:z.string().uuid(),
}).strict();
const reportSchema=blockSchema.extend({physicallyPresent:z.literal(true)}).strict();
const witnessSchema=blockSchema.extend({
  witnessedBothAdults:z.literal(true),
}).strict();

async function schoolSite(){
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  assertOnsiteAttendanceScope(actor);
  const [site]=await db.select({
    id:sites.id,timezone:sites.timezone,organizationId:sites.organizationId,
  }).from(sites).where(eq(sites.id,actor.grantSiteId!)).limit(1);
  if(!site || !actor.scope.organizationIds?.includes(site.organizationId) ||
    !actor.actorPersonId || actor.demoFacilitator)
    throw new AuthorizationError("verified onsite school staff at original Site");
  return {actor,site};
}

function minutes(value:string|null):number|null{
  const match=/^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value??"");
  if(!match)return null;
  const n=Number(match[1])*60+Number(match[2]);
  return Number(match[1])<24 && Number(match[2])<60?n:null;
}

export function inPhysicalCheckInWindow(input:{
  now:Date;date:string;timezone:string;
  start:string|null;end:string|null;
}):boolean{
  const start=minutes(input.start),end=minutes(input.end);
  if(start===null || end===null || end<=start ||
     siteDate(input.now,input.timezone)!==input.date)return false;
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:input.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  }).formatToParts(input.now);
  const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const current=Number(fields.hour)*60+Number(fields.minute);
  return Number.isFinite(current) && current>=start-60 && current<end;
}

async function currentRoom(tx:Pick<typeof db,"select">,
  site:{id:string;timezone:string},
  block:{sectionId:string;programId:string;periodId:string|null;
    startsAtLocal:string|null;endsAtLocal:string|null;
    roomLabel?:string|null},
  date:string,
){
  if(!block.periodId || !block.startsAtLocal || !block.endsAtLocal)
    throw new AuthorizationError("scheduled onsite classroom block");
  const data=await fetchRoomPlanEvidence(tx,[block.sectionId]);
  if(data.truncated)throw new AuthorizationError("complete physical room plan evidence");
  const doc=data.rows.find(row=>row.metadata.periodId===block.periodId &&
    row.metadata.date===date);
  if(!doc)throw new AuthorizationError("current independently verified physical room plan");
  const parsed=parseVerifiedRoomPlan(doc,{
    date,siteId:site.id,programId:block.programId,
    sectionId:block.sectionId,periodId:block.periodId,
    timeZone:site.timezone,startsAtLocal:block.startsAtLocal,
    endsAtLocal:block.endsAtLocal,
  });
  if(!parsed || parsed.roomLabel!==block.roomLabel)
    throw new AuthorizationError("matching effective classroom room and backup plan");
  return parsed;
}

async function currentBlock(date:string,sectionId:string,periodId:string,
  siteId:string){
  const plan=await getOnsiteSupervisionPlan({data:{date}});
  if(plan.siteId!==siteId || plan.projectionTruncated)
    throw new AuthorizationError("complete original Site supervision plan");
  const block=plan.blocks.find(row=>row.sectionId===sectionId && row.periodId===periodId);
  if(!block || !block.requiresSectionDelegation || !block.assignedPlan ||
     !block.planToken)throw new AuthorizationError("fully planned church/CAN instructional block");
  return block;
}

/** Reporter is authenticated primary or backup. This remains a truthful
 * self-report until a separate authorized onsite Site director witnesses it.
 * Never substitute this for student custody or actual headcount.
 */
export const reportOnsitePhysicalPresence=createServerFn({method:"POST"})
  .validator((v:unknown)=>reportSchema.parse(v))
  .handler(async({data})=>{
    const {actor,site}=await schoolSite();
    if(actor.role!=="room_facilitator")
      throw new AuthorizationError("verified classroom adult presence reporter");
    const block=await currentBlock(data.date,data.sectionId,data.periodId,site.id);
    if(!block.canCheckIn || !inPhysicalCheckInWindow({
      now:new Date(),date:data.date,timezone:site.timezone,
      start:block.startsAtLocal,end:block.endsAtLocal,
    }))throw new AuthorizationError("own current scheduled in-person arrival window");
    return db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"onsite-presence:"+site.id+":"+data.date+":"+data.sectionId+":"+data.periodId}))`);
      await requireCurrentChurchSchoolOpening(tx,block.programId);
      await requireCurrentSectionFacilitator(tx,actor,block.programId,block.sectionId);
      await requireCurrentOnsiteAdultSafety(tx,{
        personId:actor.actorPersonId!,date:data.date,timeZone:site.timezone,
        startsAtLocal:block.startsAtLocal,endsAtLocal:block.endsAtLocal,
      });
      const room=await currentRoom(tx,site,block,data.date);
      const role=room.primaryPersonId===actor.actorPersonId?"primary":
        room.backupPersonId===actor.actorPersonId?"backup":null;
      if(!role)throw new AuthorizationError("exact verified room roster adult");
      const [prior]=await tx.select({id:actions.id}).from(actions)
        .where(and(eq(actions.type,presenceType),eq(actions.siteId,site.id),
          eq(actions.sectionId,block.sectionId),eq(actions.ownerPersonId,actor.actorPersonId!),
          sql`${actions.metadata}->>'date' = ${data.date}`,
          sql`${actions.metadata}->>'periodId' = ${data.periodId}`,
          sql`${actions.metadata}->>'planToken' = ${block.planToken}`))
        .orderBy(desc(actions.createdAt)).limit(1);
      if(prior)return {reportId:prior.id,created:false as const};
      const [record]=await tx.insert(actions).values({
        type:presenceType,status:"resolved",priority:"normal",
        title:"Staff member reports physical arrival at scheduled room",
        description:null,subjectType:"section",subjectId:block.sectionId,
        organizationId:site.organizationId,siteId:site.id,
        programId:block.programId,sectionId:block.sectionId,
        ownerPersonId:actor.actorPersonId,resolvedAt:new Date(),
        metadata:{date:data.date,periodId:data.periodId,
          planToken:block.planToken,roomEvidenceId:room.id,
          role,physicallyPresent:true,scope:"self_attested_presence_only"},
      }).returning({id:actions.id});
      if(!record)throw new Error("Unable to record named staff arrival");
      await writeAudit(tx,actor,{
        action:"onsite.staff.presence_reported",entityType:"action",entityId:record.id,
        scope:{organizationId:site.organizationId,siteId:site.id,
          programId:block.programId,sectionId:block.sectionId},
        after:{date:data.date,periodId:data.periodId,role,roomEvidenceId:room.id},
      });
      return {reportId:record.id,created:true as const};
    });
  });

/** Only an independently appointed Site director can verify seeing both
 * named adults, with fresh original individual reports and a current opening
 * authorization. Records human witnessing, NOT automated location proof.
 */
export const witnessOnsiteBlockPresence=createServerFn({method:"POST"})
  .validator((v:unknown)=>witnessSchema.parse(v))
  .handler(async({data})=>{
    const {actor,site}=await schoolSite();
    if(actor.role!=="site_leader")
      throw new AuthorizationError("site director's witnessed adult presence");
    const block=await currentBlock(data.date,data.sectionId,data.periodId,site.id);
    if(!inPhysicalCheckInWindow({
      now:new Date(),date:data.date,timezone:site.timezone,
      start:block.startsAtLocal,end:block.endsAtLocal,
    }))throw new AuthorizationError("current supervised school block");
    return db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"onsite-presence:"+site.id+":"+data.date+":"+data.sectionId+":"+data.periodId}))`);
      await requireCurrentChurchSchoolOpening(tx,block.programId);
      await requireCurrentSiteLocalDelegate(tx,actor,block.programId,"site_director");
      const room=await currentRoom(tx,site,block,data.date);
      if([room.primaryPersonId,room.backupPersonId].includes(actor.actorPersonId!))
        throw new AuthorizationError("independent Site director must witness staff arrival");
      const reports=await tx.select({
        id:actions.id,personId:actions.ownerPersonId,createdAt:actions.createdAt,
      }).from(actions).where(and(eq(actions.type,presenceType),
        eq(actions.siteId,site.id),eq(actions.sectionId,block.sectionId),
        sql`${actions.metadata}->>'date' = ${data.date}`,
        sql`${actions.metadata}->>'periodId' = ${data.periodId}`,
        sql`${actions.metadata}->>'planToken' = ${block.planToken}`,
        sql`${actions.metadata}->>'roomEvidenceId' = ${room.id}`))
        .orderBy(desc(actions.createdAt)).limit(20);
      const primary=reports.find(r=>r.personId===room.primaryPersonId);
      const backup=reports.find(r=>r.personId===room.backupPersonId);
      if(!primary || !backup)
        throw new AuthorizationError("both named adults must individually report physical arrival");
      const now=new Date();
      if([primary,backup].some(r=>r.createdAt>now ||
        now.getTime()-r.createdAt.getTime()>90*60*1000))
        throw new AuthorizationError("fresh physical presence reports from both adults");
      const [prior]=await tx.select({id:actions.id}).from(actions)
        .where(and(eq(actions.type,witnessType),eq(actions.siteId,site.id),
          eq(actions.sectionId,block.sectionId),
          sql`${actions.metadata}->>'date' = ${data.date}`,
          sql`${actions.metadata}->>'periodId' = ${data.periodId}`,
          sql`${actions.metadata}->>'planToken' = ${block.planToken}`))
        .limit(1);
      if(prior)return {witnessId:prior.id,created:false as const};
      const [record]=await tx.insert(actions).values({
        type:witnessType,status:"resolved",priority:"normal",
        title:"Site director personally witnessed both scheduled adults",
        description:null,subjectType:"section",subjectId:block.sectionId,
        organizationId:site.organizationId,siteId:site.id,
        programId:block.programId,sectionId:block.sectionId,
        ownerPersonId:actor.actorPersonId,resolvedAt:now,
        metadata:{date:data.date,periodId:data.periodId,planToken:block.planToken,
          primaryReportId:primary.id,backupReportId:backup.id,
          roomEvidenceId:room.id,scope:"human_witnessed_adult_presence_only"},
      }).returning({id:actions.id});
      if(!record)throw new Error("Cannot store witnessed staffing evidence");
      await writeAudit(tx,actor,{
        action:"onsite.block.presence_witnessed",entityType:"action",entityId:record.id,
        scope:{organizationId:site.organizationId,siteId:site.id,
          programId:block.programId,sectionId:block.sectionId},
        after:{date:data.date,periodId:data.periodId,roomEvidenceId:room.id,
          primaryReportId:primary.id,backupReportId:backup.id},
      });
      return {witnessId:record.id,created:true as const};
    });
  });

/** The read projection deliberately does not return child or credential data.
 * An earlier witness record is stale whenever the current coverage token or
 * current CAN opening authorization changes.
 */
export const getOnsitePhysicalPresence=createServerFn({method:"GET"})
  .validator((v:unknown)=>todaySchema.parse(v))
  .handler(async({data})=>{
    const {actor,site}=await schoolSite();
    const plan=await getOnsiteSupervisionPlan({data:{date:data.date}});
    if(plan.siteId!==site.id || plan.projectionTruncated)
      return {blocks:[],truncated:true,hasWitnessedAllBlocks:false};
    const [reports,witnesses]=await Promise.all([
      db.select({
        sectionId:actions.sectionId,personId:actions.ownerPersonId,
        metadata:actions.metadata,
      }).from(actions).where(and(eq(actions.siteId,site.id),
        eq(actions.type,presenceType),
        sql`${actions.metadata}->>'date' = ${data.date}`)).limit(501),
      db.select({
        sectionId:actions.sectionId,metadata:actions.metadata,
      }).from(actions).where(and(eq(actions.siteId,site.id),
        eq(actions.type,witnessType),
        sql`${actions.metadata}->>'date' = ${data.date}`)).limit(501),
    ]);
    const truncated=reports.length>500||witnesses.length>500;
    const blocks=[];
    for(const block of plan.blocks){
      let opening=false;
      try{
        await requireCurrentChurchSchoolOpening(db,block.programId);
        opening=true;
      }catch(error){if(!(error instanceof AuthorizationError))throw error;}
      const current=!!block.assignedPlan && opening && !truncated;
      const matched=current && witnesses.some(row=>
        row.sectionId===block.sectionId &&
        row.metadata.periodId===block.periodId &&
        row.metadata.planToken===block.planToken);
      const ownPresence=current && reports.some(row=>
        row.sectionId===block.sectionId &&
        row.personId===actor.actorPersonId &&
        row.metadata.periodId===block.periodId &&
        row.metadata.planToken===block.planToken);
      blocks.push({
        sectionId:block.sectionId,periodId:block.periodId,
        programId:block.programId,
        canReport:current && !!block.canCheckIn,
        canWitness:current && actor.role==="site_leader",
        ownPresenceReported:ownPresence,witnessedBothAdults:matched,
        openingAuthorized:opening,
      });
    }
    return {blocks,truncated,
      hasWitnessedAllBlocks:blocks.length>0 &&
        blocks.every(row=>row.witnessedBothAdults),
      note:"Two named adults each report arrival; an authorized separate Site director witnesses their presence. This is a human attestation, not continuous presence tracking, student custody, pickup clearance or school-day closure."};
  });
