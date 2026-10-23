import { useEffect,useState } from "react";
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
 const [status,setStatus]=useState("loading");
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 useEffect(()=>{
  let live=true;
  void getStudentLearningHandoff({data:{applicationId}})
   .then(result=>{
    if(!live)return;
    setStatus(result.status);setEmail(result.studentEmail??"");
   })
   .catch(()=>{if(live)setStatus("not_available");});
  return ()=>{live=false;};
 },[applicationId]);
 async function submit(event:React.FormEvent){
  event.preventDefault();
  setBusy(true);setError("");setNotice("");
  try{
   if(role==="guardian"){
    await consentToStudentLearningAccount({data:{
     applicationId,studentEmail:email,acknowledged:true,
    }});
    setStatus("pending_review");
    setNotice("Student account request signed. Admissions must independently verify the identity and approve the invitation.");
   }else{
    await provisionStudentLearningAccess({data:{applicationId}});
    setStatus("approved");
    setNotice("Student access approved. A short-lived sign-in link was requested for the verified email address.");
   }
  }catch(e){setError(e instanceof Error?e.message:"Student access handoff could not be completed");}
  finally{setBusy(false);}
 }
 if(status==="not_available")return null;
 return <section className="mt-4 rounded-lg border p-4 text-sm">
  <h4 className="font-semibold">Student learning account</h4>
  {status==="loading"?<p className="mt-2">Checking the active class and access status…</p>:
   <form onSubmit={event=>void submit(event)} className="mt-3 space-y-3">
    {role==="guardian" && status==="not_requested" ? <>
     <p>Authorize a separate student account after classroom placement.
      Student email verification and school approval are required; this does not authorize your guardian login to act as a student.</p>
     <label className="block">Student's own email address
      <input required type="email" maxLength={254} value={email}
       onChange={event=>setEmail(event.target.value)}
       className="mt-1 block w-full rounded border bg-background p-2"
       autoComplete="off"/>
     </label>
     <label className="flex items-start gap-2">
      <input type="checkbox" required/>
      I am the verified parent or legal guardian and authorize this separate
      student learning sign-in request.
     </label>
     <button disabled={busy||!email.trim()} className="rounded border px-3 py-2 font-semibold disabled:opacity-50">
      {busy?"Saving…":"Authorize student sign-in request"}
     </button>
    </>:status==="pending_review"?<>
     <p>Guardian authorization received. A registrar must verify the student's
      identity and email destination before access is granted.</p>
     {role==="registrar"&&<>
      <p>Guardian-approved student address: <strong>{email}</strong></p>
      <button disabled={busy} className="rounded border px-3 py-2 font-semibold disabled:opacity-50">
       {busy?"Reviewing…":"Approve student account and send sign-in link"}
      </button>
     </>}
    </>:status==="approved"?<>
     <p>Student access is approved. The student signs in through CAN OS using a
      separate short-lived email link, then opens their assigned classes.</p>
     {role==="registrar"&&<button disabled={busy}
       className="rounded border px-3 py-2 font-semibold disabled:opacity-50">
       {busy?"Sending…":"Resend student sign-in link"}
     </button>}
    </>:<p>School enrollment and classroom access must be ready before an account
      invitation can be sent.</p>}
   </form>}
  {notice&&<p role="status" className="mt-2">{notice}</p>}
  {error&&<p role="alert" className="mt-2">{error}</p>}
 </section>;
}
