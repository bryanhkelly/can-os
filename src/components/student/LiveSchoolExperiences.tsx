import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { acknowledgeSyntheticNotice, bookSyntheticOfficeHour, setSyntheticCalendarStatus } from "@/modules/student-experience/school-experiences.functions";

type Data={
 connected:boolean;
 viewerRole:"student"|"guardian"|"registrar"|"teacher";
 events:{id:string;title:string;startsAt:string;timezone:string;status:string}[];
 notices:{id:string;title:string;body:string;acknowledged:boolean}[];
 slots:{id:string;startsAt:string;endsAt:string;status:string}[];
};
export function LiveSchoolExperiences({data}:{data:Data}) {
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function perform(operation:()=>Promise<unknown>,success:string) {
  setBusy(true);setError("");setMessage("");
  try {await operation();setMessage(success);await router.invalidate();}
  catch(err){setError(err instanceof Error?err.message:"Unable to save change");}
  finally{setBusy(false);}
 }
 const format=(stamp:string,tz="America/Los_Angeles")=>new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:tz}).format(new Date(stamp));
 return <section className="mx-auto mt-8 max-w-6xl px-4 sm:px-8">
  <div className="rounded-2xl border-2 border-foreground/15 bg-card p-5 sm:p-7">
   <div className="flex flex-wrap justify-between gap-3">
    <div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">SYNTHETIC NEON · SAVED STATE</p><h2 className="mt-2 font-serif text-3xl">School calendar & communication</h2><p className="mt-2 text-sm text-muted-foreground">Changes below persist in the synthetic Neon database. The experiences farther down remain demonstrations.</p></div>
    <span className="h-fit rounded-full border border-border px-3 py-2 text-xs font-semibold">{data.connected?"Neon connected":"Neon unavailable"}</span>
   </div>
   {message&&<p role="status" className="mt-4 rounded-lg border border-emerald-300 p-3 text-sm">{message}</p>}
   {error&&<p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
   <div className="mt-7 grid gap-7 lg:grid-cols-3">
    <div className="space-y-3">
     <h3 className="font-semibold">Site calendar exceptions</h3>
     <p className="text-xs text-muted-foreground">Simulate rescheduling or cancelling a Site event.</p>
     {data.events.map(event=><div key={event.id} className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">{event.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{format(event.startsAt,event.timezone)}</p>
      <label className="mt-3 block text-xs">Status
       <select aria-label={`Change status for ${event.title}`} disabled={busy||data.viewerRole!=="registrar"} value={event.status} onChange={e=>perform(()=>setSyntheticCalendarStatus({data:{eventId:event.id,status:e.target.value as "scheduled"|"moved"|"cancelled"}}),"Calendar change saved to Neon.")} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm">
        <option value="scheduled">Scheduled</option><option value="moved">Moved (demo status)</option><option value="cancelled">Cancelled</option>
       </select>
      </label>
     </div>)}
     {data.events.length===0&&<p className="text-xs text-muted-foreground">No synthetic calendar events.</p>}
    </div>
    <div className="space-y-3">
     <h3 className="font-semibold">Announcements</h3>
     <p className="text-xs text-muted-foreground">Acknowledge Site and network communications.</p>
     {data.notices.map(notice=><div key={notice.id} className="rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">{notice.title}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{notice.body}</p>
      <button disabled={busy||notice.acknowledged} onClick={()=>perform(()=>acknowledgeSyntheticNotice({data:{noticeId:notice.id}}),"Acknowledgement saved to Neon.")} className="mt-3 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">{notice.acknowledged?"Acknowledged ✓":"Acknowledge"}</button>
     </div>)}
     {data.notices.length===0&&<p className="text-xs text-muted-foreground">No seeded notifications.</p>}
    </div>
    <div className="space-y-3">
     <h3 className="font-semibold">Teacher office hours</h3>
     <p className="text-xs text-muted-foreground">Book a slot in Neon. Once booked, it is no longer available.</p>
     {data.slots.map(slot=><div key={slot.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <div className="flex-1"><p className="text-sm font-semibold">{format(slot.startsAt)}</p><p className="mt-1 text-xs text-muted-foreground">{slot.status}</p></div>
      <button disabled={busy||slot.status!=="available"||data.viewerRole!=="guardian"} onClick={()=>perform(()=>bookSyntheticOfficeHour({data:{slotId:slot.id}}),"Office-hour booking saved to Neon.")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">{slot.status!=="available"?"Booked":data.viewerRole==="guardian"?"Book":"Guardians book"}</button>
     </div>)}
     {data.slots.length===0&&<p className="text-xs text-muted-foreground">No seeded office hours.</p>}
    </div>
   </div>
  </div>
 </section>;
}
