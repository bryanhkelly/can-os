import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getNoncreditCompletionQueue } from "@/modules/learning/noncredit-completion-review.functions";
import { NoncreditCompletionReviewPanel } from "@/components/learning/NoncreditCompletionReviewPanel";

/** 6.1 provider operator entry point. Server guards current exact Org/Site;
 * a Browser-supplied registration ID does not provide learner authorization.
 */
export function NoncreditCompletionQueuePanel(){
  const [page,setPage]=useState(0);
  const [registrationId,setRegistrationId]=useState<string|null>(null);
  const query=useQuery({
    queryKey:["ws3-noncredit-completion-queue",page],
    queryFn:()=>getNoncreditCompletionQueue({data:{page}}),retry:false,
  });
  return <section className="space-y-5 border border-border bg-card p-5"
    aria-label="Provider noncredit completion review">
    <header className="space-y-2 border-b border-border pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CAN OS · Provider outcomes
      </p>
      <h2 className="font-serif text-2xl">Noncredit completion</h2>
      <p className="text-sm text-muted-foreground">
        Original registration, completion decision and Site attribution remain
        authoritative. A recorded decision does not issue a certificate.
      </p>
    </header>
    {query.isPending&&<p role="status">Verifying completion reviewer access…</p>}
    {query.isError&&<p role="alert">Completion review queue unavailable for this account and Site.</p>}
    {query.data&&<div className="space-y-3">
      {query.data.participants.length===0?
        <p className="text-sm text-muted-foreground">No current registrations for this authorized Site.</p>:
        <div className="divide-y divide-border border border-border">
          {query.data.participants.map(record=>
            <Button key={record.registrationId} type="button" variant={registrationId===record.registrationId?"secondary":"ghost"}
              className="h-auto w-full items-start justify-between gap-4 text-left whitespace-normal"
              aria-pressed={registrationId===record.registrationId}
              onClick={()=>setRegistrationId(record.registrationId)}>
              <span className="space-y-1">
                <strong className="block text-sm">{record.trainingTitle}</strong>
                <span className="block text-xs text-muted-foreground">
                  Registration: {record.registrationId}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {record.currentState.replaceAll("_"," ")}
                  {" · "}{record.completionPolicyPinned?
                    "Policy pinned":"Policy not pinned"}
                </span>
              </span>
              <span className="text-xs">{registrationId===record.registrationId?
                "Selected":"Review"}</span>
            </Button>)}
        </div>}
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={page===0}
          onClick={()=>{setPage(p=>Math.max(0,p-1));setRegistrationId(null);}}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {page+1}</span>
        <Button variant="outline" disabled={!query.data.hasMore}
          onClick={()=>{setPage(p=>p+1);setRegistrationId(null);}}>Next</Button>
      </div>
    </div>}
    {registrationId&&<NoncreditCompletionReviewPanel key={registrationId}
      registrationId={registrationId}/>}
  </section>;
}
