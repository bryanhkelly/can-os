import { assertSchoolDayPreparation } from "@/domain/onsite-day-preparation";
import { effectiveRoomPrimary } from "@/domain/onsite-room-plan";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, lte, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  academicCalendars, academicCalendarDays, accessAccounts, accountPersonGrants,
  deliveryArrangements, enrollments, organizations, people, programs, scheduleTemplatePeriods,
  scheduleTemplates, schoolYears, sections, sites, terms,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { siteDate } from "@/domain/expected-attendance";
import { coversLocalSupervisionBlock, summarizeOnsiteSupervision, type SupervisionBlockInput } from "@/domain/onsite-supervision-coverage";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { verifiedScheduledSectionFacilitators, scheduledBlockHasNamedFacilitator } from "./section-coverage-verification.server";
import { verifiedAdultSafetyEvidence, verifiedAdultCoversBlock } from "./onsite-block-safety.server";
import { fetchRoomPlanEvidence,parseVerifiedRoomPlan,type VerifiedRoomPlan } from "./onsite-block-room-plan.server";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

const inputSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();

type SupervisionSummary=ReturnType<typeof summarizeOnsiteSupervision>;
/** A planned instructional block as exposed to staff. Internal person IDs and
 * raw evidence identities are removed; the server-computed plan fingerprint
 * and the current actor's permissions are added. Every code path of
 * getOnsiteSupervisionPlan returns this same block shape. */
export type OnsiteSupervisionPlanBlock=Omit<SupervisionSummary["blocks"][number],
  "facilitatorPersonId"|"backupPersonId"|"roomEvidenceVersion"|
  "delegationVersion"|"agreementVersion">&{
  planToken:string;
  canCheckIn:boolean;
  canRespond:boolean;
  canAccept:boolean;
  ownDutyRole?:"primary"|"backup"|null;
  backupFacilitatorName?:string|null;
};
export type OnsiteSupervisionPlan=Omit<SupervisionSummary,"blocks">&{
  date:string;
  siteId:string;
  projectionTruncated:boolean;
  canPlanRooms?:boolean;
  blocks:OnsiteSupervisionPlanBlock[];
};
export type OnsiteOperationalSupervisionPlan=Omit<OnsiteSupervisionPlan,"blocks">&{
  blocks:Array<OnsiteSupervisionPlanBlock&{
    facilitatorPersonId:string|null;
    backupPersonId:string|null;
  }>;
};

