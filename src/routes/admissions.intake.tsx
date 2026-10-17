import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {createAdmissionsInquiry,listAdmissionsIntake,listAdmissionsIntakePrograms,provisionInquiryGuardianAccount,sendAdmissionsGuardianInvitation,verifyAdmissionsGuardianRelationship,transitionAdmissionsStage} from "@/modules/enrollment/admissions-intake.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
const load=async()=>({records:await listAdmissionsIntake(),programs:await listAdmissionsIntakePrograms()});
export const Route=createFileRoute("/admissions/intake")({
 loader:safeLoader(load,{authMessage:"Sign in as a registrar to manage admissions."}),
 component:IntakePage
});
function IntakePage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Admissions" title="Inquiry and decision pipeline" outcome={outcome}/>;
 return <Intake data={outcome.data}/>;
}
function Intake({data}:{data:Awaited<ReturnType<typeof load>>}){
 const router=useRouter();
 const programs=data.programs;
 const [programId,setProgramId]=useState(programs[0]?.id??"");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [existingApplicationId,setExistingApplicationId]=useState("");
 const [studentFirstName,setStudentFirstName]=useState(""),[studentLastName,setStudentLastName]=useState("");
 const [guardianFirstName,setGuardianFirstName]=useState(""),[guardianLastName,setGuardianLastName]=useState("");
 const [guardianEmail,setGuardianEmail]=useState(""),[gradeLevel,setGradeLevel]=useState("9"),[source,setSource]=useState("school_direct");
 const [notes,setNotes]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function perform(fn:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setNotice("");
  try{await fn();await router.invalidate();setNotice(message);}catch(e){setError(e instanceof Error?e.message:"Unable to save");}finally{setBusy(false);}
 }
 const stages=["inquiry","application","eligibility","accepted","declined","withdrawn"];
 return <WorkspaceShell eyebrow="CAN OS · Admissions" title="Admissions pipeline"
  subtitle="Capture family inquiries, qualify applicants, record decisions and hand accepted applications into enrollment."
  actions={<Link to="/admissions" className="rounded-lg border px-3 py-2 text-sm">Offers & enrollment →</Link>}>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <section className="mt-8 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">New inquiry</h2>
   <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void perform(
    async()=>{await createAdmissionsInquiry({data:{requestId,programId,...(existingApplicationId?{existingApplicationId}:{}),studentFirstName,studentLastName,
     guardianFirstName,guardianLastName,guardianEmail,gradeLevel,source,notes}});
     setRequestId(crypto.randomUUID());setExistingApplicationId("");},"Inquiry created.");}}>
    <label className="text-sm sm:col-span-2">Program<select className="mt-1 w-full rounded border bg-background p-2" required value={programId} onChange={e=>{setProgramId(e.target.value);setExistingApplicationId("");}}>
     <option value="">Choose program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <label className="text-sm sm:col-span-2">Existing household (optional, for siblings)
      <select className="mt-1 block w-full rounded border bg-background p-2"
        value={existingApplicationId} onChange={e=>setExistingApplicationId(e.target.value)}>
        <option value="">Create new household</option>
        {data.records.filter(r=>r.programId===programId).map(r=>
          <option value={r.id} key={r.id}>{r.studentFirst} {r.studentLast} — same guardian</option>)}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        Reuses the existing household and guardian only when the contact email matches.
      </span>
    </label>
    <label className="text-sm">Student first name<input required value={studentFirstName} onChange={e=>setStudentFirstName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Student last name<input required value={studentLastName} onChange={e=>setStudentLastName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Guardian first name<input required value={guardianFirstName} onChange={e=>setGuardianFirstName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Guardian last name<input required value={guardianLastName} onChange={e=>setGuardianLastName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Guardian email<input required type="email" value={guardianEmail} onChange={e=>setGuardianEmail(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Entering grade<input value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Inquiry source<select value={source} onChange={e=>setSource(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"><option value="school_direct">School inquiry</option><option value="church_referral">Church referral</option><option value="family_referral">Family referral</option><option value="event">Event</option><option value="other">Other</option></select></label>
    <label className="text-sm sm:col-span-2">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1 w-full rounded border bg-background p-2" rows={2}/></label>
    <button type="submit" disabled={busy||!programId} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create inquiry</button>
   </form>
  </section>
  <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
   {stages.map(stage=><div key={stage} className="rounded-lg border p-3"><p className="text-xs capitalize text-muted-foreground">{stage}</p><p className="font-serif text-2xl">{data.records.filter(r=>r.stage===stage).length}</p></div>)}
  </div>
  <section className="mt-8 space-y-3"><h2 className="font-serif text-2xl">Applicants and next actions</h2>
   {data.records.map(r=><article key={r.id} className="rounded-xl border bg-card p-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-semibold">{r.studentFirst} {r.studentLast}</h3>
     <p className="mt-1 text-xs text-muted-foreground">{r.programName} · {r.disposition??r.stage} · Last updated {new Date(r.updatedAt).toLocaleDateString()}</p></div>
     <span className="rounded-full border px-3 py-1 text-xs">{r.disposition??r.stage}</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy} onClick={()=>perform(()=>provisionInquiryGuardianAccount({data:{applicationId:r.id}}),
        "Guardian sign-in membership provisioned. The guardian can request an email access link at sign-in.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Provision guardian login</button>
      <button disabled={busy} onClick={()=>{
        const evidenceNote=window.prompt("Verification record: describe the independent documentation or identification reviewed.");
        if(!evidenceNote)return;
        const method=window.prompt("Method: in_person_id, verified_school_record, or live_video_verification","verified_school_record");
        if(!method||!["in_person_id","verified_school_record","live_video_verification"].includes(method))return;
        void perform(()=>verifyAdmissionsGuardianRelationship({data:{
         applicationId:r.id,method:method as "in_person_id"|"verified_school_record"|"live_video_verification",evidenceNote,
        }}),"Guardian relationship verified and family permissions enabled.");
       }}
       className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
       Verify guardian relationship
      </button>
      <button disabled={busy}
       onClick={()=>perform(()=>sendAdmissionsGuardianInvitation({data:{applicationId:r.id}}),
        "A secure email sign-in invitation was requested for this guardian.")}
       className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
       Send secure guardian invitation
      </button>
      {r.disposition==="ready_for_offer" && <Link to="/admissions"
        className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background">Issue enrollment offer →</Link>}
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
     {(r.stage==="inquiry"?[["application","Start application"],["decline","Decline"],["withdraw","Withdraw"]]:
       r.stage==="application"?[["eligibility","Begin eligibility review"],["decline","Decline"],["withdraw","Withdraw"]]:
       r.stage==="eligibility"?(r.disposition==="waitlisted"?[["restore","Restore to review"],["decline","Decline"],["withdraw","Withdraw"]]:
        r.disposition==="ready_for_offer"?[["waitlist","Waitlist"],["decline","Decline"],["withdraw","Withdraw"]]:
        [["accept","Approve for offer"],["waitlist","Waitlist"],["decline","Decline"],["withdraw","Withdraw"]]):[]).map(([decision,label])=>
       <button key={decision} disabled={busy} onClick={()=>perform(()=>transitionAdmissionsStage({data:{applicationId:r.id,decision:decision as "application"|"eligibility"|"accept"|"decline"|"withdraw"|"waitlist"|"restore"}}),label+" saved.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">{label}</button>)}
    </div>
   </article>)}
   {!data.records.length&&<p className="rounded-lg border p-5 text-sm text-muted-foreground">No applications recorded in your authorized programs.</p>}
  </section>
 </WorkspaceShell>;
}
