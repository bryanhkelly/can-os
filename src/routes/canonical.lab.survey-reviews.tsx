import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { normalizeClientError } from "@/lib/client-error";
import { safeLoader } from "@/lib/safe-loader";
import {
  readCanonicalSurveyReviewQueue, recordCanonicalSurveyReview,
} from "@/modules/operations/canonical-survey-approvals.functions";
import type { requiredSurveyReviews } from "@/domain/canonical-survey-approvals";

type ReviewKind = typeof requiredSurveyReviews[number];
type ReviewVersion = Awaited<ReturnType<typeof readCanonicalSurveyReviewQueue>>["versions"][number];
export const Route=createFileRoute("/canonical/lab/survey-reviews")({
  loader:()=>safeLoader(()=>readCanonicalSurveyReviewQueue())(),
  component:ReviewPage,
});
function ReviewPage() {
  const data=Route.useLoaderData();
  if(!data.ok)return <CanonicalBlueprintLoadError title="Independent survey review" message={data.message}/>;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Independent survey review"
    subtitle="An organization-scoped reviewer workspace, separate from Site administrators and the survey author.">
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Review authority</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Review decisions are append-only canonical records with audit history. A survey author cannot
        review their own version. Privacy, accessibility, and safeguarding each require a current
        independent approval before a provider may publish. This queue cannot publish, activate
        campaigns, invite respondents, or inspect answers.
      </p>
      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
        Organization: {data.data.organizationId} · Showing up to {data.data.limit} drafts
      </p>
    </section>
    <div className="mt-5 grid gap-4">
      {data.data.versions.map(version=><ReviewCard key={version.id} version={version}/>)}
      {data.data.versions.length===0&&<p role="status"
        className="border border-border bg-card p-5 text-sm text-muted-foreground">
        No active survey draft versions in this reviewer's organization.
      </p>}
    </div>
  </WorkspaceShell>;
}
function ReviewCard({version}:{version:ReviewVersion}) {
  const router=useRouter();
  const [kind,setKind]=useState<ReviewKind>("privacy");
  const [decision,setDecision]=useState<""|"approved"|"rejected">("");
  const [ack,setAck]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  async function record() {
    if(busy||!ack||!decision||version.ownDraft||!version.reviewPreviewComplete||
      version.questionCount===0)return;
    setBusy(true);setError("");setSuccess("");
    try {
      await recordCanonicalSurveyReview({data:{
        surveyVersionId:version.id,kind,decision,
      }});
      setSuccess("Review decision recorded. Refreshing current approval history.");
      setDecision("");setAck(false);
      await router.invalidate();
    }catch(cause){
      setError(normalizeClientError(cause,"Unable to record the independent review.").message);
    }finally{setBusy(false);}
  }
  return <article className="border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl">{version.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {version.code} · Version {version.versionNo} · {version.purposeCode} · {version.audience}
        </p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{version.id}</p>
      </div>
      <span className="border border-border px-3 py-2 text-xs font-medium">
        {version.publicationReady?"All review domains approved":"Reviews outstanding"}
      </span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {version.approvals.map(row=><div key={row.kind} className="border border-border p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{row.kind}</p>
        <p className="mt-1 font-medium">{row.decision??"Not reviewed"}{!row.independent&&row.decision?" · Not independent":""}</p>
      </div>)}
    </div>
    <details className="mt-4 border-t border-border pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary underline underline-offset-4">
        Review {version.questionCount} questions
      </summary>
      {!version.reviewPreviewComplete&&<p className="mt-3 text-sm text-destructive">
        Complete question inspection is unavailable. Reviews are disabled.
      </p>}
      <ol className="mt-3 space-y-3">
        {version.questions.map(q=><li key={q.id} className="border border-border p-3 text-sm">
          <p className="font-medium">{q.ordinal}. {q.prompt}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {q.type} · {q.required?"Required":"Optional"} · {q.safetyTriage?"Protected":"Standard"}
          </p>
          {!!q.options.length&&<ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
            {q.options.map((option,index)=><li key={index}>{option}</li>)}
          </ul>}
        </li>)}
      </ol>
    </details>
    {version.ownDraft?<p className="mt-4 border border-border p-3 text-sm text-muted-foreground">
      You authored this survey version. An independent reviewer must record its decisions.
    </p>:<section className="mt-5 border-t border-border pt-4" aria-label={"Record review for "+version.title}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Review domain
          <Select value={kind} onChange={e=>setKind(e.target.value as ReviewKind)} disabled={busy}>
            <option value="privacy">Privacy</option>
            <option value="accessibility">Accessibility</option>
            <option value="safeguarding">Safeguarding</option>
          </Select>
        </label>
        <label className="space-y-2 text-sm font-medium">Decision
          <Select value={decision} disabled={busy}
            onChange={e=>setDecision(e.target.value as ""|"approved"|"rejected")}>
            <option value="">Select decision</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </label>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={ack}
          onChange={e=>setAck(e.target.checked)} disabled={busy}/>
        I have independently reviewed the draft. My decision will be persisted and audited.
      </label>
      {error&&<p role="alert" className="mt-3 border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {success&&<p role="status" className="mt-3 border border-border p-3 text-sm">{success}</p>}
      <Button type="button" className="mt-4" variant="outline"
        disabled={!decision||!ack||busy||!version.reviewPreviewComplete||version.questionCount===0}
        onClick={()=>void record()}>{busy?"Recording…":"Record independent review"}</Button>
    </section>}
  </article>;
}
