import type { ReactNode } from "react";
import type { MutationFeedbackState } from "@/lib/mutation-feedback";
import { WorkspaceNotice } from "./notice";

export function MutationFeedback({ state, pendingMessage, successAction }: {
  state: MutationFeedbackState;
  pendingMessage: string;
  successAction?: ReactNode;
}) {
  if (state.pending) return <WorkspaceNotice>{pendingMessage}</WorkspaceNotice>;
  if (state.error) return <WorkspaceNotice tone="danger">
    {state.refreshFailed ? "The command succeeded. " : "No change was completed. "}
    {state.error}{state.refreshFailed && successAction}
  </WorkspaceNotice>;
  if (state.notice) return <WorkspaceNotice tone="success">{state.notice}{successAction}</WorkspaceNotice>;
  return null;
}
