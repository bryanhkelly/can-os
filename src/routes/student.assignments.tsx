import { saveAssignmentWork, submitAssignmentWork } from "@/modules/student-experience/submit-assignment-work";
import { AssignmentAttemptHistory } from "@/components/student/AssignmentAttemptHistory";
import {useEffect,useRef,useState} from "react";
import { SubmissionAnnotations } from "@/components/learning/SubmissionAnnotations";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getAssignments,saveAssignmentResponse,saveAssignmentDraft} from "@/modules/student-experience/assignments.functions";
import {createSubmissionAttachmentUpload,attachDocumentToSubmission,listSubmissionAttachments,getSubmissionAttachmentDownload} from "@/modules/learning/submission-attachments.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell,StatusBadge} from "@/components/workspace";

const loadAssignments=()=>getAssignments();
export const Route=createFileRoute("/student/assignments")({
 validateSearch:(search:Record<string,unknown>):{filter?:"all"|"todo"|"missing"|"submitted"|"feedback";assessment?:string;section?:string}=>({
  filter:search.filter==="all"||search.filter==="todo"||search.filter==="missing"||search.filter==="submitted"||search.filter==="feedback"?search.filter:undefined,
  assessment:typeof search.assessment==="string"?search.assessment:undefined,
  section:typeof search.section==="string"?search.section:undefined,
 }),
 loader:safeLoader(loadAssignments,{authMessage:"Sign in with an authorized student account to view your assignments."}),
 component:StudentAssignments
});

