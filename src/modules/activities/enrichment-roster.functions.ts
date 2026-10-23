import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { readEnrichmentPublication } from "@/domain/enrichment-publication";
import { isExtendedLearningType } from "@/domain/program-offerings";

/**
 * Registrar-only, verified scoped roster for one published day. Expected
 * participants are derived from immutable purchased-session snapshots.
 * Registration is not a check-in or an authorized pickup.
 */
export const listEnrichmentSessionRoster = createServerFn({method:"GET"})
  .validator((input: unknown) => z.object({
    seasonId:z.string().uuid(), sessionId:z.string().uuid(),
  }).strict().parse(input))
  .handler(async ({data})=>{
    const [{requireActor},{db},s] = await Promise.all([
      import("@/modules/identity/actors.server"),import("@/db/client"),import("@/db/schema"),
    ]);
    const actor=await requireActor(["registrar"],"program.read");
    const [record]=await db.select({
      seasonId:s.activitySeasons.id,seasonStatus:s.activitySeasons.status,
      metadata:s.activitySeasons.metadata,
      activityMetadata:s.activities.metadata,
      programType:s.programs.type,programStatus:s.programs.status,
      programId:s.programs.id,organizationId:s.programs.organizationId,
      siteId:s.activities.siteId,programSiteId:s.programs.siteId,
    }).from(s.activitySeasons)
      .innerJoin(s.activities,eq(s.activities.id,s.activitySeasons.activityId))
      .innerJoin(s.programs,eq(s.programs.id,s.activities.programId))
      .where(eq(s.activitySeasons.id,data.seasonId)).limit(1);
    if(!record || !isExtendedLearningType(record.programType) ||
      record.seasonStatus!=="registration" || record.programStatus!=="active" ||
      record.siteId!==record.programSiteId ||
      !actor.scope.organizationIds?.includes(record.organizationId) ||
      !actor.scope.siteIds?.includes(record.siteId) ||
      !actor.scope.programIds?.includes(record.programId))
      throw new Error("Not authorized to view the published season roster");

    const publication=readEnrichmentPublication(record.metadata) ??
      readEnrichmentPublication(record.activityMetadata);
    if(!publication || publication.seasonId!==record.seasonId ||
      publication.programId!==record.programId || publication.siteId!==record.siteId)
      throw new Error("Season is not published for family registration");

    const [session]=await db.select({
      id:s.calendarEvents.id,title:s.calendarEvents.title,
      startsAt:s.calendarEvents.startsAt,timezone:s.calendarEvents.timezone,
      metadata:s.calendarEvents.metadata,
    }).from(s.calendarEvents).where(and(
      eq(s.calendarEvents.id,data.sessionId),
      eq(s.calendarEvents.sourceId,data.seasonId),
      eq(s.calendarEvents.sourceType,"activity_season"),
      eq(s.calendarEvents.type,"extended_learning_session"),
      eq(s.calendarEvents.programId,record.programId),
      eq(s.calendarEvents.siteId,record.siteId),
      eq(s.calendarEvents.organizationId,record.organizationId),
    )).limit(1);
    if(!session || session.metadata.extendedLearningDraft!==false ||
      session.metadata.cancelled===true)
      throw new Error("Session is not published");

    const registrations=await db.select({
      id:s.activityRegistrations.id,status:s.activityRegistrations.status,
      studentProfileId:s.activityRegistrations.studentProfileId,
      metadata:s.activityRegistrations.metadata,
      firstName:s.people.legalFirstName,lastName:s.people.legalLastName,
      grade:s.studentProfiles.gradeLevel,
    }).from(s.activityRegistrations)
      .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.activityRegistrations.studentProfileId))
      .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
      .where(eq(s.activityRegistrations.activitySeasonId,data.seasonId));
    const roster=registrations.filter(registration=>{
      if(!["pending","eligible","conditional"].includes(registration.status))return false;
      const value=registration.metadata.enrichmentSelection;
      if(!value || typeof value!=="object")return true; // older whole-season enrollment
      if(!("sessionIds" in value) || !Array.isArray(value.sessionIds))return false;
      return value.sessionIds.includes(session.id);
    }).map(({metadata,...person})=>person).sort((a,b)=>
      a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName));
    return {session:{
      id:session.id,title:session.title,startsAt:session.startsAt.toISOString(),
      timezone:session.timezone,
    },roster,count:roster.length};
  });
