import { WorkspacePanel } from "@/components/workspace";

export type LaunchGuidance = {
  why: string;
  tip?: string;
  next: string;
};

/** Consistent, data-driven V6.1 guidance rail for Launch Studio modules. */
export function LaunchGuidancePanels({ guidance }: { guidance: LaunchGuidance }) {
  return <div className="space-y-4">
    <WorkspacePanel title="Why this matters">
      <p className="text-sm leading-6 text-muted-foreground">{guidance.why}</p>
      {guidance.tip && <p className="mt-3 text-sm leading-6 text-muted-foreground">{guidance.tip}</p>}
    </WorkspacePanel>
    <WorkspacePanel title="What comes next">
      <p className="text-sm leading-6 text-muted-foreground">{guidance.next}</p>
    </WorkspacePanel>
  </div>;
}