/** Internal projection for callers that already authorized this actor and Site. */
export const loadOnsiteSupervisionPlanForActor=createServerOnlyFn(async (actor:AccessContext,data:{
  date:string;siteId?:string;preparation?:boolean;registrarFirstDay?:boolean;programId?:string;sectionId?:string;
}):Promise<OnsiteOperationalSupervisionPlan>=>{
    setResponseHeader("Cache-Control","private, no-store");
    const [site]=await db.select({id:sites.id,organizationId:sites.organizationId,
      timezone:sites.timezone,hostType:organizations.type}).from(sites)
      .innerJoin(organizations,eq(organizations.id,sites.organizationId))
      .where(eq(sites.id,data.siteId??actor.grantSiteId!)).limit(1);
    if(!site || !actor.scope.organizationIds?.includes(site.organizationId))
      throw new AuthorizationError("site staffing organization");
    if (siteDate(new Date(data.date+"T12:00:00Z"),"UTC")!==data.date)
      throw new Error("Invalid school-local date");
    const today=siteDate(new Date(),site.timezone);
    const oldest=siteDate(new Date(Date.now()-30*86400_000),site.timezone);
    if(data.registrarFirstDay){
      if(!data.preparation || !data.programId || !data.sectionId ||
         actor.role!=="registrar" || !actor.actorPersonId || actor.sessionAccountId ||
         !actor.scope.siteIds?.includes(site.id) ||
         !actor.scope.programIds?.includes(data.programId))
        throw new AuthorizationError("registrar first-day Site Program and Section scope");
      assertCapability(actor,"enrollment.activate");
      if(actor.grantSiteId && actor.grantSiteId!==site.id)
        throw new AuthorizationError("original registrar Site grant");
      if(data.date<today)throw new AuthorizationError("future first-day date");
    }else if(data.preparation)assertSchoolDayPreparation(actor,site,data.date);
    else if(data.date>today || data.date<oldest)
      throw new AuthorizationError("onsite supervision day limited to last 30 days");

    const sectionsAtSite=await db.select({
      id:sections.id,title:sections.title,programId:sections.programId,
      programName:programs.name,deliveryModel:programs.deliveryModel,
      academicProviderOrganizationId:programs.academicProviderOrganizationId,
      scheduleTemplateId:sections.scheduleTemplateId,
      schoolYearId:schoolYears.id,
    }).from(sections)
      .innerJoin(programs,eq(programs.id,sections.programId))
      .innerJoin(terms,eq(terms.id,sections.termId))
      .innerJoin(schoolYears,eq(schoolYears.id,terms.schoolYearId))
      .where(and(eq(sections.siteId,site.id),eq(programs.siteId,site.id),
        eq(programs.organizationId,site.organizationId),
        eq(schoolYears.siteId,site.id),eq(schoolYears.organizationId,site.organizationId),
        eq(schoolYears.status,"active"),eq(sections.active,true),
        data.preparation?inArray(programs.status,["launching","ready","active"]):eq(programs.status,"active"),
        sql`${programs.deliveryModel} ->> 'onsite' = 'true'`,
        lte(schoolYears.startsOn,data.date),gte(schoolYears.endsOn,data.date),
        lte(terms.startsOn,data.date),gte(terms.endsOn,data.date),
        inArray(sections.programId,actor.scope.programIds??[]),
        ...(data.registrarFirstDay ? [eq(sections.programId,data.programId!)] : [])))
      .limit(251);
    // Evaluate the whole authorized Program before narrowing the response to
    // one Section. A shared adult or room double-booking must remain visible.
    if(data.registrarFirstDay && !sectionsAtSite.some(row=>row.id===data.sectionId))
      throw new AuthorizationError("original registrar Section not in authorized Program and Site");
    const projectionTruncated=sectionsAtSite.length>250;
    const onsiteSections=sectionsAtSite.slice(0,250);
    if(!onsiteSections.length){
      return {date:data.date,siteId:site.id,projectionTruncated,
        ...summarizeOnsiteSupervision([]),blocks:[]};
    }
    const ids=onsiteSections.map(row=>row.id);
    const yearIds=[...new Set(onsiteSections.map(row=>row.schoolYearId))];
    const templateIds=[...new Set(onsiteSections.map(r=>r.scheduleTemplateId)
      .filter((id):id is string=>!!id))];
    const day=new Date(data.date+"T12:00:00Z").getUTCDay();
    const [periodRows,arrangements,calendarRows,roomEvidence,rosterSizes]=await Promise.all([
      templateIds.length?db.select({
        templateId:scheduleTemplates.id,yearId:scheduleTemplates.schoolYearId,
        programId:scheduleTemplates.programId,siteId:scheduleTemplates.siteId,
        periodId:scheduleTemplatePeriods.id,label:scheduleTemplatePeriods.label,
        starts:scheduleTemplatePeriods.startsAtLocal,
        ends:scheduleTemplatePeriods.endsAtLocal,
      }).from(scheduleTemplatePeriods)
        .innerJoin(scheduleTemplates,eq(scheduleTemplates.id,scheduleTemplatePeriods.scheduleTemplateId))
        .where(and(inArray(scheduleTemplates.id,templateIds),
          eq(scheduleTemplates.siteId,site.id),eq(scheduleTemplates.active,true),
          lte(scheduleTemplates.effectiveFrom,data.date),
          or(isNull(scheduleTemplates.effectiveThrough),
            gte(scheduleTemplates.effectiveThrough,data.date)),
          eq(scheduleTemplatePeriods.dayOfWeek,day),
          eq(scheduleTemplatePeriods.type,"instruction"))):Promise.resolve([]),
      db.select({
        sectionId:deliveryArrangements.sectionId,
        facilitatorPersonId:deliveryArrangements.facilitatorPersonId,
        from:deliveryArrangements.effectiveFrom,
        through:deliveryArrangements.effectiveThrough,
        modality:deliveryArrangements.modality,
      }).from(deliveryArrangements)
        .where(and(inArray(deliveryArrangements.sectionId,ids),
          eq(deliveryArrangements.status,"active"))),
      db.select({
        yearId:academicCalendars.schoolYearId,
        version:academicCalendars.version,
        dayType:academicCalendarDays.type,
        minutes:academicCalendarDays.instructionalMinutes,
      }).from(academicCalendars)
        .leftJoin(academicCalendarDays,and(
          eq(academicCalendarDays.academicCalendarId,academicCalendars.id),
          eq(academicCalendarDays.calendarDate,data.date),
        ))
        .where(and(inArray(academicCalendars.schoolYearId,yearIds),
          eq(academicCalendars.siteId,site.id),eq(academicCalendars.active,true)))
        .orderBy(desc(academicCalendars.version)),
      fetchRoomPlanEvidence(db,ids),
      db.select({
        sectionId:enrollments.sectionId,
        students:sql<number>`count(distinct ${enrollments.studentProfileId})::int`,
      }).from(enrollments).where(and(
        inArray(enrollments.sectionId,ids),
        eq(enrollments.kind,"section"),eq(enrollments.status,"active"),
      )).groupBy(enrollments.sectionId),
    ]);
    // Latest active calendar version is authoritative; an absent/closed day
    // cannot confer a scheduled onsite duty from a repeating timetable alone.
    const instructionalByYear=new Map<string,boolean>();
    for(const dayRow of calendarRows){
      if(instructionalByYear.has(dayRow.yearId))continue;
      const instructional=(dayRow.dayType==="instructional"||
        dayRow.dayType==="makeup"||dayRow.dayType==="special") &&
        dayRow.minutes!==0 &&
        (dayRow.dayType!=="special"||(dayRow.minutes??0)>0);
      instructionalByYear.set(dayRow.yearId,instructional);
    }
    const rosterBySection=new Map(rosterSizes.map(row=>[
      row.sectionId,Number(row.students),
    ]));
    const matchingPlan=new Map<string,VerifiedRoomPlan>();
    // A reviewed physical plan requires an active, independently verified
    // CAN institutional reviewer, not merely a non-null verifiedAt column.
    const reviewerIds=[...new Set(roomEvidence.rows.map(row=>row.verifiedByPersonId)
      .filter((id):id is string=>!!id))];
    const canProviderIds=[...new Set(onsiteSections.map(row=>row.academicProviderOrganizationId))];
    const approvedReviewers=reviewerIds.length && canProviderIds.length
      ? await db.select({
          personId:accountPersonGrants.personId,
          organizationId:accountPersonGrants.organizationId,
        }).from(accountPersonGrants)
        .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
        .innerJoin(people,eq(people.id,accountPersonGrants.personId))
        .where(and(
          inArray(accountPersonGrants.personId,reviewerIds),
          inArray(accountPersonGrants.organizationId,canProviderIds),
          eq(accountPersonGrants.role,"can_network_steward"),
          isNull(accountPersonGrants.siteId),
          eq(accountPersonGrants.active,true),
          eq(accessAccounts.disabled,false),eq(people.active,true),
          sql`${accessAccounts.emailVerifiedAt} is not null`,
        )) : [];
    const reviewers=new Set(approvedReviewers.map(r=>r.organizationId+":"+r.personId));
    if(!roomEvidence.truncated){
      const bySection=new Map(onsiteSections.map(section=>[section.id,section]));
      // Newest independent review wins: never fall back to a superseded plan.
      const consumed=new Set<string>();
      for(const doc of roomEvidence.rows){
        const section=bySection.get(doc.subjectId);
        if(!section || doc.metadata.date!==data.date ||
           typeof doc.metadata.periodId!=="string")continue;
        const period=periodRows.find(row=>row.periodId===doc.metadata.periodId &&
          row.templateId===section.scheduleTemplateId &&
          row.yearId===section.schoolYearId &&
          (row.programId===null||row.programId===section.programId));
        if(!period)continue;
        const key=section.id+":"+period.periodId;
        if(consumed.has(key))continue;
        consumed.add(key);
        const parsed=parseVerifiedRoomPlan(doc,{
          date:data.date,siteId:site.id,programId:section.programId,
          sectionId:section.id,periodId:period.periodId,
          timeZone:site.timezone,
          startsAtLocal:period.starts,endsAtLocal:period.ends,
        });
        if(parsed && doc.verifiedByPersonId && reviewers.has(
          section.academicProviderOrganizationId+":"+doc.verifiedByPersonId))
          matchingPlan.set(key,parsed);
      }
    }
    const candidates=arrangements.filter(row=>["onsite","hybrid"].includes(row.modality));
    const peopleIds=[...new Set([
      ...candidates.map(row=>row.facilitatorPersonId),
      ...[...matchingPlan.values()].map(plan=>plan.primaryPersonId),
      ...[...matchingPlan.values()].map(plan=>plan.backupPersonId),
    ].filter((id):id is string=>!!id))];
    const [activePeople,staffGrants,adultSafety]=await Promise.all([
      peopleIds.length?db.select({id:people.id,firstName:people.legalFirstName,
        lastName:people.legalLastName,active:people.active})
        .from(people).where(inArray(people.id,peopleIds)):Promise.resolve([]),
      peopleIds.length?db.select({personId:accountPersonGrants.personId,
        role:accountPersonGrants.role})
        .from(accountPersonGrants)
        .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
        .where(and(eq(accessAccounts.disabled,false),sql`${accessAccounts.emailVerifiedAt} is not null`,
          inArray(accountPersonGrants.personId,peopleIds),
          eq(accountPersonGrants.siteId,site.id),
          eq(accountPersonGrants.organizationId,site.organizationId),
          eq(accountPersonGrants.active,true),
          inArray(accountPersonGrants.role,["room_facilitator","site_staff","site_leader"]))):Promise.resolve([]),
      verifiedAdultSafetyEvidence(db,peopleIds),
    ]);
    const peopleById=new Map(activePeople.map(row=>[row.id,row]));
    const independent = new Set(onsiteSections.filter(row =>
      site.hostType === "church" &&
      row.academicProviderOrganizationId !== site.organizationId)
      .map(row => row.programId));
    const programBySection = new Map(onsiteSections.map(row => [row.id,row.programId]));
    const namedCandidates = [
      ...candidates.filter(row => row.facilitatorPersonId &&
        independent.has(programBySection.get(row.sectionId) ?? ""))
        .map(row => ({
          programId: programBySection.get(row.sectionId)!,
          sectionId:row.sectionId,personId:row.facilitatorPersonId!,
        })),
      ...[...matchingPlan.values()].filter(plan=>independent.has(plan.programId))
        .flatMap(plan=>[plan.primaryPersonId,plan.backupPersonId].map(personId=>({
          programId:plan.programId,sectionId:plan.sectionId,personId,
        }))),
    ];
    const verifiedDelegations=await verifiedScheduledSectionFacilitators(db,
      {siteId:site.id,organizationId:site.organizationId},namedCandidates);
    const authorizedContracts = new Map<string, string | null>();
    for (const programId of independent) {
      try {
        const agreement=await requireChurchHostedOperatingServices(db,programId,
          ["onsite_supervision"]);
        authorizedContracts.set(programId,agreement);
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
        authorizedContracts.set(programId,null);
      }
    }
    const bySection=new Map<string,typeof candidates>();
    for(const entry of candidates){
      const items=bySection.get(entry.sectionId)??[];items.push(entry);
      bySection.set(entry.sectionId,items);
    }
    const result:SupervisionBlockInput[]=[];
    for(const section of onsiteSections){
      // Classroom staff only see the Sections they are named for on an
      // actual delivery arrangement. Retain visibility for an assigned adult
      // reporting inability to cover after their separate delegation expires.
      if (actor.role === "room_facilitator" &&
          !candidates.some(row => row.sectionId === section.id &&
            row.facilitatorPersonId === actor.actorPersonId) &&
          ![...matchingPlan.values()].some(row=>row.sectionId===section.id &&
            (row.backupPersonId===actor.actorPersonId||row.primaryPersonId===actor.actorPersonId))) continue;
      const templates=periodRows.filter(row=>
        row.templateId===section.scheduleTemplateId &&
        row.yearId===section.schoolYearId &&
        (row.programId===null||row.programId===section.programId));
      const assigned=bySection.get(section.id)??[];
      for(const period of templates.length?templates:[null]){
        const eligible=period?assigned.filter(row=>coversLocalSupervisionBlock({
          date:data.date,timeZone:site.timezone,startsAtLocal:period.starts,
          endsAtLocal:period.ends,effectiveFrom:row.from,effectiveThrough:row.through,
        })):[];
        const uniqueIds=[...new Set(eligible.map(row=>row.facilitatorPersonId).filter(
          (id):id is string=>!!id))];
        const scheduledPrimary=uniqueIds.length===1?uniqueIds[0]!:null;
        const reviewedRoom=period?matchingPlan.get(section.id+":"+period.periodId):undefined;
        const personId=effectiveRoomPrimary(scheduledPrimary,reviewedRoom);
        const person=personId?peopleById.get(personId):null;
        const requiresSectionDelegation=independent.has(section.programId);
        const approved=!!person?.active && staffGrants.some(grant=>
          grant.personId===personId &&
          (!requiresSectionDelegation || grant.role==="room_facilitator"));
        const verifiedTerm=personId && requiresSectionDelegation
          ? verifiedDelegations.get(section.programId + ":" +
              "room_facilitator:" + section.id + ":" + personId) : undefined;
        const safety=personId && requiresSectionDelegation
          ? verifiedAdultCoversBlock(adultSafety.get(personId),{
              date:data.date,timeZone:site.timezone,
              startsAtLocal:period?.starts??null,endsAtLocal:period?.ends??null,
            }) : {screening:true,training:true};
        const approvedRoom=period?matchingPlan.get(section.id+":"+period.periodId):undefined;
        const roomMatches=!!approvedRoom && !!personId &&
          approvedRoom.primaryPersonId===personId;
        const backupId=roomMatches?approvedRoom!.backupPersonId:null;
        const backupPerson=backupId?peopleById.get(backupId):null;
        const backupActive=!!backupId && backupId!==personId &&
          !!backupPerson?.active && staffGrants.some(grant=>
            grant.personId===backupId && grant.role==="room_facilitator");
        const backupNamed=!!backupId && !!period && backupActive &&
          scheduledBlockHasNamedFacilitator(verifiedDelegations,{
            programId:section.programId,sectionId:section.id,personId:backupId!,
            date:data.date,timeZone:site.timezone,
            startsAtLocal:period.starts,endsAtLocal:period.ends,
          });
        const backupSafety=backupId && period
          ? verifiedAdultCoversBlock(adultSafety.get(backupId),{
              date:data.date,timeZone:site.timezone,
              startsAtLocal:period.starts,endsAtLocal:period.ends,
            }) : {screening:false,training:false};
        const namedCurrent=personId && period && requiresSectionDelegation
          ? scheduledBlockHasNamedFacilitator(verifiedDelegations,{
              programId:section.programId,sectionId:section.id,personId,
              date:data.date,timeZone:site.timezone,
              startsAtLocal:period.starts,endsAtLocal:period.ends,
            }) : !requiresSectionDelegation;
        result.push({
          sectionId:section.id,sectionTitle:section.title,
          programId:section.programId,programName:section.programName,
          periodId:period?.periodId??null,periodLabel:period?.label??null,
          startsAtLocal:period?.starts??null,endsAtLocal:period?.ends??null,
          facilitatorPersonId:personId,
          facilitatorName:approved&&person?person.firstName+" "+person.lastName:null,
          verifiedSiteStaffGrant:approved,
          verifiedSafeguardingScreening:safety.screening,
          verifiedSafeguardingTraining:safety.training,
          roomLabel:roomMatches?approvedRoom!.roomLabel:null,
          roomEvidenceVersion:roomMatches ? [approvedRoom!.id,
            approvedRoom!.verifiedAt.toISOString(),approvedRoom!.expiresAt.toISOString()].join(":") : null,
          roomPlanVerified:roomMatches,
          roomCapacityAdequate:roomMatches &&
            (rosterBySection.get(section.id)??0)<=approvedRoom!.roomCapacity,
          backupPersonId:backupId,
          namedBackupVerified:!!backupNamed && backupSafety.screening && backupSafety.training,
          requiresSectionDelegation,
          verifiedSectionDelegation:!!namedCurrent,
          authorizedSupervisionService:!requiresSectionDelegation ||
            authorizedContracts.get(section.programId)!=null,
          // Private fingerprint, not a claim of background screening.
          delegationVersion:verifiedTerm ? [verifiedTerm.id,
            verifiedTerm.effectiveFrom.toISOString(),
            verifiedTerm.effectiveThrough.toISOString()].join(":") : null,
          agreementVersion:authorizedContracts.get(section.programId)??null,
          instructionalDayConfirmed:instructionalByYear.get(section.schoolYearId)===true,
          overlappingFacilitatorAssignments:uniqueIds.length>1,
        });
      }
    }
    const completeProjection=!(projectionTruncated||roomEvidence.truncated);
    const projection=summarizeOnsiteSupervision(result);
    // Internal operational readers use person IDs to detect actual substitutions.
    // The public server function strips them before returning the staff-safe plan.
    const blocks=projection.blocks.map(({
      facilitatorPersonId:assignedPersonId,backupPersonId:_backupPersonId,
      roomEvidenceVersion:_roomEvidenceVersion,
      delegationVersion,agreementVersion,...block
    })=>({
      ...block,
      facilitatorPersonId:assignedPersonId,
      backupPersonId:_backupPersonId??null,
      ownDutyRole:assignedPersonId===actor.actorPersonId?"primary" as const:
        _backupPersonId===actor.actorPersonId?"backup" as const:null,
      backupFacilitatorName:_backupPersonId&&block.namedBackupVerified&&peopleById.has(_backupPersonId)
        ? peopleById.get(_backupPersonId)!.firstName+" "+peopleById.get(_backupPersonId)!.lastName:null,
      // An acknowledgment is valid only for this exact assignment/time
      // fingerprint. Changes to the scheduled duty invalidate older records.
      planToken:createHash("sha256").update(JSON.stringify([
        site.id,data.date,block.sectionId,block.periodId,block.startsAtLocal,
        block.endsAtLocal,assignedPersonId,block.verifiedSiteStaffGrant,
        block.verifiedSectionDelegation,block.authorizedSupervisionService,
        block.verifiedSafeguardingScreening,block.verifiedSafeguardingTraining,
        block.roomPlanVerified,block.roomLabel,block.roomCapacityAdequate,
        block.namedBackupVerified,_backupPersonId,_roomEvidenceVersion,
        delegationVersion,agreementVersion,block.assignedPlan,
      ])).digest("hex"),
      // Presence is a separate witnessed workflow. Both named adults can
      // check in only against a fully evaluated current plan. This field
      // does NOT itself assert that either adult is physically present.
      canCheckIn:completeProjection && data.date===today &&
        block.requiresSectionDelegation===true &&
        (assignedPersonId===actor.actorPersonId ||
         _backupPersonId===actor.actorPersonId) &&
        block.assignedPlan,
      // Derived ONLY from the verified, original site grant and current active
      // instruction plan. Never accept a browser-supplied facilitator ID.
      canRespond:completeProjection && data.date===today &&
        (assignedPersonId===actor.actorPersonId ||
          _backupPersonId===actor.actorPersonId&&block.namedBackupVerified===true) && block.verifiedSiteStaffGrant &&
        block.instructionalDayConfirmed===true &&
        block.periodId!==null && block.startsAtLocal!==null && block.endsAtLocal!==null,
      // A qualified adult may acknowledge their own availability while
      // the site director resolves room/backup evidence. Availability is not
      // school-opening approval, verified presence, or custody handoff.
      // Missing adult credentials, authorization, calendar or double-booking
      // still block an affirmative response.
      canAccept:completeProjection && data.date===today &&
        (assignedPersonId===actor.actorPersonId ||
          _backupPersonId===actor.actorPersonId&&block.namedBackupVerified===true) &&
        block.instructionalDayConfirmed===true &&
        block.periodId!==null &&
        block.gaps.every(gap=>[
          "room_unconfigured","room_capacity_unverified",
          "room_schedule_conflict","qualified_backup_missing",
        ].includes(gap)),
    }));
    return {date:data.date,siteId:site.id,
      projectionTruncated:!completeProjection,...projection,blocks};
});

