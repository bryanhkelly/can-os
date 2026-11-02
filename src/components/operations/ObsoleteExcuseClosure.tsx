import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { closeStaleAttendanceExcuse } from "@/modules/attendance/onsite-attendance-workflow.functions";

export function ObsoleteExcuseClosure({excuse,onSaved}:{
 excuse:{excuseId:string;currentAttendanceEventId:string|null};onSaved:()=>Promise<void>;
}){
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const mutation=useMutationFeedback(onSaved);
 const busy=mutation.pending||mutation.refreshFailed;
 const [validationError,setValidationError]=useState("");
 return <form className="mt-3 space-y-3 rounded border p-3" onSubmit={async event=>{
  event.preventDefault();setValidationError("");
  if(!confirmed||reason.trim().length<10||!excuse.currentAttendanceEventId){
   setValidationError("Enter a closure reason and confirm the guardian notification.");return;
  }
  await mutation.run(
   ()=>closeStaleAttendanceExcuse({data:{excuseId:excuse.excuseId,
    expectedCurrentEventId:excuse.currentAttendanceEventId,reason,confirmed:true}}),
   {successMessage:"Obsolete excuse closed.",commandErrorMessage:"Unable to close obsolete excuse."},
  );
 }}>
  <p className="text-sm">Close only the obsolete excuse. The current attendance mark and its history stay unchanged.</p>
  <Field label="Closure reason (visible to the guardian)" required>
   <Textarea disabled={busy} minLength={10} maxLength={2000} value={reason}
    onChange={event=>setReason(event.target.value)}/>
  </Field>
  <Label className="flex items-start gap-2 leading-6"><Checkbox disabled={busy} required checked={confirmed}
   onChange={event=>setConfirmed(event.target.checked)}/>I confirm closure of this earlier excuse and notification of the guardian.</Label>
  <Button disabled={busy||!confirmed||reason.trim().length<10} type="submit" variant="outline" size="sm">Close obsolete excuse</Button>
  {validationError&&<p role="alert" className="text-sm">{validationError}</p>}
  <MutationFeedback state={mutation} pendingMessage="Closing obsolete excuse..."/>
 </form>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
