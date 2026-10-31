import {useEffect,useRef,useState} from "react";
import {beginEnrollmentDocumentUpload,finishEnrollmentDocumentUpload,getEnrollmentDocumentDownload,getEnrollmentDocumentUploadAvailability} from "@/modules/enrollment/r2-document-upload.functions";
import {createFileRoute,useRouter,Link} from "@tanstack/react-router";
import {getFamilyReadiness,setFamilyRequirement,addRequirementReviewNote,reviewRequirementDocument} from "@/modules/enrollment/family-readiness.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {RegistrarEnrollmentFormReview} from "@/components/enrollment/EnrollmentForm";
import {FamilyReadinessOverviewCard} from "@/components/admissions/FamilyReadinessOverviewCard";
import {familyRequirementKey,isEnrollmentDocumentCandidate} from "@/components/admissions/family-document-state";
const loadFamilyReadiness=(selection:{siteId?:string;programId?:string;page?:number;applicationId?:string}={})=>getFamilyReadiness({data:selection});
export const Route=createFileRoute("/admissions/families")({
 validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;application?:string;page?:number}=>({
  page:typeof search.page==="number"&&Number.isSafeInteger(search.page)&&search.page>0?search.page:1,
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined,
  application:typeof search.application==="string"?search.application:undefined,
 }),
 loaderDeps:({search})=>({siteId:search.siteId,programId:search.programId,page:search.page,applicationId:search.application}),
 loader:({deps})=>safeLoader(()=>loadFamilyReadiness(deps),{
  authMessage:"Sign in with an authorized registrar account to view family enrollment readiness.",
 })(),
 component:Families
});
function Families(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Enrollment" title="Family enrollment readiness" outcome={outcome}/>;
 return <FamiliesView page={outcome.data}/>;
}
function FamiliesView({page}:{page:Awaited<ReturnType<typeof loadFamilyReadiness>>}){
 const apps=page.items;
 const router=useRouter();
 const selection=Route.useSearch();
 const visibleApps=apps.filter(app=>!selection.application||app.id===selection.application);
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(""),[notes,setNotes]=useState<Record<string,string>>({});
 const families=[...new Set(visibleApps.map(a=>a.householdId))];
 const [files,setFiles]=useState<Record<string,File|null>>({});
 const pendingUploads=useRef(new Map<string,{file:File;key:string}>());
 const [uploadModes,setUploadModes]=useState({live:false,demo:false});
 useEffect(()=>{void getEnrollmentDocumentUploadAvailability().then(setUploadModes)
  .catch(cause=>setError(cause instanceof Error?cause.message:"Unable to load document upload availability"));},[]);
 const [reviewFiles,setReviewFiles]=useState<Record<string,string>>({});
 async function update(applicationId:string,requirementId:string,complete:boolean){
  setBusy(requirementId);setError("");
  try{await setFamilyRequirement({data:{applicationId,requirementId,complete}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Requirement update failed");}
  finally{setBusy(null);}
 }
 async function addNote(applicationId:string,requirementId:string){
  setBusy(requirementId);setError("");
  try{await addRequirementReviewNote({data:{applicationId,requirementId,note:notes[familyRequirementKey(applicationId,requirementId)]??""}});setNotes(previous=>({...previous,[familyRequirementKey(applicationId,requirementId)]:""}));await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Review note failed");}
  finally{setBusy(null);}
 }
 async function review(applicationId:string,requirementId:string,status:"requested"|"received"|"accepted"|"rejected"){
  setBusy(requirementId);setError("");
  try{await reviewRequirementDocument({data:{applicationId,requirementId,status,reason:notes[familyRequirementKey(applicationId,requirementId)]??"",documentId:reviewFiles[familyRequirementKey(applicationId,requirementId)]||undefined}});await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Document review failed");}
  finally{setBusy(null);}
 }
 async function openDocument(applicationId:string,requirementId:string,documentId:string){
  setBusy(requirementId);setError("");
  try{
   const result=await getEnrollmentDocumentDownload({data:{applicationId,requirementId,documentId}});
   window.open(result.downloadUrl,"_blank","noopener,noreferrer");
  }catch(e){setError(e instanceof Error?e.message:"Unable to open document");}
  finally{setBusy(null);}
 }
 async function upload(applicationId:string,requirementId:string){
  const file=files[familyRequirementKey(applicationId,requirementId)];if(!file)return;
  if(!isEnrollmentDocumentCandidate(file)){
   setError("Choose a nonempty PDF, PNG, or JPEG document of at most 10 MB.");return;
  }
  setBusy(requirementId);setError("");
  try{
   const request={applicationId,requirementId,fileName:file.name,mimeType:file.type,size:file.size};
   const uploadIdentity=familyRequirementKey(applicationId,requirementId);
   const previous=pendingUploads.current.get(uploadIdentity);
   let key=previous?.file===file?previous.key:undefined;
   if(!key){
    const upload=await beginEnrollmentDocumentUpload({data:request});
    const response=await fetch(upload.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file});
    if(!response.ok)throw new Error("Cloudflare R2 upload failed ("+response.status+")");
    key=upload.key;pendingUploads.current.set(uploadIdentity,{file,key});
   }
   await finishEnrollmentDocumentUpload({data:{...request,key}});
   pendingUploads.current.delete(uploadIdentity);
   setFiles(previous=>({...previous,[uploadIdentity]:null}));await router.invalidate();
  }catch(e){setError(e instanceof Error?e.message:"Document upload failed");}
  finally{setBusy(null);}
 }
 return <main className="mx-auto max-w-5xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Enrollment</p>
  <h1 className="mt-2 font-serif text-4xl">Family enrollment readiness</h1>
  <p className="mt-3 text-sm text-muted-foreground">Review each household journey and its supporting private documents. Uploads are available only where the deployment has enabled the relevant R2 workflow.</p>
  {selection.application&&<Link to="/admissions/families" search={{siteId:selection.siteId,programId:selection.programId}} className="mt-4 inline-block text-sm underline">View all household readiness</Link>}
  {selection.application&&!visibleApps.length&&<p role="alert" className="mt-4 rounded-xl border p-4">This application is unavailable in the current family readiness view.</p>}
  {error&&<p role="alert" className="mt-4 rounded-xl border border-red-400 p-3">{error}</p>}
  <div className="mt-6 rounded-xl border p-5"><p className="text-sm">Households represented</p><p className="font-serif text-3xl">{families.length}</p></div>
  <div className="mt-6 space-y-4">{families.map((id,i)=><section key={id} className="rounded-xl border p-5">
   <h2 className="font-serif text-xl">Household {i+1}</h2>
   <div className="mt-3 space-y-3">{visibleApps.filter(a=>a.householdId===id).map(a=><article key={a.id} className="rounded-lg border p-3">
    <FamilyReadinessOverviewCard application={a}/>
    <Link to="/admissions" search={{siteId:selection.siteId,programId:selection.programId,application:a.id}} className="mt-2 inline-block text-xs font-semibold underline">Review offers and enrollment →</Link>
    {a.activeSchoolYears.length>0&&<p className="mt-2 text-xs text-muted-foreground">The admissions checklist is now a historical record. Active enrollment requirements are managed separately.</p>}
    {!((a.isFixture?uploadModes.demo:uploadModes.live))&&<p className="mt-3 text-xs text-muted-foreground">Document uploads are not enabled for this application. Existing verified documents may still be reviewed.</p>}
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
    {<div className="mt-2 flex items-center gap-2"><label className="text-xs" htmlFor={"document-"+r.id}>Document being reviewed</label><select id={"document-"+r.id} className="min-w-0 flex-1 rounded border bg-background p-1 text-xs" value={reviewFiles[familyRequirementKey(a.id,r.id)]??""} onChange={e=>setReviewFiles(previous=>({...previous,[familyRequirementKey(a.id,r.id)]:e.target.value}))}><option value="">No document selected</option>{r.documents.filter(d=>d.isCurrent).map(d=><option key={d.id} value={d.id}>{d.fileName} · {d.reviewStatus}</option>)}</select></div>}
    {<div className="mt-2 flex flex-wrap gap-2">{(["requested","received","accepted","rejected"] as const).map(status=><button key={status} type="button" className="rounded border px-2 py-1 text-xs capitalize disabled:opacity-50" disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")||(status==="accepted"&&!reviewFiles[familyRequirementKey(a.id,r.id)])} onClick={()=>review(a.id,r.id,status)}>{status}</button>)}</div>}
    {<div className="mt-2 space-y-2">{r.documents.map(d=><div key={d.id} className="flex items-center justify-between gap-3 rounded border p-2 text-xs"><span className="truncate">{d.fileName} · v{d.version} · {new Date(d.uploadedAt).toLocaleDateString()} · {d.isCurrent?"Current":"Superseded"} · {d.reviewStatus}</span><button type="button" disabled={busy!==null} className="shrink-0 font-semibold underline disabled:opacity-50" onClick={()=>openDocument(a.id,r.id,d.id)}>View private file</button></div>)}{!r.documents.length&&<p className="text-xs text-muted-foreground">No R2 document registered for this requirement.</p>}</div>}
    {(a.isFixture?uploadModes.demo:uploadModes.live)&&<div className="mt-2 flex flex-wrap items-center gap-2"><input aria-label={"Select enrollment document for "+r.title} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="max-w-full text-xs" disabled={busy!==null||["active","complete","cancelled"].includes(a.journeyStatus??"")} onChange={e=>setFiles(previous=>({...previous,[familyRequirementKey(a.id,r.id)]:e.target.files?.[0]??null}))}/><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null||!files[familyRequirementKey(a.id,r.id)]} onClick={()=>upload(a.id,r.id)}>Upload to private R2</button></div>}
    {(a.isFixture?uploadModes.demo:uploadModes.live)&&<p className="mt-1 text-xs text-muted-foreground">Restricted private R2 document workflow. PDF, JPG or PNG, maximum 10 MB. Uploaded files require registrar review.</p>}
    <p className="mt-2 text-xs">Document request and rejection reasons are visible to the family. Save note records an internal registrar note only.</p>
    <div className="mt-2 flex gap-2"><input aria-label={"Review note or family-visible document instructions for "+r.title} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm" value={notes[familyRequirementKey(a.id,r.id)]??""} maxLength={500} placeholder="Internal note or family-visible document instructions" onChange={e=>setNotes(previous=>({...previous,[familyRequirementKey(a.id,r.id)]:e.target.value}))}/><button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null||(notes[familyRequirementKey(a.id,r.id)]??"").trim().length<5} onClick={()=>addNote(a.id,r.id)}>Save note</button></div></div>;
    })}</div>
    {!a.requirements.length&&<p className="mt-2 text-sm text-muted-foreground">No requirements configured for this application.</p>}
   </article>)}</div>
  </section>)}
  <nav aria-label="Family readiness pages" className="mt-5 flex gap-4 text-sm">{!selection.application&& (selection.page??1)>1&&<Link to="/admissions/families" search={{...selection,page:(selection.page??1)-1}} className="underline">Previous families</Link>}{!selection.application&&page.hasMore&&<Link to="/admissions/families" search={{...selection,page:page.nextPage??(selection.page??1)+1}} className="underline">Next families</Link>}</nav>
  {!families.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No family enrollment cases found in your authorized programs.</p>}
  </div>
 </main>;
}
