import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getNoncreditCompletionReview } from "@/modules/learning/noncredit-completion-review.functions";
import { correctNoncreditCompletion } from "@/modules/learning/noncredit-completion-corrections.functions";
import { requestCompletionEvidenceReview } from "@/modules/learning/completion-evidence-review.functions";

/** Design system 6.1 operator component. Parent roster must already
 * authorize the actual registration and never pass a browser-supplied Person.
 * Source commands independently recheck exact provider and delivery Site.
 */
export function NoncreditCompletionReviewPanel({registrationId}:{
  registrationId:string;
}){
  const [evidenceVersionId,setEvidenceVersionId]=useState("");
  const [reason,setReason]=useState("");
  const [outcome,setOutcome]=useState<"not_yet_completed"|"voided">("not_yet_completed");
  const query=useQuery({
    queryKey:["ws3-noncredit-completion-review",registrationId],
    queryFn:()=>getNoncreditCompletionReview({data:{registrationId}}),
    retry:false,
  });
  const evidenceReview=useMutation({
    mutationFn:async(expectedDecisionId:string)=>
      requestCompletionEvidenceReview({data:{
        purpose:"completion_correction",
        registrationId,
        expectedDecisionId,
        approvedOutcome:outcome,
        evidenceVersionId:evidenceVersionId.trim(),
        reason:reason.trim(),
      }}),
  });
  const correction=useMutation({
    mutationFn:async(expectedCurrentDecisionId:string)=>
      correctNoncreditCompletion({data:{
        registrationId,expectedCurrentDecisionId,
        outcome,evidenceVersionId:evidenceVersionId.trim(),
        reason:reason.trim(),
      }}),
    onSuccess:()=>{
      setReason("");setEvidenceVersionId("");
      void query.refetch();
    },
  });
  const current=query.data?.current;
  const isValidDecision=current?.state==="completed" ||
    current?.state==="not_yet_completed" || current?.state==="voided";
  const correctionReady=isValidDecision &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceVersionId.trim()) &&
    reason.trim().length>=10 && !correction.isPending;
  return <section className="space-y-5 border border-border bg-card p-5"
    aria-label="Noncredit completion review">
    <header className="space-y-2 border-b border-border pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CAN OS · Provider decisions
      </p>
      <h2 className="font-serif text-2xl">Completion review</h2>
      <p className="text-sm text-muted-foreground">
        Review the original authorized completion decision and append a documented
        correction when independently verified evidence requires it. History is preserved.
      </p>
    </header>
    {query.isPending && <p role="status">Verifying operator and Site access…</p>}
    {query.isError && <div role="alert" className="space-y-2">
      <p>Completion history is unavailable for this account, registration or Site.</p>
      <Button variant="outline" onClick={()=>void query.refetch()}>Retry verification</Button>
    </div>}
    {query.data && <div className="space-y-5">
      <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Approved training</p>
          <strong>{query.data.trainingTitle}</strong>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Registration</p>
          <strong>{query.data.registrationStatus}</strong>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Current decision</p>
          <strong>{current?.state==="unavailable"
            ?"Unable to establish valid decision history"
            :current?.state==="not_decided"?"No decision recorded"
            :isValidDecision ? current.outcome.label : "Unavailable"}</strong>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Applicable policy</p>
          <span className="text-sm">
            {query.data.pinnedPolicyId?"Pinned at registration":"No approved policy pinned"}
          </span>
        </div>
      </div>
      <section aria-label="Decision history" className="space-y-2">
        <h3 className="font-serif text-xl">Decision history</h3>
        {query.data.history.length===0
          ?<p className="text-sm text-muted-foreground">No formal decision yet.</p>
          :<ol className="divide-y divide-border border border-border">
            {query.data.history.map(row=><li key={row.id} className="p-3 text-sm">
              <p className="font-semibold">{row.outcome.replaceAll("_"," ")}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(row.decidedAt).toLocaleString()}
                {row.supersedesId?" · Superseding correction":""}
              </p>
            </li>)}
          </ol>}
      </section>
      <section aria-label="Award current validity" className="space-y-2">
        <h3 className="font-serif text-xl">Issued achievements</h3>
        <p className="text-xs text-muted-foreground">
          Current validity is computed from the canonical credential authority.
          A superseded completion, revocation or expiry can invalidate an award
          without deleting its original issuance.
        </p>
        {query.data.awards.length===0
          ?<p className="text-sm text-muted-foreground">No issued achievements.</p>
          :<ul className="divide-y divide-border border border-border">
            {query.data.awards.map(award=><li key={award.issuanceId}
              className="flex items-center justify-between gap-4 p-3 text-sm">
              <span>Issued {new Date(award.issuedAt).toLocaleDateString()}</span>
              <strong>{award.currentlyValid?"Currently valid":"No longer valid"}</strong>
            </li>)}
          </ul>}
      </section>
      {isValidDecision && current &&
      <form className="space-y-3 border-t border-border pt-4" onSubmit={event=>{
        event.preventDefault();
        if(correctionReady) correction.mutate(current.decisionId);
      }}>
        <h3 className="font-serif text-xl">Record an evidence-backed correction</h3>
        <p className="text-xs text-muted-foreground">
          The reviewer must have current exact-Site authority. Evidence must be independently
          verified, current and owned by the training provider. This action does not issue or revoke a credential.
        </p>
        <label className="block space-y-1 text-sm font-medium">
          Correction decision
          <Select
            value={outcome} onChange={event=>
              setOutcome(event.target.value as "not_yet_completed"|"voided")}>
            <option value="not_yet_completed">Not yet completed</option>
            <option value="voided">Void prior decision</option>
          </Select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Verified evidence version ID
          <Input value={evidenceVersionId} onChange={event=>setEvidenceVersionId(event.target.value)}
            placeholder="Approved evidence UUID" required/>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Correction reason (minimum 10 characters)
          <Textarea value={reason} onChange={event=>setReason(event.target.value)}
            placeholder="Document the independently verified reason" required/>
        </label>
        <p className="text-xs text-muted-foreground">
          First request independent approval for this exact registration,
          current decision, proposed outcome, provider Site and evidence.
          Another authorized reviewer must approve it before the
          correction command can succeed.
        </p>
        <Button type="button" variant="outline"
          disabled={!correctionReady||evidenceReview.isPending}
          onClick={()=>evidenceReview.mutate(current.decisionId)}>
          {evidenceReview.isPending?"Submitting evidence…":"Request independent approval"}
        </Button>
        {evidenceReview.isSuccess&&<p role="status" className="text-sm">
          Evidence review requested. An independent reviewer must approve it,
          then you can record the exact correction below.
        </p>}
        {evidenceReview.isError&&<p role="alert" className="text-sm">
          Evidence review request was denied. Verify your current Site,
          registration and independently verified document.
        </p>}
        <Button type="submit" disabled={!correctionReady}>
          {correction.isPending?"Recording…":"Record correction"}
        </Button>
        {correction.isSuccess&&<p role="status" className="text-sm">
          Correction recorded. The authoritative history has been refreshed.
        </p>}
        {correction.isError&&<p role="alert" className="text-sm">
          Correction was not accepted. Verify your current grant, policy and evidence.
        </p>}
      </form>}
      <p className="text-xs text-muted-foreground">{query.data.note}</p>
    </div>}
  </section>;
}
