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
import {WorkspaceShell,StatusBadge,WorkspaceNotice} from "@/components/workspace";
import {useHydrated} from "@/lib/use-hydrated";
import {createPrivateUploadTask,documentUploadPolicy} from "@/platform/storage/private-upload";
import {attachmentAccept,attachmentMimeForFileName as attachmentMime} from "@/modules/learning/attachment-mimes";
import {mutationErrorMessage,useMutationFeedback} from "@/lib/mutation-feedback";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {useStudentDisplayPreferences} from "@/components/shell/WorkspaceSession";
import {formatTimestamp} from "@/modules/calendar/timezone";

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

function formatDate(value:string|null,timeZone?:string){
 return value?formatTimestamp(value,timeZone??"UTC"):"No due date";
}
type AssignmentData=Awaited<ReturnType<typeof loadAssignments>>;
function StudentAssignments(){
 const result=Route.useLoaderData();
 const {filter="all",assessment,section}=Route.useSearch();
 const preferences=useStudentDisplayPreferences();
 if(!result.ok)return <LoaderFailure eyebrow="Student" title="Your assignments" outcome={result}/>;
 return <StudentAssignmentsView key={JSON.stringify([filter,assessment,section,preferences.showCompletedAssignments])} data={result.data} showCompleted={preferences.showCompletedAssignments}/>;
}
function StudentAssignmentsView({data,showCompleted}:{data:AssignmentData;showCompleted:boolean}){
 const {connected,assignments}=data;
 const router=useRouter();
 const {filter="all",assessment,section}=Route.useSearch();
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 const notice=mutation.notice;
 const [progress,setProgress]=useState("");
 const [submittedReceipt,setSubmittedReceipt]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [draftStatus,setDraftStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const [pendingFiles,setPendingFiles]=useState<File[]>([]);
 const [attachments,setAttachments]=useState<{documentId:string;fileName:string}[]>([]);
 const saveGeneration=useRef(0);
 const feedbackRef=useRef<HTMLParagraphElement>(null);
 const saving=useRef(false);
 const uploads=useRef(new Map<string,Map<File,{run:()=>Promise<unknown>}>>());
 const hydrated=useHydrated();
 useEffect(()=>{
  if(error||notice||mutation.error)feedbackRef.current?.focus();
 },[error,notice,mutation.error]);
 const items=assignments.filter(item=>(!section||item.sectionId===section)&&
  (filter!=="all"||showCompleted||item.assessmentId===assessment||!["submitted","graded"].includes(item.status??""))&&(
  filter==="all"||
  (filter==="todo"&&(!item.status||item.status==="assigned"||item.status==="returned"))||
  (filter==="missing"&&item.timeliness==="missing")||
  (filter==="submitted"&&item.status==="submitted")||
  (filter==="feedback"&&(["graded","returned"].includes(item.status??"") ||
    Boolean(item.revisionFeedbackText)))));
 const [selection]=useState(()=>assessment??items[0]?.assessmentId);
 const chosen=items.find(item=>item.assessmentId===selection)??
  (submittedReceipt?assignments.find(item=>item.assessmentId===selection):undefined);
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
  if(!hydrated||!editable||!chosen||busy||draft===(chosen.responseText??""))return;
  const generation=++saveGeneration.current;
  const task=setTimeout(()=>{
   if(generation!==saveGeneration.current)return;
   setDraftStatus("saving");
   saveAssignmentDraft({data:{assessmentId:chosen.assessmentId,text:draft}})
    .then(()=>{if(generation===saveGeneration.current)setDraftStatus("saved")})
    .catch(()=>{if(generation===saveGeneration.current)setDraftStatus("error")});
  },950);
  return()=>{clearTimeout(task);saveGeneration.current++};
 },[chosen?.assessmentId,chosen?.status,chosen?.responseText,editable,busy,draft,hydrated]);
 async function saveWork(submitFinal:boolean){
  if(saving.current)return;
  if(!chosen||!editable){
   setError("This assignment is no longer editable. Reload to review its current status.");
   return;
  }
  if(submitFinal&&!canSubmit){
   setError("Write at least three characters or choose a file before submitting.");
   return;
  }
  saving.current=true;
  saveGeneration.current++;
  setError("");setProgress("Saving your draft...");
  try{
   await mutation.run(async()=>{
   const work={
    files:pendingFiles,
    saveDraft:()=>saveAssignmentDraft({data:{assessmentId:chosen.assessmentId,text:draft}}),
    attach:async(file:File)=>{
     setProgress("Uploading "+file.name+"...");
     const contentType=attachmentMime(file.name);
     if(!contentType)
      throw new Error("Unsupported file type or size: "+file.name);
     let files=uploads.current.get(chosen.assessmentId);
     if(!files){files=new Map();uploads.current.set(chosen.assessmentId,files);}
     let task=files.get(file);
     if(!task){
      task=createPrivateUploadTask({file,contentType,policy:documentUploadPolicy,
       begin:()=>createSubmissionAttachmentUpload({data:{
        assessmentId:chosen.assessmentId,fileName:file.name,contentType,sizeBytes:file.size,
       }}),
       finish:upload=>{
        setProgress("Verifying "+file.name+"...");
        return attachDocumentToSubmission({data:{assessmentId:chosen.assessmentId,documentId:upload.documentId}});
       },
      });
      files.set(file,task);
     }
     await task.run();
    },
    attached:(file:File)=>setPendingFiles(current=>current.filter(item=>item!==file)),
   };
   if(submitFinal){
    const receipt=await submitAssignmentWork({...work,submit:()=>{
     setProgress("Submitting your assignment...");
     return saveAssignmentResponse({data:{assessmentId:chosen.assessmentId,text:draft}});
    }});
    setSubmittedReceipt(receipt.submissionId);
    return receipt.submissionId;
   }else{
    await saveAssignmentWork(work);
    setDraftStatus("saved");
    return null;
   }
   },{
    successMessage:receipt=>receipt?"Your assignment has been submitted. Receipt: "+receipt:
     "Draft and attached files saved. You can return to continue before submitting.",
    commandErrorMessage:(submitFinal?"Unable to confirm assignment submission.":"Unable to confirm draft save.")+
     " Your response and pending files are retained; review the current status before retrying.",
    refresh:async()=>{
    const updatedFiles=await listSubmissionAttachments({data:{assessmentId:chosen.assessmentId}});
    setAttachments(updatedFiles.attachments);
    await router.invalidate();
    },
   });
  }finally{saving.current=false;setProgress("");}
 }
 return <WorkspaceShell width="wide" eyebrow="Student learning" title="Your assignments"
  subtitle="Read instructions, save your response, submit work and follow through on feedback."
  breadcrumbs={<><Link to="/home" className="underline">Student Today</Link><span>/</span><Link to="/student/courses" search={{section}} className="underline">{section?"Class":"My classes"}</Link><span>/</span><span>Assignments</span></>}
  actions={<Link to="/calendar-export" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold">Export deadlines (.ics)</Link>}>
  {!connected&&<p role="status" className="mt-5 rounded-xl border p-4 text-sm">School records are currently unavailable.</p>}
  {!chosen&&error&&<WorkspaceNotice ref={feedbackRef} tone="danger" className="mt-5">{error}</WorkspaceNotice>}
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
  {!showCompleted&&filter==="all"&&<p role="status" className="mt-4 text-sm text-muted-foreground">Completed assignments are hidden by your display preference. Use Submitted or Feedback to review them; direct assignment links remain available.</p>}
  <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
   <section aria-label="Assignments" className="space-y-3">
    {!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No assignments in this view.</p>}
    {items.map(item=><Link key={item.assessmentId} to="/student/assignments"
     search={{filter,section,assessment:item.assessmentId}} aria-current={selected===item.assessmentId?"page":undefined}
     className={"block w-full rounded-xl border bg-card p-5 text-left "+(selected===item.assessmentId?"border-foreground":"")}>
     <p className="text-xs text-muted-foreground">{item.course} · {item.status??"not started"}</p>
     <h2 className="mt-2 font-semibold">{item.title}</h2>
     <p className="mt-2 text-xs text-muted-foreground">{item.dueAt?"Due "+formatDate(item.dueAt,item.timezone):"No due date"}</p>
     {item.score!==null&&item.score!==undefined&&<p className="mt-2 text-sm">Score: {item.score} / {item.pointsPossible??100}</p>}
    </Link>)}
   </section>
   <section aria-label="Assignment details">
    {!chosen?<div className="rounded-xl border p-6"><h2 className="font-serif text-xl">Select an assignment</h2></div>:
    <article className="rounded-xl border bg-card p-6">
     <nav aria-label="Assignment navigation" className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-sm">
      <span>{selectedIndex>=0?`${selectedIndex+1} of ${items.length}`:"Submitted assignment"}</span>
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
     <p className="mt-3 text-xs text-muted-foreground">{chosen.dueAt?"Due "+formatDate(chosen.dueAt,chosen.timezone):"No due date"} · {chosen.assessmentStatus}</p>
     {chosen.metadata.maxAttempts!==null&&<p className="mt-3 text-xs text-muted-foreground">
      Attempt {chosen.attemptNumber??1} of {chosen.metadata.maxAttempts} permitted attempts
     </p>}
     {attemptLimitReached&&<p role="status" className="mt-3 text-sm">This assignment's attempt limit has been reached. Contact your teacher about next steps.</p>}
     {!chosen.workAvailability.actionable&&<p className="mt-3 text-sm" role="status">
      {chosen.workAvailability.reason==="unreleased"
       ?"Opens "+formatDate(chosen.availableAt,chosen.timezone)
       :"Closed for student work. Your saved work and feedback remain available."}
     </p>}
     {chosen.submissionId&&chosen.submittedAt&&<p className="mt-3 text-xs text-muted-foreground">
      Submitted {formatDate(chosen.submittedAt,chosen.timezone)} · Receipt: {chosen.submissionId}
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
     {chosen.attempts.length>1&&<AssignmentAttemptHistory key={JSON.stringify([chosen.assessmentId,chosen.attempts])} assessmentId={chosen.assessmentId}/>}
     {attachments.length>0&&<div className="mt-4 rounded-lg border p-3"><p className="font-semibold text-sm">Attached files</p>{attachments.map(file=><button type="button" key={file.documentId}
      className="mt-1 block text-xs underline" onClick={async()=>{
       if(!chosen)return;
       try{
        const result=await getSubmissionAttachmentDownload({data:{assessmentId:chosen.assessmentId,documentId:file.documentId}});
        window.location.assign(result.downloadUrl);
       }catch(cause){setError(mutationErrorMessage(cause, "Unable to open attachment"))}
      }}>{file.fileName}</button>)}</div>}
     {editable?<div className="mt-6" aria-busy={busy}>
      <label className="text-sm font-semibold">Your response (optional when submitting a file)
       <textarea disabled={!hydrated||busy} rows={8} value={draft} maxLength={20000} onChange={event=>{setDraft(event.target.value);setDraftStatus("idle")}}
        className="mt-2 block w-full rounded-xl border bg-background p-3 text-sm" placeholder="Write your response…"/>
      </label>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">Draft: {draftStatus==="saving"?"Saving…":draftStatus==="saved"?"Saved":draftStatus==="error"?"Could not autosave":"Ready"}</p>
      <>
        <label className="mt-4 block text-sm font-semibold">Attachments (PDF, PNG or JPEG; maximum 10 MB each)
         <input type="file" multiple accept={attachmentAccept} disabled={!hydrated||busy}
          onChange={event=>setPendingFiles(Array.from(event.target.files??[]))}
          className="mt-2 block w-full rounded-lg border p-2 text-xs"/>
        </label>
        {pendingFiles.length>0&&<p className="mt-2 text-xs text-muted-foreground">Not yet uploaded: {pendingFiles.map(file=>file.name).join(", ")}. Choose Save draft or Submit assignment to save these files.</p>}
       </>
      <button type="button" disabled={!hydrated||busy} onClick={()=>saveWork(false)}
       className="mr-3 mt-4 rounded-lg border px-5 py-3 text-sm font-semibold disabled:opacity-40">Save draft</button>
      <button type="button" disabled={!hydrated||busy||!canSubmit} onClick={()=>saveWork(true)}
       className="mt-4 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">{busy?"Saving assignment...":"Submit assignment"}</button>
     </div>:<p className="mt-5 rounded-lg bg-muted p-4 text-sm">Your submission is not currently editable. Review its status and feedback above.</p>}
     {error&&<WorkspaceNotice ref={feedbackRef} tone="danger" className="mt-4">{error}</WorkspaceNotice>}
     <div tabIndex={-1} ref={feedbackRef} className="mt-4">
      <MutationFeedback state={mutation} pendingMessage={progress||"Saving assignment..."}/>
     </div>
    </article>}
   </section>
  </div>
 </WorkspaceShell>;
}
