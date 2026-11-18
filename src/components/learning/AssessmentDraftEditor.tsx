import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useState } from "react";
import { manageAssessment } from "@/modules/learning/gradebook.functions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    <Field className="mt-3" label="Draft title" required
      description="Students see this title only after the assessment is published.">
      <Input disabled={busy} value={title} minLength={3} maxLength={200}
        onChange={event=>setTitle(event.target.value)}/>
    </Field>
    <Field className="mt-3" label="Student directions"
      description="Explain the assignment before publishing. Saving here does not assign it to students.">
      <Textarea disabled={busy} rows={5} maxLength={20000}
        value={instructions} onChange={event=>setInstructions(event.target.value)}/>
    </Field>
    <Button type="button" variant="outline" size="sm" className="mt-3"
      loading={mutation.pending} loadingLabel="Saving draft..."
      disabled={busy||title.trim().length<3} onClick={()=>void save()}>Save assignment draft</Button>
    <MutationFeedback state={mutation} className="mt-2" pendingMessage="Saving assignment draft..."/>
  </details>;
}
