import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { useEffect,useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
 consentToStudentLearningAccount, getStudentLearningHandoff,
 provisionStudentLearningAccess,
} from "@/modules/enrollment/student-access-handoff.functions";

type ViewRole="guardian"|"registrar";

/** Application-specific parent consent and independent registrar review.
 * An email is an invitation destination, never an identity claim by itself.
 */
export function StudentLearningAccessHandoff({
 applicationId,role,
}:{applicationId:string;role:ViewRole}){
 // A different application or role gets a fresh state owner. Late mutation
 // responses from the unmounted handoff cannot update the next child's view.
 return <ApplicationLearningAccessHandoff key={`${role}:${applicationId}`}
  applicationId={applicationId} role={role}/>;
}

function ApplicationLearningAccessHandoff({
 applicationId,role,
}:{applicationId:string;role:ViewRole}){
 const [status,setStatus]=useState("loading");
 const [blocker,setBlocker]=useState<Awaited<ReturnType<typeof getStudentLearningHandoff>>["blocker"]>(null);
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [retry,setRetry]=useState(0);
 const [independentReviewConfirmed,setIndependentReviewConfirmed]=useState(false);
 const [guardianConsentConfirmed,setGuardianConsentConfirmed]=useState(false);
 const [attempted,setAttempted]=useState(false);
 const [reviewMethod,setReviewMethod]=useState<"institutional_school_record"|"verified_in_person">("institutional_school_record");
 useEffect(()=>{
  let live=true;
  // Switching between children must not retain another child's email, review
  // confirmation or approval status while a new handoff request is in flight.
  setStatus("loading");setEmail("");setError("");setNotice("");setBlocker(null);
  setIndependentReviewConfirmed(false);
  setReviewMethod("institutional_school_record");
  void getStudentLearningHandoff({data:{applicationId}})
   .then(result=>{
    if(!live)return;
    setStatus(result.status);setEmail(result.studentEmail??"");setBlocker(result.blocker);
   })
   .catch(()=>{if(live)setStatus("not_available");});
  return ()=>{live=false;};
 },[applicationId,retry]);
 async function submit(event:React.FormEvent){
  event.preventDefault();
  setAttempted(true);
  if(role==="guardian"&&status==="not_requested"&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||!guardianConsentConfirmed))return;
  if(role!=="guardian"&&status==="pending_review"&&!independentReviewConfirmed)return;
  setBusy(true);setError("");setNotice("");
  try{
   if(role==="guardian"){
    await consentToStudentLearningAccount({data:{
     applicationId,studentEmail:email,acknowledged:true,
    }});
    setStatus("pending_review");
    setGuardianConsentConfirmed(false);setAttempted(false);
    setNotice("Student account request signed. Admissions must independently verify the identity and approve the invitation.");
   }else{
    const result=await provisionStudentLearningAccess({data:{
      applicationId,
      ...(status==="pending_review"&&independentReviewConfirmed
        ?{confirmedIndependentIdentity:true as const,reviewMethod}:{}),
    }});
    setStatus("approved");
    setIndependentReviewConfirmed(false);setAttempted(false);
    setNotice("Student access approval is saved.");
    if(result.signInRequest==="failed"){
      setError("The sign-in link could not be requested. Wait at least a minute, then request it again below. Approval does not need to be repeated.");
    }else{
      setNotice("Student access approval is saved. A sign-in link was requested; email delivery is not verified.");
    }
   }
  }catch(e){setError(mutationErrorMessage(e, "Student access handoff could not be completed"));}
  finally{setBusy(false);}
 }
 if(status==="blocked"&&blocker)return <section aria-label="Student learning account" className="mt-4 rounded-lg border p-4 text-sm">
  <h4 className="font-semibold">Student learning account · Next requirement</h4>
  <p role="status" className="mt-2">{blocker.message}</p>
  {hasRegistrarAuthority(role)?(blocker.target==="academic_setup"
   ?<Link to="/launch/school/$programId" params={{programId:blocker.programId}} className="mt-3 inline-block font-semibold underline">{blocker.nextAction} →</Link>
   :<Link to="/admissions" search={{siteId:blocker.siteId??undefined,programId:blocker.programId,application:blocker.applicationId}} className="mt-3 inline-block font-semibold underline">{blocker.nextAction} →</Link>)
   :<Link to="/messages" className="mt-3 inline-block underline">Ask admissions to complete this requirement</Link>}
  <button type="button" onClick={()=>setRetry(value=>value+1)} className="ml-3 rounded border px-3 py-2">Check again</button>
 </section>;
 if(status==="access_unavailable")return <section aria-label="Student learning account"
  className="mt-4 rounded-lg border p-4 text-sm">
  <h4 className="font-semibold">Student learning account · Access needs review</h4>
  <p role="status" className="mt-2">A prior guardian authorization was approved, but the
   student's current school login grant is no longer available. A sign-in link
   cannot restore a revoked grant or disabled account.</p>
  <p className="mt-2">{hasRegistrarAuthority(role)
    ? "Review the original student grant, account status and school authorization. Restore access only through the independently authorized student-access restoration workflow."
    : "Contact admissions to review the student's separate school account. Your guardian sign-in does not restore the student's access."}</p>
  <button type="button" className="mt-3 rounded border px-3 py-2 font-semibold"
   onClick={()=>setRetry(value=>value+1)}>Recheck access</button>
  <Link to="/messages" className="ml-3 inline-block text-sm underline">Contact admissions</Link>
 </section>;
 if(status==="not_available")return <section aria-label="Student learning account"
  className="mt-4 rounded-lg border p-4 text-sm">
  <h4 className="font-semibold">Student learning account</h4>
  <p className="mt-2" role="status">We could not verify this student's current school sign-in status.
   Admissions can confirm classroom placement and account eligibility. No invitation has been sent by this screen.</p>
  <button type="button" className="mt-3 rounded border px-3 py-2 font-semibold"
   onClick={()=>setRetry(value=>value+1)}>Check again</button>
  <Link to="/messages" className="ml-3 inline-block text-sm underline">Ask admissions for help</Link>
 </section>;
 return <section className="mt-4 rounded-lg border p-4 text-sm">
  <h4 className="font-semibold">Student learning account</h4>
  {status==="loading"?<p className="mt-2">Checking the active class and access status…</p>:
  <form noValidate onSubmit={event=>void submit(event)} className="mt-3 space-y-3">
    {role==="guardian" && status==="not_requested" ? <>
     <p>Authorize a separate student account after classroom placement.
      Student email verification and school approval are required; this does not authorize your guardian login to act as a student.</p>
     <Field label="Student's own email address" required
      error={attempted&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())?"Enter a valid email address for the student.":undefined}>
      <Input type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} autoComplete="off"/>
     </Field>
     <Field label="I am the verified parent or legal guardian and authorize this separate student learning sign-in request." required
      error={attempted&&!guardianConsentConfirmed?"Confirm your guardian authorization before requesting student sign-in.":undefined}>
      <Checkbox checked={guardianConsentConfirmed} onChange={event=>setGuardianConsentConfirmed(event.target.checked)}/>
     </Field>
     <Button type="submit" variant="outline" disabled={busy}>
      {busy?"Saving…":"Authorize student sign-in request"}
     </Button>
    </>:status==="pending_review"?<>
     <p>Guardian authorization received. A registrar must verify the student's
      identity and email destination before access is granted.</p>
     {role==="guardian"&&<Link to="/messages" className="mt-3 inline-block underline">Ask admissions about student access</Link>}
     {hasRegistrarAuthority(role)&&<>
      <p>Guardian-approved student address: <strong>{email}</strong></p>
      <Field label="Independent student identity check">
       <Select value={reviewMethod} onChange={event=>setReviewMethod(
         event.target.value==="verified_in_person"?"verified_in_person":"institutional_school_record")}
       >
        <option value="institutional_school_record">Matched institutional student records</option>
        <option value="verified_in_person">Verified student identity in person</option>
       </Select>
      </Field>
      <Field label="I independently checked the student's identity and separate email destination using the selected method, not solely the public form or parent's statement." required
       error={attempted&&!independentReviewConfirmed?"Confirm that you independently reviewed the student's identity.":undefined}>
       <Checkbox checked={independentReviewConfirmed} onChange={event=>setIndependentReviewConfirmed(event.target.checked)}/>
      </Field>
      <Button type="submit" variant="outline" disabled={busy}>
       {busy?"Reviewing…":"Approve verified student account and send sign-in link"}
      </Button>
     </>}
    </>:status==="approved"?<>
     <p>Student access is approved. The student uses their own verified email address—not the parent’s account—to request a short-lived sign-in link and open assigned classes.</p>
     {role==="guardian"&&<Link to="/access" className="mt-3 inline-block rounded border px-3 py-2 font-semibold">Open student sign-in</Link>}
     {hasRegistrarAuthority(role)&&<button disabled={busy}
       className="rounded border px-3 py-2 font-semibold disabled:opacity-50">
       {busy?"Requesting…":"Request student sign-in link again"}
     </button>}
    </>:status==="not_requested"&&hasRegistrarAuthority(role)?
     <p>Enrollment and classroom placement are ready. A verified managing guardian
      must authorize the student's separate sign-in request in their enrollment
      checklist before a registrar can review it. No invitation has been sent.</p>
    :<p>School enrollment and classroom access must be ready before an account
      invitation can be sent.</p>}
   </form>}
  {notice&&<p role="status" className="mt-2">{notice}</p>}
  {error&&<p role="alert" className="mt-2">{error}</p>}
 </section>;
}
