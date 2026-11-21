import { WorkspacePanel } from "@/components/workspace";

export type LaunchGuidance = {
  why: string;
  tip?: string;
  next: string;
};

/** One concise guidance panel for Launch Studio steps. */
export function LaunchGuidancePanels({ guidance }: { guidance: LaunchGuidance }) {
  return <WorkspacePanel title="Next">
    <p className="text-sm leading-6 text-muted-foreground">{guidance.next}</p>
  </WorkspacePanel>;
}
