import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gt, gte, inArray, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { academicCalendarDays, academicCalendars, documents, programs, scheduleTemplatePeriods,
  scheduleTemplates, schoolYears, sections, sites, terms, people, roleAssignments, programResponsibilityAssignments, deliveryArrangements } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { siteDate } from "@/domain/expected-attendance";
import { coversLocalSupervisionBlock } from "@/domain/onsite-supervision-coverage";
import { roomPlanBlockSchema, submitRoomPlanSchema, reviewRoomPlanSchema, assertRoomPrimaryChoice } from "@/domain/onsite-room-plan";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { schoolIdentity, verifyCANSchoolApprover, verifyChurchEvidenceSubmitter, latestConfiguration } from "./school-opening.server";
import { requireCurrentSiteLocalDelegate } from "./site-local-delegation.server";
import { ROOM_COVERAGE_DOCUMENT_CATEGORY } from "./onsite-block-room-plan.server";
import { verifiedScheduledSectionFacilitators, scheduledBlockHasNamedFacilitator } from "./section-coverage-verification.server";
import { requireCurrentOnsiteAdultSafety, verifiedAdultSafetyEvidence, verifiedAdultCoversBlock } from "./onsite-block-safety.server";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import type { z } from "zod";

type Reader = Pick<typeof db, "select">;
type BlockInput = z.infer<typeof roomPlanBlockSchema>;

/** Exact canonical schedule identity, shared by plan submission and review. */
export async function scheduledRoomBlocks(tx: Reader, input: Pick<BlockInput,"programId"|"date"> & Partial<BlockInput>) {
  const school = await schoolIdentity(tx, input.programId);
  const newerCalendar = alias(academicCalendars,"newer_room_calendar");
  const blocks = await tx.select({ sectionId: sections.id, periodId: scheduleTemplatePeriods.id,
    periodLabel: scheduleTemplatePeriods.label, startsAtLocal: scheduleTemplatePeriods.startsAtLocal,
    endsAtLocal: scheduleTemplatePeriods.endsAtLocal, title: sections.title,
  }).from(sections)
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .innerJoin(scheduleTemplates, eq(scheduleTemplates.id, sections.scheduleTemplateId))
    .innerJoin(scheduleTemplatePeriods, eq(scheduleTemplatePeriods.scheduleTemplateId, scheduleTemplates.id))
    .innerJoin(academicCalendars, and(eq(academicCalendars.schoolYearId, schoolYears.id),
      eq(academicCalendars.siteId, school.siteId), eq(academicCalendars.active, true)))
    .innerJoin(academicCalendarDays, eq(academicCalendarDays.academicCalendarId, academicCalendars.id))
    .where(and(...(input.sectionId ? [eq(sections.id, input.sectionId)] : []), eq(sections.programId, input.programId),
      eq(sections.siteId, school.siteId), eq(sections.active, true),
      eq(schoolYears.organizationId, school.organizationId), eq(schoolYears.siteId, school.siteId),
      or(eq(schoolYears.programId, input.programId), isNull(schoolYears.programId)), eq(schoolYears.status, "active"),
      lte(schoolYears.startsOn, input.date), gte(schoolYears.endsOn, input.date),
      lte(terms.startsOn, input.date), gte(terms.endsOn, input.date),
      eq(scheduleTemplates.schoolYearId, schoolYears.id), eq(scheduleTemplates.siteId, school.siteId),
      or(eq(scheduleTemplates.programId, input.programId), isNull(scheduleTemplates.programId)),
      eq(scheduleTemplates.active, true), lte(scheduleTemplates.effectiveFrom, input.date),
      or(isNull(scheduleTemplates.effectiveThrough), gte(scheduleTemplates.effectiveThrough, input.date)),
      ...(input.periodId ? [eq(scheduleTemplatePeriods.id, input.periodId)] : []), eq(scheduleTemplatePeriods.type, "instruction"),
      eq(scheduleTemplatePeriods.dayOfWeek, new Date(input.date + "T12:00:00Z").getUTCDay()),
      notExists(tx.select({id:newerCalendar.id}).from(newerCalendar).where(and(
        eq(newerCalendar.schoolYearId,schoolYears.id),eq(newerCalendar.siteId,school.siteId),
        eq(newerCalendar.active,true),gt(newerCalendar.version,academicCalendars.version)))),
      eq(academicCalendarDays.calendarDate, input.date),
      or(eq(academicCalendarDays.type, "instructional"), and(eq(academicCalendarDays.type, "special"),
        sql`${academicCalendarDays.instructionalMinutes} > 0`)),
    )).limit(201);
  return { school, blocks };
}
export async function scheduledRoomBlock(tx: Reader, input: BlockInput) {
  const { school, blocks } = await scheduledRoomBlocks(tx,input);
  const block = blocks[0];
  if (!block || block.startsAtLocal >= block.endsAtLocal)
    throw new AuthorizationError("current scheduled instructional Section, period and calendar date");
  return { school, block };
}