/** Registrar-safe projection after the enrollment reader has independently
 * authorized the exact student, Program and Section. No presence or custody APIs. */
export const loadFirstDaySupervisionPreparationForActor=createServerOnlyFn(async(actor:AccessContext,data:{
  date:string;siteId:string;programId:string;sectionId:string;
})=>{
  const plan=await loadOnsiteSupervisionPlanForActor(actor,{...data,preparation:true,registrarFirstDay:true});
  return {date:plan.date,projectionTruncated:plan.projectionTruncated,
    blocks:plan.blocks.filter(block=>block.programId===data.programId &&
      block.sectionId===data.sectionId).map(block=>({
        programId:block.programId,sectionId:block.sectionId,periodId:block.periodId,
        assignedPlan:block.assignedPlan,gaps:block.gaps,
      }))};
});

/** A staff-safe read of planned instruction coverage at ONE original grant site. */
export const getOnsiteSupervisionPlan = createServerFn({method:"GET"})
  .validator((input:unknown)=>inputSchema.parse(input))
  .handler(async ({data}):Promise<OnsiteSupervisionPlan>=>{
    const actor=await getCommandContext(getRequest());
    assertOnsiteAttendanceScope(actor);
    const plan=await loadOnsiteSupervisionPlanForActor(actor,data);
    return {...plan,canPlanRooms:actor.role==="site_leader",blocks:plan.blocks.map(({
      facilitatorPersonId:_facilitatorPersonId,backupPersonId:_backupPersonId,...block
    })=>block)};
  });
