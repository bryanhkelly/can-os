import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { downloadBase64 } from "@/lib/download";
import { normalizeClientError } from "@/lib/client-error";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalCapabilityLab } from "@/modules/operations/canonical-capability-lab.functions";
import { previewNoncreditCredential } from "@/modules/learning/credential-preview.functions";

export const Route = createFileRoute("/canonical/lab/credentials")({
  loader: () => safeLoader(() => getCanonicalCapabilityLab())(),
  component: CredentialPreviewLab,
});
type PreviewFormat = "pdf" | "badge_svg" | "badge_json";

function CredentialPreviewLab() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Credential previews" message={result.message}/>;
  return <CredentialPreviewContent trainings={result.data.trainings}/>;
}

function CredentialPreviewContent({ trainings }: {
  trainings: Awaited<ReturnType<typeof getCanonicalCapabilityLab>>["trainings"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function preview(trainingVersionId: string, format: PreviewFormat) {
    if (busy) return;
    setBusy(trainingVersionId + ":" + format);
    setError("");
    try {
      const file = await previewNoncreditCredential({ data: { trainingVersionId, format } });
      downloadBase64(file.base64, file.filename, file.mediaType);
    } catch (cause) {
      setError(normalizeClientError(cause, "Unable to generate the credential preview.").message);
    } finally {
      setBusy(null);
    }
  }

  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Credential previews"
    subtitle="Preview noncredit completion certificates and digital badges for your published training. This page does not issue awards or publish learner information.">
    <CapabilityLabNav current="credentials"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Preview-only workspace</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Documents are generated with an example learner and prominently marked SAMPLE. These previews are not issued credentials. Actual issuance remains disabled pending the canonical database patch, issuer permissions, and acceptance tests.</p>
      {error && <p role="alert" className="mt-4 border border-destructive p-3 text-sm text-destructive">{error}</p>}
    </section>
    <section aria-label="Credential previews by training" className="mt-6 grid gap-4">
      {trainings.filter(training => training.state === "published").map(training =>
        <article key={training.id} className="border border-border bg-card p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{training.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Noncredit training · {training.requiredMinutes} instructional minutes</p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{training.id}</p>
            </div>
            <span className="h-fit border border-border bg-muted/40 px-2 py-1 text-xs">Sample only</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" disabled={busy !== null}
              onClick={() => void preview(training.id, "pdf")}>Certificate PDF</Button>
            <Button variant="outline" size="sm" disabled={busy !== null}
              onClick={() => void preview(training.id, "badge_svg")}>Badge artwork</Button>
            <Button variant="outline" size="sm" disabled={busy !== null}
              onClick={() => void preview(training.id, "badge_json")}>Badge metadata</Button>
          </div>
        </article>)}
      {trainings.every(training => training.state !== "published") &&
        <p role="status" className="border border-border bg-card p-5 text-sm text-muted-foreground">
          No published provider training versions are available for preview.</p>}
    </section>
  </WorkspaceShell>;
}