export async function authorizeRoomPlanHost(tx: Reader, actor: AccessContext,
  school: Awaited<ReturnType<typeof schoolIdentity>>) {
  if (actor.role === "registrar") return verifyChurchEvidenceSubmitter(actor, school);
  if (actor.role !== "site_leader" || actor.sessionAccountId || !actor.actorPersonId ||
      actor.grantSiteId !== school.siteId || !actor.scope.organizationIds?.includes(school.organizationId) ||
      !actor.scope.siteIds?.includes(school.siteId) || !actor.scope.programIds?.includes(school.programId))
    throw new AuthorizationError("current local director for this exact school");
  await requireCurrentSiteLocalDelegate(tx, actor, school.programId, "site_director");
}

export function currentRoomPlan(tx: Reader, input: BlockInput) {
  return tx.select().from(documents).where(and(eq(documents.subjectType, "section"),
    eq(documents.subjectId, input.sectionId), eq(documents.category, ROOM_COVERAGE_DOCUMENT_CATEGORY),
    sql`${documents.metadata}->>'date' = ${input.date}`,
    sql`${documents.metadata}->>'periodId' = ${input.periodId}`,
    sql`${documents.metadata}->>'isCurrent' IS DISTINCT FROM 'false'`,
  )).orderBy(desc(documents.createdAt), desc(documents.id)).limit(1);
}

async function checkPlannedPrimary(tx:Reader,input:BlockInput,block:{startsAtLocal:string;endsAtLocal:string},
  timezone:string,primaryPersonId:string,substitutesForPersonId?:string){
  const rows=await tx.select({personId:deliveryArrangements.facilitatorPersonId,
    from:deliveryArrangements.effectiveFrom,through:deliveryArrangements.effectiveThrough,
  }).from(deliveryArrangements).innerJoin(programs,eq(programs.id,input.programId))
    .where(and(eq(deliveryArrangements.academicProviderOrganizationId,programs.academicProviderOrganizationId),
    eq(deliveryArrangements.sectionId,input.sectionId),
    eq(deliveryArrangements.status,"active"),inArray(deliveryArrangements.modality,["onsite","hybrid"]))).limit(201);
  if(rows.length>200)throw new Error("Complete scheduled primary records are required");
  const ids=rows.filter(row=>row.personId&&coversLocalSupervisionBlock({date:input.date,timeZone:timezone,...block,
    effectiveFrom:row.from,effectiveThrough:row.through})).map(row=>row.personId!);
  assertRoomPrimaryChoice(ids,primaryPersonId,substitutesForPersonId);
}

