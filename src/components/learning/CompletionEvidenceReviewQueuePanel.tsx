import { useState } from "react";
import { useQuery,useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getPendingCompletionEvidenceReviews,
  decideCompletionEvidenceReview,
  requestCompletionEvidenceReview,
} from "@/modules/learning/completion-evidence-review.functions";
import { revokeLearningAwardIssuance } from "@/modules/learning/credential-revocation.functions";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * WS3 6.1 independent review for Class, noncredit and credential evidence.
 * Every query/command derives current original Site and participant from the
 * server, not these browser fields; role alone never authorizes issuance.
 */
export function CompletionEvidenceReviewQueuePanel(){
  const [page,setPage]=useState(0);
  const [issuanceId,setIssuanceId]=useState("");
  const [evidenceVersionId,setEvidenceVersionId]=useState("");
  const [reason,setReason]=useState("");
  const [notice,setNotice]=useState("");
  const queue=useQuery({
    queryKey:["ws3-independent-evidence-review-queue",page],
    queryFn:()=>getPendingCompletionEvidenceReviews({data:{page}}),
    retry:false,
  });
  const decide=useMutation({
    mutationFn:(data:{requestId:string;decision:"approve"|"reject"})=>
      decideCompletionEvidenceReview({data}),
    onSuccess:async()=>{
      setNotice("Independent evidence decision recorded with its authorization history.");
      await queue.refetch();
    },
  });
  const requestRevocation=useMutation({
    mutationFn:()=>requestCompletionEvidenceReview({data:{
      purpose:"award_revocation",
      issuanceId:issuanceId.trim(),
      evidenceVersionId:evidenceVersionId.trim(),
      reason:reason.trim(),
    }}),
    onSuccess:()=>{
      setNotice("Revocation evidence sent for independent approval. This has not revoked the credential.");
    },
  });
  const revoke=useMutation({
    mutationFn:()=>revokeLearningAwardIssuance({data:{
      issuanceId:issuanceId.trim(),
      evidenceVersionId:evidenceVersionId.trim(),
      reason:reason.trim(),
    }}),
    onSuccess:()=>{
      setNotice("Revocation recorded in the original credential ledger. Historical issuance remains preserved.");
      setIssuanceId("");setEvidenceVersionId("");setReason("");
    },
  });
  const valid=uuidPattern.test(issuanceId.trim()) &&
    uuidPattern.test(evidenceVersionId.trim()) &&
    reason.trim().length>=10&&reason.trim().length<=1000;
  return <section aria-label="Independent completion evidence approvals"
    className="space-y-6 border border-border bg-card p-5">
    <header className="space-y-2 border-b border-border pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CAN OS · Independent evidence authority
      </p>
      <h2 className="font-serif text-2xl">Completion evidence approvals</h2>
      <p className="text-sm text-muted-foreground">
        Review provider-submitted evidence for its original Person, Organization
        and delivery Site. Approval does not itself issue completion, credit or a credential.
      </p>
    </header>
    {notice&&<p role="status" className="border border-border p-3 text-sm">{notice}</p>}
    {queue.isPending&&<p role="status">Checking your current provider and Site approval scope…</p>}
    {queue.isError&&<div role="alert">
      Pending evidence cannot be displayed under this session.
      <Button variant="outline" onClick={()=>void queue.refetch()}>Retry authorization</Button>
    </div>}
    {queue.data&&<section className="space-y-3" aria-label="Independent approvals awaiting decision">
      <h3 className="font-serif text-xl">Pending independent review</h3>
      {queue.data.pending.length===0&&
        <p className="text-sm text-muted-foreground">No pending approvals in your authorized Site and capability scope.</p>}
      <ol className="divide-y divide-border border border-border">
        {queue.data.pending.map(entry=><li key={entry.requestId}
          className="space-y-2 p-3 text-sm">
          <strong>{entry.purpose.replaceAll("_"," ")}</strong>
          <p className="text-xs text-muted-foreground">
            Exact canonical source: {entry.sourceId}
            {entry.proposedOutcome?" · Decision: "+entry.proposedOutcome:""}
          </p>
          <p>{entry.reviewReason}</p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            Verified evidence version: {entry.evidenceVersionId}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={decide.isPending}
              onClick={()=>decide.mutate({requestId:entry.requestId,decision:"approve"})}>
              Approve independent evidence
            </Button>
            <Button variant="outline" disabled={decide.isPending}
              onClick={()=>decide.mutate({requestId:entry.requestId,decision:"reject"})}>
              Reject
            </Button>
          </div>
        </li>)}
      </ol>
      {decide.isError&&<p role="alert" className="text-sm">
        Approval was denied, modified or already reviewed. Refresh and verify authorization.
      </p>}
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={page===0}
          onClick={()=>setPage(x=>Math.max(0,x-1))}>Previous</Button>
        <span className="text-xs text-muted-foreground">Page {page+1}</span>
        <Button variant="outline" disabled={!queue.data.hasMore}
          onClick={()=>setPage(x=>x+1)}>Next</Button>
      </div>
    </section>}
    <section aria-label="Credential revocation" className="space-y-3 border-t border-border pt-5">
      <h3 className="font-serif text-xl">Governed credential revocation</h3>
      <p className="text-sm text-muted-foreground">
        A separately approved credential issuer may submit evidence for
        revocation, seek independent review, and then record the revocation
        in the existing award issuance ledger. A regular Site role is not
        issuer authority. The reason must match the reviewed request exactly.
      </p>
      <label className="block space-y-1 text-sm font-medium">
        Original canonical issuance ID
        <Input value={issuanceId} onChange={event=>setIssuanceId(event.target.value)}
          placeholder="Credential issuance UUID"/>
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Verified evidence version ID
        <Input value={evidenceVersionId}
          onChange={event=>setEvidenceVersionId(event.target.value)}
          placeholder="Provider-owned verified evidence UUID"/>
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Independently reviewed reason
        <Textarea value={reason} onChange={event=>setReason(event.target.value)}
          placeholder="Document the precise evidentiary basis for revocation"/>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!valid||requestRevocation.isPending}
          onClick={()=>requestRevocation.mutate()}>
          {requestRevocation.isPending?"Requesting…":"Request independent revocation approval"}
        </Button>
        <Button disabled={!valid||revoke.isPending} onClick={()=>revoke.mutate()}>
          {revoke.isPending?"Recording…":"Record independently approved revocation"}
        </Button>
      </div>
      {(requestRevocation.isError||revoke.isError)&&
        <p role="alert" className="text-sm">
          Source or issuer authorization is unavailable, or the exact evidence
          request has not yet been approved by another authorized reviewer.
        </p>}
    </section>
  </section>;
}
