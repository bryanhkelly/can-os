import type { ReactNode } from "react";
import { PrerequisiteChecklist } from "@/components/workspace/prerequisite-checklist";

export interface WorkflowPrerequisite {
  id: string;
  label: string;
  satisfied: boolean;
  explanation?: string | null;
}

/** Reuse the canonical prerequisite status pattern without inferring eligibility. */
export function WorkflowPrerequisites({ items, heading = "Prerequisites", nextAction }: {
  items: readonly WorkflowPrerequisite[];
  heading?: string;
  nextAction?: ReactNode;
}) {
  return <section aria-label={heading} className="border p-4">
    <h3 className="font-semibold">{heading}</h3>
    {items.length === 0
      ? <p className="mt-2 text-sm text-muted-foreground">No prerequisites reported.</p>
      : <PrerequisiteChecklist label={heading + " results"} items={items.map(item=>({
          id:item.id,title:item.label,satisfied:item.satisfied,detail:item.explanation ?? undefined,
        }))}/>}
    {nextAction && <div className="mt-3 border-t pt-3">{nextAction}</div>}
  </section>;
}
