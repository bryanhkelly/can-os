import type { DailyAttentionItem } from "@/domain/daily-operations";
import { WorkQueue } from "@/components/workspace";

const categoryLabels = {
  opening: "Opening handoff",
  staffing: "Staffing",
  admissions: "Admissions",
  documents: "Forms & documents",
  family: "Family",
  academic: "Academic activity",
  operations: "Operations",
} as const;

/** Source-owned work projection, rendered by the common queue. */
export function AttentionQueue({ items = [], empty = "Nothing needs your attention in the current authorized view." }: {
  items: readonly DailyAttentionItem[]; empty?: string;
}) {
  return <WorkQueue empty={empty}
    description="Canonical work and source-derived follow-ups for your current role and scope."
    items={items.map(item=>({
      id:item.id,category:categoryLabels[item.category],title:item.title,detail:item.detail,priority:item.priority,
      responsibility:<p>
        {item.ownerName ? `Owner: ${item.ownerName}` : "Owner: unassigned or determined by the owning workflow"}
        {" · "}{item.dueAt ? `Due ${new Intl.DateTimeFormat("en-US",{
          dateStyle:"medium",...(item.timezone?{timeZone:item.timezone}:{}),
        }).format(new Date(item.dueAt))}` : "No deadline recorded"}
      </p>,
      actions:<>{item.secondaryHref && <a href={item.secondaryHref} className="underline">{item.secondaryLabel ?? "Open workspace"} →</a>}
        <a href={item.href} className="underline">{item.nextStep} →</a></>,
    }))}/>;
}
