import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { normalizeClientError } from "@/lib/client-error";
import {
  decideCanonicalBlueprintReview,
  listCanonicalBlueprintReviews,
} from "@/modules/blueprints/blueprint-studio.functions";

type Item = Awaited<ReturnType<typeof listCanonicalBlueprintReviews>>[number];
type Decision = "approved" | "conditional" | "rejected";

export const Route = createFileRoute("/operations/blueprint-reviews")({
  loader: () => safeLoader(() => listCanonicalBlueprintReviews())(),
  component: BlueprintReviewPage,
});

function BlueprintReviewPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS" title="Blueprint review" outcome={result}/>;
  return <WorkspaceShell
    eyebrow="Independent authorization"
    title="Blueprint reviews"
    subtitle="Review submitted planning configurations and their components. Approval does not authorize a school or learning center to operate.">
    <div className="mt-5 space-y-4">
      {result.data.length === 0 && <p role="status" className="border bg-card p-5 text-sm">
        No submitted Blueprint configurations are available for independent review.
      </p>}
      {result.data.map(item =>
        <ReviewEditor key={item.configurationVersionId} item={item}/>)}
    </div>
  </WorkspaceShell>;
}

function ReviewEditor({ item }: { item: Item }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [decision, setDecision] = useState<Decision>("conditional");
  const [rationale, setRationale] = useState("");
  const [evidenceVersionId, setEvidenceVersionId] = useState("");
  const [componentEvidence, setComponentEvidence] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const approvalComplete = decision !== "approved" || (
    Boolean(evidenceVersionId.trim()) && item.selectedComponents.every(component =>
      Boolean(componentEvidence[component.componentId]?.trim())
    )
  );

  async function recordReview() {
    if (!approvalComplete || rationale.trim().length < 8 || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await decideCanonicalBlueprintReview({ data: {
        reviewId: crypto.randomUUID(),
        configurationVersionId: item.configurationVersionId,
        decision,
        rationale: rationale.trim(),
        evidenceVersionId: decision === "approved" ? evidenceVersionId.trim() : null,
        components: decision === "approved"
          ? item.selectedComponents.map(component => ({
              componentId: component.componentId,
              decision: "approved" as const,
              evidenceVersionId: componentEvidence[component.componentId]?.trim() ?? null,
              conditions: null,
            }))
          : [],
      } });
      setMessage("Independent Blueprint review recorded. No operating permission was granted.");
      setExpanded(false);
      await router.invalidate();
    } catch (caught) {
      setError(normalizeClientError(caught, "Blueprint review could not be recorded.").message);
    } finally {
      setBusy(false);
    }
  }

  return <article className="border bg-card p-5">
    <h2 className="font-semibold">{item.name}</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      {item.blueprintTitle} · Revision {item.revision} · Latest decision: {item.latestDecision.replaceAll("_", " ")}
    </p>
    <p className="mt-2 text-sm">
      {item.selectedComponents.length} selected component{item.selectedComponents.length === 1 ? "" : "s"}
    </p>
    <Button type="button" variant="outline" className="mt-3"
      onClick={() => setExpanded(open => !open)}>
      {expanded ? "Close review" : "Review submitted Blueprint"}
    </Button>
    {expanded && <section className="mt-5 space-y-4 border-t pt-4" aria-label="Independent Blueprint review decision">
      <ul className="space-y-2 text-sm">
        {item.selectedComponents.map(component =>
          <li key={component.componentId} className="border p-3">
            {component.key.replaceAll("_", " ")} · {component.kind.replaceAll("_", " ")}
            {decision === "approved" && <label className="mt-2 block" htmlFor={`evidence-${component.componentId}`}>
              Component approval evidence version ID
              <Input id={`evidence-${component.componentId}`} className="mt-1"
                placeholder="Verified evidence UUID"
                value={componentEvidence[component.componentId] ?? ""}
                disabled={busy}
                onChange={event => setComponentEvidence(current => ({
                  ...current, [component.componentId]: event.currentTarget.value,
                }))}/>
            </label>}
          </li>)}
      </ul>
      <label className="block text-sm" htmlFor={`decision-${item.configurationVersionId}`}>
        Review outcome
        <Select id={`decision-${item.configurationVersionId}`} className="mt-2"
          value={decision} disabled={busy}
          onChange={event => setDecision(event.currentTarget.value as Decision)}>
          <option value="conditional">Changes or additional verification required</option>
          <option value="approved">Approve configuration and selected components</option>
          <option value="rejected">Reject configuration</option>
        </Select>
      </label>
      {decision === "approved" && <label className="block text-sm"
        htmlFor={`overall-evidence-${item.configurationVersionId}`}>
        Whole-configuration approval evidence version ID
        <Input id={`overall-evidence-${item.configurationVersionId}`} className="mt-2"
          placeholder="Verified evidence UUID"
          value={evidenceVersionId} disabled={busy}
          onChange={event => setEvidenceVersionId(event.currentTarget.value)}/>
      </label>}
      <label className="block text-sm" htmlFor={`review-rationale-${item.configurationVersionId}`}>
        Review rationale
        <Textarea id={`review-rationale-${item.configurationVersionId}`} className="mt-2"
          value={rationale} disabled={busy} maxLength={4000}
          onChange={event => setRationale(event.currentTarget.value)}/>
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {message && <p className="text-sm" role="status">{message}</p>}
      <Button type="button" disabled={busy || !approvalComplete || rationale.trim().length < 8}
        onClick={() => void recordReview()}>
        {busy ? "Recording review…" : "Record independent review"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Approved components require verified evidence. Review decisions are auditable
        and do not activate Offerings, enrollment, or operations.
      </p>
    </section>}
    {!expanded && message && <p className="mt-3 text-sm" role="status">{message}</p>}
    {!expanded && error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
  </article>;
}
