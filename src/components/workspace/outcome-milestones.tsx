import type { ReactNode } from "react";
import { WorkspacePanel, StatusBadge, type StatusTone } from "./workspace-panel";
import { EmptyState } from "./empty-state";

export type MilestoneState = "complete" | "next" | "pending" | "blocked" | "unavailable";
export interface OutcomeMilestone {
  id: string; title: string; detail?: string; state: MilestoneState;
  action?: ReactNode;
}
const views: Record<MilestoneState,{label:string;tone:StatusTone}> = {
  complete:{label:"Complete",tone:"success"}, next:{label:"Next action",tone:"info"},
  pending:{label:"Not confirmed",tone:"neutral"}, blocked:{label:"Action required",tone:"attention"},
  unavailable:{label:"Status unavailable",tone:"attention"},
};
/** Completion is supplied by the owning reader. Missing or unavailable evidence
 * never becomes a green check. Progress is milestone completion, not approval. */
export function OutcomeMilestones({ title = "Your milestones", description, items }: {
  title?: string; description?: string; items: readonly OutcomeMilestone[];
}) {
  return <WorkspacePanel title={title} description={description}><OutcomeMilestoneList items={items} label={title}/></WorkspacePanel>;
}

/** Embedded variant for existing record panels; avoids a second page header. */
export function OutcomeMilestoneList({items,label="Milestones"}:{items:readonly OutcomeMilestone[];label?:string}){
  const done=items.filter(item=>item.state==="complete").length;
  return <div role="group" aria-label={label}>
    {items.length === 0 ? <EmptyState title="No milestones available."/> : <>
      <p className="text-sm font-medium">{done} of {items.length} milestones confirmed complete</p>
      <progress className="mt-2 h-2 w-full accent-primary" aria-label="Confirmed milestone completion" value={done} max={items.length}/>
      <ol className="mt-4 divide-y divide-border">{items.map(item => <li key={item.id}
        className="flex min-w-0 flex-wrap items-start justify-between gap-3 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold [overflow-wrap:anywhere]">{item.title}</p>
          {item.detail&&<p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.detail}</p>}
          <div className="mt-2"><StatusBadge tone={views[item.state].tone}>{views[item.state].label}</StatusBadge></div>
        </div>
        {item.action && <div className="min-w-0 max-w-full">{item.action}</div>}
      </li>)}</ol>
    </>}
  </div>;
}
