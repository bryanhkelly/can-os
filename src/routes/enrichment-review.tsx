import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { ExtendedSeasonEvidencePanel } from "@/components/operations/ExtendedSeasonEvidencePanel";
import { listExtendedEvidenceReviewsFn } from "@/modules/activities/extended-learning-evidence.functions";

export const Route = createFileRoute("/enrichment-review")({
  loader: safeLoader(() => listExtendedEvidenceReviewsFn()),
  component: EnrichmentReview,
});

function EnrichmentReview() {
  const result = Route.useLoaderData();
  const [selected, setSelected] = useState("");
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS" title="Extended-learning approvals" outcome={result}/>;
  return <WorkspaceShell eyebrow="CAN OS · Independent review"
    title="Summer and after-school operating evidence"
    subtitle="For verified CAN network reviewers. All approvals are restricted, audited and tied to one Season.">
    <div className="mt-5 space-y-3">
      {!result.data.length && <p className="text-sm">No extended-learning seasons are awaiting operating review.</p>}
      {result.data.map(season => <div className="rounded-lg border bg-card p-3" key={season.seasonId}>
        <button type="button" className="text-left text-sm font-semibold underline"
          onClick={() => setSelected(old => old === season.seasonId ? "" : season.seasonId)}>
          {season.offeringName} · {season.seasonName} · {season.status}
        </button>
        {selected === season.seasonId && <ExtendedSeasonEvidencePanel seasonId={season.seasonId}/>}
      </div>)}
    </div>
  </WorkspaceShell>;
}
