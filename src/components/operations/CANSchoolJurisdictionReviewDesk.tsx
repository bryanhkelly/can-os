import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {
  listCANSchoolJurisdictionReviewQueue,
  getSchoolJurisdictionReview,
  reviewSchoolJurisdictionLegally,
  reviewSchoolLegalRequirementEvidence,
} from "@/modules/programs/school-jurisdiction-review.functions";

type Queue=Awaited<ReturnType<typeof listCANSchoolJurisdictionReviewQueue>>;
type Item=Queue["items"][number];
type Review=Awaited<ReturnType<typeof getSchoolJurisdictionReview>>;

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
    if(!selected||selected.type!=="school_jurisdiction_legal_review"){
      setReview(null);setSourceUrls([]);return;
    }
    let active=true;
    void getSchoolJurisdictionReview({data:{programId:selected.programId}})
      .then(result=>{if(active){setReview(result);setSourceUrls([]);}})
      .catch(()=>{if(active)setError("Current school policy could not be read; no decision recorded.");});
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
      setSelected(null);setNote("");setReview(null);setSourceUrls([]);
      await reload();
    }catch(e){
      setError(e instanceof Error?e.message:
        "Independent review could not be recorded. Reload the current Site and evidence.");
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
      {selected.type==="school_jurisdiction_requirement"&&<p className="text-sm text-muted-foreground">
        Inspect the Program's existing scoped, independently verified document before deciding.
        A note alone does not satisfy a legal requirement; the server rechecks the actual Document.
      </p>}
      <label className="block text-sm font-medium" htmlFor="can-jurisdiction-note">Independent decision rationale</label>
      <textarea id="can-jurisdiction-note" value={note} rows={4}
        onChange={event=>setNote(event.target.value)}
        className="w-full rounded-md border bg-background p-2 text-sm"
        placeholder="Record which current official requirements and evidence were verified, or why corrections are necessary."/>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={submitting||note.trim().length<25||
          (selected.type==="school_jurisdiction_legal_review"&&
            (!review?.policyReady||sourceUrls.length===0))}
          onClick={()=>void decide("verify")}>Verify documented scope</Button>
        <Button type="button" variant="outline" disabled={submitting||note.trim().length<25}
          onClick={()=>void decide("request_changes")}>Request corrections</Button>
      </div>
    </div>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  </section>;
}
