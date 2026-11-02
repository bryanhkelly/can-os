import type { ReactNode } from "react";
import { WorkspacePanel } from "@/components/workspace";

export function ChecklistWorkspaceShell({ title, description, summary, context, activity, children }: {
  title: string;
  description?: string;
  summary?: ReactNode;
  context?: ReactNode;
  activity?: ReactNode;
  children: ReactNode;
}) {
  return <div className="space-y-6">
    {summary}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <WorkspacePanel title={title} description={description}>{children}</WorkspacePanel>
      {(context || activity) && <aside aria-label="Checklist context" className="space-y-6 lg:sticky lg:top-6">
        {context && <WorkspacePanel title="Context">{context}</WorkspacePanel>}
        {activity && <WorkspacePanel title="Activity">{activity}</WorkspacePanel>}
      </aside>}
    </div>
  </div>;
}
