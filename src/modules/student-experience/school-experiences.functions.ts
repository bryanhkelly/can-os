import { createServerFn } from "@tanstack/react-start";
import { and, eq, asc } from "drizzle-orm";
const PERSON = "f1000000-0000-4000-8000-000000000005";
const STUDENT = "f1000000-0000-4000-8000-000000000007";
const GUARDIAN = "f3000000-0000-4000-8000-000000000007";
const SITE = "f1000000-0000-4000-8000-000000000003";
const EVENT_IDS = ["f1000000-0000-4000-8000-000000000080","f1000000-0000-4000-8000-000000000081","f1000000-0000-4000-8000-000000000082"];
const NOTICE_IDS = ["f3000000-0000-4000-8000-000000000001","f3000000-0000-4000-8000-000000000002"];
const SLOT_IDS = ["f3000000-0000-4000-8000-000000000004","f3000000-0000-4000-8000-000000000005","f3000000-0000-4000-8000-000000000006"];
export const getSchoolExperiences = createServerFn({method:"GET"}).handler(async()=>{
  if(!process.env.DATABASE_URL) return {connected:false,events:[],notices:[],slots:[]};
  const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [events,notices,slots]=await Promise.all([
    db.select().from(schema.calendarEvents).where(eq(schema.calendarEvents.siteId,SITE)).orderBy(asc(schema.calendarEvents.startsAt)),
    db.select().from(schema.notifications).where(eq(schema.notifications.recipientPersonId,PERSON)),
    db.select().from(schema.conferenceSlots).where(eq(schema.conferenceSlots.conferenceSeriesId,"f3000000-0000-4000-8000-000000000003")).orderBy(asc(schema.conferenceSlots.startsAt)),
  ]);
  return {connected:true,
    events:events.filter(e=>EVENT_IDS.includes(e.id)).map(e=>({id:e.id,title:e.title,startsAt:e.startsAt.toISOString(),timezone:e.timezone,status:typeof e.metadata.demoStatus==="string"?e.metadata.demoStatus:"scheduled"})),
    notices:notices.filter(n=>NOTICE_IDS.includes(n.id)).map(n=>({id:n.id,title:n.title,body:n.body??"",acknowledged:n.status==="read"})),
    slots:slots.filter(s=>SLOT_IDS.includes(s.id)).map(s=>({id:s.id,startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),status:s.status})),
  };
});
export const setSyntheticCalendarStatus=createServerFn({method:"POST"})
  .validator((value:{eventId:string;status:"scheduled"|"moved"|"cancelled"})=>value)
  .handler(async({data})=>{
    if(!EVENT_IDS.includes(data.eventId)) throw new Error("Event is outside synthetic fixture");
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    const [current]=await db.select({metadata:schema.calendarEvents.metadata}).from(schema.calendarEvents).where(and(eq(schema.calendarEvents.id,data.eventId),eq(schema.calendarEvents.siteId,SITE))).limit(1);
    if(!current) throw new Error("Event not found");
    await db.update(schema.calendarEvents).set({metadata:{...current.metadata,demoStatus:data.status},updatedAt:new Date()}).where(eq(schema.calendarEvents.id,data.eventId));
    return {saved:true};
  });
export const acknowledgeSyntheticNotice=createServerFn({method:"POST"})
  .validator((value:{noticeId:string})=>value)
  .handler(async({data})=>{
    if(!NOTICE_IDS.includes(data.noticeId)) throw new Error("Notice outside synthetic fixture");
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    await db.update(schema.notifications).set({status:"read",readAt:new Date(),updatedAt:new Date()}).where(and(eq(schema.notifications.id,data.noticeId),eq(schema.notifications.recipientPersonId,PERSON)));
    return {saved:true};
  });
export const bookSyntheticOfficeHour=createServerFn({method:"POST"})
  .validator((value:{slotId:string})=>value)
  .handler(async({data})=>{
    if(!SLOT_IDS.includes(data.slotId)) throw new Error("Slot outside synthetic fixture");
    const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
    return db.transaction(async tx=>{
      const [slot]=await tx.update(schema.conferenceSlots).set({status:"booked",updatedAt:new Date()}).where(and(eq(schema.conferenceSlots.id,data.slotId),eq(schema.conferenceSlots.status,"available"))).returning({id:schema.conferenceSlots.id});
      if(!slot) throw new Error("Office-hour slot already taken");
      const [booking]=await tx.insert(schema.conferenceBookings).values({conferenceSlotId:slot.id,studentProfileId:STUDENT,guardianPersonId:GUARDIAN,status:"booked"}).returning({id:schema.conferenceBookings.id});
      return {bookingId:booking!.id};
    });
  });
