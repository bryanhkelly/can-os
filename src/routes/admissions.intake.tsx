import { AdmissionsApplicantCard } from "@/components/admissions/AdmissionsApplicantCard";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { ArrowUpRight } from "lucide-react";
import {useEffect,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {createAdmissionsInquiry,getAdmissionsStageCounts,listAdmissionsExistingStudentsPage,listAdmissionsIntake,listAdmissionsIntakePrograms,provisionInquiryGuardianAccount,sendAdmissionsGuardianInvitation,verifyAdmissionsGuardianRelationship,transitionAdmissionsStage} from "@/modules/enrollment/admissions-intake.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
import { PublicInterestInbox } from "@/components/admissions/PublicInterestInbox";
import { AdmissionsInquiryForm } from "@/components/admissions/AdmissionsInquiryForm";
import { AdmissionsPageNavigation } from "@/components/admissions/AdmissionsPageNavigation";
import { AdmissionsPipelineSummary } from "@/components/admissions/AdmissionsPipelineSummary";
import { listPublicAdmissionsInterests } from "@/modules/enrollment/public-admissions-interest.functions";
const load=async(selection:{interest?:string;siteId?:string;programId?:string;page?:number;studentPage?:number;search?:string;application?:string})=>{
 const [records,programs,existingStudentPage,publicInterests,selectedInterestPage,stageCounts]=await Promise.all([
  listAdmissionsIntake({data:{siteId:selection.siteId,programId:selection.programId,page:selection.page??1,search:selection.application?undefined:selection.search,applicationId:selection.application}}),
  listAdmissionsIntakePrograms(),
  listAdmissionsExistingStudentsPage({data:{siteId:selection.siteId,programId:selection.programId,page:selection.studentPage??1}}),
  listPublicAdmissionsInterests({data:{}}),
  selection.interest?listPublicAdmissionsInterests({data:{interestId:selection.interest}}):Promise.resolve(null),
  getAdmissionsStageCounts({data:{siteId:selection.siteId,programId:selection.programId,search:selection.search}}),
 ]);
 return {records,programs,existingStudents:existingStudentPage.items,existingStudentHasMore:existingStudentPage.nextPage!==null,publicInterests,
  linkedInterest:selectedInterestPage?.items[0]??null,stageCounts};
};
export const Route=createFileRoute("/admissions/intake")({
 validateSearch:(search:Record<string,unknown>):{application?:string;siteId?:string;programId?:string;interest?:string;page?:number;studentPage?:number;search?:string}=>({
  page:typeof search.page==="number"&&Number.isSafeInteger(search.page)&&search.page>0?search.page:1,
  studentPage:typeof search.studentPage==="number"&&Number.isSafeInteger(search.studentPage)&&search.studentPage>0?search.studentPage:1,
  search:typeof search.search==="string"?search.search.slice(0,100):undefined,
  application:typeof search.application==="string"?search.application:undefined,
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined,
  interest:typeof search.interest==="string"?search.interest:undefined,
 }),
 loaderDeps:({search})=>({interest:search.interest,siteId:search.siteId,programId:search.programId,page:search.page,studentPage:search.studentPage,search:search.search,application:search.application}),
 loader:({deps})=>safeLoader(()=>load(deps),{authMessage:"Sign in as a registrar to manage admissions."})(),
 component:IntakePage
});
function IntakePage(){
 const outcome=Route.useLoaderData();
 const selected=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Admissions" title="Inquiry and decision pipeline" outcome={outcome}/>;
 return <Intake key={`${selected.siteId??""}:${selected.programId??""}:${selected.interest??""}:${selected.studentPage??1}`} data={outcome.data}/>;
}
function Intake({data}:{data:Awaited<ReturnType<typeof load>>}){
 const router=useRouter();
 const selected=Route.useSearch();
 const programs=data.programs.filter(program=>(!selected.programId||program.id===selected.programId)&&
  (!selected.siteId||program.siteId===selected.siteId));
 const scopedRecords=data.records.items.filter(row=>(!selected.siteId||row.siteId===selected.siteId)&&
  (!selected.programId||row.programId===selected.programId));
 const records=scopedRecords.filter(row=>!selected.application||row.id===selected.application);
 const candidateInterest = data.linkedInterest?.id===selected.interest
  ? data.linkedInterest
  : data.publicInterests.items.find(row=>row.id===selected.interest);
 const selectedInterest=candidateInterest &&
  (!selected.siteId||candidateInterest.siteId===selected.siteId) &&
  (!selected.programId||candidateInterest.programId===selected.programId)
  ? candidateInterest : null;
 const convertibleInterest=selectedInterest&&["new","contacted"].includes(selectedInterest.status)?
  selectedInterest:null;
 const [programId,setProgramId]=useState(convertibleInterest?.programId??programs[0]?.id??"");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [existingApplicationId,setExistingApplicationId]=useState("");
 const [existingStudentKey,setExistingStudentKey]=useState("");
 const [createHouseholdConfirmed,setCreateHouseholdConfirmed]=useState(false);
 const existingStudents=data.existingStudents.filter(student=>student.programId===programId);
 const [searchDraft,setSearchDraft]=useState(selected.search??"");
 const pageNavigation=<div className="my-4 flex flex-wrap items-center gap-3">
  <form onSubmit={e=>{e.preventDefault();void router.navigate({to:"/admissions/intake",search:{...selected,search:searchDraft||undefined,page:1}});}}>
   <input aria-label="Search admissions" className="rounded border bg-background px-2 py-1" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} placeholder="Student, program, application ID"/>
   <button className="ml-2 rounded border px-2 py-1" type="submit">Search</button>
  </form>
  <AdmissionsPageNavigation selection={selected} hasMore={data.records.hasMore} kind="applications"/>
 </div>;

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
 return <WorkspaceShell eyebrow="CAN OS · Admissions" title="Admissions pipeline"
  subtitle="Capture family inquiries, qualify applicants, record decisions and hand accepted applications into enrollment."
  actions={<Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,application:selected.application}} className="rounded-lg border px-3 py-2 text-sm">Offers & enrollment →</Link>}>
  <WorkflowIntro eyebrow="Verified admissions workflow" title="Every applicant, a clear next step." description="Start with a family inquiry, review identity and eligibility, then record decisions in the canonical admissions workflow. A public inquiry never proves guardianship." actions={<a href="#new-inquiry" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">New inquiry <ArrowUpRight className="size-4" /></a>} />
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <PublicInterestInbox initialPage={data.publicInterests}
    siteId={selected.siteId} programId={selected.programId}/>
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
   {(!selected.interest||!!convertibleInterest)&&<AdmissionsInquiryForm
    onSubmit={e=>{e.preventDefault();void perform(
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
     setRequestId(crypto.randomUUID());setExistingApplicationId("");setExistingStudentKey("");setCreateHouseholdConfirmed(false);},"Inquiry created; continue the normal admissions and enrollment checklist.");}}
    programs={programs} programId={programId} setProgramId={setProgramId}
    convertibleInterest={!!convertibleInterest} contactReviewed={contactReviewed} busy={busy}
    existingStudentKey={existingStudentKey} setExistingStudentKey={setExistingStudentKey}
    existingStudents={existingStudents} existingStudent={existingStudent}
    createHouseholdConfirmed={createHouseholdConfirmed} setCreateHouseholdConfirmed={setCreateHouseholdConfirmed}
    existingApplicationId={existingApplicationId} setExistingApplicationId={setExistingApplicationId}
    studentFirstName={studentFirstName} setStudentFirstName={setStudentFirstName}
    studentLastName={studentLastName} setStudentLastName={setStudentLastName}
    guardianFirstName={guardianFirstName} setGuardianFirstName={setGuardianFirstName}
    guardianLastName={guardianLastName} setGuardianLastName={setGuardianLastName}
    guardianEmail={guardianEmail} setGuardianEmail={setGuardianEmail}
    gradeLevel={gradeLevel} setGradeLevel={setGradeLevel} source={source} setSource={setSource}
    notes={notes} setNotes={setNotes} selection={selected} existingStudentHasMore={data.existingStudentHasMore}/>}

  </section>
  <AdmissionsPipelineSummary counts={data.stageCounts}/>
  <section className="mt-8 space-y-3"><h2 className="font-serif text-2xl">Applicants and next actions</h2>
   {selected.application&&<Link to="/admissions/intake" search={{application:undefined,siteId:selected.siteId,programId:selected.programId}} className="inline-block text-sm underline">Show all applicants</Link>}
   {records.map(r=><AdmissionsApplicantCard key={r.id} r={r} busy={busy}
    onVerify={applicationId=>{
     const evidenceNote=window.prompt("Verification record: describe the independent documentation or identification reviewed.");
     if(!evidenceNote)return;
     const method=window.prompt("Method: in_person_id, verified_school_record, or live_video_verification","verified_school_record");
     if(!method||!["in_person_id","verified_school_record","live_video_verification"].includes(method))return;
     void perform(()=>verifyAdmissionsGuardianRelationship({data:{
      applicationId,method:method as "in_person_id"|"verified_school_record"|"live_video_verification",evidenceNote,
     }}),"Guardian relationship verified and family permissions enabled.");
    }}
    onProvision={applicationId=>void perform(()=>provisionInquiryGuardianAccount({data:{applicationId}}),
     "Verified guardian sign-in access provisioned.")}
    onInvite={applicationId=>void perform(()=>sendAdmissionsGuardianInvitation({data:{applicationId}}),
     "A secure email sign-in invitation was requested for this guardian.")}
    onDecision={(applicationId,decision,label)=>void perform(()=>transitionAdmissionsStage({data:{applicationId,decision}}),label+" saved.")}/>)}
   {pageNavigation}
   {!records.length&&<p role="status" className="rounded-lg border p-5 text-sm text-muted-foreground">{selected.application?
    "This application is unavailable in your authorized programs.":"No applications recorded in your authorized programs."}</p>}
  </section>
 </WorkspaceShell>;
}

