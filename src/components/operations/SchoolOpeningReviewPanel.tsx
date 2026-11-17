import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { PrerequisiteChecklist } from "@/components/workspace/prerequisite-checklist";
import { EvidenceDetails } from "@/components/evidence/EvidenceDetails";
import {useCallback,useEffect,useRef,useState} from "react";
import { MutationFeedback, QueryState, StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const [readError,setReadError]=useState("");
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
        mutationErrorMessage(cause, "Unable to load the current opening review"));
      throw cause;
    }finally{
      if(request===requestSequence.current)setLoading(false);
    }
  },[programId]);
  const mutation=useMutationFeedback(refresh);
  const busy=mutation.pending||mutation.refreshFailed;
  useEffect(()=>{
    void refresh().catch(()=>{});
    return ()=>{requestSequence.current++};
  },[refresh]);
  function reload(){
    if(busy||loading)return;
    void refresh().catch(()=>{});
  }
  const decide=async(decision:"approve"|"suspend")=>{
    if(busy||loading||!opening)return;
    const reviewed=opening;
    await mutation.run(
      ()=>decideChurchSchoolOpeningFn({data:{
        programId,configurationId:reviewed.configurationId,
        expectedVersion:reviewed.version,decision,reason,
      }}),
      {
        successMessage:decision==="approve"
        ?"Institutional opening approval recorded. Daily supervision remains a separate gate."
        :"Institutional opening suspended; new onsite attendance coverage cannot be verified.",
        commandErrorMessage:"Opening decision was not recorded",
        refreshErrorMessage:"The opening decision was recorded, but the latest review could not be loaded. Retry the refresh before making another decision.",
      },
    );
  };
  return <section className="mt-4 border p-4 text-sm">
    <h3 className="font-semibold">Church school opening authorization</h3>
    <p className="mt-2 text-xs text-muted-foreground">
      An institutional reviewer must independently verify current legal, facility,
      safeguarding-reporting, emergency and custody/pickup evidence, in addition
      to the signed school services agreement and a named church Site director.
      This does not certify that adults are physically present today.
    </p>
    <MutationFeedback state={mutation} className="mt-2" pendingMessage="Saving opening decision…"/>
    {!readError&&<Button type="button" variant="ghost" size="sm" onClick={reload}
      loading={loading} disabled={busy||loading} className="mt-3">Reload review</Button>}
    <QueryState loading={loading?"Loading current opening review…":undefined}
      error={readError||undefined} onRetry={reload} retrying={busy||loading}>
    {opening&&<>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span>Configuration v{opening.version}</span>
        <StatusBadge tone={opening.status==="approved"?"success":opening.status==="suspended"?"danger":"neutral"}>{opening.status}</StatusBadge>
        <span>{opening.prerequisites.every(item=>item.satisfied)?"Current prerequisites met":"Opening prerequisites need attention"}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Required reviewed categories: {opening.evidenceRequired.join(", ")}
      </p>
      <PrerequisiteChecklist label="School opening prerequisites" items={opening.prerequisites}/>
      <ul className="mt-3 space-y-3">
        {opening.evidence.map(document=><li key={document.id} className="border p-3">
          <p className="font-medium">{document.category.replace("school_opening_","").replaceAll("_"," ")}</p>
          <EvidenceDetails evidence={document}/>
        </li>)}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        These are the latest independently verified records for each required category.
        Approval rechecks current evidence; this list does not provide document preview.
      </p>
      <Field label="Reason for decision" className="mt-3" required
        description="Provide at least 10 characters explaining the independent review decision.">
        <Input value={reason} disabled={busy||loading} minLength={10} maxLength={500}
          onChange={e=>setReason(e.target.value)}/>
      </Field>
      <div className="mt-2 flex gap-2">
        {opening.canDecide&&opening.status==="draft"&&<Button type="button"
          disabled={busy||loading||reason.trim().length<10||!opening.approvalReady}
          onClick={()=>void decide("approve")}>
          Approve independently reviewed opening
        </Button>}
        {opening.canDecide&&opening.status==="approved"&&<Button type="button" variant="destructive"
          disabled={busy||loading||reason.trim().length<10}
          onClick={()=>void decide("suspend")}>
          Suspend school opening authorization
        </Button>}
        {opening.status==="suspended"&&<p className="text-xs">
          Suspended. A new reviewed draft version is required to reopen.
        </p>}
      </div>
    </>}
    </QueryState>
  </section>;
}
