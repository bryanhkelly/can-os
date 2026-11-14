import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { noncreditLabActions } from "@/domain/canonical-capability-lab";
import { normalizeClientError } from "@/lib/client-error";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalCapabilityLab } from "@/modules/operations/canonical-capability-lab.functions";
import {
  finalizeNoncreditKnowledgeCheckResult,
  provisionNoncreditKnowledgeCheckAccess,
} from "@/modules/learning/noncredit-assessment.functions";
import { decideNoncreditCompletion } from "@/modules/learning/noncredit-completion-decisions.functions";

type Attempt = Awaited<ReturnType<typeof getCanonicalCapabilityLab>>["attempts"][number];
type Command = "provision" | "finalize" | "complete";

export const Route = createFileRoute("/canonical/lab/noncredit")({
  loader: () => safeLoader(() => getCanonicalCapabilityLab())(),
  component: NoncreditLabPage,
});

function NoncreditLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Noncredit testing" message={result.message}/>;
  return <NoncreditLabContent attempts={result.data.attempts} trainings={result.data.trainings}/>;
}

function NoncreditLabContent({ attempts, trainings }: {
  attempts: Awaited<ReturnType<typeof getCanonicalCapabilityLab>>["attempts"];
  trainings: Awaited<ReturnType<typeof getCanonicalCapabilityLab>>["trainings"];
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function run(command: Command, record: Attempt) {
    if (!acknowledged || busy) return;
    setFeedback(null);
    setBusy(record.courseAttemptId + ":" + command);
    try {
      if (command === "provision") {
        await provisionNoncreditKnowledgeCheckAccess({ data: { courseAttemptId: record.courseAttemptId } });
      } else if (command === "finalize") {
        if (!record.assessmentAttemptId) throw new Error("No scored assessment attempt");
        await finalizeNoncreditKnowledgeCheckResult({ data: {
          courseAttemptId: record.courseAttemptId,
          assessmentAttemptId: record.assessmentAttemptId,
        } });
      } else {
        if (!record.policyId) throw new Error("No current completion policy");
        await decideNoncreditCompletion({ data: {
          courseAttemptId: record.courseAttemptId,
          expectedPolicyId: record.policyId,
          assessmentResultId: record.finalizedResultId,
        } });
      }
      await router.invalidate();
      setFeedback({ tone: "success", text: "Command saved. The latest scoped records have been requested." });
    } catch (cause) {
      setFeedback({ tone: "danger", text: normalizeClientError(cause,
        "This operation could not be completed.").message });
    } finally {
      setBusy(null);
    }
  }

  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Noncredit testing" subtitle="Test the provider-owned sequence using the canonical noncredit registration, knowledge check and completion records. These are not school grades or credits.">
    <CapabilityLabNav current="noncredit"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Write safety</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">These controls execute real audited commands against the configured database. Only use disposable or intentionally synthetic pilot records. The learner must submit their knowledge check in their own authorized learning experience before a provider can finalize it.</p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={acknowledged}
          onChange={event => setAcknowledged(event.target.checked)}/>
        <span>I understand these actions persist to the connected database.</span>
      </label>
      {feedback && <p role={feedback.tone === "danger" ? "alert" : "status"}
        className={"mt-4 border px-4 py-3 text-sm " +
          (feedback.tone === "danger" ? "border-destructive text-destructive" : "border-success text-foreground")}>
        {feedback.text}</p>}
    </section>

    <section className="mt-6" aria-label="Provider training versions">
      <h2 className="font-serif text-2xl">Training versions</h2>
      <div className="mt-3 overflow-x-auto border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr><th scope="col" className="p-3 font-semibold">Training</th>
              <th scope="col" className="p-3 font-semibold">Publication</th>
              <th scope="col" className="p-3 font-semibold">Instruction</th>
              <th scope="col" className="p-3 font-semibold">Knowledge check</th></tr>
          </thead>
          <tbody>
            {trainings.map(training => <tr key={training.id} className="border-b last:border-b-0">
              <th scope="row" className="p-3 font-medium">{training.title}
                <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">{training.id}</p></th>
              <td className="p-3">{training.state}</td>
              <td className="p-3">{training.requiredMinutes} min</td>
              <td className="p-3">{training.assessmentVersionId ? "Linked" : "Not linked"}</td>
            </tr>)}
            {trainings.length === 0 && <tr><td colSpan={4} className="p-5 text-muted-foreground">
              No provider-owned training versions in the current scope.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="mt-7" aria-label="Noncredit course participation">
      <h2 className="font-serif text-2xl">Course attempts</h2>
      <p className="mt-2 text-sm text-muted-foreground">Each row represents one existing course participation record. Commands remain subject to independent provider review, current policy and SQL validation.</p>
      <div className="mt-4 grid gap-4">
        {attempts.map(record => {
          const actions = noncreditLabActions(record);
          const disabled = !acknowledged || busy !== null;
          return <article key={record.courseAttemptId} className="border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{record.trainingTitle}</h3>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Course attempt: {record.courseAttemptId}</p>
              </div>
              <span className="border border-border bg-muted/40 px-2 py-1 text-xs font-medium">
                {record.courseStatus} · registration {record.registrationStatus}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Assessment access</dt>
                <dd className="mt-1 font-medium">{record.assessmentGrantStatus ?? "Not issued"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Assessment attempt</dt>
                <dd className="mt-1 font-medium">{record.assessmentAttemptState ?? "Not started"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Finalized result</dt>
                <dd className="mt-1 font-medium">{record.finalizedOutcome ?? "Not finalized"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Completion</dt>
                <dd className="mt-1 font-medium">{record.latestDecision ?? "No decision"}</dd></div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Policy: {record.policyId
              ? "v" + record.policyVersion + " · minimum " + record.policyMinMinutes + " minutes · " +
                (record.policyRequiresAssessment ? "finalized assessment required" : "assessment optional")
              : "No effective published policy found"}</p>
            {record.assessmentAttemptId && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              Assessment attempt: {record.assessmentAttemptId}</p>}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <Button size="sm" variant="outline" disabled={disabled || !actions.provision}
                onClick={() => void run("provision", record)}>Provision assessment access</Button>
              <Button size="sm" variant="outline" disabled={disabled || !actions.finalize}
                onClick={() => void run("finalize", record)}>Finalize scored result</Button>
              <Button size="sm" disabled={disabled || !actions.complete}
                onClick={() => void run("complete", record)}>Record completion</Button>
            </div>
          </article>;
        })}
        {attempts.length === 0 && <p role="status" className="border border-border bg-card p-5 text-sm text-muted-foreground">
          No noncredit course attempts are available in your provider organization.</p>}
      </div>
    </section>
  </WorkspaceShell>;
}
