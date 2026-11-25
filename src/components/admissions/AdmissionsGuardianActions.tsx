import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionFooter, WorkspaceNotice, FormSection, StatusBadge } from "@/components/workspace";
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
  <div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone={verified?"success":"attention"}>Guardian relationship: {verified?"Verified":"Required"}</StatusBadge><StatusBadge tone={loginProvisioned?"success":"neutral"}>Sign-in access: {loginProvisioned?"Provisioned":"Not provisioned"}</StatusBadge></div>
  <WorkspaceNotice className="mt-3"><strong>Next for family access: </strong>
   {!verified?"Admissions registrar verifies the guardian relationship before granting family access.":
    !loginProvisioned?"Admissions registrar provisions verified guardian sign-in; invitation is a separate step.":
     "Guardian sign-in is provisioned. The registrar may request a secure invitation or confirm the existing sign-in method; offer decisions remain with the guardian."}
  </WorkspaceNotice>
  <ActionFooter layout="inline">
   <Button type="button" variant="outline" size="sm" disabled={busy||verified} onClick={()=>setVerifying(true)}
    >
    {verified?"Relationship verified":"Verify guardian relationship"}
   </Button>
   <Button type="button" variant="outline" size="sm" disabled={busy||!verified||loginProvisioned} onClick={()=>onProvision(applicationId)}
    >
    {loginProvisioned?"Login provisioned":"Provision guardian login"}
   </Button>
   <Button type="button" variant="outline" size="sm" disabled={busy||!loginProvisioned} onClick={()=>onInvite(applicationId)}
    >
    Request guardian sign-in
   </Button>
  </ActionFooter>
  {verifying&&!verified&&<form noValidate className="mt-5 space-y-3 text-sm"
   onSubmit={event=>{
    event.preventDefault();setAttempted(true);
    if(busy||evidenceNote.trim().length<12)return;
    onVerify(applicationId,{method,evidenceNote:evidenceNote.trim()});
   }}>
   <fieldset disabled={busy} className="space-y-3">
    <legend className="sr-only">Independent guardian relationship verification</legend>
    <FormSection columns={1} title="Independent guardian relationship verification" description="Record the documentation or identification actually reviewed. An email address or inquiry alone does not establish guardianship.">
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
    </FormSection>
    <ActionFooter layout="form">
     <Button type="submit" disabled={busy} loading={busy} loadingLabel="Recording verification...">Record guardian verification</Button>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>{setVerifying(false);setAttempted(false);}}>Cancel verification</Button>
    </ActionFooter>
   </fieldset>
  </form>}
 </>;
}
