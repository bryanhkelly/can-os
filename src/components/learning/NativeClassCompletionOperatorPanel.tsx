import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/choice";
import { Select } from "@/components/ui/select";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getNativeClassCompletionQueue,getNativeClassCompletionReview,
  decideNativeClassCompletion,
} from "@/modules/classes/native-class-completion.functions";
import {
  requestCompletionEvidenceReview,getPendingCompletionEvidenceReviews,
  decideCompletionEvidenceReview,
} from "@/modules/learning/completion-evidence-review.functions";
import { publishNativeClassCompletionPolicy } from "@/modules/classes/native-class-completion-policy.functions";

/** WS3 V6.1 right-angle operator workspace. Actual Class, learner,
 * reviewer and Site rights are always resolved from the original source.
 * A pending request never grants completion; the second reviewer approves
 * evidence, then the provider records the canonical outcome.
 */
export function NativeClassCompletionOperatorPanel({classId}:{classId:string}){
  const [page,setPage]=useState(0);
  const [approvalPage,setApprovalPage]=useState(0);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [outcome,setOutcome]=useState<"completed"|"not_yet_completed"|"voided">("completed");
  const [evidenceVersionId,setEvidenceVersionId]=useState("");
  const [reason,setReason]=useState("");
  const [policyRequireLessons,setPolicyRequireLessons]=useState(true);
  const [policySessions,setPolicySessions]=useState(0);
  const [policyRequireAssessment,setPolicyRequireAssessment]=useState(false);
  const [policyEvidence,setPolicyEvidence]=useState("");
  const [notice,setNotice]=useState("");
  const [view,setView]=useState<"participants"|"approvals">("participants");
  const list=useQuery({
    queryKey:["ws3-class-completion-queue",classId,page],
    queryFn:()=>getNativeClassCompletionQueue({data:{classId,page}}),
    enabled:!!classId,retry:false,
  });
  const detail=useQuery({
    queryKey:["ws3-class-completion",selectedId],
    queryFn:()=>getNativeClassCompletionReview({
      data:{classEnrollmentId:selectedId!},
    }),
    enabled:!!selectedId,retry:false,
  });
  const approvals=useQuery({
    queryKey:["ws3-source-evidence-review-queue",approvalPage],
    queryFn:()=>getPendingCompletionEvidenceReviews({data:{page:approvalPage}}),
    enabled:view==="approvals",retry:false,
  });
  const request=useMutation({
    mutationFn:()=>requestCompletionEvidenceReview({data:{
      purpose:"class_completion_decision",
      classEnrollmentId:selectedId!,
      expectedClassOutcomeId:detail.data?.currentDecision?.id??null,
      approvedOutcome:outcome,evidenceVersionId:evidenceVersionId.trim(),
      reason:reason.trim(),
    }}),
    onSuccess:()=>setNotice("Evidence review requested. A second authorized reviewer must approve it before completion may be recorded."),
  });
  const decide=useMutation({
    mutationFn:()=>decideNativeClassCompletion({data:{
      classEnrollmentId:selectedId!,
      expectedPolicyVersionId:detail.data!.policyVersionId!,
      expectedPriorOutcomeId:detail.data?.currentDecision?.id??null,
      outcome,evidenceVersionId:evidenceVersionId.trim(),
      reason:reason.trim(),
    }}),
    onSuccess:async()=>{
      setNotice("Official Class decision recorded with its original completion policy and audit history.");
      await Promise.all([list.refetch(),detail.refetch()]);
    },
  });
  const publishPolicy=useMutation({
    mutationFn:()=>publishNativeClassCompletionPolicy({data:{
      classId,
      expectedLatestVersion:list.data?.latestCompletionPolicyVersion??null,
      requireAllLessons:policyRequireLessons,
      requiredVerifiedSessions:policySessions,
      requirePassingAssessment:policyRequireAssessment,
      policyEvidenceVersionId:policyEvidence.trim(),
    }}),
    onSuccess:async()=>{
      setPolicyEvidence("");
      setNotice("Completion policy published. It applies only to future Class Enrollments; existing pins remain unchanged.");
      await list.refetch();
    },
  });
  const review=useMutation({
    mutationFn:async(input:{requestId:string;decision:"approve"|"reject"})=>
      decideCompletionEvidenceReview({data:input}),
    onSuccess:async()=>{setNotice("Independent evidence review saved.");
      await approvals.refetch();},
  });
  const ready=!!selectedId && !!detail.data?.policyVersionId &&
    (outcome!=="completed" || detail.data.readiness.readyForIndependentReview) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(evidenceVersionId.trim()) && reason.trim().length>=10 &&
    !request.isPending && !decide.isPending;
  return <section className="space-y-5 border border-border bg-card p-5"
    aria-label="Class completion governance">
    <header className="space-y-2 border-b border-border pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        CAN OS · Governed outcomes
      </p>
      <h2 className="font-serif text-2xl">Class completion</h2>
      <p className="text-sm text-muted-foreground">
        A participant's recorded work is not an issued award. Verify the
        original completion policy, independently review the evidence, and
        record a formal decision without changing official grades.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant={view==="participants"?"default":"outline"}
          onClick={()=>setView("participants")}>Participant review</Button>
        <Button variant={view==="approvals"?"default":"outline"}
          onClick={()=>setView("approvals")}>Independent approvals</Button>
      </div>
    </header>
    {notice&&<p role="status" className="border border-border p-3 text-sm">{notice}</p>}
    {view==="approvals"?
      <div className="space-y-4">
        <h3 className="font-serif text-xl">Review requested evidence</h3>
        <p className="text-xs text-muted-foreground">
          Approval does not record completion. Only another currently authorized
          provider reviewer can approve an immutable exact-learner evidence binding.
        </p>
        {approvals.isPending&&<p role="status">Verifying current reviewer scope…</p>}
        {approvals.isError&&<p role="alert">Pending reviews are unavailable.</p>}
        {approvals.data?.pending.length===0&&<p className="text-sm">No pending reviews at your authorized Site.</p>}
        {approvals.data?.pending.map(item=>
          <article key={item.requestId} className="space-y-2 border border-border p-4">
            <h4 className="font-semibold">{item.purpose.replaceAll("_"," ")}</h4>
            <p className="text-xs text-muted-foreground">Source: {item.sourceId}</p>
            <p className="text-sm">{item.reviewReason}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">
              Evidence version: {item.evidenceVersionId}
            </p>
            <div className="flex gap-2">
              <Button disabled={review.isPending}
                onClick={()=>review.mutate({requestId:item.requestId,decision:"approve"})}>
                Approve evidence
              </Button>
              <Button variant="outline" disabled={review.isPending}
                onClick={()=>review.mutate({requestId:item.requestId,decision:"reject"})}>
                Reject
              </Button>
            </div>
          </article>)}
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={approvalPage===0}
            onClick={()=>setApprovalPage(p=>Math.max(0,p-1))}>Previous</Button>
          <span className="text-xs text-muted-foreground">
            Approval page {approvalPage+1}
          </span>
          <Button variant="outline" disabled={!approvals.data?.hasMore}
            onClick={()=>setApprovalPage(p=>p+1)}>Next</Button>
        </div>
        {review.isError&&<p role="alert">This evidence approval was denied or could not be saved.</p>}
      </div>:
      <div className="space-y-5">
        {list.isPending&&<p role="status">Loading authorized Class participants…</p>}
        {list.isError&&<p role="alert">
          This Class queue is unavailable. Verify the Class, original Site and current grant.
        </p>}
        {list.data&&<div className="space-y-3">
          <h3 className="font-serif text-xl">{list.data.classTitle}</h3>
          <details className="border border-border bg-card p-4">
            <summary className="cursor-pointer font-semibold">
              Publish completion requirements for future learners
            </summary>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Latest policy version: {list.data.latestCompletionPolicyVersion??"None"}.
                Publication requires another current exact-Site authorized
                reviewer, independent of the Class creator, with verified policy evidence.
                Existing enrollment policies cannot be rewritten.
              </p>
              <Label className="flex items-center gap-2 text-sm">
                <Checkbox checked={policyRequireLessons}
                  onChange={e=>setPolicyRequireLessons(e.target.checked)}/>
                Require every canonical Course lesson
              </Label>
              <Label className="block space-y-1 text-sm font-medium">
                Required independently verified Sessions
                <Input type="number" min={0} max={52} value={policySessions}
                  onChange={e=>setPolicySessions(
                    Math.max(0,Math.min(52,Number(e.target.value)||0)))}/>
              </Label>
              <Label className="flex items-center gap-2 text-sm">
                <Checkbox checked={policyRequireAssessment}
                  onChange={e=>setPolicyRequireAssessment(e.target.checked)}/>
                Require a finalized passing canonical assessment
              </Label>
              <Label className="block space-y-1 text-sm font-medium">
                Independently verified policy evidence version
                <Input value={policyEvidence}
                  onChange={e=>setPolicyEvidence(e.target.value)}
                  placeholder="Verified evidence UUID"/>
              </Label>
              <Button disabled={publishPolicy.isPending ||
                  !(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                    .test(policyEvidence.trim())) ||
                  !(policyRequireLessons||policySessions>0||policyRequireAssessment)}
                onClick={()=>publishPolicy.mutate()}>
                Publish reviewed policy
              </Button>
              {publishPolicy.isError&&<p role="alert" className="text-sm">
                Publication denied. Review the independent Class/Site authority,
                verified evidence and current policy version.
              </p>}
            </div>
          </details>
          <div className="divide-y divide-border border border-border">
            {list.data.participants.map(person=>
              <Button variant={selectedId===person.classEnrollmentId?"secondary":"ghost"} key={person.classEnrollmentId} type="button"
                className="flex h-auto w-full items-start justify-between gap-4 text-left"
                aria-pressed={selectedId===person.classEnrollmentId}
                onClick={()=>{
                  setSelectedId(person.classEnrollmentId);
                  setOutcome("completed");setEvidenceVersionId("");setReason("");
                  setNotice("");
                }}>
                <span className="space-y-1">
                  <strong className="block text-sm">{person.displayName}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {person.completedLessons}/{person.totalLessons} lessons ·
                    {" "}{person.verifiedSessions} verified Sessions ·
                    {" "}{person.finalizedPassingResults} finalized passing assessments
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {person.currentOutcome?
                      "Formal decision: "+person.currentOutcome:
                      person.readyForIndependentReview?
                        "Requirements met, awaiting independent review":
                        "Requirements outstanding: "+person.blockers.join(", ")}
                  </span>
                </span>
                <span className="text-xs">{selectedId===person.classEnrollmentId?
                  "Selected":"Review"}</span>
              </Button>)}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={page===0}
              onClick={()=>{setPage(p=>Math.max(0,p-1));setSelectedId(null);}}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page+1}</span>
            <Button variant="outline" disabled={!list.data.hasMore}
              onClick={()=>{setPage(p=>p+1);setSelectedId(null);}}>Next</Button>
          </div>
        </div>}
        {selectedId&&<div className="space-y-4 border-t border-border pt-4">
          <h3 className="font-serif text-xl">Adjudicate selected Class enrollment</h3>
          {detail.isPending&&<p role="status">Rechecking completion evidence…</p>}
          {detail.isError&&<p role="alert">Independent source review is unavailable.</p>}
          {detail.data&&<div className="space-y-3">
            <p className="text-sm">
              Policy: {detail.data.policyVersionId?"Pinned at original enrollment":"Unavailable"}
              {" · "}Recorded decision: {detail.data.currentDecision?.resultCode??"None"}
              {" · "}Verified completion: {detail.data.verifiedCompletion?"Yes":"No"}
            </p>
            <p className="text-xs text-muted-foreground">
              {detail.data.readiness.blockers.length?
                "Requirements outstanding: "+detail.data.readiness.blockers.join(", "):
                "Evidence requirements are satisfied for independent adjudication."}
            </p>
            <Label className="block space-y-1 text-sm font-medium">
              Completion decision
              <Select className="w-full"
                value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>
                <option value="completed">Completed</option>
                <option value="not_yet_completed">Not yet completed</option>
                <option value="voided">Void previous decision</option>
              </Select>
            </Label>
            <Label className="block space-y-1 text-sm font-medium">
              Verified evidence document version ID
              <Input value={evidenceVersionId}
                onChange={e=>setEvidenceVersionId(e.target.value)}
                placeholder="UUID for original provider-owned verified evidence"/>
            </Label>
            <Label className="block space-y-1 text-sm font-medium">
              Documented evidence review reason
              <Textarea value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="Document the independent basis (10–1000 characters)"/>
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!ready}
                onClick={()=>request.mutate()}>Request independent approval</Button>
              <Button disabled={!ready}
                onClick={()=>decide.mutate()}>Record formal decision</Button>
            </div>
            {request.isError&&<p role="alert" className="text-sm">
              Evidence review request was not accepted. Check exact source and Site.
            </p>}
            {decide.isError&&<p role="alert" className="text-sm">
              Completion was not recorded. It may need independent approval or refreshed evidence.
            </p>}
          </div>}
        </div>}
      </div>}
  </section>;
}
