import { useState } from "react";
import { manageAssessment } from "@/modules/learning/gradebook.functions";
import { dateTimeInputValue } from "@/modules/calendar/timezone";

export function AssessmentScheduleEditor({assessment,onSaved}:{assessment:{id:string;title:string;availableAt:string|null;closesAt:string|null};onSaved:()=>Promise<unknown>}) {
  const local=(stamp:string|null)=>stamp?dateTimeInputValue(stamp,Intl.DateTimeFormat().resolvedOptions().timeZone):"";
  const [release,setRelease]=useState(()=>local(assessment.availableAt));
  const [close,setClose]=useState(()=>local(assessment.closesAt));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function save() {
    setBusy(true);setMessage("");
    try {
      await manageAssessment({data:{assessmentId:assessment.id,action:"schedule",
        availableAt:release?new Date(release).toISOString():null,closesAt:close?new Date(close).toISOString():null}});
      setMessage("Release and close times saved.");
      try {await onSaved();}catch {setMessage("Schedule saved. Reload to review the latest dates.");}
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to save schedule.");}
    finally {setBusy(false);}
  }
  return <details className="mt-3 text-xs font-normal">
    <summary className="cursor-pointer underline">Edit release and close times</summary>
    <label className="mt-2 block">Release time for {assessment.title}
      <input type="datetime-local" disabled={busy} value={release} onChange={event=>setRelease(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <label className="mt-2 block">Close time for {assessment.title}
      <input type="datetime-local" disabled={busy} value={close} onChange={event=>setClose(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <p className="mt-2">Times use your device timezone. Empty release means available once published; empty close leaves submissions open. The due date stays unchanged.</p>
    <button type="button" disabled={busy} onClick={save} className="mt-2 rounded border px-2 py-1 disabled:opacity-40">Save schedule</button>
    {message&&<p role="status" className="mt-2">{message}</p>}
  </details>;
}