export async function submitOnsiteRoomPlan(actor: AccessContext, value: z.infer<typeof submitRoomPlanSchema>) {
  const input = submitRoomPlanSchema.parse(value);
  return db.transaction(async tx => {
    await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, input.programId)).for("update");
    const { school, block } = await scheduledRoomBlock(tx, input);
    await authorizeRoomPlanHost(tx, actor, school);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"onsite-presence:"+school.siteId+":"+input.date+":"+input.sectionId+":"+input.periodId}))`);
    const [site] = await tx.select({ timezone: sites.timezone }).from(sites).where(eq(sites.id, school.siteId)).limit(1);
    const timezone = site!.timezone;
    const today = siteDate(new Date(), timezone);
    const horizon = siteDate(new Date(Date.now() + 30 * 86400_000), timezone);
    if (input.date < today || input.date > horizon) throw new Error("Plan a block today or within the next 30 days");
    const expiresAt = new Date(input.expiresAt);
    if (!coversLocalSupervisionBlock({ date: input.date, timeZone: timezone, ...block,
      effectiveFrom: new Date(), effectiveThrough: expiresAt }))
      throw new Error("Plan validity must cover the entire scheduled block");
    await checkPlannedPrimary(tx,input,block,timezone,input.primaryPersonId,input.substitutesForPersonId);
    const metadata = { siteId: school.siteId, programId: input.programId, sectionId: input.sectionId,
      periodId: input.periodId, date: input.date, primaryPersonId: input.primaryPersonId,
      backupPersonId: input.backupPersonId, substitutesForPersonId:input.substitutesForPersonId??null, roomLabel: input.roomLabel, roomCapacity: input.roomCapacity,
      startsAtLocal: block.startsAtLocal, endsAtLocal: block.endsAtLocal,
      rationale: input.rationale, source: "staff_room_plan", reviewStatus: "pending", isCurrent: true };
    const [replay] = await tx.select().from(documents).where(eq(documents.id, input.documentId)).limit(1);
    if (replay) {
      if (replay.uploadedByPersonId !== actor.actorPersonId || replay.category !== ROOM_COVERAGE_DOCUMENT_CATEGORY ||
          replay.subjectId !== input.sectionId || replay.expiresAt?.toISOString() !== expiresAt.toISOString() ||
          Object.entries(metadata).some(([key, expected]) => !["reviewStatus", "isCurrent"].includes(key) && replay.metadata[key] !== expected))
        throw new Error("This plan identifier was already used for different details");
      return { documentId: replay.id, created: false };
    }
    const [previous] = await currentRoomPlan(tx, input);
    if ((previous?.id ?? null) !== input.expectedDocumentId) throw new Error("Room plan changed; refresh before replacing it");
    const now = new Date();
    if (previous) await tx.update(documents).set({ metadata: { ...previous.metadata,
      isCurrent: false, supersededByDocumentId: input.documentId }, updatedAt: now }).where(eq(documents.id, previous.id));
    await tx.insert(documents).values({ id: input.documentId, subjectType: "section", subjectId: input.sectionId,
      category: ROOM_COVERAGE_DOCUMENT_CATEGORY, fileName: `Room plan ${input.date} — ${block.title}`,
      storageProvider: "internal_record", storageKey: `onsite-room-plan/${input.documentId}`,
      mimeType: "application/json", sensitivityTier: "restricted", expiresAt,
      uploadedByPersonId: actor.actorPersonId!, metadata });
    const scope = { organizationId: school.organizationId, siteId: school.siteId, programId: input.programId, sectionId: input.sectionId };
    const eventId = await emitEvent(tx, { eventType: EventTypes.OnsiteRoomPlanSubmitted,
      aggregateType: "document", aggregateId: input.documentId, actorPersonId: actor.actorPersonId,
      ...scope, payload: { date: input.date, periodId: input.periodId, supersededDocumentId: previous?.id ?? null } });
    await writeAudit(tx, actor, { action: "onsite.room_plan.submitted", entityType: "document", entityId: input.documentId,
      scope, after: metadata, contextExtras: { domainEventId: eventId } });
    return { documentId: input.documentId, created: true };
  });
}

/** Verification is independent CAN review of a staff plan, never a legal room
 * inspection, school-opening decision, staff arrival or custody handoff. */
export async function reviewOnsiteRoomPlan(actor: AccessContext, value: z.infer<typeof reviewRoomPlanSchema>) {
  const input = reviewRoomPlanSchema.parse(value);
  return db.transaction(async tx => {
    await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, input.programId)).for("update");
    const { school, block } = await scheduledRoomBlock(tx, input);
    verifyCANSchoolApprover(actor, school.institutionId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:"+input.programId}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"onsite-presence:"+school.siteId+":"+input.date+":"+input.sectionId+":"+input.periodId}))`);
    const [document] = await currentRoomPlan(tx, input);
    if (!document || document.id !== input.documentId || document.metadata.isCurrent === false ||
        document.metadata.siteId !== school.siteId || document.metadata.programId !== input.programId)
      throw new Error("Room plan changed; review the current version");
    if (document.uploadedByPersonId === actor.actorPersonId) throw new AuthorizationError("independent room plan reviewer other than the submitter");
    const decision = input.decision === "approve" ? "approved" : "rejected";
    if (document.metadata.reviewStatus !== "pending") {
      if (document.metadata.reviewStatus === decision && document.metadata.reviewReason === input.reason &&
          document.metadata.reviewedByPersonId === actor.actorPersonId)
        return { documentId: document.id, changed: false };
      throw new Error("This version was already reviewed; submit a corrected plan");
    }
    if (input.decision === "approve") {
      const [site] = await tx.select({ timezone: sites.timezone }).from(sites).where(eq(sites.id, school.siteId)).limit(1);
      const scope = { date: input.date, timeZone: site!.timezone, ...block };
      const m = document.metadata;
      if (m.startsAtLocal !== block.startsAtLocal || m.endsAtLocal !== block.endsAtLocal ||
          !coversLocalSupervisionBlock({ ...scope, effectiveFrom: new Date(), effectiveThrough: document.expiresAt }))
        throw new Error("The current schedule and full-block plan validity must match before approval");
      const primary = m.primaryPersonId, backup = m.backupPersonId;
      if (typeof primary !== "string" || typeof backup !== "string" || primary === backup)
        throw new Error("Two distinct named adults are required");
      await checkPlannedPrimary(tx,input,block,site!.timezone,primary,
        typeof m.substitutesForPersonId==="string"?m.substitutesForPersonId:undefined);
      await requireChurchHostedOperatingServices(tx, input.programId, ["onsite_supervision"]);
      const appointments = await verifiedScheduledSectionFacilitators(tx,
        { siteId: school.siteId, organizationId: school.organizationId },
        [primary, backup].map(personId => ({ personId, programId: input.programId, sectionId: input.sectionId })));
      for (const personId of [primary, backup]) {
        if (!scheduledBlockHasNamedFacilitator(appointments, { personId, programId: input.programId, ...scope }))
          throw new AuthorizationError("current primary and backup Section appointments for the entire block");
        await requireCurrentOnsiteAdultSafety(tx, { personId, ...scope });
      }
    }
    const now = new Date();
    await tx.update(documents).set({ verifiedAt: decision === "approved" ? now : null,
      verifiedByPersonId: decision === "approved" ? actor.actorPersonId : null,
      metadata: { ...document.metadata, reviewStatus: decision, reviewReason: input.reason,
        reviewedAt: now.toISOString(), reviewedByPersonId: actor.actorPersonId }, updatedAt: now,
    }).where(eq(documents.id, document.id));
    const scope = { organizationId: school.institutionId, siteId: school.siteId, programId: input.programId, sectionId: input.sectionId };
    const eventId = await emitEvent(tx, { eventType: EventTypes.OnsiteRoomPlanReviewed,
      aggregateType: "document", aggregateId: document.id, actorPersonId: actor.actorPersonId, ...scope,
      payload: { date: input.date, periodId: input.periodId, decision: input.decision } });
    await writeAudit(tx, actor, { action: "onsite.room_plan.reviewed", entityType: "document", entityId: document.id,
      scope, before: { reviewStatus: "pending" }, after: { decision: input.decision, reason: input.reason },
      contextExtras: { domainEventId: eventId } });
    await notifyMany(tx, [{ recipientPersonId: document.uploadedByPersonId, type: "onsite_room_plan_reviewed",
      title: decision === "approved" ? "Room coverage plan reviewed" : "Room coverage plan needs correction",
      body: "Open the school supervision workspace for the current room-plan decision. This does not authorize opening or confirm staff arrival.",
      resourceType: "program", resourceId: input.programId, eventId }]);
    return { documentId: document.id, changed: true };
  });
}

