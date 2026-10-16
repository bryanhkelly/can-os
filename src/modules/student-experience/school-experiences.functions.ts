import { assertSyntheticMutation } from "./demo-write-gate";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, assertSiteGranted, recordAudit, requireActor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";
const EVENT_IDS = ["f1000000-0000-4000-8000-000000000080","f1000000-0000-4000-8000-000000000081","f1000000-0000-4000-8000-000000000082"];
const NOTICE_IDS = ["f3000000-0000-4000-8000-000000000001","f3000000-0000-4000-8000-000000000002"];
const SLOT_IDS = ["f3000000-0000-4000-8000-000000000004","f3000000-0000-4000-8000-000000000005","f3000000-0000-4000-8000-000000000006"];
const SERIES_ID = "f3000000-0000-4000-8000-000000000003";
const anyone = () => requireActor(["student","guardian","registrar","teacher"]);
export const getSchoolExperiences = createServerFn({method:"GET"}).handler(async()=>{
  const actor=await anyone();
  setResponseHeader("Cache-Control","private, no-store");
  const sites=actorSiteIds(actor);
  const viewerRole=actor.role as "student"|"guardian"|"registrar"|"teacher";
  if(!process.env.DATABASE_URL) return {connected:false,viewerRole,events:[],notices:[],slots:[]};
  const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [events,notices,slots]=await Promise.all([
    db.select().from(schema.calendarEvents).where(inArray(schema.calendarEvents.siteId,sites)).orderBy(asc(schema.calendarEvents.startsAt)),
    db.select().from(schema.notifications).where(eq(schema.notifications.recipientPersonId,actor.actorPersonId)),
    db.select({id:schema.conferenceSlots.id,startsAt:schema.conferenceSlots.startsAt,endsAt:schema.conferenceSlots.endsAt,status:schema.conferenceSlots.status})
      .from(schema.conferenceSlots).innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
      .where(and(eq(schema.conferenceSlots.conferenceSeriesId,SERIES_ID),inArray(schema.conferenceSeries.siteId,sites))).orderBy(asc(schema.conferenceSlots.startsAt)),
  ]);
  return {connected:true,viewerRole,
    events:events.filter(e=>EVENT_IDS.includes(e.id)).map(e=>({id:e.id,title:e.title,startsAt:e.startsAt.toISOString(),timezone:e.timezone,status:typeof e.metadata.demoStatus==="string"?e.metadata.demoStatus:"scheduled"})),
    notices:notices.filter(n=>NOTICE_IDS.includes(n.id)).map(n=>({id:n.id,title:n.title,body:n.body??"",acknowledged:n.status==="read"})),
    slots:slots.filter(s=>SLOT_IDS.includes(s.id)).map(s=>({id:s.id,startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),status:s.status})),
  };
});
export const setSyntheticCalendarStatus=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({eventId:z.string().uuid(),status:z.enum(["scheduled","moved","cancelled"])}).parse(value))
  .handler(async({data})=>{
  assertSyntheticMutation("registrar");
    const actor=await requireActor(["registrar"]);
    if(!EVENT_IDS.includes(data.eventId)) throw new Error("Event is outside synthetic fixture");
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [current]=await tx.select({metadata:schema.calendarEvents.metadata,siteId:schema.calendarEvents.siteId}).from(schema.calendarEvents).where(eq(schema.calendarEvents.id,data.eventId)).for("update").limit(1);
      if(!current) throw new Error("Event not found");
      assertSiteGranted(actor,current.siteId);
      const before=typeof current.metadata.demoStatus==="string"?current.metadata.demoStatus:"scheduled";
      await tx.update(schema.calendarEvents).set({metadata:{...current.metadata,demoStatus:data.status},updatedAt:new Date()}).where(eq(schema.calendarEvents.id,data.eventId));
      await recordAudit(tx,actor,{action:"calendar.status.set",resourceType:"calendar_event",resourceId:data.eventId,before:{status:before},after:{status:data.status},scope:{siteId:current.siteId}});
      return {saved:true};
    });
  });
export const acknowledgeSyntheticNotice=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({noticeId:z.string().uuid()}).parse(value))
  .handler(async({data})=>{
  assertSyntheticMutation("student");
    const actor=await anyone();
    if(!NOTICE_IDS.includes(data.noticeId)) throw new Error("Notice outside synthetic fixture");
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    const rows=await db.update(schema.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()}).where(and(eq(schema.notifications.id,data.noticeId),eq(schema.notifications.recipientPersonId,actor.actorPersonId))).returning({id:schema.notifications.id});
    if(!rows.length) throw new Error("Notice not found");
    return {saved:true};
  });
export const bookSyntheticOfficeHour=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({slotId:z.string().uuid()}).parse(value))
  .handler(async({data})=>{
  assertSyntheticMutation("guardian");
    const actor=await requireActor(["guardian"]);
    if(!SLOT_IDS.includes(data.slotId)) throw new Error("Slot outside synthetic fixture");
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [slotSite]=await tx.select({siteId:schema.conferenceSeries.siteId}).from(schema.conferenceSlots)
        .innerJoin(schema.conferenceSeries,eq(schema.conferenceSeries.id,schema.conferenceSlots.conferenceSeriesId))
        .where(eq(schema.conferenceSlots.id,data.slotId)).limit(1);
      if(!slotSite) throw new Error("Office-hour slot not found");
      assertSiteGranted(actor,slotSite.siteId);
      const [child]=await tx.select({studentProfileId:schema.studentProfiles.id}).from(schema.guardianRelationships)
        .innerJoin(schema.studentProfiles,eq(schema.studentProfiles.personId,schema.guardianRelationships.studentPersonId))
        .where(and(eq(schema.guardianRelationships.guardianPersonId,actor.actorPersonId),eq(schema.guardianRelationships.canViewAcademics,true))).limit(1);
      if(!child) throw new AuthorizationError("guardian relationship");
      const [slot]=await tx.update(schema.conferenceSlots).set({status:"booked",updatedAt:new Date()}).where(and(eq(schema.conferenceSlots.id,data.slotId),eq(schema.conferenceSlots.status,"available"))).returning({id:schema.conferenceSlots.id});
      if(!slot) throw new Error("Office-hour slot already taken");
      const [booking]=await tx.insert(schema.conferenceBookings).values({conferenceSlotId:slot.id,studentProfileId:child.studentProfileId,guardianPersonId:actor.actorPersonId,status:"booked"}).returning({id:schema.conferenceBookings.id});
      await recordAudit(tx,actor,{action:"conference.book",resourceType:"conference_booking",resourceId:booking!.id,after:{slotId:slot.id,studentProfileId:child.studentProfileId},scope:{siteId:slotSite.siteId}});
      return {bookingId:booking!.id};
    });
  });
