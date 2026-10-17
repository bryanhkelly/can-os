import { assertSyntheticMutation } from "@/modules/_demo/demo-write-gate";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, asc, inArray, isNull, ne, notExists } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, assertSiteGranted, recordAudit, requireActor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";




const anyone = () => requireActor(["student","guardian","registrar","teacher"]);
export const getSchoolExperiences = createServerFn({method:"GET"}).handler(async()=>{
  const actor=await anyone();
  setResponseHeader("Cache-Control","private, no-store");
  const sites=actorSiteIds(actor);
  const viewerRole=actor.role as "student"|"guardian"|"registrar"|"teacher";
  if(!process.env.DATABASE_URL) return {connected:false,viewerRole,events:[],notices:[],slots:[]};
  const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [events,notices,slots]=await Promise.all([
    db.select().from(schema.calendarEvents).where(and(inArray(schema.calendarEvents.siteId,sites),isNull(schema.calendarEvents.sectionId),ne(schema.calendarEvents.type,"personal"),notExists(db.select({id:schema.calendarEventParticipants.id}).from(schema.calendarEventParticipants).where(eq(schema.calendarEventParticipants.calendarEventId,schema.calendarEvents.id))))).orderBy(asc(schema.calendarEvents.startsAt)).limit(50),
    db.select().from(schema.notifications).where(eq(schema.notifications.recipientPersonId,actor.actorPersonId)),
    viewerRole==="guardian" ? db.select({id:schema.conferenceSlots.id,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,status:schema.conferenceSlots.status})
      .from(schema.conferenceSlots).innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
      .where(inArray(schema.conferenceSeries.siteId,sites)).orderBy(asc(schema.conferenceSlots.startsAt)).limit(25) : Promise.resolve([]),
  ]);
  return {connected:true,viewerRole,
    events:events.map(e=>({id:e.id,title:e.title,startsAt:e.startsAt.toISOString(),timezone:e.timezone,status:"scheduled"})),
    notices:notices.map(n=>({id:n.id,title:n.title,body:n.body??"",acknowledged:n.status==="read"})),
    slots:slots.map(s=>({id:s.id,startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),status:s.status})),
  };
});
export const bookSyntheticOfficeHour=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({slotId:z.string().uuid(),studentProfileId:z.string().uuid()}).parse(value))
  .handler(async({data})=>{
  assertSyntheticMutation("guardian");
    const actor=await requireActor(["guardian"]);
   const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [slotSite]=await tx.select({siteId:schema.conferenceSeries.siteId}).from(schema.conferenceSlots)
        .innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
        .where(eq(schema.conferenceSlots.id,data.slotId)).limit(1);
      if(!slotSite) throw new Error("Office-hour slot not found");
      assertSiteGranted(actor,slotSite.siteId);
      const [child]=await tx.select({studentProfileId:schema.studentProfiles.id}).from(schema.guardianRelationships)
        .innerJoin(schema.studentProfiles,eq(schema.studentProfiles.personId,schema.guardianRelationships.studentPersonId))
        .where(and(eq(schema.guardianRelationships.guardianPersonId,actor.actorPersonId),eq(schema.guardianRelationships.canViewAcademics,true),eq(schema.studentProfiles.id,data.studentProfileId))).limit(1);
      if(!child) throw new AuthorizationError("guardian relationship");
      const [slot]=await tx.update(schema.conferenceSlots).set({status:"booked",updatedAt:new Date()}).where(and(eq(schema.conferenceSlots.id,data.slotId),eq(schema.conferenceSlots.status,"available"))).returning({id:schema.conferenceSlots.id});
      if(!slot) throw new Error("Office-hour slot already taken");
      const [booking]=await tx.insert(schema.conferenceBookings).values({conferenceSlotId:slot.id,studentProfileId:child.studentProfileId,guardianPersonId:actor.actorPersonId,status:"booked"}).returning({id:schema.conferenceBookings.id});
      await recordAudit(tx,actor,{action:"conference.book",resourceType:"conference_booking",resourceId:booking!.id,after:{slotId:slot.id,studentProfileId:child.studentProfileId},scope:{siteId:slotSite.siteId}});
      return {bookingId:booking!.id};
    });
  });
