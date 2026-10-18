import { createServerFn } from "@tanstack/react-start";
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
  const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [events,notices,slots,bookings]=await Promise.all([
    db.select().from(schema.calendarEvents).where(and(inArray(schema.calendarEvents.siteId,sites),gte(schema.calendarEvents.startsAt,new Date()),isNull(schema.calendarEvents.sectionId),ne(schema.calendarEvents.type,"personal"),ne(schema.calendarEvents.type,"study_group"),or(isNull(schema.calendarEvents.programId),inArray(schema.calendarEvents.programId,actor.scope.programIds??[])),notExists(db.select({id:schema.calendarEventParticipants.id}).from(schema.calendarEventParticipants).where(eq(schema.calendarEventParticipants.calendarEventId,schema.calendarEvents.id))))).orderBy(asc(schema.calendarEvents.startsAt)).limit(50),
    db.select().from(schema.notifications).where(eq(schema.notifications.recipientPersonId,actor.actorPersonId)),
    viewerRole==="guardian" ? db.select({id:schema.conferenceSlots.id,seriesId:schema.conferenceSlots.conferenceSeriesId,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,status:schema.conferenceSlots.status})
      .from(schema.conferenceSlots).innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
      .where(and(inArray(schema.conferenceSeries.siteId,sites),eq(schema.conferenceSeries.status,"published"),eq(schema.conferenceSlots.status,"available"),gte(schema.conferenceSlots.startsAt,new Date()))).orderBy(asc(schema.conferenceSlots.startsAt)).limit(25) : Promise.resolve([]),
    viewerRole==="guardian" ? db.select({id:schema.conferenceBookings.id,slotId:schema.conferenceBookings.conferenceSlotId,studentPersonId:schema.studentProfiles.personId,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,seriesId:schema.conferenceSlots.conferenceSeriesId}).from(schema.conferenceBookings)
      .innerJoin(schema.conferenceSlots,eq(schema.conferenceSlots.id,schema.conferenceBookings.conferenceSlotId))
      .innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
      .innerJoin(schema.studentProfiles,eq(schema.studentProfiles.id,schema.conferenceBookings.studentProfileId))
      .where(and(eq(schema.conferenceBookings.guardianPersonId,actor.actorPersonId),eq(schema.conferenceBookings.status,"booked"),inArray(schema.conferenceSeries.siteId,sites),gte(schema.conferenceSlots.startsAt,new Date()))).orderBy(asc(schema.conferenceSlots.startsAt)).limit(30) : Promise.resolve([]),
  ]);
  return {connected:true,viewerRole,
    events:events.map(e=>({id:e.id,title:e.title,startsAt:e.startsAt.toISOString(),timezone:e.timezone,status:"scheduled"})),
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
      .where(and(eq(schema.guardianRelationships.guardianPersonId,actor.actorPersonId),eq(schema.guardianRelationships.canViewAcademics,true),eq(schema.guardianRelationships.studentPersonId,data.studentPersonId))).limit(1);
    if(!child) throw new AuthorizationError("guardian relationship");
    const {bookConference}=await import("@/modules/conferences/conference-service");
    const bookingId=await bookConference(actor,{conferenceSlotId:data.slotId,studentProfileId:child.studentProfileId},{enrollmentScope:{programIds:actor.scope.programIds??[]}});
    return {bookingId};
  });


/** Move a guardian-owned future booking within its published conference series. */
export const rescheduleOfficeHour=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({bookingId:z.string().uuid(),newSlotId:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["guardian"]);
  const {rescheduleConferenceBooking}=await import("@/modules/conferences/conference-service");
  await rescheduleConferenceBooking(actor,{bookingId:data.bookingId,newSlotId:data.newSlotId},{enrollmentScope:{programIds:actor.scope.programIds??[]}});
  return {saved:true};
 });