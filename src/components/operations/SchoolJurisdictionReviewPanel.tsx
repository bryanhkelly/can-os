import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EvidenceUploadSection } from "@/components/evidence";
import {
  getSchoolJurisdictionReview,
  requestSchoolJurisdictionLegalReview,
  getSchoolJurisdictionRequirementActions,
  submitSchoolLegalRequirementEvidence,
  beginSchoolJurisdictionDocumentUploadFn,
  finishSchoolJurisdictionDocumentUploadFn,
} from "@/modules/programs/school-jurisdiction-review.functions";

type Review = Awaited<ReturnType<typeof getSchoolJurisdictionReview>>;
type Worklist=Awaited<ReturnType<typeof getSchoolJurisdictionRequirementActions>>;
type LegalEvidenceUpload={
  actionId:string;expiresAt:string;fileName:string;
  mimeType:"application/pdf"|"image/jpeg"|"image/png";size:number;
};

export function SchoolJurisdictionReviewPanel({programId}:{programId:string}) {
  const [review,setReview] = useState<Review | null>(null);
  const [work,setWork]=useState<Worklist|null>(null);
  const [selectedAction,setSelectedAction]=useState("");
  const [selectedDocument,setSelectedDocument]=useState("");
  const [evidenceStatement,setEvidenceStatement]=useState("");
  const [loading,setLoading] = useState(true);
  const [submitting,setSubmitting] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  useEffect(()=>{
    let current=true;
    setLoading(true);
    setError("");
    setReview(null);setWork(null);
    void Promise.all([
      getSchoolJurisdictionReview({data:{programId}}),
      getSchoolJurisdictionRequirementActions({data:{programId}}),
    ]).then(([result,actions])=>{
      if(current){setReview(result);setWork(actions);}
    }).catch(()=>{
      if(current)setError("State-specific legal review is not available for your current access or school. Ask the school registrar or CAN team to confirm this review.");
    }).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[programId]);
  async function requestReview(){
    if(submitting)return;
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response=await requestSchoolJurisdictionLegalReview({data:{programId}});
      setMessage(response.needed
        ?"CAN legal review request is recorded in the existing launch Actions workflow. This is not opening approval."
        :"Current school-specific review does not require a new request. School-opening authorization remains separate.");
      const [next,nextWork]=await Promise.all([
        getSchoolJurisdictionReview({data:{programId}}),
        getSchoolJurisdictionRequirementActions({data:{programId}}),
      ]);
      setReview(next);setWork(nextWork);
    }catch{
      setError("Could not record the review request. Confirm registrar access and retry; no legal approval was granted.");
    }finally{setSubmitting(false);}
  }
  async function submitEvidence(){
    if(submitting||!selectedAction||!selectedDocument||
      evidenceStatement.trim().length<10)return;
    setSubmitting(true);setError("");setMessage("");
    try{
      await submitSchoolLegalRequirementEvidence({data:{
        actionId:selectedAction,documentId:selectedDocument,
        statement:evidenceStatement,
      }});
      setWork(await getSchoolJurisdictionRequirementActions({data:{programId}}));
      setSelectedAction("");setSelectedDocument("");setEvidenceStatement("");
      setMessage("Existing Program evidence submitted for independent CAN review; this is not legal or opening approval.");
    }catch{
      setError("Evidence could not be submitted. Refresh the current requirement, verify your role and selected document, then retry.");
    }finally{setSubmitting(false);}
  }
  return <section className="mt-4 rounded-xl border bg-card p-4" aria-labelledby="school-jurisdiction-title">
    <h3 id="school-jurisdiction-title" className="font-semibold">State-specific legal review</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      CAN checks the actual school's state, program, delivery model, responsible entity and authoritative policy evidence.
      General state research above cannot replace this review.
    </p>
    {loading&&<p className="mt-3 text-sm" role="status">Loading your school's jurisdiction review…</p>}
    {!loading&&review&&<div className="mt-3 space-y-3 text-sm">
      <p className="font-medium">{review.reviewRequired?"CAN legal review is required":"This school's current jurisdiction scope has been independently reviewed"}</p>
      {review.schoolReviewReason&&<p role="status" className="rounded-lg border p-3 text-sm">{review.schoolReviewReason}</p>}
      {review.locationReviewReason&&<p className="text-xs text-muted-foreground">Please correct the physical Site address in school configuration before requesting independent verification.</p>}
      <p className="text-xs text-muted-foreground">Profile revision: {review.revision??"not published"}. This is a scoped evaluation, not authorization to open or enroll.</p>
      {review.readiness.status==="verified_policy"&&<>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">School-specific legal requirements ({review.readiness.requirements.length})</summary>
          <ul className="mt-2 space-y-3">{review.readiness.requirements.map(item=><li key={item.id}>
            <p className="font-medium">{item.title} · {item.applicability.replaceAll("_"," ")}</p>
            <p className="text-muted-foreground">{item.nextAction}</p>
            <p className="text-xs text-muted-foreground">Owner: {item.responsibleParty} · {item.phase.replaceAll("_"," ")}</p>
            {item.filingDeadline&&<p className="text-xs">Verified filing date: {item.filingDeadline}</p>}
            {item.sources.map(source=><a key={source.url} className="block underline" href={source.url}
              target="_blank" rel="noopener noreferrer">{source.title} · checked {source.checkedAt.slice(0,10)}</a>)}
          </li>)}</ul>
        </details>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">Sourced funding research ({review.readiness.fundingOpportunities.length})</summary>
          <p className="mt-2 text-xs text-muted-foreground">These are researched opportunities, not confirmed school eligibility, provider participation, government approval or revenue.</p>
          <ul className="mt-2 space-y-3">{review.readiness.fundingOpportunities.map(item=><li key={item.id}>
            <p className="font-medium">{item.name}</p><p>{item.summary}</p>
            <p className="text-xs text-muted-foreground">{item.nextAction}</p>
            {item.applicationDeadline&&<p className="text-xs">Verified application date: {item.applicationDeadline}</p>}
            {item.sources.map(source=><a key={source.url} href={source.url} className="block underline"
              target="_blank" rel="noopener noreferrer">{source.title}</a>)}
          </li>)}</ul>
        </details>
      </>}
      {work&&work.items.length>0&&<details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">Assigned legal requirement Actions ({work.items.length})</summary>
        <p className="mt-2 text-xs text-muted-foreground">These Actions track obligations and independently reviewed evidence. Completing an Action does not authorize opening, enrollment or government funding.</p>
        <ul className="mt-2 space-y-3">{work.items.map(item=><li key={item.id} className="rounded border p-3">
          <p className="font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.responsibleParty.toUpperCase()} responsibility · {item.phase?.replaceAll("_"," ")??"review phase pending"} · {item.effectiveStatus.replaceAll("_"," ")}</p>
          <p className="text-xs">{item.reviewState.replaceAll("_"," ")}</p>
          {item.responsibleParty==="family"&&<p className="text-xs text-muted-foreground">
            Family-provided proof must follow the separately authorized family intake process. A Site registrar cannot approve this requirement on a family's behalf.
          </p>}
          {item.canSubmitEvidence&&<Button type="button" variant="outline" className="mt-2"
            onClick={()=>{setSelectedAction(item.id);setSelectedDocument("");setEvidenceStatement("");}}>
            Submit existing Program evidence
          </Button>}
        </li>)}</ul>
        {selectedAction&&<div className="mt-3 space-y-2 rounded-lg border p-3">
          <EvidenceUploadSection<LegalEvidenceUpload>
            heading="Upload an actual legal filing or requirement document to private Program storage"
            adapter={{
              begin:async input=>beginSchoolJurisdictionDocumentUploadFn({data:input}),
              finish:async input=>finishSchoolJurisdictionDocumentUploadFn({data:input}),
            }}
            makeInput={(file,expiresAt)=>({
              actionId:selectedAction,expiresAt,fileName:file.name,
              mimeType:file.type as LegalEvidenceUpload["mimeType"],size:file.size,
            })}
            onUploaded={async()=>{
              setWork(await getSchoolJurisdictionRequirementActions({data:{programId}}));
              setMessage("Document uploaded to private Program storage. Select it below and submit the legal requirement for independent CAN review.");
            }}
            submitLabel="Upload legal evidence"
          />
          <label className="block text-sm font-medium" htmlFor="legal-doc-selection">Select previously uploaded, verified-storage Program evidence</label>
          <select id="legal-doc-selection" value={selectedDocument}
            onChange={event=>setSelectedDocument(event.target.value)}
            className="w-full rounded-md border bg-background p-2">
            <option value="">Choose a document</option>
            {work.evidenceDocuments.filter(document=>document.actionId===selectedAction)
              .map(document=><option key={document.id} value={document.id}>
              {document.fileName}
            </option>)}
          </select>
          {!work.evidenceDocuments.some(document=>document.actionId===selectedAction)&&
            <p className="text-xs text-muted-foreground">No eligible documents are available. Upload the correctly scoped file above, then select it for independent CAN review.</p>}
          <label className="block text-sm font-medium" htmlFor="legal-evidence-statement">Evidence statement</label>
          <textarea id="legal-evidence-statement" rows={3} value={evidenceStatement}
            onChange={event=>setEvidenceStatement(event.target.value)}
            className="w-full rounded-md border bg-background p-2" placeholder="Explain how this document addresses the particular required filing or obligation."/>
          <Button type="button" disabled={submitting||!selectedDocument||evidenceStatement.trim().length<10}
            onClick={()=>void submitEvidence()}>
            {submitting?"Submitting…":"Submit for independent review"}
          </Button>
          <Button type="button" variant="ghost" onClick={()=>setSelectedAction("")}>Cancel</Button>
        </div>}
      </details>}
      {review.decisions.length>0&&<details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">Requirement evaluation ({review.decisions.length})</summary>
        <ul className="mt-2 space-y-2">{review.decisions.map(item=><li key={item.id}>
          <span className="font-medium">{item.status.replaceAll("_"," ")}</span>
          <span className="text-muted-foreground"> · {item.reason}</span>
        </li>)}</ul>
      </details>}
      {review.reviewRequired&&<Button type="button" disabled={submitting} onClick={requestReview}>
        {submitting?"Requesting review…":"Request CAN legal review"}
      </Button>}
    </div>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  </section>;
}
