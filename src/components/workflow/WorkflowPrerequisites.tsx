import type { ReactNode } from "react";
export interface WorkflowPrerequisite {
  id: string;
  label: string;
  satisfied: boolean;
  explanation?: string | null;
}
export function WorkflowPrerequisites({ items, heading = "Prerequisites", nextAction }: {
  items: readonly WorkflowPrerequisite[]; heading?: string; nextAction?: ReactNode;
}) {
  return <section aria-label={heading} className="rounded-lg border p-4">
    <h3 className="font-semibold">{heading}</h3>
    {items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No prerequisites reported.</p> :
      <ul className="mt-3 space-y-2">{items.map(item => <li key={item.id} className="flex items-start gap-2 text-sm">
        <span aria-hidden="true">{item.satisfied ? "✓" : "○"}</span>
        <div><span>{item.label}</span>{item.explanation && <p className="text-muted-foreground">{item.explanation}</p>}</div>
      </li>)}</ul>}
    {nextAction && <div className="mt-3 border-t pt-3">{nextAction}</div>}
  </section>;
}
