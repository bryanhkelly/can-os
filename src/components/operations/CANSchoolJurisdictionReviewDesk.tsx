import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {EvidenceDocumentSummary,EvidenceUploadSection} from "@/components/evidence";
import {
  listCANSchoolJurisdictionReviewQueue,
  getSchoolJurisdictionReview,
  reviewSchoolJurisdictionLegally,
  reviewSchoolLegalRequirementEvidence,
  getSchoolJurisdictionEvidenceForCAN,
  getSchoolJurisdictionEvidenceDownloadForCAN,
  getSchoolJurisdictionRequirementActions,
  beginSchoolJurisdictionDocumentUploadFn,finishSchoolJurisdictionDocumentUploadFn,
  submitSchoolLegalRequirementEvidence,
} from "@/modules/programs/school-jurisdiction-review.functions";

type Queue=Awaited<ReturnType<typeof listCANSchoolJurisdictionReviewQueue>>;
type Item=Queue["items"][number];
type Review=Awaited<ReturnType<typeof getSchoolJurisdictionReview>>;
type Evidence=Awaited<ReturnType<typeof getSchoolJurisdictionEvidenceForCAN>>;
type Worklist=Awaited<ReturnType<typeof getSchoolJurisdictionRequirementActions>>;
type LegalEvidenceUpload={
  actionId:string;expiresAt:string;fileName:string;
  mimeType:"application/pdf"|"image/jpeg"|"image/png";size:number;
};

/**
 * CAN-only reviewer component for Integration I to embed in the established
 * jurisdiction operations workspace. Does not replace Site/Program launch.
 * Independent reviewers must inspect actual canonical Documents separately.
 */
