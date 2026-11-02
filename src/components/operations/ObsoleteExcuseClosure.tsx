import { useState } from "react";
import { closeStaleAttendanceExcuse } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { ValidationError } from "@/domain/errors";
import { useMutationFeedback } from "@/lib/mutation-feedback";

export function ObsoleteExcuseClosure({excuse,onSaved}:{
 excuse:{excuseId:string;currentAttendanceEventId:string|null};onSaved:()=>Promise<void>;
}){
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const mutation=useMutationFeedback();
 return <form className="mt-3 space-y-3 rounded border p-3" onSubmit={async event=>{
  event.preventDefault();
  await mutation.run(async()=>{
   if(!confirmed||reason.trim().length<10||!excuse.currentAttendanceEventId)
    throw new ValidationError("Enter a closure reason and confirm the guardian notification.");
   return closeStaleAttendanceExcuse({data:{excuseId:excuse.excuseId,
    expectedCurrentEventId:excuse.currentAttendanceEventId,reason,confirmed:true}});
  },{
   fallback:"Unable to close obsolete excuse.",
   success:"Obsolete excuse closed.",
   refresh:onSaved,
  });
 }}>
  <p className="text-sm">Close only the obsolete excuse. The current attendance mark and its history stay unchanged.</p>
  <label className="block text-sm">Closure reason (visible to the guardian)
   <textarea required minLength={10} maxLength={2000} value={reason}
    onChange={event=>setReason(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
  </label>
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={confirmed}
   onChange={event=>setConfirmed(event.target.checked)}/>I confirm closure of this earlier excuse and notification of the guardian.</label>
  <button disabled={mutation.disabled||!confirmed||reason.trim().length<10} type="submit"
   className="rounded border px-3 py-2 text-xs disabled:opacity-50">Close obsolete excuse</button>
  {mutation.error&&<p role="alert" className="text-sm">{mutation.error}</p>}
  {mutation.notice&&<p role="status" className="text-sm">{mutation.notice}</p>}
 </form>;
}
