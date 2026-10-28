import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { ArrowUpRight } from "lucide-react";
import {useEffect,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {createAdmissionsInquiry,listAdmissionsExistingStudents,listAdmissionsIntake,listAdmissionsIntakePrograms,provisionInquiryGuardianAccount,sendAdmissionsGuardianInvitation,verifyAdmissionsGuardianRelationship,transitionAdmissionsStage} from "@/modules/enrollment/admissions-intake.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
import { PublicInterestInbox } from "@/components/admissions/PublicInterestInbox";
import { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";
const load=async()=>{
 const [records,programs,existingStudents,publicInterests]=await Promise.all([
  listAdmissionsIntake(),listAdmissionsIntakePrograms(),listAdmissionsExistingStudents(),
  listPublicAdmissionsInterests(),
 ]);
 return {records,programs,existingStudents,publicInterests};
};
export const Route=createFileRoute("/admissions/intake")({
 validateSearch:(search:Record<string,unknown>):{application?:string;siteId?:string;programId?:string;interest?:string}=>({
  application:typeof search.application==="string"?search.application:undefined,
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined,
  interest:typeof search.interest==="string"?search.interest:undefined,
 }),
 loader:safeLoader(load,{authMessage:"Sign in as a registrar to manage admissions."}),
 component:IntakePage
});
function IntakePage(){
 const outcome=Route.useLoaderData();
 const selected=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Admissions" title="Inquiry and decision pipeline" outcome={outcome}/>;
 return <Intake key={`${selected.siteId??""}:${selected.programId??""}:${selected.interest??""}`} data={outcome.data}/>;
}
function Intake({data}:{data:Awaited<ReturnType<typeof load>>}){
 const router=useRouter();
 const selected=Route.useSearch();
 const programs=data.programs.filter(program=>(!selected.programId||program.id===selected.programId)&&
  (!selected.siteId||program.siteId===selected.siteId));
 const scopedRecords=data.records.filter(row=>(!selected.siteId||row.siteId===selected.siteId)&&
  (!selected.programId||row.programId===selected.programId));
 const records=scopedRecords.filter(row=>!selected.application||row.id===selected.application);
 const selectedInterest=data.publicInterests.find(row=>row.id===selected.interest &&
  (!selected.siteId||row.siteId===selected.siteId) &&
  (!selected.programId||row.programId===selected.programId));
 const convertibleInterest=selectedInterest&&["new","contacted"].includes(selectedInterest.status)?
  selectedInterest:null;
 const [programId,setProgramId]=useState(convertibleInterest?.programId??programs[0]?.id??"");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [existingApplicationId,setExistingApplicationId]=useState("");
 const [existingStudentKey,setExistingStudentKey]=useState("");
 const [createHouseholdConfirmed,setCreateHouseholdConfirmed]=useState(false);
 const existingStudents=data.existingStudents.filter(student=>student.programId===programId);
 const studentKey=(student:typeof existingStudents[number])=>
  `${student.studentProfileId}:${student.guardianPersonId}:${student.householdId??"new"}`;
 const existingStudent=existingStudents.find(student=>studentKey(student)===existingStudentKey);
 const [studentFirstName,setStudentFirstName]=useState(""),[studentLastName,setStudentLastName]=useState("");
 const [guardianFirstName,setGuardianFirstName]=useState(convertibleInterest?.firstName??""),[guardianLastName,setGuardianLastName]=useState(convertibleInterest?.lastName??"");
 const [guardianEmail,setGuardianEmail]=useState(convertibleInterest?.email??""),[gradeLevel,setGradeLevel]=useState(convertibleInterest?"":"9"),[source,setSource]=useState(convertibleInterest?"published_site":"school_direct");
 const [notes,setNotes]=useState(convertibleInterest?.message??""),[contactReviewed,setContactReviewed]=useState(false),[saving,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [interactive,setInteractive]=useState(false);
 useEffect(()=>setInteractive(true),[]);
 const busy=saving||!interactive;
 async function perform(fn:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setNotice("");
  try{await fn();await router.invalidate();setNotice(message);}catch(e){setError(e instanceof Error?e.message:"Unable to save");}finally{setBusy(false);}
 }
 const stages=["inquiry","application","eligibility","accepted","declined","withdrawn"];
 return <WorkspaceShell eyebrow="CAN OS · Admissions" title="Admissions pipeline"
  subtitle="Capture family inquiries, qualify applicants, record decisions and hand accepted applications into enrollment."
  actions={<Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,application:selected.application}} className="rounded-lg border px-3 py-2 text-sm">Offers & enrollment →</Link>}>
  <WorkflowIntro eyebrow="Verified admissions workflow" title="Every applicant, a clear next step." description="Start with a family inquiry, review identity and eligibility, then record decisions in the canonical admissions workflow. A public inquiry never proves guardianship." actions={<a href="#new-inquiry" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">New inquiry <ArrowUpRight className="size-4" /></a>} />
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <PublicInterestInbox items={data.publicInterests.filter(row =>
    (!selected.siteId || row.siteId === selected.siteId) &&
    (!selected.programId || row.programId === selected.programId))}/>
  <section className="mt-8 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">New inquiry</h2>
   {selected.interest&&!selectedInterest&&<p role="alert" className="mt-3 rounded-lg border p-3 text-sm">
    This public interest is unavailable in your authorized Site and Program scope.
   </p>}
   {selectedInterest&&!convertibleInterest&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">
    This public interest is {selectedInterest.status}; it cannot be converted again.
    {selectedInterest.applicationId&&<>{" "}
      <Link to="/admissions/intake"
        search={{siteId:selectedInterest.siteId,programId:selectedInterest.programId,
          application:selectedInterest.applicationId,interest:undefined}}
        className="underline">View linked admissions inquiry</Link>
    </>}
   </p>}
   {convertibleInterest&&<div className="mt-3 space-y-2 rounded-lg border p-4 text-sm">
     <p className="font-semibold">Public request selected · {convertibleInterest.programName}</p>
     <p>Adult contact fields and the original inquiry note are prefilled. Confirm
       the contact with the family and enter the student's identity below.
       Public contact details do not prove guardianship or confer school access.</p>
     <p>If this student or guardian already has a CAN OS record, exit this handoff
       and use ordinary verified intake to avoid duplicate identities.</p>
     <label className="flex items-start gap-2">
       <input type="checkbox" checked={contactReviewed}
         onChange={e=>setContactReviewed(e.target.checked)}/>
       <span>I reviewed the adult contact with the family, confirmed the new
         student's identity and checked that a new unverified intake record
         is appropriate. Formal guardian verification remains a separate step.</span>
     </label>
   </div>}
   {(!selected.interest||!!convertibleInterest)&&<form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void perform(
    async()=>{
     if(existingStudentKey&&!existingStudent)throw new Error("The selected student is no longer available. Choose a student again.");
     if(existingStudent&&!existingStudent.householdId&&!createHouseholdConfirmed)
      throw new Error("Confirm creation of the missing household before continuing.");
     if(convertibleInterest&&!contactReviewed)
      throw new Error("Confirm the family contact and student identity before continuing.");
     const created=await createAdmissionsInquiry({data:existingStudent?{
      requestId,programId,source,notes,existingStudent:{studentProfileId:existingStudent.studentProfileId,
       guardianPersonId:existingStudent.guardianPersonId,...(existingStudent.householdId?
        {householdId:existingStudent.householdId}:{createHousehold:true})},
     }:{requestId,programId,...(existingApplicationId?{existingApplicationId}:{}),studentFirstName,studentLastName,
      guardianFirstName,guardianLastName,guardianEmail,gradeLevel,source,notes,
      ...(convertibleInterest?{publicInterestId:convertibleInterest.id,contactReviewed:true as const}:{})}});
     const selectedProgram=data.programs.find(program=>program.id===programId);
     await router.navigate({to:"/admissions/intake",search:{
       siteId:convertibleInterest?.siteId??selectedProgram?.siteId??undefined,
       programId,application:created.applicationId,interest:undefined,
     }});
     setRequestId(crypto.randomUUID());setExistingApplicationId("");setExistingStudentKey("");setCreateHouseholdConfirmed(false);},"Inquiry created; continue the normal admissions and enrollment checklist.");}}>
    <label className="text-sm sm:col-span-2">Program<select className="mt-1 w-full rounded border bg-background p-2" required disabled={!!convertibleInterest} value={programId} onChange={e=>{setProgramId(e.target.value);setExistingApplicationId("");setExistingStudentKey("");setCreateHouseholdConfirmed(false);}}>
     <option value="">Choose program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <label className="text-sm sm:col-span-2">Student identity
     <select className="mt-1 block w-full rounded border bg-background p-2" disabled={!!convertibleInterest} value={existingStudentKey}
      onChange={e=>{setExistingStudentKey(e.target.value);setExistingApplicationId("");setCreateHouseholdConfirmed(false);}}>
      <option value="">Create a new student</option>
      {existingStudents.map(student=><option key={studentKey(student)} value={studentKey(student)}>
       {student.studentFirstName} {student.studentLastName} — guardian: {student.guardianFirstName} {student.guardianLastName}
       {!student.householdId?" (new household required)":""}
      </option>)}
     </select>
     <span className="mt-1 block text-xs text-muted-foreground">
      Existing students reuse their identity and managing guardian. Existing households are preserved. Creating an inquiry does not activate enrollment.
     </span>
    </label>
    {existingStudent&&!existingStudent.householdId&&<label className="text-sm sm:col-span-2">
     <input type="checkbox" required checked={createHouseholdConfirmed} onChange={e=>setCreateHouseholdConfirmed(e.target.checked)}/>
     {" "}I confirm creating the missing household for this existing student and managing guardian. Neither currently belongs to a household.
    </label>}
    {!existingStudent&&<>
    <label className="text-sm sm:col-span-2">Existing household (optional, for siblings)
      <select className="mt-1 block w-full rounded border bg-background p-2"
        disabled={!!convertibleInterest} value={existingApplicationId} onChange={e=>setExistingApplicationId(e.target.value)}>
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
    </>}
    <label className="text-sm">Inquiry source<select value={source} disabled={!!convertibleInterest} onChange={e=>setSource(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"><option value="school_direct">School inquiry</option><option value="published_site">Published Site</option><option value="church_referral">Church referral</option><option value="family_referral">Family referral</option><option value="event">Event</option><option value="other">Other</option></select></label>
    <label className="text-sm sm:col-span-2">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1 w-full rounded border bg-background p-2" rows={2}/></label>
    <button type="submit" disabled={busy||!programId||(!!convertibleInterest&&!contactReviewed)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create inquiry</button>
   </form>}
  </section>
  <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
   {stages.map(stage=><div key={stage} className="rounded-lg border p-3"><p className="text-xs capitalize text-muted-foreground">{stage}</p><p className="font-serif text-2xl">{scopedRecords.filter(r=>r.stage===stage).length}</p></div>)}
  </div>
  <section className="mt-8 space-y-3"><h2 className="font-serif text-2xl">Applicants and next actions</h2>
   {selected.application&&<Link to="/admissions/intake" search={{application:undefined,siteId:selected.siteId,programId:selected.programId}} className="inline-block text-sm underline">Show all applicants</Link>}
   {records.map(r=><article key={r.id} className="rounded-xl border bg-card p-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-semibold">{r.studentFirst} {r.studentLast}</h3>
     <p className="mt-1 text-xs text-muted-foreground">{r.programName} · {r.disposition??r.stage} · Last updated {new Date(r.updatedAt).toLocaleDateString()}</p></div>
     <span className="rounded-full border px-3 py-1 text-xs">{r.disposition??r.stage}</span>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">
      Guardian verification: <strong>{r.guardianVerified?"Verified":"Required"}</strong> ·
      {" "}Sign-in access: <strong>{r.guardianLoginProvisioned?"Provisioned":"Not provisioned"}</strong>.
      Verify the relationship independently before granting or inviting access.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy||r.guardianVerified} onClick={()=>{
        const evidenceNote=window.prompt("Verification record: describe the independent documentation or identification reviewed.");
        if(!evidenceNote)return;
        const method=window.prompt("Method: in_person_id, verified_school_record, or live_video_verification","verified_school_record");
        if(!method||!["in_person_id","verified_school_record","live_video_verification"].includes(method))return;
        void perform(()=>verifyAdmissionsGuardianRelationship({data:{
         applicationId:r.id,method:method as "in_person_id"|"verified_school_record"|"live_video_verification",evidenceNote,
        }}),"Guardian relationship verified and family permissions enabled.");
       }}
       className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
       {r.guardianVerified?"Relationship verified":"Verify guardian relationship"}
      </button>
      <button disabled={busy||!r.guardianVerified||r.guardianLoginProvisioned}
        onClick={()=>perform(()=>provisionInquiryGuardianAccount({data:{applicationId:r.id}}),
          "Verified guardian sign-in access provisioned.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
        {r.guardianLoginProvisioned?"Login provisioned":"Provision guardian login"}
      </button>
      <button disabled={busy||!r.guardianLoginProvisioned}
       onClick={()=>perform(()=>sendAdmissionsGuardianInvitation({data:{applicationId:r.id}}),
        "A secure email sign-in invitation was requested for this guardian.")}
       className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
       Send secure guardian invitation
      </button>
      {r.disposition==="ready_for_offer" && <Link to="/admissions"
        search={{siteId:r.siteId??undefined,programId:r.programId,application:r.id}}
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
    <Link to="/admissions" search={{siteId:r.siteId??undefined,programId:r.programId,application:r.id}}
      className="mt-3 inline-block text-xs underline">Review this application's offers and enrollment →</Link>
    <p className="mt-2 text-xs text-muted-foreground">Withdraw unaccepted offers before waitlisting, declining or withdrawing an application.
      Accepted offers and active enrollments require their enrollment workflow and cannot be cancelled here.</p>
   </article>)}
   {!records.length&&<p role="status" className="rounded-lg border p-5 text-sm text-muted-foreground">{selected.application?
    "This application is unavailable in your authorized programs.":"No applications recorded in your authorized programs."}</p>}
  </section>
 </WorkspaceShell>;
}
