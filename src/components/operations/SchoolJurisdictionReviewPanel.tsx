import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getSchoolJurisdictionReview,
  requestSchoolJurisdictionLegalReview,
} from "@/modules/programs/school-jurisdiction-review.functions";

type Review = Awaited<ReturnType<typeof getSchoolJurisdictionReview>>;

export function SchoolJurisdictionReviewPanel({programId}:{programId:string}) {
  const [review,setReview] = useState<Review | null>(null);
  const [loading,setLoading] = useState(true);
  const [submitting,setSubmitting] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  useEffect(()=>{
    let current=true;
    setLoading(true);
    setError("");
    setReview(null);
    void getSchoolJurisdictionReview({data:{programId}}).then(result=>{
      if(current)setReview(result);
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
      setReview(await getSchoolJurisdictionReview({data:{programId}}));
    }catch{
      setError("Could not record the review request. Confirm registrar access and retry; no legal approval was granted.");
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
