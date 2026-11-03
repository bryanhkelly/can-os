import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useState } from "react";
import { manageAssessment } from "@/modules/learning/gradebook.functions";

/** Draft edits use the existing assessment command and never assign student work. */
export function AssessmentDraftEditor({assessment,onSaved}:{assessment:{id:string;title:string;instructions:string};onSaved:()=>Promise<unknown>}) {
  const [title,setTitle]=useState(assessment.title);
  const [instructions,setInstructions]=useState(assessment.instructions);
  const mutation=useMutationFeedback(onSaved);
  const busy=mutation.pending||mutation.refreshFailed;
  async function save(){
    await mutation.run(()=>manageAssessment({data:{assessmentId:assessment.id,action:"edit_draft",title,instructions}}),{
      successMessage:"Draft saved. Students receive this work only after you publish it.",
      commandErrorMessage:"Unable to save assignment draft.",
    });
  }
  return <details className="mt-3 text-xs font-normal">
    <summary className="cursor-pointer underline">Edit assignment draft</summary>
    <label className="mt-2 block">Draft title
      <input disabled={busy} value={title} minLength={3} maxLength={200} onChange={event=>setTitle(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <label className="mt-2 block">Student directions
      <textarea disabled={busy} rows={5} maxLength={20000} value={instructions} onChange={event=>setInstructions(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/>
    </label>
    <button type="button" disabled={busy||title.trim().length<3} onClick={save} className="mt-2 rounded border px-2 py-1 disabled:opacity-40">Save assignment draft</button>
    <MutationFeedback state={mutation} className="mt-2" pendingMessage="Saving assignment draft..."/>
  </details>;
}
