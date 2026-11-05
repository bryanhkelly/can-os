import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type GuardianVerification = {
 method:"in_person_id"|"verified_school_record"|"live_video_verification";
 evidenceNote:string;
};

export function AdmissionsGuardianActions({applicationId,verified,loginProvisioned,busy,onVerify,onProvision,onInvite}:{
 applicationId:string;verified:boolean;loginProvisioned:boolean;busy:boolean;
 onVerify:(applicationId:string,verification:GuardianVerification)=>void;
 onProvision:(applicationId:string)=>void;
 onInvite:(applicationId:string)=>void;
}){
 const [verifying,setVerifying]=useState(false);
 const [method,setMethod]=useState<GuardianVerification["method"]>("verified_school_record");
 const [evidenceNote,setEvidenceNote]=useState("");
 const [attempted,setAttempted]=useState(false);
 return <>
  <p className="mt-3 text-xs text-muted-foreground">
   Guardian verification: <strong>{verified?"Verified":"Required"}</strong> ·{" "}
   Sign-in access: <strong>{loginProvisioned?"Provisioned":"Not provisioned"}</strong>.
   Verify the relationship independently before granting or inviting access.
  </p>
  <p role="status" className="mt-2 text-sm"><strong>Next for family access: </strong>
   {!verified?"Admissions registrar verifies the guardian relationship before granting family access.":
    !loginProvisioned?"Admissions registrar provisions verified guardian sign-in; invitation is a separate step.":
     "Guardian sign-in is provisioned. The registrar may send the secure invitation; offer decisions remain with the guardian."}
  </p>
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" disabled={busy||verified} onClick={()=>setVerifying(true)}
    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
    {verified?"Relationship verified":"Verify guardian relationship"}
   </button>
   <button type="button" disabled={busy||!verified||loginProvisioned} onClick={()=>onProvision(applicationId)}
    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
    {loginProvisioned?"Login provisioned":"Provision guardian login"}
   </button>
   <button type="button" disabled={busy||!loginProvisioned} onClick={()=>onInvite(applicationId)}
    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
    Send secure guardian invitation
   </button>
  </div>
  {verifying&&!verified&&<form noValidate className="mt-3 space-y-3 rounded-lg border p-3 text-sm"
   onSubmit={event=>{
    event.preventDefault();setAttempted(true);
    if(evidenceNote.trim().length<12)return;
    onVerify(applicationId,{method,evidenceNote:evidenceNote.trim()});
   }}>
   <fieldset disabled={busy} className="space-y-3">
    <legend className="font-semibold">Independent guardian relationship verification</legend>
    <p>Record the documentation or identification actually reviewed. An email address or inquiry alone does not establish guardianship.</p>
    <Field label="Verification method">
     <Select value={method}
      onChange={event=>{
       const value=event.target.value;
       if(value==="in_person_id"||value==="verified_school_record"||value==="live_video_verification")setMethod(value);
      }}>
      <option value="verified_school_record">Verified school record</option>
      <option value="in_person_id">In-person identification</option>
      <option value="live_video_verification">Live video verification</option>
     </Select>
    </Field>
    <Field label="Verification evidence" required
     error={attempted&&evidenceNote.trim().length<12?"Enter at least 12 characters describing the evidence reviewed.":undefined}>
     <Textarea minLength={12} maxLength={2000} rows={3} value={evidenceNote}
      onChange={event=>setEvidenceNote(event.target.value)}/>
    </Field>
    <div className="flex gap-2">
     <Button type="submit" disabled={busy}>Record guardian verification</Button>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>{setVerifying(false);setAttempted(false);}}>Cancel verification</Button>
    </div>
   </fieldset>
  </form>}
 </>;
}
