import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, asc, inArray, isNull, ne, notExists, gte } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, assertSiteGranted, recordAudit, requireActor } from "@/modules/identity/actors.server";
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
    db.select().from(schema.calendarEvents).where(and(inArray(schema.calendarEvents.siteId,sites),isNull(schema.calendarEvents.sectionId),ne(schema.calendarEvents.type,"personal"),notExists(db.select({id:schema.calendarEventParticipants.id}).from(schema.calendarEventParticipants).where(eq(schema.calendarEventParticipants.calendarEventId,schema.calendarEvents.id))))).orderBy(asc(schema.calendarEvents.startsAt)).limit(50),
    db.select().from(schema.notifications).where(eq(schema.notifications.recipientPersonId,actor.actorPersonId)),
    viewerRole==="guardian" ? db.select({id:schema.conferenceSlots.id,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,status:schema.conferenceSlots.status})
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
    slots:slots.map(s=>({id:s.id,startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),status:s.status})),
    bookings:bookings.map(b=>({...b,startsAt:b.startsAt.toISOString(),endsAt:b.endsAt.toISOString()})),
  };
});
export const bookOfficeHour=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({slotId:z.string().uuid(),studentPersonId:z.string().uuid()}).parse(value))
  .handler(async({data})=>{
    const actor=await requireActor(["guardian"]);
   const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [slotSite]=await tx.select({siteId:schema.conferenceSeries.siteId,seriesStatus:schema.conferenceSeries.status,sectionId:schema.conferenceSeries.sectionId,startsAt:schema.conferenceSlots.startsAt}).from(schema.conferenceSlots)
        .innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
        .where(eq(schema.conferenceSlots.id,data.slotId)).limit(1);
      if(!slotSite||slotSite.seriesStatus!=="published"||slotSite.startsAt<=new Date()) throw new Error("Office-hour slot not available");
      assertSiteGranted(actor,slotSite.siteId);
      const [child]=await tx.select({studentProfileId:schema.studentProfiles.id}).from(schema.guardianRelationships)
        .innerJoin(schema.studentProfiles,eq(schema.studentProfiles.personId,schema.guardianRelationships.studentPersonId))
        .where(and(eq(schema.guardianRelationships.guardianPersonId,actor.actorPersonId),eq(schema.guardianRelationships.canViewAcademics,true),eq(schema.guardianRelationships.studentPersonId,data.studentPersonId))).limit(1);
      if(!child) throw new AuthorizationError("guardian relationship");
      const [siteEnrollment]=await tx.select({id:schema.enrollments.id}).from(schema.enrollments)
        .innerJoin(schema.programs,eq(schema.programs.id,schema.enrollments.programId))
        .where(and(eq(schema.enrollments.studentProfileId,child.studentProfileId),eq(schema.enrollments.status,"active"),eq(schema.programs.siteId,slotSite.siteId))).limit(1);
      if(!siteEnrollment)throw new AuthorizationError("child enrollment at selected school");
      if(slotSite.sectionId){
        const [sectionEnrollment]=await tx.select({id:schema.enrollments.id}).from(schema.enrollments).where(and(eq(schema.enrollments.studentProfileId,child.studentProfileId),eq(schema.enrollments.sectionId,slotSite.sectionId),eq(schema.enrollments.status,"active"),eq(schema.enrollments.kind,"section"))).limit(1);
        if(!sectionEnrollment)throw new AuthorizationError("child is not enrolled in the appointment section");
      }
      const [slot]=await tx.update(schema.conferenceSlots).set({status:"booked",updatedAt:new Date()}).where(and(eq(schema.conferenceSlots.id,data.slotId),eq(schema.conferenceSlots.status,"available"))).returning({id:schema.conferenceSlots.id});
      if(!slot) throw new Error("Office-hour slot already taken");
      const [booking]=await tx.insert(schema.conferenceBookings).values({conferenceSlotId:slot.id,studentProfileId:child.studentProfileId,guardianPersonId:actor.actorPersonId,status:"booked"}).returning({id:schema.conferenceBookings.id});
      await recordAudit(tx,actor,{action:"conference.book",resourceType:"conference_booking",resourceId:booking!.id,after:{slotId:slot.id,studentProfileId:child.studentProfileId},scope:{siteId:slotSite.siteId}});
      return {bookingId:booking!.id};
    });
  });


/** Move a guardian-owned future booking within its published conference series. */
export const rescheduleOfficeHour=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({bookingId:z.string().uuid(),newSlotId:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  const actor=await requireActor(["guardian"]);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [current]=await tx.select({
    id:s.conferenceBookings.id,oldSlotId:s.conferenceSlots.id,
    seriesId:s.conferenceSlots.conferenceSeriesId,startsAt:s.conferenceSlots.startsAt,
    siteId:s.conferenceSeries.siteId,
   }).from(s.conferenceBookings)
    .innerJoin(s.conferenceSlots,eq(s.conferenceSlots.id,s.conferenceBookings.conferenceSlotId))
    .innerJoin(s.conferenceSeries,eq(s.conferenceSeries.id,s.conferenceSlots.conferenceSeriesId))
    .where(and(eq(s.conferenceBookings.id,data.bookingId),
      eq(s.conferenceBookings.guardianPersonId,actor.actorPersonId),
      eq(s.conferenceBookings.status,"booked"))).limit(1);
   if(!current||current.startsAt<=new Date())throw new AuthorizationError("future guardian booking");
   assertSiteGranted(actor,current.siteId);
   if(current.oldSlotId===data.newSlotId)return {saved:true};
   const [next]=await tx.update(s.conferenceSlots)
    .set({status:"booked",updatedAt:new Date()})
    .where(and(eq(s.conferenceSlots.id,data.newSlotId),
      eq(s.conferenceSlots.conferenceSeriesId,current.seriesId),
      eq(s.conferenceSlots.status,"available"),gte(s.conferenceSlots.startsAt,new Date())))
    .returning({id:s.conferenceSlots.id});
   if(!next)throw new Error("Replacement slot is no longer available");
   await tx.update(s.conferenceBookings)
    .set({conferenceSlotId:next.id,updatedAt:new Date()})
    .where(and(eq(s.conferenceBookings.id,current.id),
      eq(s.conferenceBookings.conferenceSlotId,current.oldSlotId)));
   await tx.update(s.conferenceSlots).set({status:"available",updatedAt:new Date()})
    .where(eq(s.conferenceSlots.id,current.oldSlotId));
   await recordAudit(tx,actor,{action:"conference.reschedule",
    resourceType:"conference_booking",resourceId:current.id,
    before:{slotId:current.oldSlotId},after:{slotId:next.id},scope:{siteId:current.siteId}});
   return {saved:true};
  });
 });
