import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {getGuardianStudents} from "@/modules/learning/guardian-academic-queries.functions";
import { Link, useRouter } from "@tanstack/react-router";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { bookOfficeHour, cancelOfficeHour, rescheduleOfficeHour } from "@/modules/student-experience/school-experiences.functions";
import { readNotification } from "@/modules/communication/notification-center.functions";

type Data={
 connected:boolean;
 viewerRole:"student"|"guardian"|"registrar"|"teacher";
 events:{id:string;title:string;startsAt:string;timezone:string;status:string}[];
 notices:{id:string;title:string;body:string;acknowledged:boolean}[];
 slots:{id:string;seriesId:string;startsAt:string;endsAt:string;status:string}[];
 bookings:{id:string;slotId:string;studentPersonId:string;seriesId:string;startsAt:string;endsAt:string}[];
};
export function LiveSchoolExperiences({data}:{data:Data}) {
 const router=useRouter();
 const familySearch=useSearch({strict:false}) as {student?:string};
 const [busy,setBusy]=useState(false);
 const [children,setChildren]=useState<{studentPersonId:string;firstName:string;lastName:string}[]>([]);
 const [selectedChild,setSelectedChild]=useState("");
 const [replacementSlots,setReplacementSlots]=useState<Record<string,string>>({});
 useEffect(()=>{if(data.viewerRole!=="guardian")return;let active=true;getGuardianStudents().then(result=>{if(active){setChildren(result.students);setSelectedChild(result.students.find(child=>child.studentPersonId===familySearch.student)?.studentPersonId??result.students[0]?.studentPersonId??"");}}).catch(()=>{});return()=>{active=false};},[data.viewerRole,familySearch.student]);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function perform(operation:()=>Promise<unknown>,success:string) {
  setBusy(true);setError("");setMessage("");
  try {
   await operation();
   setMessage(success);
   try { await router.invalidate(); }
   catch { setError("Your change was saved, but the calendar could not refresh. Reopen this page before trying again."); }
  }
  catch(err){setError(err instanceof Error?err.message:"Unable to save change");}
  finally{setBusy(false);}
 }
 const format=(stamp:string,tz="America/Los_Angeles")=>new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:tz}).format(new Date(stamp));
 return <section className="mt-6 w-full">
  <div className="rounded-2xl border bg-card p-5 sm:p-7">
   <div className="flex flex-wrap justify-between gap-3">
    <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">School experiences</p><h2 className="mt-2 font-serif text-2xl">Calendar, announcements & conferences</h2><p className="mt-2 text-sm text-muted-foreground">Your school calendar, announcements and teacher office hours.</p></div>
    {!data.connected&&<span role="status" className="h-fit rounded-full border border-border px-3 py-2 text-xs font-semibold">School updates temporarily unavailable</span>}
   </div>
   {message&&<p role="status" className="mt-4 rounded-lg border border-emerald-300 p-3 text-sm">{message}</p>}
   {error&&<p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
   <div className="mt-7 grid gap-7 lg:grid-cols-3">
    <div className="space-y-3">
     <h3 className="font-semibold">School calendar</h3>
     <p className="text-xs text-muted-foreground">Upcoming schedule changes and important dates.</p>
     {data.events.map(event=><div key={event.id} className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold"><Link to="/calendar" search={{date:dateKeyInTimezone(event.startsAt,event.timezone),event:event.id}} className="hover:underline">{event.title}</Link></p>
      <p className="mt-1 text-xs text-muted-foreground">{format(event.startsAt,event.timezone)}</p>
      <p className="mt-1 text-xs font-semibold">{event.status==="cancelled"?"Cancelled":"Scheduled"}</p>
      <p className="mt-2 text-xs text-muted-foreground">For changes, contact your school office.</p>
     </div>)}
     {data.events.length===0&&<p className="text-xs text-muted-foreground">No upcoming calendar events.</p>}
    </div>
    <div className="space-y-3">
     <h3 className="font-semibold">Announcements</h3>
     <p className="text-xs text-muted-foreground">Updates from your school and CAN.</p>
     {data.notices.map(notice=><div key={notice.id} className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold"><Link to="/notifications" search={{notification:notice.id}} className="hover:underline">{notice.title}</Link></p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{notice.body}</p>
      <button disabled={busy||notice.acknowledged} onClick={()=>perform(()=>readNotification({data:{id:notice.id}}),"Notice marked as read.")} className="mt-3 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">{notice.acknowledged?"Read ✓":"Mark as read"}</button>
     </div>)}
     {data.notices.length===0&&<p className="text-xs text-muted-foreground">No announcements yet.</p>}
    </div>
    <div className="space-y-3">
     <h3 className="font-semibold">Teacher conferences</h3>
     {data.viewerRole==="guardian"&&<label className="block text-xs">Student<select className="mt-1 block w-full rounded border bg-background p-2" aria-label="Student for office-hour booking" value={selectedChild} onChange={e=>setSelectedChild(e.target.value)}><option value="">Choose student</option>{children.map(child=><option key={child.studentPersonId} value={child.studentPersonId}>{child.firstName} {child.lastName}</option>)}</select></label>}
     {data.viewerRole==="guardian"&&data.bookings.length>0&&<div className="space-y-3">
      <h4 className="text-sm font-semibold">Your upcoming appointments</h4>
      {data.bookings.map(booking=><div key={booking.id} className="rounded-xl border p-3">
       <p className="text-sm font-semibold">{format(booking.startsAt)}</p>
       <p className="text-xs text-muted-foreground">{children.find(x=>x.studentPersonId===booking.studentPersonId)?.firstName??"Student"} · Confirmed</p>
       <label className="mt-2 block text-xs">Reschedule to
        <select className="mt-1 block w-full rounded border bg-background p-2" value={replacementSlots[booking.id]??""} onChange={event=>setReplacementSlots(value=>({...value,[booking.id]:event.target.value}))}>
         <option value="">Choose another time</option>
         {data.slots.filter(slot=>slot.seriesId===booking.seriesId).map(slot=><option key={slot.id} value={slot.id}>{format(slot.startsAt)}</option>)}
        </select>
       </label>
       <button type="button" disabled={busy||!replacementSlots[booking.id]} className="mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={()=>perform(()=>rescheduleOfficeHour({data:{bookingId:booking.id,newSlotId:replacementSlots[booking.id]}}),"Appointment rescheduled.")}>Save new time</button>
       <button type="button" disabled={busy} aria-label="Cancel appointment" className="ml-2 mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={()=>{if(!window.confirm("Cancel this appointment? The slot will open for another family."))return;void perform(()=>cancelOfficeHour({data:{bookingId:booking.id}}),"Appointment cancelled.");}}>Cancel appointment</button>
      </div>)}
     </div>}
     <p className="text-xs text-muted-foreground">Book an available teacher office-hour appointment.</p>
     {data.slots.map(slot=><div key={slot.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <div className="flex-1"><p className="text-sm font-semibold">{format(slot.startsAt)}</p><p className="mt-1 text-xs text-muted-foreground">{slot.status}</p></div>
      <button disabled={busy||!selectedChild||slot.status!=="available"||data.viewerRole!=="guardian"} onClick={()=>perform(()=>bookOfficeHour({data:{slotId:slot.id,studentPersonId:selectedChild}}),"Office-hour booking saved.")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">{slot.status!=="available"?"Booked":data.viewerRole==="guardian"?"Book":"Guardians book"}</button>
     </div>)}
     {data.slots.length===0&&<p className="text-xs text-muted-foreground">No conference times are available right now. Check back later or message your school.</p>}
    </div>
   </div>
  </div>
 </section>;
}
