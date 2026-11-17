import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusTimeline } from "@/components/workflow";
import { readCanonicalBlueprintReviewHistory } from "@/modules/blueprints/blueprint-studio.functions";

/** Read-only. Server authorizes the Blueprint version and returns only its
 * original append-only reviews, not derived operational permissions.
 */
export function BlueprintReviewHistoryPanel({ configurationVersionId }: {
  configurationVersionId: string;
}) {
  const [page, setPage] = useState(0);
  const history = useQuery({
    queryKey: ["blueprint-review-history", configurationVersionId, page],
    queryFn: () => readCanonicalBlueprintReviewHistory({
      data: { configurationVersionId, page },
    }),
    retry: false,
  });
  return <section className="mt-4 space-y-3" aria-label="Blueprint review history">
    <h3 className="text-sm font-semibold">Independent review history</h3>
    <p className="text-xs text-muted-foreground">
      Recorded decisions for this exact submitted version. Review approval does
      not authorize enrollment, operating a Site or publishing Offerings.
    </p>
    {history.isPending && <p role="status" className="text-sm">Loading authorized review history…</p>}
    {history.isError && <div role="alert" className="space-y-2 text-sm">
      <p>Review history is unavailable under the current authorization.</p>
      <Button type="button" variant="outline" size="sm"
        onClick={() => void history.refetch()}>Retry review history</Button>
    </div>}
    {history.data && <StatusTimeline
      label="Recorded Blueprint decisions"
      emptyMessage="No independent review has been recorded for this version."
      entries={history.data.items.map(item => ({
        id: item.id,
        title: item.decision.replaceAll("_", " "),
        occurredAt: item.decidedAt,
        status: item.decision.replaceAll("_", " "),
        tone: item.decision === "approved" ? "success" as const :
          item.decision === "rejected" ? "danger" as const :
          item.decision === "conditional" ? "attention" as const : "neutral" as const,
        description: item.evidenceVersionId
          ? `Supporting evidence version: ${item.evidenceVersionId}`
          : "No supporting evidence version recorded",
      }))}/>}
    {history.data && (page > 0 || history.data.hasMore) &&
      <nav aria-label="Blueprint review history pages" className="flex flex-wrap items-center gap-3 text-sm">
        <Button type="button" size="sm" variant="outline" disabled={page === 0}
          onClick={() => setPage(value => Math.max(0, value - 1))}>Newer</Button>
        <span>Page {page + 1}</span>
        <Button type="button" size="sm" variant="outline" disabled={!history.data.hasMore || page >= 100}
          onClick={() => setPage(value => value + 1)}>Older</Button>
      </nav>}
  </section>;
}
