import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, EmptyState, DisclosureSection } from "@/components/workspace";
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
  return <WorkspaceShell eyebrow="Independent review"
    title="Summer and after-school operating evidence"
    subtitle="For verified CAN network reviewers. All approvals are restricted, audited and tied to one Season.">
    <div className="mt-5 space-y-3">
      {!result.data.length && <EmptyState title="No seasons awaiting review" description="No extended-learning seasons are awaiting operating review."/>}
      {result.data.map(season => <DisclosureSection key={season.seasonId} headingLevel="h2" title={`${season.offeringName} · ${season.seasonName}`} description={season.status} open={selected === season.seasonId} onOpenChange={open => setSelected(open ? season.seasonId : "")}>
        {selected === season.seasonId && <ExtendedSeasonEvidencePanel seasonId={season.seasonId}/>}
      </DisclosureSection>)}
    </div>
  </WorkspaceShell>;
}
