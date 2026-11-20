import { WorkspacePanel } from "@/components/workspace";
import { GroupModerationReportRow } from "./GroupReviewRows";
import { resolveCanonicalGroupReport } from "@/modules/study-groups/canonical-moderation.functions";
import type { GroupPanelRecord, GroupPanelAvailability, GroupPanelRun } from "./group-panel-contracts";

/** Moderation actions are subject to the authenticated server policy. */
export function GroupReportsPanel({ group, availability, busy, run }: {
  group: GroupPanelRecord; availability: GroupPanelAvailability; busy: boolean; run: GroupPanelRun;
}) {
  return <WorkspacePanel title="Content reports"
    description="Open reports for this group's discussion.">
    <div className="space-y-3">
      {group.reports.map(report => <GroupModerationReportRow
        key={report.id} groupId={group.id} report={report}
        busy={busy} moderationEnabled={availability.moderationEnabled}
        onResolve={(reportId,hidePost)=>run(
          ()=>resolveCanonicalGroupReport({data:{reportId,hidePost}}),
          hidePost?"Reported post hidden.":"Report reviewed; content retained.")}/>)}
      {group.reports.length === 0 && <p className="text-xs text-muted-foreground">No open content reports.</p>}
    </div>
  </WorkspacePanel>;
}
