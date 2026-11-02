import {useEffect,useRef,useState} from "react";
import {useRouter} from "@tanstack/react-router";
import {beginEnrollmentDocumentUpload,finishEnrollmentDocumentUpload,getEnrollmentDocumentDownload,getEnrollmentDocumentUploadAvailability} from "@/modules/enrollment/r2-document-upload.functions";
import {getFamilyReadiness,setFamilyRequirement,addRequirementReviewNote,reviewRequirementDocument} from "@/modules/enrollment/family-readiness.functions";
import {RegistrarEnrollmentFormReview} from "@/components/enrollment/EnrollmentForm";
import {PrivateUploadCompletion,validateUploadFile,type PrivateUpload} from "@/platform/storage/private-upload";
import {normalizeClientError} from "@/lib/client-error";

export type ReadinessApplication=Awaited<ReturnType<typeof getFamilyReadiness>>[number];

/** Registrar enrollment requirement checklist, document review and notes for one application. */
export function ApplicationReadinessPanel({application:a}:{application:ReadinessApplication}){
 const router=useRouter();
 const [pending,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[notes,setNotes]=useState<Record<string,string>>({});
 const [interactive,setInteractive]=useState(false);
 useEffect(()=>setInteractive(true),[]);
 const busy=interactive?pending:"hydrating";
 const [files,setFiles]=useState<Record<string,File|null>>({});
 const pendingUploads=useRef(new Map<string,PrivateUploadCompletion<PrivateUpload>>());
 const uploadAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>uploadAbort.current?.abort(),[]);
 const [uploadModes,setUploadModes]=useState({live:false,demo:false});
 useEffect(()=>{void getEnrollmentDocumentUploadAvailability().then(setUploadModes)
  .catch(cause=>setError(cause instanceof Error?cause.message:"Unable to load document upload availability"));},[]);
 const [reviewFiles,setReviewFiles]=useState<Record<string,string>>({});
 async function update(applicationId:string,requirementId:string,complete:boolean){
  setBusy(requirementId);setError("");
  try{await setFamilyRequirement({data:{applicationId,requirementId,complete}});await router.invalidate();}
  catch(e){setError(normalizeClientError(e,{fallback:"Requirement update failed."}).message);}
  finally{setBusy(null);}
 }
 async function addNote(applicationId:string,requirementId:string){
  setBusy(requirementId);setError("");
  try{await addRequirementReviewNote({data:{applicationId,requirementId,note:notes[requirementId]??""}});setNotes(previous=>({...previous,[requirementId]:""}));await router.invalidate();}
  catch(e){setError(normalizeClientError(e,{fallback:"Review note failed."}).message);}
  finally{setBusy(null);}
 }
 async function review(applicationId:string,requirementId:string,status:"requested"|"received"|"accepted"|"rejected"){
  setBusy(requirementId);setError("");
  try{await reviewRequirementDocument({data:{applicationId,requirementId,status,reason:notes[requirementId]??"",documentId:reviewFiles[requirementId]||undefined}});await router.invalidate();}
  catch(e){setError(normalizeClientError(e,{fallback:"Document review failed."}).message);}
  finally{setBusy(null);}
 }
 async function openDocument(applicationId:string,requirementId:string,documentId:string){
  setBusy(requirementId);setError("");
  try{
   const result=await getEnrollmentDocumentDownload({data:{applicationId,requirementId,documentId}});
   window.open(result.downloadUrl,"_blank","noopener,noreferrer");
  }catch(e){setError(normalizeClientError(e,{fallback:"Unable to open document."}).message);}
  finally{setBusy(null);}
 }
 async function upload(applicationId:string,requirementId:string){
  const file=files[requirementId];if(!file)return;
  const controller=new AbortController();uploadAbort.current=controller;
  setBusy(requirementId);setError("");
  try{
   validateUploadFile(file,file.type);
   const request={applicationId,requirementId,fileName:file.name,mimeType:file.type,size:file.size};
   let completion=pendingUploads.current.get(requirementId);
   if(!completion){completion=new PrivateUploadCompletion<PrivateUpload>();pendingUploads.current.set(requirementId,completion);}
   await completion.run(file,
    ()=>beginEnrollmentDocumentUpload({data:request}),
    upload=>finishEnrollmentDocumentUpload({data:{...request,key:upload.objectKey}}),
    controller.signal);
   pendingUploads.current.delete(requirementId);
   setFiles(previous=>({...previous,[requirementId]:null}));await router.invalidate();
  }catch(e){setError(normalizeClientError(e,{fallback:"Document upload failed."}).message);}
  finally{if(uploadAbort.current===controller)uploadAbort.current=null;setBusy(null);}
 }
 return <div>
  {error&&<p role="alert" className="mt-3 rounded-xl border border-red-400 p-3 text-sm">{error}</p>}
    {!((a.demoTenant?uploadModes.demo:uploadModes.live))&&<p className="mt-3 text-xs text-muted-foreground">Document uploads are not enabled for this application. Existing verified documents may still be reviewed.</p>}
    <div className="mt-3 space-y-3">{a.requirements.map(r=>{
     if(r.form)return <article key={r.id} className="space-y-3 rounded-lg border p-3">
      <h3 className="font-semibold">{r.title}{r.blocking?" · Required":""}</h3>
      <RegistrarEnrollmentFormReview key={r.form.submission?.id??r.form.revision} applicationId={a.id} requirementId={r.id}
       record={r.form} closed={["active","complete","cancelled"].includes(a.journeyStatus??"")}
       onChanged={async()=>{await router.invalidate();}}/>
     </article>;
     const latestDocumentReview=[...r.evidence].reverse().find(e=>e.kind==="document_review");
     const documentReviewPending=Boolean(latestDocumentReview&&latestDocumentReview.status!=="accepted");
     return <div key={r.id} className="rounded-lg border p-3"><label className="flex items-center gap-3 text-sm">
      <input type="checkbox" checked={r.status==="complete"} disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")||
       (r.status!=="complete"&&documentReviewPending)} onChange={e=>update(a.id,r.id,e.target.checked)}/>
      <span>{r.title}{r.blocking?" · Required":""}</span>
      <span className="text-xs text-muted-foreground">({r.status.replaceAll("_"," ")})</span>
    </label>{r.status!=="complete"&&documentReviewPending&&<p className="mt-1 text-xs">Accept the current document using document review; the checklist cannot bypass review.</p>}<div className="mt-2 space-y-1">{r.evidence.filter(e=>e.kind==="registrar_note"&&typeof e.text==="string").map((e,i)=><p key={i} className="text-xs text-muted-foreground">Review note: {String(e.text)}</p>)}</div><div className="mt-2 space-y-1">{r.evidence.filter(e=>e.kind==="document_review").map((e,i)=><p key={i} className="text-xs text-muted-foreground">Document review: {e.status}{e.text?" · "+e.text:""}{e.reviewedAt?" · "+new Date(e.reviewedAt).toLocaleDateString():""}</p>)}</div>
    {<div className="mt-2 flex items-center gap-2"><label className="text-xs" htmlFor={"document-"+r.id}>Document being reviewed</label><select id={"document-"+r.id} className="min-w-0 flex-1 rounded border bg-background p-1 text-xs" value={reviewFiles[r.id]??""} onChange={e=>setReviewFiles(previous=>({...previous,[r.id]:e.target.value}))}><option value="">No document selected</option>{r.documents.filter(d=>d.isCurrent).map(d=><option key={d.id} value={d.id}>{d.fileName} · {d.reviewStatus}</option>)}</select></div>}
    {<div className="mt-2 flex flex-wrap gap-2">{(["requested","received","accepted","rejected"] as const).map(status=><button key={status} type="button" className="rounded border px-2 py-1 text-xs capitalize disabled:opacity-50" disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")||(status==="accepted"&&!reviewFiles[r.id])} onClick={()=>review(a.id,r.id,status)}>{status}</button>)}</div>}
    {<div className="mt-2 space-y-2">{r.documents.map(d=><div key={d.id} className="flex items-center justify-between gap-3 rounded border p-2 text-xs"><span className="truncate">{d.fileName} · v{d.version} · {new Date(d.uploadedAt).toLocaleDateString()} · {d.isCurrent?"Current":"Superseded"} · {d.reviewStatus}</span><button type="button" disabled={busy!==null||!d.canDownload} className="shrink-0 font-semibold underline disabled:opacity-50" onClick={()=>openDocument(a.id,r.id,d.id)}>{d.canDownload?"View private file":"Storage not verified"}</button></div>)}{!r.documents.length&&<p className="text-xs text-muted-foreground">No R2 document registered for this requirement.</p>}</div>}
    {(a.demoTenant?uploadModes.demo:uploadModes.live)&&<div className="mt-2 flex flex-wrap items-center gap-2"><input aria-label={"Select enrollment document for "+r.title} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="max-w-full text-xs" disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")} onChange={e=>setFiles(previous=>({...previous,[r.id]:e.target.files?.[0]??null}))}/><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null||!files[r.id]} onClick={()=>upload(a.id,r.id)}>Upload to private R2</button></div>}
    {(a.demoTenant?uploadModes.demo:uploadModes.live)&&<p className="mt-1 text-xs text-muted-foreground">Restricted private R2 document workflow. PDF, JPG or PNG, maximum 10 MB. Uploaded files require registrar review.</p>}
    <p className="mt-2 text-xs">Document request and rejection reasons are visible to the family. Save note records an internal registrar note only.</p>
    <div className="mt-2 flex gap-2"><input aria-label={"Review note or family-visible document instructions for "+r.title} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm" value={notes[r.id]??""} maxLength={500} placeholder="Internal note or family-visible document instructions" onChange={e=>setNotes(previous=>({...previous,[r.id]:e.target.value}))}/><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null||(notes[r.id]??"").trim().length<5} onClick={()=>addNote(a.id,r.id)}>Save note</button></div></div>;
    })}</div>
    {!a.requirements.length&&<p className="mt-2 text-sm text-muted-foreground">No requirements configured for this application.</p>}
 </div>;
}