const attachmentAccept=".pdf,.png,.jpg,.jpeg";
const attachmentMimes:Record<string,string>={
 pdf:"application/pdf",
 png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",
};
function attachmentMime(name:string){
 return attachmentMimes[name.split(".").pop()?.toLowerCase()??""]??null;
}
function formatDate(value:string|null){
 return value?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"No due date";
}
type AssignmentData=Awaited<ReturnType<typeof loadAssignments>>;
function StudentAssignments(){
 const result=Route.useLoaderData();
 const {filter="all",assessment,section}=Route.useSearch();
 if(!result.ok)return <LoaderFailure eyebrow="CAN OS · Student" title="Your assignments" outcome={result}/>;
 return <StudentAssignmentsView key={JSON.stringify([filter,assessment,section])} data={result.data}/>;
}
function StudentAssignmentsView({data}:{data:AssignmentData}){
 const {connected,assignments}=data;
 const router=useRouter();
 const {filter="all",assessment,section}=Route.useSearch();
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [submittedReceipt,setSubmittedReceipt]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [draftStatus,setDraftStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const [pendingFiles,setPendingFiles]=useState<File[]>([]);
 const [attachments,setAttachments]=useState<{documentId:string;fileName:string}[]>([]);
 const saveGeneration=useRef(0);
 const items=assignments.filter(item=>(!section||item.sectionId===section)&&(
  filter==="all"||
  (filter==="todo"&&(!item.status||item.status==="assigned"||item.status==="returned"))||
  (filter==="missing"&&item.timeliness==="missing")||
  (filter==="submitted"&&item.status==="submitted")||
  (filter==="feedback"&&(["graded","returned"].includes(item.status??"") ||
    Boolean(item.revisionFeedbackText)))));
 const [selection]=useState(()=>assessment??items[0]?.assessmentId);
 const chosen=items.find(item=>item.assessmentId===selection);
 const selected=chosen?.assessmentId??null;
 const selectedIndex=items.findIndex(item=>item.assessmentId===selected);
 const previousAssignment=items[selectedIndex-1],nextAssignment=items[selectedIndex+1];
 const [draft,setDraft]=useState(()=>chosen?.responseText??"");
 const nextAttempt=chosen?.status==="returned"?(chosen.attemptNumber??1)+1:chosen?.attemptNumber??1;
 const attemptLimitReached=Boolean(chosen&&chosen.metadata.maxAttempts!==null&&nextAttempt>chosen.metadata.maxAttempts);
 const editable=chosen?.canEdit===true&&!submittedReceipt;
 const canSubmit=draft.trim().length>=3||pendingFiles.length>0||
  (chosen?.status==="assigned"&&attachments.length>0);
 useEffect(()=>{
  if(!selected){setAttachments([]);return;}
  let active=true;
  listSubmissionAttachments({data:{assessmentId:selected}})
   .then(result=>{if(active)setAttachments(result.attachments)})
   .catch(()=>{if(active){setAttachments([]);setError("Unable to load this assignment's attachments.");}});
  return()=>{active=false};
 },[selected]);
 useEffect(()=>{
  if(!editable||!chosen||busy||draft===(chosen.responseText??""))return;
  const generation=++saveGeneration.current;
  const task=setTimeout(()=>{
   if(generation!==saveGeneration.current)return;
   setDraftStatus("saving");
   saveAssignmentDraft({data:{assessmentId:chosen.assessmentId,text:draft}})
    .then(()=>{if(generation===saveGeneration.current)setDraftStatus("saved")})
    .catch(()=>{if(generation===saveGeneration.current)setDraftStatus("error")});
  },950);
  return()=>{clearTimeout(task);saveGeneration.current++};
 },[chosen?.assessmentId,chosen?.status,chosen?.responseText,editable,busy,draft]);
 async function saveWork(submitFinal:boolean){
  if(!chosen||!editable||(submitFinal&&!canSubmit))return;
  saveGeneration.current++;
  setBusy(true);setError("");setNotice("");
  try{
   const work={
    files:pendingFiles,
    saveDraft:()=>saveAssignmentDraft({data:{assessmentId:chosen.assessmentId,text:draft}}),
    attach:async(file:File)=>{
     const contentType=attachmentMime(file.name);
     if(!contentType||file.size<16||file.size>10*1024*1024)
      throw new Error("Unsupported file type or size: "+file.name);
     const upload=await createSubmissionAttachmentUpload({data:{
      assessmentId:chosen.assessmentId,fileName:file.name,contentType,sizeBytes:file.size
     }});
     const response=await fetch(upload.uploadUrl,{method:"PUT",headers:{"Content-Type":contentType},body:file});
     if(!response.ok)throw new Error("Upload failed for "+file.name+". Your draft is saved; retry before submitting.");
     await attachDocumentToSubmission({data:{assessmentId:chosen.assessmentId,documentId:upload.documentId}});
    },
    attached:(file:File)=>setPendingFiles(current=>current.filter(item=>item!==file)),
   };
   if(submitFinal){
    const receipt=await submitAssignmentWork({...work,submit:()=>saveAssignmentResponse({data:{assessmentId:chosen.assessmentId,text:draft}})});
    setSubmittedReceipt(receipt.submissionId);
    setNotice("Your assignment has been submitted. Receipt: "+receipt.submissionId);
   }else{
    await saveAssignmentWork(work);
    setDraftStatus("saved");
    setNotice("Draft and attached files saved. You can return to continue before submitting.");
   }
   try{
    const updatedFiles=await listSubmissionAttachments({data:{assessmentId:chosen.assessmentId}});
    setAttachments(updatedFiles.attachments);
    await router.invalidate();
   }catch{
    setNotice(current=>current+" The latest view could not load. Reload to review your saved work.");
   }
  }catch(cause){
   setError(cause instanceof Error?cause.message:submitFinal?"Unable to submit assignment":"Unable to save draft");
  }finally{setBusy(false);}
 }
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Student learning" title="Your assignments"
  subtitle="Read instructions, save your response, submit work and follow through on feedback."
  breadcrumbs={<><Link to="/student" className="underline">Student Today</Link><span>/</span><Link to="/student/courses" search={{section}} className="underline">{section?"Class":"My classes"}</Link><span>/</span><span>Assignments</span></>}
  actions={<Link to="/calendar-export" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold">Export deadlines (.ics)</Link>}>
  {!connected&&<p role="status" className="mt-5 rounded-xl border p-4 text-sm">School records are currently unavailable.</p>}
  {error&&<p role="alert" className="mt-5 rounded-xl border p-4 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-xl border p-4 text-sm">{notice}</p>}
  {assessment&&!chosen&&<p role="alert" className="mt-5 rounded-xl border p-4 text-sm">This assignment is unavailable in the current view. Choose another assignment or select All.</p>}
  <div className="mt-6 grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Assignments</p><p className="mt-1 text-3xl font-semibold">{assignments.length}</p></div>
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Awaiting feedback</p><p className="mt-1 text-3xl font-semibold">{assignments.filter(item=>item.status==="submitted").length}</p></div>
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Graded</p><p className="mt-1 text-3xl font-semibold">{assignments.filter(item=>item.status==="graded").length}</p></div>
  </div>
  <nav aria-label="Assignment filters" className="mt-7 flex flex-wrap gap-2">
   {([["all","All"],["todo","To do / revise"],["missing","Missing work"],["submitted","Submitted"],["feedback","Feedback"]] as const)
    .map(([key,label])=><Link key={key} to="/student/assignments" search={{filter:key,section}} aria-current={filter===key?"page":undefined}
     className={"rounded-full border px-4 py-2 text-xs font-semibold "+(filter===key?"bg-foreground text-background":"bg-card")}>{label}</Link>)}
  </nav>
  <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
   <section aria-label="Assignments" className="space-y-3">
    {!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No assignments in this view.</p>}
    {items.map(item=><Link key={item.assessmentId} to="/student/assignments"
     search={{filter,section,assessment:item.assessmentId}} aria-current={selected===item.assessmentId?"page":undefined}
     className={"block w-full rounded-xl border bg-card p-5 text-left "+(selected===item.assessmentId?"border-foreground":"")}>
     <p className="text-xs text-muted-foreground">{item.course} · {item.status??"not started"}</p>
     <h2 className="mt-2 font-semibold">{item.title}</h2>
     <p className="mt-2 text-xs text-muted-foreground">Due {formatDate(item.dueAt)}</p>
     {item.score!==null&&item.score!==undefined&&<p className="mt-2 text-sm">Score: {item.score} / {item.pointsPossible??100}</p>}
    </Link>)}
   </section>
   <section aria-label="Assignment details">
    {!chosen?<div className="rounded-xl border p-6"><h2 className="font-serif text-xl">Select an assignment</h2></div>:
    <article className="rounded-xl border bg-card p-6">
     <nav aria-label="Assignment navigation" className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-sm">
      <span>{selectedIndex+1} of {items.length}</span>
      <div className="flex gap-4">
       {previousAssignment&&<Link to="/student/assignments" search={{filter,section,assessment:previousAssignment.assessmentId}} className="underline">Previous</Link>}
       {nextAssignment&&selectedIndex>=0&&<Link to="/student/assignments" search={{filter,section,assessment:nextAssignment.assessmentId}} className="underline">Next</Link>}
      </div>
     </nav>
     <p className="text-xs text-muted-foreground">{chosen.course}</p>
     <h2 className="mt-2 font-serif text-2xl">{chosen.title}</h2>
     <p className="mt-2 text-xs text-muted-foreground">Teacher activity: {chosen.metadata.assignmentKind}</p>
     {chosen.metadata.curriculumLessonId&&<Link to="/classes"
       search={{section:chosen.sectionId,tab:"lessons",lesson:chosen.metadata.curriculumLessonId}}
       className="mt-2 inline-block text-sm underline">Review publisher lesson: {chosen.metadata.curriculumLessonTitle??chosen.metadata.curriculumLessonId}</Link>}
     <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{chosen.instructions??"Follow your teacher's instructions."}</p>
     <p className="mt-3 text-xs text-muted-foreground">Due {formatDate(chosen.dueAt)} · {chosen.assessmentStatus}</p>
     {chosen.metadata.maxAttempts!==null&&<p className="mt-3 text-xs text-muted-foreground">
      Attempt {chosen.attemptNumber??1} of {chosen.metadata.maxAttempts} permitted attempts
     </p>}
     {attemptLimitReached&&<p role="status" className="mt-3 text-sm">This assignment's attempt limit has been reached. Contact your teacher about next steps.</p>}
     {!chosen.workAvailability.actionable&&<p className="mt-3 text-sm" role="status">
      {chosen.workAvailability.reason==="unreleased"
       ?"Opens "+formatDate(chosen.availableAt)
       :"Closed for student work. Your saved work and feedback remain available."}
     </p>}
     {chosen.submissionId&&chosen.submittedAt&&<p className="mt-3 text-xs text-muted-foreground">
      Submitted {new Date(chosen.submittedAt).toLocaleString()} · Receipt: {chosen.submissionId}
     </p>}
     <div className="mt-3"><StatusBadge tone={chosen.timeliness==="missing"?"attention":chosen.status==="graded"?"success":"neutral"}>{chosen.status??"Assigned"}{chosen.timeliness==="missing"?" · Missing":chosen.timeliness==="late"?" · Late":""}</StatusBadge></div>
     {chosen.metadata.rubric&&<p className="mt-4 rounded-lg bg-muted p-3 text-sm">Rubric: {chosen.metadata.rubric}</p>}
     {(chosen.metadata.criteria??[]).length>0&&<details className="mt-4 rounded-lg border p-4" open>
      <summary className="cursor-pointer text-sm font-semibold">How this work is assessed</summary>
      <ul className="mt-3 divide-y">{chosen.metadata.criteria.map(criterion=><li key={criterion.id} className="py-3 text-sm">
       <p className="font-semibold">{criterion.label} · {criterion.maxPoints} points</p>
       {criterion.description&&<p className="mt-1 text-muted-foreground">{criterion.description}</p>}
      </li>)}</ul>
     </details>}
     {chosen.feedbackText&&<div className="mt-4 rounded-lg bg-muted p-4"><p className="font-semibold text-sm">Teacher feedback</p><p className="mt-2 whitespace-pre-wrap text-sm">{chosen.feedbackText}</p></div>}
     {chosen.revisionFeedbackText&&<div className="mt-4 rounded-lg border p-4" role="status">
      <p className="font-semibold text-sm">Previous teacher feedback — guidance for your revision</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{chosen.revisionFeedbackText}</p>
     </div>}
     {chosen.submissionId&&["graded","returned"].includes(chosen.status??"")&&<SubmissionAnnotations key={chosen.submissionId} submissionId={chosen.submissionId}/>}
     {chosen.revisionFeedbackSubmissionId&&<SubmissionAnnotations
       key={chosen.revisionFeedbackSubmissionId} submissionId={chosen.revisionFeedbackSubmissionId}/>}
     <AssignmentConversation key={`conversation-${chosen.assessmentId}`} assessmentId={chosen.assessmentId}/>
     {chosen.attempts.length>1&&<AssignmentAttemptHistory key={chosen.assessmentId} assessmentId={chosen.assessmentId}/>}
     {attachments.length>0&&<div className="mt-4 rounded-lg border p-3"><p className="font-semibold text-sm">Attached files</p>{attachments.map(file=><button type="button" key={file.documentId}
      className="mt-1 block text-xs underline" onClick={async()=>{
       if(!chosen)return;
       try{
        const result=await getSubmissionAttachmentDownload({data:{assessmentId:chosen.assessmentId,documentId:file.documentId}});
        window.location.assign(result.downloadUrl);
       }catch(cause){setError(cause instanceof Error?cause.message:"Unable to open attachment")}
      }}>{file.fileName}</button>)}</div>}
     {editable?<div className="mt-6">
      <label className="text-sm font-semibold">Your response (optional when submitting a file)
       <textarea disabled={busy} rows={8} value={draft} maxLength={20000} onChange={event=>{setDraft(event.target.value);setDraftStatus("idle")}}
        className="mt-2 block w-full rounded-xl border bg-background p-3 text-sm" placeholder="Write your response…"/>
      </label>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">Draft: {draftStatus==="saving"?"Saving…":draftStatus==="saved"?"Saved":draftStatus==="error"?"Could not autosave":"Ready"}</p>
      <>
        <label className="mt-4 block text-sm font-semibold">Attachments (PDF, PNG or JPEG; maximum 10 MB each)
         <input type="file" multiple accept={attachmentAccept} disabled={busy}
          onChange={event=>setPendingFiles(Array.from(event.target.files??[]))}
          className="mt-2 block w-full rounded-lg border p-2 text-xs"/>
        </label>
        {pendingFiles.length>0&&<p className="mt-2 text-xs text-muted-foreground">Not yet uploaded: {pendingFiles.map(file=>file.name).join(", ")}. Choose Save draft or Submit assignment to save these files.</p>}
       </>
      <button type="button" disabled={busy} onClick={()=>saveWork(false)}
       className="mr-3 mt-4 rounded-lg border px-5 py-3 text-sm font-semibold disabled:opacity-40">Save draft</button>
      <button type="button" disabled={busy||!canSubmit} onClick={()=>saveWork(true)}
       className="mt-4 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">Submit assignment</button>
     </div>:<p className="mt-5 rounded-lg bg-muted p-4 text-sm">Your submission is not currently editable. Review its status and feedback above.</p>}
    </article>}
   </section>
  </div>
 </WorkspaceShell>;
}
