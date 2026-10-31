import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { academicCalendarDays, academicCalendars, documents, programs, scheduleTemplatePeriods,
  scheduleTemplates, schoolYears, sections, sites, terms } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { siteDate } from "@/domain/expected-attendance";
import { coversLocalSupervisionBlock } from "@/domain/onsite-supervision-coverage";
import { roomPlanBlockSchema, submitRoomPlanSchema } from "@/domain/onsite-room-plan";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { schoolIdentity, verifyChurchEvidenceSubmitter } from "./school-opening.server";
import { requireCurrentSiteLocalDelegate } from "./site-local-delegation.server";
import { ROOM_COVERAGE_DOCUMENT_CATEGORY } from "./onsite-block-room-plan.server";
import type { z } from "zod";

type Reader = Pick<typeof db, "select">;
type BlockInput = z.infer<typeof roomPlanBlockSchema>;

/** Exact canonical schedule identity, shared by plan submission and review. */
export async function scheduledRoomBlock(tx: Reader, input: BlockInput) {
  const school = await schoolIdentity(tx, input.programId);
  const [block] = await tx.select({ startsAtLocal: scheduleTemplatePeriods.startsAtLocal,
    endsAtLocal: scheduleTemplatePeriods.endsAtLocal, title: sections.title,
  }).from(sections)
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
    .innerJoin(scheduleTemplates, eq(scheduleTemplates.id, sections.scheduleTemplateId))
    .innerJoin(scheduleTemplatePeriods, eq(scheduleTemplatePeriods.scheduleTemplateId, scheduleTemplates.id))
    .innerJoin(academicCalendars, and(eq(academicCalendars.schoolYearId, schoolYears.id),
      eq(academicCalendars.siteId, school.siteId), eq(academicCalendars.active, true)))
    .innerJoin(academicCalendarDays, eq(academicCalendarDays.academicCalendarId, academicCalendars.id))
    .where(and(eq(sections.id, input.sectionId), eq(sections.programId, input.programId),
      eq(sections.siteId, school.siteId), eq(sections.active, true),
      eq(schoolYears.organizationId, school.organizationId), eq(schoolYears.siteId, school.siteId),
      or(eq(schoolYears.programId, input.programId), isNull(schoolYears.programId)), eq(schoolYears.status, "active"),
      lte(schoolYears.startsOn, input.date), gte(schoolYears.endsOn, input.date),
      lte(terms.startsOn, input.date), gte(terms.endsOn, input.date),
      eq(scheduleTemplates.schoolYearId, schoolYears.id), eq(scheduleTemplates.siteId, school.siteId),
      or(eq(scheduleTemplates.programId, input.programId), isNull(scheduleTemplates.programId)),
      eq(scheduleTemplates.active, true), lte(scheduleTemplates.effectiveFrom, input.date),
      or(isNull(scheduleTemplates.effectiveThrough), gte(scheduleTemplates.effectiveThrough, input.date)),
      eq(scheduleTemplatePeriods.id, input.periodId), eq(scheduleTemplatePeriods.type, "instruction"),
      eq(scheduleTemplatePeriods.dayOfWeek, new Date(input.date + "T12:00:00Z").getUTCDay()),
      eq(academicCalendarDays.calendarDate, input.date),
      or(eq(academicCalendarDays.type, "instructional"), and(eq(academicCalendarDays.type, "special"),
        sql`${academicCalendarDays.instructionalMinutes} > 0`)),
    )).limit(1);
  if (!block || block.startsAtLocal >= block.endsAtLocal)
    throw new AuthorizationError("current scheduled instructional Section, period and calendar date");
  return { school, block };
}

export async function authorizeRoomPlanHost(tx: Reader, actor: AccessContext,
  school: Awaited<ReturnType<typeof schoolIdentity>>) {
  if (actor.role === "registrar") return verifyChurchEvidenceSubmitter(actor, school);
  if (actor.role !== "site_leader" || actor.demoFacilitator || !actor.actorPersonId ||
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
  )).orderBy(desc(documents.createdAt), desc(documents.id)).limit(1);
}

export async function submitOnsiteRoomPlan(actor: AccessContext, value: z.infer<typeof submitRoomPlanSchema>) {
  const input = submitRoomPlanSchema.parse(value);
  return db.transaction(async tx => {
    await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, input.programId)).for("update");
    const { school, block } = await scheduledRoomBlock(tx, input);
    await authorizeRoomPlanHost(tx, actor, school);
    const [site] = await tx.select({ timezone: sites.timezone }).from(sites).where(eq(sites.id, school.siteId)).limit(1);
    const timezone = site!.timezone;
    const today = siteDate(new Date(), timezone);
    const horizon = siteDate(new Date(Date.now() + 30 * 86400_000), timezone);
    if (input.date < today || input.date > horizon) throw new Error("Plan a block today or within the next 30 days");
    const expiresAt = new Date(input.expiresAt);
    if (!coversLocalSupervisionBlock({ date: input.date, timeZone: timezone, ...block,
      effectiveFrom: new Date(), effectiveThrough: expiresAt }))
      throw new Error("Plan validity must cover the entire scheduled block");
    const metadata = { siteId: school.siteId, programId: input.programId, sectionId: input.sectionId,
      periodId: input.periodId, date: input.date, primaryPersonId: input.primaryPersonId,
      backupPersonId: input.backupPersonId, roomLabel: input.roomLabel, roomCapacity: input.roomCapacity,
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
