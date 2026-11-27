import { useId, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { WorkspaceNotice } from "./notice";
import { StatusBadge, type StatusTone } from "./workspace-panel";

/** Controlled view state only. Callers supply confirmed outcomes from their command. */
export type ActionState =
  | { kind: "unchanged" | "ready" | "saving" | "saved" }
  | { kind: "blocked" | "failed" | "conflict" | "partial"; detail: string };
const presentation: Record<ActionState["kind"], { label: string; tone: StatusTone }> = {
  unchanged: { label: "No unsaved changes", tone: "neutral" },
  ready: { label: "Unsaved changes", tone: "attention" },
  saving: { label: "Saving", tone: "info" },
  saved: { label: "Saved", tone: "success" },
  blocked: { label: "Action required", tone: "attention" },
  failed: { label: "Save failed", tone: "danger" },
  conflict: { label: "Newer version exists", tone: "attention" },
  partial: { label: "Saved; follow-up required", tone: "attention" },
};
export function ActionStateIndicator({ state }: { state: ActionState }) {
  const view = presentation[state.kind];
  return <div role="status" aria-live="polite" className="min-w-0 space-y-1">
    <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
    {"detail" in state && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{state.detail}</p>}
  </div>;
}

/** Does not own mutation or permission decisions. Partial/conflict requires recovery,
 * never a blind repeat of a possibly committed command. */
export function GovernedSaveAction({ state, label = "Save and continue", onSave, recovery, ...props }: {
  state: ActionState; label?: string; onSave: () => void; recovery?: ReactNode;
} & Pick<ButtonProps,"className"|"size">) {
  const reasonId = useId();
  const canSave = state.kind === "ready" || state.kind === "failed";
  return <div className="min-w-0 space-y-2">
    <div id={reasonId}><ActionStateIndicator state={state}/></div>
    <Button {...props} type="button" disabled={!canSave} loading={state.kind === "saving"} loadingLabel="Saving…" aria-describedby={reasonId}
      onClick={onSave}>{state.kind === "failed" ? "Retry save" : label}</Button>
    {recovery}
  </div>;
}

export type OperationState =
  | { kind: "idle" | "queued" | "running" | "succeeded" }
  | { kind: "failed" | "partial" | "unavailable"; detail: string };
const operationLabels = { idle: "Not started", queued: "Queued", running: "Processing", succeeded: "Completed", failed: "Failed", partial: "Completed with follow-up", unavailable: "Status unavailable" };
export function AsyncOperationStatus({ title, state, recovery }: { title: string; state: OperationState; recovery?: ReactNode }) {
  const tone = state.kind === "succeeded" ? "success" : state.kind === "failed" ? "danger" : state.kind === "partial" || state.kind === "unavailable" ? "attention" : "info";
  return <WorkspaceNotice tone={tone}>
    <p className="font-semibold">{title}: {operationLabels[state.kind]}</p>
    {"detail" in state && <p>{state.detail}</p>}
    {recovery && <div className="mt-2">{recovery}</div>}
  </WorkspaceNotice>;
}
