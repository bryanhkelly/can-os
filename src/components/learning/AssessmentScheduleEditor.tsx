import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useState } from "react";
import { manageAssessment } from "@/modules/learning/gradebook.functions";
import { dateTimeInputValue } from "@/modules/calendar/timezone";
import { assessmentClockToUtc } from "@/domain/assessment-local-schedule";

export function AssessmentScheduleEditor({assessment,timezone,onSaved}:{assessment:{id:string;title:string;availableAt:string|null;closesAt:string|null};timezone:string;onSaved:()=>Promise<unknown>}) {
  const local=(stamp:string|null)=>stamp?dateTimeInputValue(stamp,timezone):"";
  const [release,setRelease]=useState(()=>local(assessment.availableAt));
  const [close,setClose]=useState(()=>local(assessment.closesAt));
  const [dateError,setDateError]=useState("");
  const mutation=useMutationFeedback(onSaved);
  const busy=mutation.pending||mutation.refreshFailed;
  async function save() {
    let availableAt:string|null;
    let closesAt:string|null;
    try {
      availableAt=release?assessmentClockToUtc(release,timezone):null;
      closesAt=close?assessmentClockToUtc(close,timezone):null;
    } catch (error) {
      setDateError(mutationErrorMessage(error,"Enter a valid time in the class timezone."));
      return;
    }
    setDateError("");
    await mutation.run(()=>manageAssessment({data:{
      assessmentId:assessment.id,action:"schedule",availableAt,closesAt,
    }}),{
      successMessage:"Release and close times saved.",commandErrorMessage:"Unable to save schedule.",
    });
  }
  return <details className="mt-3 text-xs font-normal">
    <summary className="cursor-pointer underline">Edit release and close times</summary>
    <label className="mt-2 block">Release time for {assessment.title}
      <input type="datetime-local" disabled={busy} value={release} onChange={event=>setRelease(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <label className="mt-2 block">Close time for {assessment.title}
      <input type="datetime-local" disabled={busy} value={close} onChange={event=>setClose(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <p className="mt-2">Times use the class timezone ({timezone}). Empty release means available once published; empty close leaves submissions open. The due date stays unchanged.</p>
    <button type="button" disabled={busy} onClick={save} className="mt-2 rounded border px-2 py-1 disabled:opacity-40">Save schedule</button>
    {dateError && <p role="alert" className="mt-2 text-destructive">{dateError}</p>}
    <MutationFeedback state={mutation} className="mt-2" pendingMessage="Saving schedule..."/>
  </details>;
}
