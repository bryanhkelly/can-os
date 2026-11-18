import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useState } from "react";
import { manageAssessment } from "@/modules/learning/gradebook.functions";
import { dateTimeInputValue } from "@/modules/calendar/timezone";
import { assessmentClockToUtc } from "@/domain/assessment-local-schedule";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";

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
    <Field className="mt-3" label={`Release time for ${assessment.title}`}>
      <Input type="datetime-local" disabled={busy} value={release}
        onChange={event=>setRelease(event.target.value)}/>
    </Field>
    <Field className="mt-3" label={`Close time for ${assessment.title}`}>
      <Input type="datetime-local" disabled={busy} value={close}
        onChange={event=>setClose(event.target.value)}/>
    </Field>
    <p className="mt-2">Times use the class timezone ({timezone}). Empty release means available once published; empty close leaves submissions open. The due date stays unchanged.</p>
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={save} className="mt-3">Save schedule</Button>
    {dateError && <WorkspaceNotice tone="danger" className="mt-2">{dateError}</WorkspaceNotice>}
    <MutationFeedback state={mutation} className="mt-2" pendingMessage="Saving schedule..."/>
  </details>;
}
