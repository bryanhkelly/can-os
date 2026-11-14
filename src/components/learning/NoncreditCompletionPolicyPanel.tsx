import { useEffect,useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getNoncreditCompletionPolicyCatalog,publishNoncreditCompletionPolicy,
} from "@/modules/learning/noncredit-completion-policy.functions";

type Catalog=Awaited<ReturnType<typeof getNoncreditCompletionPolicyCatalog>>;

/** Existing canonical provider lab, not a separate credential/academic workflow. */
export function NoncreditCompletionPolicyPanel(){
  const [catalog,setCatalog]=useState<Catalog>([]);
  const [chosen,setChosen]=useState("");
  const [minutes,setMinutes]=useState("0");
  const [allLessons,setAllLessons]=useState(true);
  const [checkRequired,setCheckRequired]=useState(false);
  const [fraction,setFraction]=useState("0.8");
  const [mode,setMode]=useState<"automatic"|"provider_review">("provider_review");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const selected=catalog.find(row=>row.trainingVersionId===chosen);
  async function refresh(){
    const next=await getNoncreditCompletionPolicyCatalog();
    setCatalog(next);
    const current=next.find(item=>item.trainingVersionId===chosen)??next[0];
    if(current)selectTraining(current);
  }
  function selectTraining(training:Catalog[number]){
    setChosen(training.trainingVersionId);
    setMinutes(String(training.latest?.minParticipationMinutes??0));
    setAllLessons(training.latest?.requireAllLessons??true);
    setCheckRequired(training.latest?.skillsAssessmentRequired??false);
    setFraction(String(training.latest?.minimumAssessmentFraction??0.8));
    setMode(training.latest?.completionMode??"provider_review");
    setConfirmed(false);setNotice("");setError("");
  }
  useEffect(()=>{
    let alive=true;
    void getNoncreditCompletionPolicyCatalog()
      .then(rows=>{if(alive){setCatalog(rows);if(rows[0])selectTraining(rows[0]);}})
      .catch(()=>{if(alive)setError("Completion policies cannot be loaded.");});
    return ()=>{alive=false;};
  },[]);
  async function publish(){
    if(!selected||busy)return;
    if(mode==="automatic"&&!confirmed){
      setError("Explicit confirmation is required to authorize automatic completion.");
      return;
    }
    setError("");setNotice("");setBusy(true);
    try{
      const saved=await publishNoncreditCompletionPolicy({data:{
        trainingVersionId:selected.trainingVersionId,
        expectedLatestPolicyVersion:selected.latest?.policyVersion??null,
        minParticipationMinutes:Number(minutes),
        requireAllLessons:allLessons,skillsAssessmentRequired:checkRequired,
        minimumAssessmentFraction:checkRequired?Number(fraction):null,
        completionMode:mode,
      }});
      await refresh();
      setNotice(`Published completion policy v${saved.policyVersion}. It applies only to future registrations.`);
    }catch{
      setError("Policy publication failed. Verify provider authorization, published training and version.");
    }finally{setBusy(false);}
  }
  return <section aria-label="Noncredit completion policy authoring"
    className="space-y-4 border border-border bg-card p-5">
    <div>
      <h2 className="font-serif text-xl font-semibold">Completion requirements</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Publish a new immutable policy version. Existing participants retain
        their enrollment-time requirements. Automatic completion is opt-in.
      </p>
    </div>
    {catalog.length===0?<p role="status" className="text-sm">
      No independently approvable noncredit training is available in your scope.
    </p>:<>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Training</span>
        <select className="w-full max-w-lg border border-border bg-background p-2"
          value={chosen} onChange={event=>{
            const row=catalog.find(item=>item.trainingVersionId===event.target.value);
            if(row)selectTraining(row);
          }}>
          {catalog.map(row=><option key={row.trainingVersionId} value={row.trainingVersionId}>
            {row.title}
          </option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Current policy: {selected?.latest?`v${selected.latest.policyVersion}`:"Not yet published"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Verified participation minutes required</span>
          <input type="number" min={0} max={100000} step={1}
            className="w-full border border-border bg-background p-2" value={minutes}
            onChange={event=>setMinutes(event.target.value)}/>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Completion decision mode</span>
          <select className="w-full border border-border bg-background p-2"
            value={mode} onChange={event=>{
              setMode(event.target.value as "automatic"|"provider_review");
              setConfirmed(false);
            }}>
            <option value="provider_review">Provider review (default)</option>
            <option value="automatic">Automatic when requirements are satisfied</option>
          </select>
        </label>
      </div>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={allLessons}
          onChange={e=>setAllLessons(e.target.checked)}/>
        Require all course lessons to be marked complete
      </label>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={checkRequired}
          disabled={!selected?.hasFinalKnowledgeCheck}
          onChange={e=>setCheckRequired(e.target.checked)}/>
        Require a finalized after-course knowledge check
      </label>
      {checkRequired&&<label className="block space-y-1 text-sm">
        <span className="font-medium">Minimum final knowledge-check fraction (0–1)</span>
        <input type="number" min={0} max={1} step={0.05} value={fraction}
          className="w-full max-w-xs border border-border bg-background p-2"
          onChange={e=>setFraction(e.target.value)}/>
      </label>}
      {mode==="automatic"&&<label className="flex gap-2 border border-border p-3 text-sm">
        <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
        I authorize automatic noncredit training completion under this published policy.
        Exceptions and corrections remain provider-controlled.
      </label>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="text-sm">{notice}</p>}
      <Button type="button" disabled={busy||(mode==="automatic"&&!confirmed)}
        onClick={()=>void publish()}>
        {busy?"Publishing...":"Publish new completion policy"}
      </Button>
    </>}
  </section>;
}