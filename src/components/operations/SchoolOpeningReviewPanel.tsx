import { PrerequisiteChecklist } from "@/components/workspace/prerequisite-checklist";
import { EvidenceDetails } from "@/components/evidence/EvidenceDetails";
import {useCallback,useEffect,useRef,useState} from "react";
import { QueryState } from "@/components/workspace";
import {
  decideChurchSchoolOpeningFn,getChurchSchoolOpeningFn,
} from "@/modules/operations/school-opening.functions";
type Model=Awaited<ReturnType<typeof getChurchSchoolOpeningFn>>;

/** CAN institutional decision; never visible as a church self-approval. */
export function SchoolOpeningReviewPanel({programId}:{programId:string}){
  return <SchoolOpeningReviewForm key={programId} programId={programId}/>;
}

function SchoolOpeningReviewForm({programId}:{programId:string}){
  const [opening,setOpening]=useState<Model|null>(null);
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");
  const [readError,setReadError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const requestSequence=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++requestSequence.current;
    setLoading(true);setOpening(null);setReason("");setReadError("");
    try{
      const current=await getChurchSchoolOpeningFn({data:{programId}});
      if(request===requestSequence.current)setOpening(current);
    }catch(cause){
      if(request===requestSequence.current)setReadError(
        cause instanceof Error?cause.message:"Unable to load the current opening review");
    }finally{
      if(request===requestSequence.current)setLoading(false);
    }
  },[programId]);
  useEffect(()=>{
    void refresh();
    return ()=>{requestSequence.current++};
  },[refresh]);
  function reload(){
    if(busy||loading)return;
    setError("");setNotice("");void refresh();
  }
  const decide=async(decision:"approve"|"suspend")=>{
    if(busy||loading||!opening)return;
    const reviewed=opening;
    setBusy(true);setError("");setNotice("");
    try{
      await decideChurchSchoolOpeningFn({data:{
        programId,configurationId:reviewed.configurationId,
        expectedVersion:reviewed.version,decision,reason,
      }});
      setNotice(decision==="approve"
        ?"Institutional opening approval recorded. Daily supervision remains a separate gate."
        :"Institutional opening suspended; new onsite attendance coverage cannot be verified.");
      // A refresh error is shown separately; it must not imply the decision failed.
      await refresh();
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Opening decision was not recorded");
    }finally{setBusy(false);}
  };
  return <section className="mt-4 rounded-lg border p-4 text-sm">
    <h3 className="font-semibold">Church school opening authorization</h3>
    <p className="mt-2 text-xs text-muted-foreground">
      An institutional reviewer must independently verify current legal, facility,
      safeguarding-reporting, emergency and custody/pickup evidence, in addition
      to the signed school services agreement and a named church Site director.
      This does not certify that adults are physically present today.
    </p>
    {error&&<p role="alert" className="mt-2">{error}</p>}
    {notice&&<p role="status" className="mt-2">{notice}</p>}
    {!readError&&<button type="button" onClick={reload} disabled={busy||loading}
      className="mt-3 underline disabled:opacity-50">Reload review</button>}
    <QueryState loading={loading?"Loading current opening review…":undefined}
      error={readError||undefined} onRetry={reload} retrying={busy||loading}>
    {opening&&<>
      <p className="mt-2">Configuration v{opening.version} · {opening.status}
        {" · "}{opening.prerequisites.every(item=>item.satisfied)?"Current prerequisites met":"Opening prerequisites need attention"}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Required reviewed categories: {opening.evidenceRequired.join(", ")}
      </p>
      <PrerequisiteChecklist label="School opening prerequisites" items={opening.prerequisites}/>
      <ul className="mt-3 space-y-3">
        {opening.evidence.map(document=><li key={document.id} className="rounded border p-3">
          <p className="font-medium">{document.category.replace("school_opening_","").replaceAll("_"," ")}</p>
          <EvidenceDetails evidence={document}/>
        </li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        These are the latest independently verified records for each required category.
        Approval rechecks current evidence; this list does not provide document preview.
      </p>
      <label className="mt-3 block">Reason for decision
        <input className="mt-1 block w-full rounded border bg-background p-2"
          value={reason} disabled={busy||loading} minLength={10} maxLength={500}
          onChange={e=>setReason(e.target.value)}/>
      </label>
      <div className="mt-2 flex gap-2">
        {opening.canDecide&&opening.status==="draft"&&<button type="button"
          disabled={busy||loading||reason.trim().length<10||!opening.approvalReady}
          onClick={()=>void decide("approve")}
          className="rounded border px-3 py-2 disabled:opacity-50">
          Approve independently reviewed opening
        </button>}
        {opening.canDecide&&opening.status==="approved"&&<button type="button"
          disabled={busy||loading||reason.trim().length<10}
          onClick={()=>void decide("suspend")}
          className="rounded border px-3 py-2 disabled:opacity-50">
          Suspend school opening authorization
        </button>}
        {opening.status==="suspended"&&<p className="text-xs">
          Suspended. A new reviewed draft version is required to reopen.
        </p>}
      </div>
    </>}
    </QueryState>
  </section>;
}