export function CANSchoolJurisdictionReviewDesk(){
  const [items,setItems]=useState<Item[]>([]);
  const [truncated,setTruncated]=useState(false);
  const [selected,setSelected]=useState<Item|null>(null);
  const [review,setReview]=useState<Review|null>(null);
  const [evidence,setEvidence]=useState<Evidence|null>(null);
  const [work,setWork]=useState<Worklist|null>(null);
  const [documentId,setDocumentId]=useState("");
  const [evidenceStatement,setEvidenceStatement]=useState("");
  const [sourceUrls,setSourceUrls]=useState<string[]>([]);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function reload(){
    const queue=await listCANSchoolJurisdictionReviewQueue();
    setItems(queue.items);setTruncated(queue.truncated);
  }
  useEffect(()=>{
    let active=true;
    void listCANSchoolJurisdictionReviewQueue().then(queue=>{
      if(active){setItems(queue.items);setTruncated(queue.truncated);}
    }).catch(()=>{
      if(active)setError("CAN jurisdiction work queue could not be loaded for this grant.");
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!selected){setReview(null);setEvidence(null);setWork(null);setSourceUrls([]);return;}
    let active=true;
    if(selected.type==="school_jurisdiction_legal_review"){
      setEvidence(null);setWork(null);
      void getSchoolJurisdictionReview({data:{programId:selected.programId}})
        .then(result=>{if(active){setReview(result);setSourceUrls([]);}})
        .catch(()=>{if(active)setError("Current school policy could not be read; no decision recorded.");});
    }else{
      setReview(null);setSourceUrls([]);
      void Promise.all([
        getSchoolJurisdictionEvidenceForCAN({data:{actionId:selected.id}}),
        getSchoolJurisdictionRequirementActions({data:{programId:selected.programId}}),
      ]).then(([result,worklist])=>{
        if(active){setEvidence(result);setWork(worklist);}
      }).catch(()=>{if(active)setError("Current scoped Program document or worklist could not be loaded; no approval recorded.");});
    }
    return ()=>{active=false;};
  },[selected]);

  async function decide(decision:"verify"|"request_changes"){
    if(!selected||submitting||note.trim().length<25)return;
    setSubmitting(true);setError("");setMessage("");
    try{
      if(selected.type==="school_jurisdiction_legal_review"){
        if(!review)throw new Error("Refresh current school policy before recording a review.");
        await reviewSchoolJurisdictionLegally({data:{
          programId:selected.programId,
          expectedScopeFingerprint:review.scopeFingerprint,
          expectedSiteRevision:review.siteAddressRevision,
          decision,note,sourceUrls,
        }});
      }else{
        await reviewSchoolLegalRequirementEvidence({data:{
          actionId:selected.id,decision,note,
        }});
      }
      setMessage(decision==="verify"
        ?"Independent decision recorded. Site opening, family admissions and funding approvals remain separate."
        :"Correction request recorded in the canonical school Action.");
      setSelected(null);setNote("");setReview(null);setEvidence(null);setWork(null);setSourceUrls([]);
      await reload();
    }catch(e){
      setError(e instanceof Error?e.message:
        "Independent review could not be recorded. Reload the current Site and evidence.");
    }finally{setSubmitting(false);}
  }

  async function submitCANRequirementEvidence(){
    if(!selected||!documentId||evidenceStatement.trim().length<10||submitting)return;
    setSubmitting(true);setError("");setMessage("");
    try{
      await submitSchoolLegalRequirementEvidence({data:{
        actionId:selected.id,documentId,statement:evidenceStatement,
      }});
      const [current,updated]=await Promise.all([
        getSchoolJurisdictionEvidenceForCAN({data:{actionId:selected.id}}),
        getSchoolJurisdictionRequirementActions({data:{programId:selected.programId}}),
      ]);
      setEvidence(current);setWork(updated);
      setMessage("CAN-owned documentary submission recorded. A different authorized CAN reviewer must independently approve it.");
      setDocumentId("");setEvidenceStatement("");
      await reload();
    }catch{
      setError("CAN-owned documentary evidence could not be submitted. Verify the Program, current Action, and file scope.");
    }finally{setSubmitting(false);}
  }
  return <section className="rounded-xl border bg-card p-4" aria-labelledby="can-school-jurisdiction-desk">
    <h2 id="can-school-jurisdiction-desk" className="font-semibold">School-specific CAN jurisdiction reviews</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      Review canonical church Site, Program, government policy sources and existing evidence.
      This workspace cannot approve school opening, public claims, government funding or accreditation.
    </p>
    {loading&&<p role="status">Loading authorized reviews…</p>}
    {!loading&&<div className="mt-3 space-y-2">
      {items.length===0&&<p className="text-sm">No pending school jurisdiction reviews in this CAN institutional scope.</p>}
      {items.map(item=><Button key={item.id} type="button" variant="outline"
        onClick={()=>{setSelected(item);setNote("");setMessage("");setError("");}}
        className="h-auto w-full justify-start whitespace-normal text-left">
        {item.siteName} · {item.programName} · {item.type==="school_jurisdiction_requirement"?"Requirement evidence":"Legal scope"} · {item.status.replaceAll("_"," ")}
      </Button>)}
      {truncated&&<p className="text-xs text-muted-foreground">More review Actions exist; filter the canonical Actions workspace.</p>}
    </div>}
    {selected&&<div className="mt-4 space-y-3 rounded-lg border p-4">
      <p className="font-medium">{selected.programName} — {selected.siteName}</p>
      <p className="text-xs text-muted-foreground">Action {selected.id} · {selected.reviewState.replaceAll("_"," ")}</p>
      {selected.type==="school_jurisdiction_legal_review"&&review&&<>
        <p className="text-sm">School policy revision: {review.revision??"not published"}.</p>
        {review.schoolReviewReason&&<p className="text-sm">{review.schoolReviewReason}</p>}
        {!review.policyReady&&<p role="alert" className="text-sm">Policy or applicability is not ready for independent verification. Request corrections.</p>}
        <div className="space-y-2">
          <p className="text-sm font-medium">Independently check current official source records</p>
          {review.reviewSources.map(source=><label key={source.url} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={sourceUrls.includes(source.url)}
              onChange={event=>setSourceUrls(current=>event.target.checked?
                [...current,source.url]:current.filter(url=>url!==source.url))}/>
            <span><a className="underline" target="_blank" rel="noopener noreferrer"
              href={source.url}>{source.title}</a> · {source.authority} · checked {source.checkedAt.slice(0,10)}</span>
          </label>)}
        </div>
      </>}
      {selected.type==="school_jurisdiction_requirement"&&<>
        <p className="text-sm text-muted-foreground">
          Inspect the actual private Program document before deciding. The server independently checks the current evidence version and reviewer identity; a note alone cannot satisfy the obligation.
        </p>
        {evidence?.evidence&&<EvidenceDocumentSummary
          fileName={evidence.evidence.fileName} version={evidence.evidence.version}
          submittedAt={evidence.evidence.submittedAt}
          expiresAt={evidence.evidence.expiresAt}
          onGetDownloadUrl={async()=>{
            const link=await getSchoolJurisdictionEvidenceDownloadForCAN({data:{
              actionId:selected.id,documentId:evidence.evidence!.id,
            }});
            return link.downloadUrl;
          }}/>}
        {evidence&&!evidence.evidence&&<p role="alert" className="text-sm">No submitted, current, private legal evidence is available for this Action. Request corrections or have the responsible party submit documentation.</p>}
        {evidence&&!evidence.scopeCurrent&&<p role="alert" className="text-sm">This evidence cannot be approved for the current policy and school configuration until its legal scope is renewed.</p>}
        {evidence?.responsibleParty==="can"&&work&&
          work.items.some(item=>item.id===selected.id&&item.canSubmitEvidence)&&
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">CAN-owned requirement submission</p>
            <p className="text-xs text-muted-foreground">A CAN reviewer may submit documentation for a CAN-owned obligation, but the submitter cannot independently verify that same evidence.</p>
            <EvidenceUploadSection<LegalEvidenceUpload>
              heading="Upload restricted, source-scoped CAN requirement proof"
              adapter={{
                begin:async input=>beginSchoolJurisdictionDocumentUploadFn({data:input}),
                finish:async input=>finishSchoolJurisdictionDocumentUploadFn({data:input}),
              }}
              makeInput={(file,expiresAt)=>({
                actionId:selected.id,expiresAt,fileName:file.name,
                mimeType:file.type as LegalEvidenceUpload["mimeType"],size:file.size,
              })}
              onUploaded={async()=>setWork(await getSchoolJurisdictionRequirementActions({
                data:{programId:selected.programId},
              }))}
              submitLabel="Upload CAN evidence"/>
            <label className="block text-xs font-medium" htmlFor="can-doc-selected">Select your scoped evidence</label>
            <select id="can-doc-selected" value={documentId}
              onChange={event=>setDocumentId(event.target.value)}
              className="w-full rounded-md border bg-background p-2 text-sm">
              <option value="">Choose a current document</option>
              {work.evidenceDocuments.filter(document=>document.actionId===selected.id)
                .map(document=><option key={document.id} value={document.id}>
                  {document.fileName}
                </option>)}
            </select>
            <label className="block text-xs font-medium" htmlFor="can-doc-statement">Document submission statement</label>
            <textarea id="can-doc-statement" value={evidenceStatement}
              onChange={event=>setEvidenceStatement(event.target.value)} rows={3}
              className="w-full rounded-md border bg-background p-2 text-sm"/>
            <Button type="button" disabled={submitting||!documentId||evidenceStatement.trim().length<10}
              onClick={()=>void submitCANRequirementEvidence()}>
              Submit for a different CAN reviewer
            </Button>
          </div>}
      </>}
      <label className="block text-sm font-medium" htmlFor="can-jurisdiction-note">Independent decision rationale</label>
      <textarea id="can-jurisdiction-note" value={note} rows={4}
        onChange={event=>setNote(event.target.value)}
        className="w-full rounded-md border bg-background p-2 text-sm"
        placeholder="Record which current official requirements and evidence were verified, or why corrections are necessary."/>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={submitting||note.trim().length<25||
          (selected.type==="school_jurisdiction_legal_review"&&
            (!review?.policyReady||sourceUrls.length===0)) ||
          (selected.type==="school_jurisdiction_requirement"&&
            (!evidence?.canIndependentlyVerify||!evidence.evidence||
              evidence.evidence.reviewStatus==="rejected"))}
          onClick={()=>void decide("verify")}>Verify documented scope</Button>
        <Button type="button" variant="outline" disabled={submitting||note.trim().length<25}
          onClick={()=>void decide("request_changes")}>Request corrections</Button>
      </div>
    </div>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  </section>;
}
