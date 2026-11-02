import { useEffect, useState } from "react";
import { Link, useRouter, useSearch } from "@tanstack/react-router";
import {getGuardianStudents} from "@/modules/learning/guardian-academic-queries.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { bookOfficeHour, cancelOfficeHour, rescheduleOfficeHour } from "@/modules/student-experience/school-experiences.functions";
import { readNotification } from "@/modules/communication/notification-center.functions";
import { StatusBadge } from "@/components/workspace";

type Data={
 connected:boolean;
 viewerRole:"student"|"guardian"|"registrar"|"teacher";
 events:{id:string;title:string;startsAt:string;timezone:string;status:string}[];
 notices:{id:string;title:string;body:string;acknowledged:boolean}[];
 slots:{id:string;seriesId:string;startsAt:string;endsAt:string;status:string}[];
 bookings:{id:string;slotId:string;studentPersonId:string;seriesId:string;startsAt:string;endsAt:string}[];
};
type GuardianStudent={studentPersonId:string;firstName:string;lastName:string};
type GuardianStudentLookup=
 | {status:"loading"}
 | {status:"ready";students:GuardianStudent[]}
 | {status:"error"};
const formatStatus=(status:string)=>status.replaceAll("_"," ").replace(/^\w/,letter=>letter.toUpperCase());
export function LiveSchoolExperiences({data}:{data:Data}) {
 const router=useRouter();
 const familySearch=useSearch({strict:false}) as {student?:string};
 const [busy,setBusy]=useState(false);
 const [guardianStudentLookup,setGuardianStudentLookup]=useState<GuardianStudentLookup|null>(()=>data.viewerRole==="guardian"?{status:"loading"}:null);
 const [childSelection,setChildSelection]=useState<{searchStudent?:string;studentPersonId:string}>();
 const [replacementSlots,setReplacementSlots]=useState<Record<string,string>>({});
 useEffect(()=>{
  if(data.viewerRole!=="guardian")return;
  let active=true;
  getGuardianStudents().then(result=>{
   if(active)setGuardianStudentLookup({status:"ready",students:result.students});
  }).catch(()=>{
   if(active)setGuardianStudentLookup({status:"error"});
  });
  return()=>{active=false};
 },[data.viewerRole]);
 const children=data.viewerRole==="guardian"&&guardianStudentLookup?.status==="ready"?guardianStudentLookup.students:[];
 const studentsLoading=data.viewerRole==="guardian"&&(!guardianStudentLookup||guardianStudentLookup.status==="loading");
 const studentsError=data.viewerRole==="guardian"&&guardianStudentLookup?.status==="error"
  ?"We couldn’t load the students connected to this family account. Refresh the page or contact your school."
  :"";
 const requestedChild=children.find(child=>child.studentPersonId===familySearch.student);
 const selectedChildOverride=childSelection&&childSelection.searchStudent===familySearch.student&&children.some(child=>child.studentPersonId===childSelection.studentPersonId)
  ?childSelection.studentPersonId
  :"";
 const selectedChild=selectedChildOverride||(familySearch.student?requestedChild?.studentPersonId??"":children[0]?.studentPersonId??"");
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
 return <section aria-labelledby="school-community-heading" className="mt-6 w-full">
  <div className="rounded-2xl border bg-card p-5 sm:p-7">
   <div className="flex flex-wrap justify-between gap-3">
    <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Student life</p><h2 id="school-community-heading" className="mt-2 font-serif text-3xl">School &amp; community</h2><p className="mt-2 text-sm text-muted-foreground">School calendar updates, announcements and teacher conferences.</p></div>
    {!data.connected&&<span role="status" className="h-fit rounded-full border border-border px-3 py-2 text-xs font-semibold">School updates temporarily unavailable</span>}
   </div>
   {message&&<p role="status" className="mt-4 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">{message}</p>}
   {error&&<p role="alert" className="mt-4 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
   <div className="mt-7 grid gap-7 lg:grid-cols-3">
    <div className="space-y-3">
     <h3 className="font-semibold">School calendar</h3>
     <p className="text-xs text-muted-foreground">Upcoming schedule changes and important dates.</p>
     {data.events.map(event=><div key={event.id} className="rounded-xl border border-border bg-background p-4">
      <p className="text-sm font-semibold"><Link to="/calendar" search={{date:dateKeyInTimezone(event.startsAt,event.timezone),event:event.id}} className="hover:underline focus-visible:outline-2">{event.title}</Link></p>
      <p className="mt-1 text-xs text-muted-foreground">{format(event.startsAt,event.timezone)}</p>
      <StatusBadge tone={event.status==="cancelled"?"attention":"neutral"}>{formatStatus(event.status)}</StatusBadge>
      <p className="mt-2 text-xs text-muted-foreground">For changes, contact your school office.</p>
     </div>)}
     {data.events.length===0&&<p className="text-xs text-muted-foreground">No upcoming calendar events.</p>}
    </div>
    <div className="space-y-3">
     <h3 className="font-semibold">Announcements</h3>
     <p className="text-xs text-muted-foreground">Updates from your school and CAN.</p>
     {data.notices.map(notice=><div key={notice.id} className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
       <p className="text-sm font-semibold"><Link to="/notifications" search={{notification:notice.id}} className="hover:underline focus-visible:outline-2">{notice.title}</Link></p>
       <StatusBadge tone={notice.acknowledged?"success":"info"}>{notice.acknowledged?"Read":"New"}</StatusBadge>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{notice.body}</p>
      <button type="button" disabled={busy||notice.acknowledged} onClick={()=>perform(()=>readNotification({data:{id:notice.id}}),"Notice marked as read.")} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{notice.acknowledged?"Marked as read":"Mark as read"}</button>
     </div>)}
     {data.notices.length===0&&<p className="text-xs text-muted-foreground">No announcements yet.</p>}
    </div>
    <div className="space-y-3">
     <h3 className="font-semibold">Teacher conferences</h3>
     {data.viewerRole==="guardian"&&<label className="block text-xs font-medium">Student for conference<select className="mt-1 block w-full rounded border bg-background p-2 focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Student for office-hour booking" value={selectedChild} onChange={e=>setChildSelection({searchStudent:familySearch.student,studentPersonId:e.target.value})}><option value="">Choose student</option>{children.map(child=><option key={child.studentPersonId} value={child.studentPersonId}>{child.firstName} {child.lastName}</option>)}</select></label>}
     {data.viewerRole==="guardian"&&studentsLoading&&<p role="status" className="text-xs text-muted-foreground">Loading eligible students…</p>}
     {data.viewerRole==="guardian"&&studentsError&&<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{studentsError}</p>}
     {data.viewerRole==="guardian"&&!studentsLoading&&!studentsError&&children.length===0&&<p role="status" className="text-xs text-muted-foreground">No eligible students are currently available for conference booking.</p>}
     {data.viewerRole==="guardian"&&familySearch.student&&!studentsLoading&&!studentsError&&children.length>0&&!requestedChild&&!selectedChildOverride&&<p role="alert" className="text-sm text-destructive">The selected student is unavailable in this family account. Choose an eligible student before booking.</p>}
     {data.viewerRole==="guardian"&&data.bookings.length>0&&<div className="space-y-3">
      <h4 className="text-sm font-semibold">Your upcoming appointments</h4>
      {data.bookings.map(booking=><div key={booking.id} className="rounded-xl border p-3">
       <p className="text-sm font-semibold">{format(booking.startsAt)}</p>
       <div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-muted-foreground">{children.find(x=>x.studentPersonId===booking.studentPersonId)?.firstName??"Student"}</p><StatusBadge tone="success">Confirmed</StatusBadge></div>
       <label className="mt-2 block text-xs">Reschedule to
        <select aria-label={`New conference time for ${children.find(x=>x.studentPersonId===booking.studentPersonId)?.firstName??"student"}`} className="mt-1 block w-full rounded border bg-background p-2 focus-visible:outline-2 focus-visible:outline-offset-2" value={replacementSlots[booking.id]??""} onChange={event=>setReplacementSlots(value=>({...value,[booking.id]:event.target.value}))}>
         <option value="">Choose another time</option>
         {data.slots.filter(slot=>slot.seriesId===booking.seriesId).map(slot=><option key={slot.id} value={slot.id}>{format(slot.startsAt)}</option>)}
        </select>
       </label>
       <button type="button" disabled={busy||!replacementSlots[booking.id]} className="mt-2 inline-flex min-h-11 items-center rounded border px-3 py-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50" onClick={()=>perform(()=>rescheduleOfficeHour({data:{bookingId:booking.id,newSlotId:replacementSlots[booking.id]}}),"Appointment rescheduled.")}>Save new time</button>
       <button type="button" disabled={busy} aria-label="Cancel appointment" className="ml-2 mt-2 inline-flex min-h-11 items-center rounded border px-3 py-2 text-xs font-semibold focus-visible:outline-2 disabled:opacity-50" onClick={()=>{if(!window.confirm("Cancel this appointment? The slot will open for another family."))return;void perform(()=>cancelOfficeHour({data:{bookingId:booking.id}}),"Appointment cancelled.");}}>Cancel appointment</button>
      </div>)}
     </div>}
     <p className="text-xs text-muted-foreground">Book an available teacher office-hour appointment.</p>
     {data.slots.map(slot=><div key={slot.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <div className="flex-1"><p className="text-sm font-semibold">{format(slot.startsAt)}</p><div className="mt-1"><StatusBadge tone={slot.status==="available"?"success":"neutral"}>{formatStatus(slot.status)}</StatusBadge></div></div>
      <button type="button" disabled={busy||!selectedChild||slot.status!=="available"||data.viewerRole!=="guardian"} onClick={()=>perform(()=>bookOfficeHour({data:{slotId:slot.id,studentPersonId:selectedChild}}),"Office-hour booking saved.")} className="inline-flex min-h-11 items-center rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{slot.status!=="available"?"Booked":data.viewerRole==="guardian"?"Book":"Guardians book"}</button>
     </div>)}
     {data.slots.length===0&&<p className="text-xs text-muted-foreground">No conference times are available right now. Check back later or message your school.</p>}
    </div>
   </div>
  </div>
 </section>;
}