/** Role-scoped planning DTO: assigned adults, schedule and current structured
 * plans only. No student roster or qualification documents are exposed. */
export async function getOnsiteRoomPlanning(actor: AccessContext, value: Pick<BlockInput,"programId"|"date">) {
  const input = roomPlanBlockSchema.pick({ programId:true,date:true }).parse(value);
  const school = await schoolIdentity(db,input.programId);
  const canReview = actor.role === "can_network_steward";
  if (canReview) verifyCANSchoolApprover(actor,school.institutionId);
  else await authorizeRoomPlanHost(db,actor,school);
  const { blocks } = await scheduledRoomBlocks(db,input);
  if (blocks.length > 200) throw new Error("Room planning is incomplete; narrow the school schedule before continuing");
  const configuration = await latestConfiguration(db,input.programId);
  const [site] = await db.select({ timezone:sites.timezone }).from(sites).where(eq(sites.id,school.siteId)).limit(1);
  const sectionIds=[...new Set(blocks.map(block=>block.sectionId))];
  const [assignments, plans, arrangements] = sectionIds.length ? await Promise.all([
    db.select({ personId:roleAssignments.personId, name:sql<string>`${people.legalFirstName} || ' ' || ${people.legalLastName}`,
      key:programResponsibilityAssignments.responsibilityKey,
    }).from(programResponsibilityAssignments)
      .innerJoin(roleAssignments,eq(roleAssignments.id,programResponsibilityAssignments.responsibleRoleAssignmentId))
      .innerJoin(people,eq(people.id,roleAssignments.personId))
      .where(and(eq(programResponsibilityAssignments.configurationVersionId,configuration.id),
        eq(roleAssignments.programId,input.programId),eq(roleAssignments.siteId,school.siteId),
        eq(roleAssignments.roleKey,"room_facilitator"))).limit(501),
    db.select().from(documents).where(and(eq(documents.subjectType,"section"),inArray(documents.subjectId,sectionIds),
      eq(documents.category,ROOM_COVERAGE_DOCUMENT_CATEGORY),sql`${documents.metadata}->>'date' = ${input.date}`))
      .orderBy(desc(documents.createdAt),desc(documents.id)).limit(1001),
    db.select().from(deliveryArrangements).where(and(inArray(deliveryArrangements.sectionId,sectionIds),
      eq(deliveryArrangements.status,"active"))).limit(501),
  ]) : [[],[],[]];
  if(assignments.length>500||plans.length>1000||arrangements.length>500)
    throw new Error("Room planning source records are incomplete; no approval is inferred");
  const candidates=assignments.flatMap(row=>{
    const [kind,sectionId,personId]=row.key.split(":");
    return kind==="room_facilitator"&&sectionId&&sectionIds.includes(sectionId)&&personId===row.personId
      ? [{personId:row.personId,name:row.name,sectionId,programId:input.programId}] : [];
  });
  const [appointments,safety]=await Promise.all([
    verifiedScheduledSectionFacilitators(db,{siteId:school.siteId,organizationId:school.organizationId},candidates),
    verifiedAdultSafetyEvidence(db,candidates.map(row=>row.personId)),
  ]);
  return { programId:input.programId,date:input.date,timezone:site!.timezone,canSubmit:!canReview,canReview,
    blocks:blocks.map(block=>{
      const scope={date:input.date,timeZone:site!.timezone,...block};
      const staff=[...new Map(candidates.filter(row=>row.sectionId===block.sectionId&&
        scheduledBlockHasNamedFacilitator(appointments,{...row,...scope})&&
        Object.values(verifiedAdultCoversBlock(safety.get(row.personId),scope)).every(Boolean)
      ).map(row=>[row.personId,{personId:row.personId,name:row.name}])).values()];
      const primaries=[...new Set(arrangements.filter(row=>row.sectionId===block.sectionId&&
        ["onsite","hybrid"].includes(row.modality)&&coversLocalSupervisionBlock({...scope,
          effectiveFrom:row.effectiveFrom,effectiveThrough:row.effectiveThrough}))
        .map(row=>row.facilitatorPersonId).filter((id):id is string=>!!id))];
      const document=plans.find(row=>row.subjectId===block.sectionId&&row.metadata.periodId===block.periodId&&row.metadata.isCurrent!==false);
      return {...block,staff,assignedPrimaryPersonId:primaries.length===1?primaries[0]:null,
        current:document?{id:document.id,submittedByPersonId:document.uploadedByPersonId,
          primaryPersonId:String(document.metadata.primaryPersonId??""),backupPersonId:String(document.metadata.backupPersonId??""),
          roomLabel:String(document.metadata.roomLabel??""),roomCapacity:Number(document.metadata.roomCapacity??0),
          rationale:String(document.metadata.rationale??""),
          substitutesForPersonId:typeof document.metadata.substitutesForPersonId==="string"?document.metadata.substitutesForPersonId:null,expiresAt:document.expiresAt?.toISOString()??null,
          status:document.metadata.isCurrent===false?"superseded":String(document.metadata.reviewStatus??"legacy"),
          reason:typeof document.metadata.reviewReason==="string"?document.metadata.reviewReason:null,
          canReview:canReview&&document.uploadedByPersonId!==actor.actorPersonId&&document.metadata.reviewStatus==="pending",
        }:null};
    }) };
}
