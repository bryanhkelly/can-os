import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Accessible read-only map of a user journey or business process.
 * This is process documentation and navigation, not an executable workflow engine.
 */
export type UserFlowKind = "entry" | "task" | "decision" | "review" | "exit";
export type UserFlowState = "not_started" | "active" | "complete" | "blocked";
export interface UserFlowNode {
  id: string;
  title: string;
  description?: string;
  kind: UserFlowKind;
  state?: UserFlowState;
  owner?: string;
  href?: string;
}
export interface UserFlowStage {
  id: string;
  title: string;
  description?: string;
  nodes: readonly UserFlowNode[];
}

const kinds: Record<UserFlowKind, string> = {
  entry: "Start",
  task: "Action",
  decision: "Decision",
  review: "Independent review",
  exit: "Outcome",
};
const states: Record<UserFlowState, string> = {
  not_started: "Not started",
  active: "Current",
  complete: "Complete",
  blocked: "Blocked",
};

export function UserFlowMap({ title, description, stages, legend, className }: {
  title: string;
  description?: string;
  stages: readonly UserFlowStage[];
  legend?: ReactNode;
  className?: string;
}) {
  return <section aria-label={title} className={cn("min-w-0 space-y-4", className)}>
    <header className="border-b border-border pb-4">
      <h2 className="font-serif text-3xl font-normal leading-tight">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
    </header>
    <ol className="grid min-w-0 gap-4 lg:grid-cols-3">
      {stages.map((stage, stageIndex) => <li key={stage.id} className="min-w-0 border border-border bg-card">
        <header className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">Stage {stageIndex + 1}</div>
          <h3 className="mt-1 text-sm font-semibold">{stage.title}</h3>
          {stage.description && <p className="mt-1 text-xs text-muted-foreground">{stage.description}</p>}
        </header>
        <ol className="divide-y divide-border">
          {stage.nodes.map(node => <li key={node.id} className={cn("border-l-2 p-4",
            node.state === "blocked" ? "border-l-danger" :
            node.state === "active" ? "border-l-primary" :
            node.state === "complete" ? "border-l-success" : "border-l-transparent")}>
            <div className="flex items-center justify-between gap-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{kinds[node.kind]}</span>
              {node.state && <span>{states[node.state]}</span>}
            </div>
            {node.href ? <a href={node.href} className="mt-2 block text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{node.title}</a>
              : <h4 className="mt-2 text-sm font-semibold">{node.title}</h4>}
            {node.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{node.description}</p>}
            {node.owner && <p className="mt-2 text-xs text-muted-foreground">Owner: {node.owner}</p>}
          </li>)}
        </ol>
      </li>)}
    </ol>
    {legend && <div className="border border-border bg-card p-4">{legend}</div>}
  </section>;
}
