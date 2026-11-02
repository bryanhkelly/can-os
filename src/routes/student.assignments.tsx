import {useEffect,useRef,useState} from "react";
import { SubmissionAnnotations } from "@/components/learning/SubmissionAnnotations";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getAssignments,saveAssignmentResponse,saveAssignmentDraft} from "@/modules/student-experience/assignments.functions";
import {createSubmissionAttachmentUpload,attachDocumentToSubmission,listSubmissionAttachments,getSubmissionAttachmentDownload} from "@/modules/learning/submission-attachments.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell,StatusBadge} from "@/components/workspace";
import {attachmentContentType,PrivateUploadCompletion,validateUploadFile,type PrivateUpload} from "@/platform/storage/private-upload";
import {normalizeClientError} from "@/lib/client-error";

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
 const [error,setError]=useState("");
 const [interactive,setInteractive]=useState(false);
 const [draftStatus,setDraftStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const [pendingFiles,setPendingFiles]=useState<File[]>([]);
 const [responseSavedForAttachmentRetry,setResponseSavedForAttachmentRetry]=useState(false);
 const [attachments,setAttachments]=useState<{documentId:string;fileName:string}[]>([]);
 const saveGeneration=useRef(0);
 const pendingUploads=useRef(new Map<File,PrivateUploadCompletion<PrivateUpload & {documentId:string}>>());
 const uploadAbort=useRef<AbortController|null>(null);
 useEffect(()=>setInteractive(true),[]);
 useEffect(()=>()=>uploadAbort.current?.abort(),[]);
 const items=assignments.filter(item=>(!section||item.sectionId===section)&&(
  filter==="all"||
  (filter==="todo"&&(!item.status||item.status==="assigned"||item.status==="returned"))||
  (filter==="missing"&&item.timeliness==="missing")||
  (filter==="submitted"&&item.status==="submitted")||
  (filter==="feedback"&&["graded","returned"].includes(item.status??""))));
 const [selection]=useState(()=>assessment??items[0]?.assessmentId);
 const chosen=items.find(item=>item.assessmentId===selection);
 const selected=chosen?.assessmentId??null;
 const selectedIndex=items.findIndex(item=>item.assessmentId===selected);
 const previousAssignment=items[selectedIndex-1],nextAssignment=items[selectedIndex+1];
 const [draft,setDraft]=useState(()=>chosen?.responseText??"");
 const editable=Boolean(chosen&&chosen.assessmentStatus==="published"&&
  (!chosen.status||chosen.status==="assigned"||chosen.status==="returned"));
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
 async function submit(){
  if(!chosen||(!editable&&!responseSavedForAttachmentRetry)||(editable&&draft.trim().length<3))return;
  saveGeneration.current++;
  const controller=new AbortController();uploadAbort.current=controller;
  setBusy(true);setError("");setNotice("");
  try{
   if(!responseSavedForAttachmentRetry){
    await saveAssignmentResponse({data:{assessmentId:chosen.assessmentId,text:draft}});
    setResponseSavedForAttachmentRetry(true);
   }
   const failures:string[]=[];
   const remainingFiles:File[]=[];
   for(const file of pendingFiles){
    try{
     const contentType=attachmentContentType(file.name);
     validateUploadFile(file,contentType);
     let completion=pendingUploads.current.get(file);
     if(!completion){completion=new PrivateUploadCompletion<PrivateUpload & {documentId:string}>();pendingUploads.current.set(file,completion);}
     await completion.run(file,
      ()=>createSubmissionAttachmentUpload({data:{
       assessmentId:chosen.assessmentId,fileName:file.name,contentType,sizeBytes:file.size
      }}),
      upload=>attachDocumentToSubmission({data:{assessmentId:chosen.assessmentId,documentId:upload.documentId}}),
      controller.signal);
     pendingUploads.current.delete(file);
    }catch(cause){
     remainingFiles.push(file);
     failures.push(file.name+": "+normalizeClientError(cause,{fallback:"Unable to upload attachment."}).message);
    }
   }
   setPendingFiles(remainingFiles);
   const updatedFiles=await listSubmissionAttachments({data:{assessmentId:chosen.assessmentId}});
   setAttachments(updatedFiles.attachments);
   await router.invalidate();
   if(failures.length){
    setNotice("Your response was submitted, but attachments need attention: "+failures.join(", "));
   }else{
    setNotice("Your assignment has been submitted.");
    setResponseSavedForAttachmentRetry(false);
   }
  }catch(cause){
   setError(normalizeClientError(cause,{fallback:"Unable to submit assignment."}).message);
  }finally{if(uploadAbort.current===controller)uploadAbort.current=null;setBusy(false);}
 }
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Student learning" title="Your assignments"
  subtitle="Read instructions, save your response, submit work and follow through on feedback."
  breadcrumbs={<><Link to="/student" className="underline">Student Today</Link><span>/</span><Link to="/student/courses" search={{section}} className="underline">{section?"Class":"My classes"}</Link><span>/</span><span>Assignments</span></>}>
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
     <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{chosen.instructions??"Follow your teacher's instructions."}</p>
     <p className="mt-3 text-xs text-muted-foreground">Due {formatDate(chosen.dueAt)} · {chosen.assessmentStatus}</p>
     <div className="mt-3"><StatusBadge tone={chosen.timeliness==="missing"?"attention":chosen.status==="graded"?"success":"neutral"}>{chosen.status??"Assigned"}{chosen.timeliness==="missing"?" · Missing":chosen.timeliness==="late"?" · Late":""}</StatusBadge></div>
     {chosen.metadata.rubric&&<p className="mt-4 rounded-lg bg-muted p-3 text-sm">Rubric: {chosen.metadata.rubric}</p>}
     {(chosen.metadata.criteria??[]).length>0&&<details className="mt-4 rounded-lg border p-4" open>
      <summary className="cursor-pointer text-sm font-semibold">How this work is assessed</summary>
      <ul className="mt-3 divide-y">{chosen.metadata.criteria.map(criterion=><li key={criterion.id} className="py-3 text-sm">
       <p className="font-semibold">{criterion.label} · {criterion.maxPoints} points</p>
       {criterion.description&&<p className="mt-1 text-muted-foreground">{criterion.description}</p>}
      </li>)}</ul>
     </details>}
     {chosen.feedbackText&&<div className="mt-4 rounded-lg bg-muted p-4"><p className="font-semibold text-sm">Teacher feedback</p><p className="mt-2 text-sm">{chosen.feedbackText}</p></div>}
     {chosen.submissionId&&["graded","returned"].includes(chosen.status??"")&&<SubmissionAnnotations key={chosen.submissionId} submissionId={chosen.submissionId}/>}
     <AssignmentConversation key={`conversation-${chosen.assessmentId}`} assessmentId={chosen.assessmentId}/>
     {chosen.attempts.length>1&&<div className="mt-4 rounded-lg border p-3"><h3 className="font-semibold text-sm">Submission history</h3>{chosen.attempts.map(attempt=><p key={attempt.attempt} className="mt-1 text-xs">Attempt {attempt.attempt} · {attempt.status}{attempt.score!==null?" · "+attempt.score+" points":""}</p>)}</div>}
     {attachments.length>0&&<div className="mt-4 rounded-lg border p-3"><p className="font-semibold text-sm">Attached files</p>{attachments.map(file=><button type="button" key={file.documentId}
      className="mt-1 block text-xs underline" onClick={async()=>{
       if(!chosen)return;
       try{
        const result=await getSubmissionAttachmentDownload({data:{assessmentId:chosen.assessmentId,documentId:file.documentId}});
        window.location.assign(result.downloadUrl);
       }catch(cause){setError(cause instanceof Error?cause.message:"Unable to open attachment")}
      }}>{file.fileName}</button>)}</div>}
     {editable?<fieldset disabled={!interactive} className="mt-6">
      <label className="text-sm font-semibold">Your response
       <textarea rows={8} value={draft} maxLength={20000} onChange={event=>{setDraft(event.target.value);setDraftStatus("idle")}}
        className="mt-2 block w-full rounded-xl border bg-background p-3 text-sm" placeholder="Write your response…"/>
      </label>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">Draft: {draftStatus==="saving"?"Saving…":draftStatus==="saved"?"Saved":draftStatus==="error"?"Could not autosave":"Ready"}</p>
      <>
        <label className="mt-4 block text-sm font-semibold">Attachments (PDF, PNG or JPEG; maximum 10 MB each)
         <input type="file" multiple accept={attachmentAccept} disabled={busy}
          onChange={event=>setPendingFiles(Array.from(event.target.files??[]))}
          className="mt-2 block w-full rounded-lg border p-2 text-xs"/>
        </label>
        {pendingFiles.length>0&&<p className="mt-2 text-xs text-muted-foreground">Selected: {pendingFiles.map(file=>file.name).join(", ")}</p>}
       </>
      <button type="button" disabled={busy||draft.trim().length<3} onClick={submit}
       className="mt-4 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">Submit assignment</button>
     </fieldset>:responseSavedForAttachmentRetry&&pendingFiles.length>0?<fieldset disabled={!interactive||busy} className="mt-6 rounded-lg border p-4">
      <p className="text-sm">Your response is submitted. The following attachments still need to finish:</p>
      <p className="mt-2 text-xs text-muted-foreground">{pendingFiles.map(file=>file.name).join(", ")}</p>
      <button type="button" disabled={busy} onClick={submit}
       className="mt-3 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">Retry attachments</button>
     </fieldset>:<p className="mt-5 rounded-lg bg-muted p-4 text-sm">Your submission is not currently editable. Review its status and feedback above.</p>}
    </article>}
   </section>
  </div>
 </WorkspaceShell>;
}
