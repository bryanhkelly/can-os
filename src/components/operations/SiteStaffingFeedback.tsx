import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace/notice";

/**
 * Presentation only for the shared Site staffing mutation contract.
 * The server command remains authoritative. If the write succeeds but
 * refreshing the read model fails, never invite a second write.
 */
export function SiteStaffingFeedback({ error, notice, refreshWarning, onRetry, busy }: {
  error?: string;
  notice?: string;
  refreshWarning?: string | null;
  onRetry: () => void;
  busy: boolean;
}) {
  return <>
    {error && <WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    {notice && !refreshWarning &&
      <WorkspaceNotice tone="success" className="mt-3">{notice}</WorkspaceNotice>}
    {refreshWarning && <WorkspaceNotice tone="attention" className="mt-3">
      {notice && <p>{notice}</p>}
      <p className={notice ? "mt-1" : undefined}>{refreshWarning}</p>
      <Button type="button" variant="outline" size="sm" className="mt-2"
        onClick={onRetry} loading={busy} disabled={busy}>Refresh staffing</Button>
    </WorkspaceNotice>}
  </>;
}
