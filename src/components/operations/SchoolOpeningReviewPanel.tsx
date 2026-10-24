import {useCallback,useEffect,useState} from "react";
import {
  decideChurchSchoolOpeningFn,getChurchSchoolOpeningFn,
} from "@/modules/operations/school-opening.functions";
type Model=Awaited<ReturnType<typeof getChurchSchoolOpeningFn>>;

/** CAN institutional decision; never visible as a church self-approval. */
export function SchoolOpeningReviewPanel({programId}:{programId:string}){
  const [opening,setOpening]=useState<Model|null>(null);
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    setOpening(await getChurchSchoolOpeningFn({data:{programId}}));
  },[programId]);
  useEffect(()=>{setOpening(null);void refresh().catch(c=>
    setError(c instanceof Error?c.message:"Unable to review school opening"));
  },[refresh]);
  const decide=async(decision:"approve"|"suspend")=>{
    setBusy(true);setError("");setNotice("");
    try{
      await decideChurchSchoolOpeningFn({data:{programId,decision,reason}});
      await refresh();setNotice(decision==="approve"
        ?"Institutional opening approval recorded. Daily supervision remains a separate gate."
        :"Institutional opening suspended; new onsite attendance coverage cannot be verified.");
    }catch(e){setError(e instanceof Error?e.message:"Opening decision was not recorded");}
    finally{setBusy(false);}
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
    {opening&&<>
      <p className="mt-2">Configuration v{opening.version} · {opening.status}
        {" · "}{opening.evidenceReady?"Evidence/contract currently valid":"Current evidence or contract incomplete"}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Required reviewed categories: {opening.evidenceRequired.join(", ")}
      </p>
      <label className="mt-3 block">Reason for decision
        <input className="mt-1 block w-full rounded border bg-background p-2"
          value={reason} minLength={10} maxLength={500}
          onChange={e=>setReason(e.target.value)}/>
      </label>
      <div className="mt-2 flex gap-2">
        {opening.status==="draft"&&<button type="button"
          disabled={busy||reason.trim().length<10||!opening.evidenceReady}
          onClick={()=>void decide("approve")}
          className="rounded border px-3 py-2 disabled:opacity-50">
          Approve independently reviewed opening
        </button>}
        {opening.status==="approved"&&<button type="button"
          disabled={busy||reason.trim().length<10}
          onClick={()=>void decide("suspend")}
          className="rounded border px-3 py-2 disabled:opacity-50">
          Suspend school opening authorization
        </button>}
        {opening.status==="suspended"&&<p className="text-xs">
          Suspended. A new reviewed draft version is required to reopen.
        </p>}
      </div>
    </>}
  </section>;
}
