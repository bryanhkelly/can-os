import {useEffect,useRef,useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getAssignments,saveAssignmentResponse,saveAssignmentDraft} from "@/modules/student-experience/assignments.functions";
import {createSubmissionAttachmentUpload,attachDocumentToSubmission,listSubmissionAttachments} from "@/modules/learning/submission-attachments.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";

const loadAssignments=()=>getAssignments();
export const Route=createFileRoute("/student/assignments")({
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
 if(!result.ok)return <LoaderFailure eyebrow="CAN OS · Student" title="Your assignments" outcome={result}/>;
 return <StudentAssignmentsView data={result.data}/>;
}
function StudentAssignmentsView({data}:{data:AssignmentData}){
 const {connected,assignments}=data;
 const router=useRouter();
 const [selected,setSelected]=useState<string|null>(null);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [draftStatus,setDraftStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const [filter,setFilter]=useState<"all"|"todo"|"submitted"|"feedback">("all");
 const [pendingFiles,setPendingFiles]=useState<File[]>([]);
 const [attachments,setAttachments]=useState<{documentId:string;fileName:string}[]>([]);
 const saveGeneration=useRef(0);
 const chosen=assignments.find(item=>item.assessmentId===selected);
 const editable=Boolean(chosen&&chosen.assessmentStatus==="published"&&
  (!chosen.status||chosen.status==="assigned"||chosen.status==="returned"));
 function openAssignment(id:string,text:string){
  saveGeneration.current++;
  setSelected(id);setDraft(text);setDraftStatus("idle");setPendingFiles([]);
  setError("");setNotice("");
 }
 useEffect(()=>{
  const requested=new URLSearchParams(window.location.search).get("assessment");
  const target=assignments.find(item=>item.assessmentId===requested)??assignments[0];
  if(!selected&&target){
   setSelected(target.assessmentId);
   setDraft(target.responseText??"");
  }
 },[assignments,selected]);
 useEffect(()=>{
  if(!selected){setAttachments([]);return;}
  let active=true;
  listSubmissionAttachments({data:{assessmentId:selected}})
   .then(result=>{if(active)setAttachments(result.attachments)})
   .catch(()=>{if(active)setAttachments([])});
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
  if(!chosen||!editable||draft.trim().length<3)return;
  saveGeneration.current++;
  setBusy(true);setError("");setNotice("");
  try{
   await saveAssignmentResponse({data:{assessmentId:chosen.assessmentId,text:draft}});
   // The submission endpoint writes response text; files are attached after it.
   const failures:string[]=[];
   for(const file of pendingFiles){
    try{
     const contentType=attachmentMime(file.name);
     if(!contentType||file.size<16||file.size>10*1024*1024)
      throw new Error("Unsupported file type or size");
     const upload=await createSubmissionAttachmentUpload({data:{
      assessmentId:chosen.assessmentId,fileName:file.name,contentType,sizeBytes:file.size
     }});
     const response=await fetch(upload.uploadUrl,{method:"PUT",headers:{"Content-Type":contentType},body:file});
     if(!response.ok)throw new Error("Storage upload failed");
     await attachDocumentToSubmission({data:{assessmentId:chosen.assessmentId,documentId:upload.documentId}});
    }catch{failures.push(file.name);}
   }
   setPendingFiles([]);
   await router.invalidate();
   setNotice(failures.length
    ?"Your response was submitted, but attachments need attention: "+failures.join(", ")
    :"Your assignment has been submitted.");
  }catch(cause){
   setError(cause instanceof Error?cause.message:"Unable to submit assignment");
  }finally{setBusy(false);}
 }
 const items=assignments.filter(item=>
  filter==="all"||
  (filter==="todo"&&(!item.status||item.status==="assigned"||item.status==="returned"))||
  (filter==="submitted"&&item.status==="submitted")||
  (filter==="feedback"&&["graded","returned"].includes(item.status??"")));
 return <main className="mx-auto max-w-6xl px-5 py-10 pb-24">
  <Link to="/student" className="text-xs font-semibold underline">← Student Today</Link>
  <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Student learning</p>
  <h1 className="mt-2 font-serif text-4xl">Your assignments</h1>
  <p className="mt-3 max-w-2xl text-sm text-muted-foreground">View coursework in your enrolled classes, save a draft, submit responses, and review feedback. Teachers manage assessments and grades in their separate authorized gradebook.</p>
  {!connected&&<p role="status" className="mt-5 rounded-xl border p-4 text-sm">School records are currently unavailable.</p>}
  {error&&<p role="alert" className="mt-5 rounded-xl border p-4 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-xl border p-4 text-sm">{notice}</p>}
  <div className="mt-6 grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Assignments</p><p className="mt-1 text-3xl font-semibold">{assignments.length}</p></div>
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Awaiting feedback</p><p className="mt-1 text-3xl font-semibold">{assignments.filter(item=>item.status==="submitted").length}</p></div>
   <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Graded</p><p className="mt-1 text-3xl font-semibold">{assignments.filter(item=>item.status==="graded").length}</p></div>
  </div>
  <nav aria-label="Assignment filters" className="mt-7 flex flex-wrap gap-2">
   {([["all","All"],["todo","To do / revise"],["submitted","Submitted"],["feedback","Feedback"]] as const)
    .map(([key,label])=><button key={key} type="button" onClick={()=>setFilter(key)}
     className={"rounded-full border px-4 py-2 text-xs font-semibold "+(filter===key?"bg-foreground text-background":"bg-card")}>{label}</button>)}
  </nav>
  <div className="mt-5 grid gap-6 lg:grid-cols-2">
   <section aria-label="Assignments" className="space-y-3">
    {!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No assignments in this view.</p>}
    {items.map(item=><button key={item.assessmentId} type="button"
     onClick={()=>openAssignment(item.assessmentId,item.responseText??"")}
     className={"w-full rounded-xl border bg-card p-5 text-left "+(selected===item.assessmentId?"border-foreground":"")}>
     <p className="text-xs text-muted-foreground">{item.course} · {item.status??"not started"}</p>
     <h2 className="mt-2 font-semibold">{item.title}</h2>
     <p className="mt-2 text-xs text-muted-foreground">Due {formatDate(item.dueAt)}</p>
     {item.score!==null&&item.score!==undefined&&<p className="mt-2 text-sm">Score: {item.score} / {item.pointsPossible??100}</p>}
    </button>)}
   </section>
   <section aria-label="Assignment details">
    {!chosen?<div className="rounded-xl border p-6"><h2 className="font-serif text-xl">Select an assignment</h2></div>:
    <article className="rounded-xl border bg-card p-6">
     <p className="text-xs text-muted-foreground">{chosen.course}</p>
     <h2 className="mt-2 font-serif text-2xl">{chosen.title}</h2>
     <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{chosen.instructions??"Follow your teacher's instructions."}</p>
     <p className="mt-3 text-xs text-muted-foreground">Due {formatDate(chosen.dueAt)} · {chosen.assessmentStatus}</p>
     {chosen.metadata.rubric&&<p className="mt-4 rounded-lg bg-muted p-3 text-sm">Rubric: {chosen.metadata.rubric}</p>}
     {chosen.feedbackText&&<div className="mt-4 rounded-lg bg-muted p-4"><p className="font-semibold text-sm">Teacher feedback</p><p className="mt-2 text-sm">{chosen.feedbackText}</p></div>}
     {chosen.attempts.length>1&&<div className="mt-4 rounded-lg border p-3"><h3 className="font-semibold text-sm">Submission history</h3>{chosen.attempts.map(attempt=><p key={attempt.attempt} className="mt-1 text-xs">Attempt {attempt.attempt} · {attempt.status}{attempt.score!==null?" · "+attempt.score+" points":""}</p>)}</div>}
     {attachments.length>0&&<div className="mt-4 rounded-lg border p-3"><p className="font-semibold text-sm">Attached files</p>{attachments.map(file=><p key={file.documentId} className="mt-1 text-xs">{file.fileName}</p>)}</div>}
     {editable?<div className="mt-6">
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
     </div>:<p className="mt-5 rounded-lg bg-muted p-4 text-sm">Your submission is not currently editable. Review its status and feedback above.</p>}
    </article>}
   </section>
  </div>
 </main>;
}
