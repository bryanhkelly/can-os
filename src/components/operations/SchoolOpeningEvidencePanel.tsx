import { EvidenceReviewForm } from "@/components/evidence/EvidenceReviewForm";
import { useCallback, useEffect, useRef, useState } from "react";
import { QueryState, StatusBadge } from "@/components/workspace";
import { getChurchSchoolOpeningFn } from "@/modules/operations/school-opening.functions";
import {
  beginSchoolOpeningEvidenceUploadFn, finishSchoolOpeningEvidenceUploadFn,
  getSchoolOpeningEvidenceDownloadFn, reviewSchoolOpeningEvidenceFn,
} from "@/modules/operations/school-opening-evidence.functions";
import type { SchoolOpeningEvidenceCategory } from "@/domain/school-opening-evidence";

type Model=Awaited<ReturnType<typeof getChurchSchoolOpeningFn>>;
type Item=Model["evidenceItems"][number];
type UploadInput={
  programId:string;configurationId:string;expectedVersion:number;category:SchoolOpeningEvidenceCategory;
  expiresAt:string;fileName:string;mimeType:"application/pdf"|"image/jpeg"|"image/png";size:number;
};

/** Role-appropriate church submission and independent CAN review over canonical Documents. */
export function SchoolOpeningEvidencePanel({programId}:{programId:string}) {
  return <SchoolOpeningEvidenceWorkspace key={programId} programId={programId}/>;
}

