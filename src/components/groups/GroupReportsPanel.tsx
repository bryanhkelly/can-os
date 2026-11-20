import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/workspace";
import { resolveCanonicalGroupReport } from "@/modules/study-groups/canonical-moderation.functions";
import type { GroupPanelRecord, GroupPanelRole, GroupPanelAvailability, GroupPanelRun, GroupPanelMutation } from "./group-panel-contracts";

/** Moderation actions are subject to the authenticated server policy. */
export function GroupReportsPanel({ group, availability, busy, run }: {
  group: GroupPanelRecord; availability: GroupPanelAvailability; busy: boolean; run: GroupPanelRun;
}) {
  return <WorkspacePanel title="Content reports"
    description="Open reports for this group's discussion.">
    <div className="space-y-3">
      {group.reports.map(report => <div key={report.id} className="border p-3">
        <p className="text-sm">Reason: {report.reason}</p>
        <blockquote className="mt-2 border bg-muted p-3 text-sm whitespace-pre-wrap">
          {report.postBody ?? "The reported post is unavailable."}
        </blockquote>
        {report.postHidden && <p className="mt-1 text-xs text-muted-foreground">Post already hidden</p>}
        <div className="mt-2 flex gap-2">
          <Button variant="destructive" size="sm" type="button" disabled={busy || !availability.moderationEnabled}
            onClick={() => void run(() => resolveCanonicalGroupReport({ data: {
              reportId: report.id, hidePost: true,
            } }), "Reported post hidden.")}>Hide post</Button>
          <Button variant="outline" size="sm" type="button" disabled={busy || !availability.moderationEnabled}
            onClick={() => void run(() => resolveCanonicalGroupReport({ data: {
              reportId: report.id, hidePost: false,
            } }), "Report reviewed; content retained.")}>Retain post</Button>
        </div>
      </div>)}
      {group.reports.length === 0 && <p className="text-xs text-muted-foreground">No open content reports.</p>}
    </div>
  </WorkspacePanel>;
}
