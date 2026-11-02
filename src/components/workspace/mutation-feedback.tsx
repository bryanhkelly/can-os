import type { ReactNode } from "react";
import type { MutationFeedbackState, RefreshOutcome } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "./notice";

export function MutationFeedback({ state, pendingMessage, successAction, className }: {
  state: MutationFeedbackState & { retryRefresh?: () => Promise<RefreshOutcome> };
  pendingMessage: string;
  successAction?: ReactNode;
  className?: string;
}) {
  if (state.pending) return <WorkspaceNotice className={className}>
    {state.refreshFailed ? "Refreshing saved changes..." : pendingMessage}
    {state.refreshFailed && state.notice && <span className="block">{state.notice}</span>}
  </WorkspaceNotice>;
  if (state.error) return <WorkspaceNotice tone="danger" className={className}>
    {state.refreshFailed ? "The command succeeded. " : "No change was completed. "}
    {state.error}{state.refreshFailed && <>
      {state.notice && <span className="block">{state.notice}</span>}
      {state.retryRefresh && <Button variant="outline" size="sm" className="mt-2"
        onClick={() => void state.retryRefresh?.()}>Retry refresh</Button>}
      {successAction}
    </>}
  </WorkspaceNotice>;
  if (state.notice) return <WorkspaceNotice tone="success" className={className}>{state.notice}{successAction}</WorkspaceNotice>;
  return null;
}