function SchoolOpeningEvidenceWorkspace({programId}:{programId:string}) {
  const [model,setModel]=useState<Model|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const sequence=useRef(0);
  const load=useCallback(async()=>{
    const request=++sequence.current;setLoading(true);setError("");
    try{
      const result=await getChurchSchoolOpeningFn({data:{programId}});
      if(request===sequence.current)setModel(result);
    }catch(cause){
      if(request===sequence.current){setModel(null);setError(cause instanceof Error?cause.message:"Unable to load opening evidence");}
    }finally{if(request===sequence.current)setLoading(false);}
  },[programId]);
  useEffect(()=>{void load();return()=>{sequence.current++};},[load]);
  async function changed(message:string){setNotice(message);await load();}
  return <section className="mt-7 rounded-xl border bg-card p-5" aria-label="School opening evidence">
    <h2 className="font-serif text-2xl">Evidence for school opening</h2>
    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
      The church submits each required document. A different CAN officer independently reviews it,
      and a further officer approves the exact school configuration. A correction adds a version;
      it never erases earlier evidence or its review history.
    </p>
    {model&&<p className="mt-3 text-sm">Configuration v{model.version} · <strong>{model.status}</strong></p>}
    {notice&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">{notice}</p>}
    <QueryState loading={loading?"Loading current evidence and version history…":undefined}
      error={error||undefined} onRetry={()=>void load()} retrying={loading}>
      {model&&<div className="mt-4 space-y-4">{model.evidenceItems.map(item=>
        <EvidenceCategoryCard key={item.category} item={item} model={model} changed={changed}/>)}</div>}
    </QueryState>
  </section>;
}

function EvidenceCategoryCard({item,model,changed}:{item:Item;model:Model;
  changed:(message:string)=>Promise<void>}) {
  const [file,setFile]=useState<File|null>(null);
  const [expiry,setExpiry]=useState("");
  const [pending,setPending]=useState<{key:string;input:UploadInput}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const tone=item.status==="approved"?"success":item.status==="pending"?"attention":"danger";
  async function upload() {
    if(busy)return;setBusy(true);setError("");
    try{
      let attempt=pending;
      if(!attempt){
        if(!file||!expiry)throw new Error("Choose a document and its actual expiry date");
        const input:UploadInput={programId:model.programId,configurationId:model.configurationId,
          expectedVersion:model.version,category:item.category,expiresAt:new Date(expiry+"T23:59:59.999Z").toISOString(),
          fileName:file.name,mimeType:file.type as UploadInput["mimeType"],size:file.size};
        const begun=await beginSchoolOpeningEvidenceUploadFn({data:input});
        const response=await fetch(begun.uploadUrl,{method:"PUT",headers:begun.uploadHeaders,body:file});
        if(!response.ok)throw new Error("Private upload failed; the evidence was not recorded");
        attempt={key:begun.key,input};setPending(attempt);
      }
      await finishSchoolOpeningEvidenceUploadFn({data:{...attempt.input,key:attempt.key}});
      setPending(null);setFile(null);setExpiry("");
      await changed(`Version ${item.versions.length+1} submitted for independent CAN review.`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Evidence upload was not recorded");}
    finally{setBusy(false);}
  }
  async function review(decision:"approve"|"reject", reason:string) {
    if(!item.current||busy)return;setBusy(true);setError("");
    try{
      await reviewSchoolOpeningEvidenceFn({data:{programId:model.programId,documentId:item.current.id,
        expectedVersion:item.current.version,decision,reason}});
      await changed(decision==="approve"?"Independent evidence verification recorded.":
        "Evidence rejected with correction instructions for the church.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Evidence review was not recorded");}
    finally{setBusy(false);}
  }
  async function download(documentId:string) {
    setError("");
    try{
      const result=await getSchoolOpeningEvidenceDownloadFn({data:{programId:model.programId,documentId}});
      window.open(result.downloadUrl,"_blank","noopener,noreferrer");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to open private evidence");}
  }
  return <article className="rounded-lg border p-4 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">{item.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Responsible: {item.responsibleOwner}</p></div>
      <StatusBadge tone={tone}>{item.status}</StatusBadge>
    </div>
    <p className="mt-3 text-sm">{item.nextAction}</p>
    {item.rejectionReason&&<p role="alert" className="mt-2 rounded border border-danger p-2 text-xs">
      Rejection reason: {item.rejectionReason}</p>}
    {item.current&&<div className="mt-3 rounded border p-3 text-xs">
      <p><strong>Current v{item.current.version}:</strong> {item.current.fileName}</p>
      <p className="mt-1">Submitted {new Date(item.current.submittedAt).toLocaleString()} ·
        {" "}expires {item.current.expiresAt?new Date(item.current.expiresAt).toLocaleDateString():"not recorded"}</p>
      <button type="button" className="mt-2 underline" onClick={()=>void download(item.current!.id)}>Open private document</button>
    </div>}
    {model.canReview&&item.current&&item.status==="pending"&&<EvidenceReviewForm disabled={busy}
      label="Independent review reason" approveLabel="Verify this version"
      onReview={review}/>}
    {model.canSubmit&&<div className="mt-3 rounded border p-3">
      <p className="text-xs font-medium">{item.current?"Submit a corrected or renewed version":"Submit required evidence"}</p>
      {!model.uploadsEnabled&&<p className="mt-2 text-xs" role="status">Private school-opening uploads are disabled in this deployment. Contact the deployment administrator; no approval can be inferred here.</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs">PDF, JPEG or PNG
          <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy||!model.uploadsEnabled}
            className="mt-1 block w-full text-xs" onChange={event=>{setFile(event.target.files?.[0]??null);setPending(null);}}/>
        </label>
        <label className="text-xs">Evidence expires on
          <input type="date" value={expiry} disabled={busy||!model.uploadsEnabled}
            className="mt-1 block w-full rounded border bg-background p-2"
            onChange={event=>{setExpiry(event.target.value);setPending(null);}}/>
        </label>
      </div>
      <button type="button" disabled={busy||!model.uploadsEnabled||(!pending&&(!file||!expiry))}
        onClick={()=>void upload()} className="mt-2 rounded border px-3 py-2 text-xs disabled:opacity-50">
        {pending?"Retry recording the uploaded file":"Upload a new version for review"}
      </button>
      {pending&&<p className="mt-2 text-xs">The private file was uploaded. Retry recording it without uploading or replacing the bytes.</p>}
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    {item.versions.length>0&&<details className="mt-3 text-xs">
      <summary>Version history ({item.versions.length})</summary>
      <ul className="mt-2 space-y-2">{item.versions.map(version=><li key={version.id} className="border-l pl-3">
        v{version.version} · {version.fileName} · {version.status}{version.isCurrent?" · current":" · superseded"}
        {version.reviewReason&&<span> · Review: {version.reviewReason}</span>}
      </li>)}</ul>
    </details>}
  </article>;
}
