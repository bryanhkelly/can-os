import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DirectoryWindowPagination } from "@/components/workspace/directory-window-pagination";
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
    {history.isPending && <p role="status" className="text-sm">Loading plan review history…</p>}
    {history.isError && <div role="alert" className="space-y-2 text-sm">
      <p>We couldn't show this review history with your current access.</p>
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
        description: <div className="space-y-1">
          {item.rationale && <p>{item.rationale}</p>}
          <p>{item.evidenceVersionId
            ? `Supporting evidence version: ${item.evidenceVersionId}`
            : "No supporting evidence version recorded"}</p>
        </div>,
      }))}/>}
    {history.data && (page > 0 || history.data.hasMore) &&
      <DirectoryWindowPagination label="Blueprint review history"
        pageIndex={page} hasMore={history.data.hasMore && page < 100}
        previousLabel="Newer" nextLabel="Older" disabled={history.isFetching}
        onPageChange={setPage} />}
  </section>;
}
