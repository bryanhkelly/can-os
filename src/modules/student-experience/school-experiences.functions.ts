import { createServerFn } from "@tanstack/react-start";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, asc, inArray, isNull, ne, notExists, gte, or } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";




const anyone = () => requireActor(["student","guardian","registrar","teacher"]);
export const getSchoolExperiences = createServerFn({method:"GET"}).handler(async()=>{
  const actor=await anyone();
  setResponseHeader("Cache-Control","private, no-store");
  const sites=actorSiteIds(actor);
  const viewerRole=actor.role as "student"|"guardian"|"registrar"|"teacher";
  if(!process.env.DATABASE_URL) return {connected:false,viewerRole,events:[],notices:[],slots:[],bookings:[]};
  const [{db},schema,{getNotifications}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("@/modules/communication/notification-center.functions")]);
  const [events,notices,slots,bookings]=await Promise.all([
    db.select().from(schema.calendarEvents)
      .innerJoin(schema.scheduledOccurrences,eq(schema.calendarEvents.scheduledOccurrenceId,schema.scheduledOccurrences.id))
      .where(and(inArray(schema.scheduledOccurrences.siteId,sites),gte(schema.scheduledOccurrences.startsAt,new Date()),isNull(schema.scheduledOccurrences.sectionId),ne(schema.calendarEvents.type,"personal"),ne(schema.calendarEvents.type,"study_group"),or(isNull(schema.scheduledOccurrences.programId),inArray(schema.scheduledOccurrences.programId,actor.scope.programIds??[])),notExists(db.select({id:schema.calendarEventParticipants.id}).from(schema.calendarEventParticipants).where(eq(schema.calendarEventParticipants.calendarEventId,schema.calendarEvents.id)))))
      .orderBy(asc(schema.scheduledOccurrences.startsAt)).limit(50)
      .then(rows=>rows.map(row=>({
        ...row.calendar_events,
        startsAt:row.scheduled_occurrences.startsAt,
        timezone:row.scheduled_occurrences.timezone,
      }))),
    // Reuse the current guardian/student permission filtering on title and body.
    getNotifications(),
    viewerRole==="guardian" ? db.select({id:schema.conferenceSlots.id,seriesId:schema.conferenceSlots.conferenceSeriesId,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,status:schema.conferenceSlots.status})
      .from(schema.conferenceSlots).innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
      .where(and(inArray(schema.conferenceSeries.siteId,sites),eq(schema.conferenceSeries.status,"published"),eq(schema.conferenceSlots.status,"available"),gte(schema.conferenceSlots.startsAt,new Date()))).orderBy(asc(schema.conferenceSlots.startsAt)).limit(25) : Promise.resolve([]),
    viewerRole==="guardian" ? db.select({id:schema.conferenceBookings.id,slotId:schema.conferenceBookings.conferenceSlotId,studentPersonId:schema.studentProfiles.personId,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,seriesId:schema.conferenceSlots.conferenceSeriesId}).from(schema.conferenceBookings)
      .innerJoin(schema.conferenceSlots,eq(schema.conferenceSlots.id,schema.conferenceBookings.conferenceSlotId))
      .innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
      .innerJoin(schema.studentProfiles,eq(schema.studentProfiles.id,schema.conferenceBookings.studentProfileId))
      .innerJoin(schema.guardianRelationships,guardianRelationshipPredicate({
        guardianPersonId:actor.actorPersonId,
        studentPersonId:schema.studentProfiles.personId,
        access:"academic",
      }))
      .innerJoin(schema.enrollments,and(
        eq(schema.enrollments.studentProfileId,schema.studentProfiles.id),
        eq(schema.enrollments.kind,"program"),eq(schema.enrollments.status,"active"),
      ))
      .innerJoin(schema.programs,and(
        eq(schema.programs.id,schema.enrollments.programId),
        eq(schema.programs.status,"active"),
        eq(schema.programs.siteId,schema.conferenceSeries.siteId),
      ))
      .where(and(eq(schema.conferenceBookings.guardianPersonId,actor.actorPersonId),eq(schema.conferenceBookings.status,"booked"),inArray(schema.conferenceSeries.siteId,sites),inArray(schema.programs.id,actor.scope.programIds??[]),gte(schema.conferenceSlots.startsAt,new Date()))).orderBy(asc(schema.conferenceSlots.startsAt)).limit(30) : Promise.resolve([]),
  ]);
  return {connected:true,viewerRole,
    events:events.map(e=>({id:e.id,title:e.title,startsAt:e.startsAt.toISOString(),timezone:e.timezone,status:e.metadata.cancelled===true?"cancelled":"scheduled"})),
    notices:notices.map(n=>({id:n.id,title:n.title,body:n.body??"",acknowledged:n.status==="read"})),
    slots:slots.map(s=>({id:s.id,seriesId:s.seriesId,startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),status:s.status})),
    bookings:bookings.map(b=>({...b,startsAt:b.startsAt.toISOString(),endsAt:b.endsAt.toISOString()})),
  };
});
export const bookOfficeHour=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({slotId:z.string().uuid(),studentPersonId:z.string().uuid()}).parse(value))
  .handler(async({data})=>{
    const actor=await requireActor(["guardian"]);
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    // Pure read: translate the selected student person into the guardian-linked profile.
    const [child]=await db.select({studentProfileId:schema.studentProfiles.id}).from(schema.guardianRelationships)
      .innerJoin(schema.studentProfiles,eq(schema.studentProfiles.personId,schema.guardianRelationships.studentPersonId))
      .where(guardianRelationshipPredicate({
        guardianPersonId: actor.actorPersonId, studentPersonId: data.studentPersonId, access: "academic",
      })).limit(1);
    if(!child) throw new AuthorizationError("guardian relationship");
    const {bookConference}=await import("@/modules/conferences/conference-service");
    const bookingId=await bookConference(actor,{conferenceSlotId:data.slotId,studentProfileId:child.studentProfileId});
    return {bookingId};
  });


/** Move a guardian-owned future booking within its published conference series. */
export const rescheduleOfficeHour=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({bookingId:z.string().uuid(),newSlotId:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["guardian"]);
  const {rescheduleConferenceBooking}=await import("@/modules/conferences/conference-service");
  await rescheduleConferenceBooking(actor,{bookingId:data.bookingId,newSlotId:data.newSlotId});
  return {saved:true};
 });

/** Cancel a guardian-owned booking, freeing the slot for another family. */
export const cancelOfficeHour=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({bookingId:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["guardian"]);
  const {cancelConferenceBooking}=await import("@/modules/conferences/conference-service");
  await cancelConferenceBooking(actor,{bookingId:data.bookingId});
  return {cancelled:true};
 });