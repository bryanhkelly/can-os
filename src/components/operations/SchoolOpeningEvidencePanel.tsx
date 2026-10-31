import { EvidenceUploadSection, EvidenceWorkflow, EvidenceHistory, EvidenceReviewForm, EvidenceDocumentSummary } from "@/components/evidence";
import { useCallback, useEffect, useRef, useState } from "react";
import { QueryState } from "@/components/workspace";
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
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function review(decision:"approve"|"reject", reason:string) {
    if(!item.current||busy)return;setBusy(true);setError("");
    try{
      await reviewSchoolOpeningEvidenceFn({data:{programId:model.programId,documentId:item.current.id,
        expectedVersion:item.current.version,decision,reason}});
      await changed(decision==="approve"?"Independent evidence verification recorded.":
        "Evidence rejected with correction instructions for the church.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Evidence review was not recorded");throw cause;}
    finally{setBusy(false);}
  }
  return <EvidenceWorkflow title={item.title} status={item.status} rejectionReason={item.rejectionReason}>
    <p className="mt-1 text-xs text-muted-foreground">Responsible: {item.responsibleOwner}</p>
    <p className="mt-3 text-sm">{item.nextAction}</p>
    {item.current&&<EvidenceDocumentSummary
      fileName={item.current.fileName} version={item.current.version}
      submittedAt={item.current.submittedAt} expiresAt={item.current.expiresAt}
      onGetDownloadUrl={async()=>{
        const result=await getSchoolOpeningEvidenceDownloadFn({data:{
          programId:model.programId,documentId:item.current!.id,
        }});
        return result.downloadUrl;
      }}/>}
    {model.canReview&&item.current&&item.status==="pending"&&<EvidenceReviewForm disabled={busy}
      label="Independent review reason" approveLabel="Verify this version"
      onReview={review}/>}
    {model.canSubmit&&<div>

      {!model.uploadsEnabled&&<p role="status" className="mt-2 text-xs">Private school-opening uploads are disabled in this deployment. Contact the deployment administrator; no approval can be inferred here.</p>}
      <EvidenceUploadSection<UploadInput> disabled={!model.uploadsEnabled}
        heading={item.current ? "Submit a corrected or renewed version" : "Submit required evidence"}
        adapter={{begin: async input => beginSchoolOpeningEvidenceUploadFn({data:input}),
          finish: async input => finishSchoolOpeningEvidenceUploadFn({data:input})}}
        makeInput={(file,expiresAt)=>({programId:model.programId,configurationId:model.configurationId,
          expectedVersion:model.version,category:item.category,expiresAt,fileName:file.name,
          mimeType:file.type as UploadInput["mimeType"],size:file.size})}
        onUploaded={()=>changed(`Version ${item.versions.length+1} submitted for independent CAN review.`)}
        submitLabel="Upload a new version for review"/>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    <EvidenceHistory versions={item.versions}/>
  </EvidenceWorkflow>;
}
