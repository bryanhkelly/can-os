import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceShell } from "@/components/workspace";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { normalizeClientError } from "@/lib/client-error";
import {
  decideCanonicalBlueprintReview,
  listCanonicalBlueprintReviews,
  listCanonicalBlueprintReviewEvidence,
} from "@/modules/blueprints/blueprint-studio.functions";

type Item = Awaited<ReturnType<typeof listCanonicalBlueprintReviews>>[number];
type Decision = "approved" | "conditional" | "rejected";
type Evidence = Awaited<ReturnType<typeof listCanonicalBlueprintReviewEvidence>>[number];

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
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let current = true;
    setEvidenceLoading(true);
    void listCanonicalBlueprintReviewEvidence({
      data: { owningOrganizationId: item.owningOrganizationId },
    }).then(items => {
      if (current) setEvidence(items);
    }).catch(caught => {
      if (current) setError(normalizeClientError(caught,
        "Verified review evidence could not be loaded.").message);
    }).finally(() => { if (current) setEvidenceLoading(false); });
    return () => { current = false; };
  }, [expanded, item.owningOrganizationId]);

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
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div className="border p-3">
        <h3 className="font-semibold">Site and identity</h3>
        <p className="mt-1 text-muted-foreground">
          Site: {item.siteId ?? "No Site selected"}
        </p>
        <p className="mt-1 text-muted-foreground">
          Educational identity: {item.editorialIdentity.replaceAll("_", " ")}
        </p>
        <p className="mt-1 text-muted-foreground">
          Affiliation: {item.religiousAffiliationCode ?? "Unspecified"}
        </p>
      </div>
      <div className="border p-3">
        <h3 className="font-semibold">Published Offering intents</h3>
        {item.offeringIntents.length === 0
          ? <p className="mt-1 text-muted-foreground">No Offerings proposed</p>
          : <ul className="mt-2 space-y-1">
              {item.offeringIntents.map((offering, index) =>
                <li key={index}>{offering.title} · v{offering.offeringVersionNo}</li>)}
            </ul>}
      </div>
    </div>
    {(item.references.length > 0 || item.localExperiences.length > 0) &&
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {item.references.length > 0 && <section className="border p-3">
          <h3 className="font-semibold">Selected curated references</h3>
          <ul className="mt-2 space-y-2">
            {item.references.map((reference, index) =>
              <li key={index}>
                <strong>{reference.title}</strong>
                <p className="text-muted-foreground">{reference.summary}</p>
              </li>)}
          </ul>
        </section>}
        {item.localExperiences.length > 0 && <section className="border p-3">
          <h3 className="font-semibold">Locally proposed experiences</h3>
          <ul className="mt-2 space-y-2">
            {item.localExperiences.map((experience, index) =>
              <li key={index}>
                <strong>{experience.title}</strong>
                <p className="text-muted-foreground">{experience.summary}</p>
              </li>)}
          </ul>
        </section>}
      </div>}
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
              <Select id={`evidence-${component.componentId}`} className="mt-1"
                value={componentEvidence[component.componentId] ?? ""}
                disabled={busy || evidenceLoading}
                onChange={event => setComponentEvidence(current => ({
                  ...current, [component.componentId]: event.currentTarget.value,
                }))}>
                <option value="">Select verified evidence</option>
                {evidence.map(item => <option key={item.id} value={item.id}>
                  {item.title} · {item.kind.replaceAll("_", " ")}
                </option>)}
              </Select>
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
        <Select id={`overall-evidence-${item.configurationVersionId}`} className="mt-2"
          value={evidenceVersionId} disabled={busy || evidenceLoading}
          onChange={event => setEvidenceVersionId(event.currentTarget.value)}>
          <option value="">Select verified evidence</option>
          {evidence.map(evidenceItem => <option key={evidenceItem.id} value={evidenceItem.id}>
            {evidenceItem.title} · {evidenceItem.kind.replaceAll("_", " ")}
          </option>)}
        </Select>
      </label>}
      <label className="block text-sm" htmlFor={`review-rationale-${item.configurationVersionId}`}>
        Review rationale
        <Textarea id={`review-rationale-${item.configurationVersionId}`} className="mt-2"
          value={rationale} disabled={busy} maxLength={4000}
          onChange={event => setRationale(event.currentTarget.value)}/>
      </label>
      {evidenceLoading && <p className="text-sm text-muted-foreground" role="status">
        Loading verified supporting evidence…
      </p>}
      {!evidenceLoading && evidence.length === 0 && <p className="text-sm text-muted-foreground">
        No verified evidence is available for this Organization. Rejection or a request
        for changes can still be recorded; approval requires verified evidence.
      </p>}
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
