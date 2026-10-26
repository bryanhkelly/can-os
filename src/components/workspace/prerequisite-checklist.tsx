import { StatusBadge } from "./workspace-panel";

export type PrerequisiteItem = {
  id: string; title: string; satisfied: boolean; detail: string;
};

/** Display server-evaluated prerequisites; never infer permission or approval. */
export function PrerequisiteChecklist({ items, label }: {
  items: readonly PrerequisiteItem[]; label: string;
}) {
  return <ul aria-label={label} className="mt-3 space-y-2">
    {items.map(item => <li key={item.id} className="rounded border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.title}</span>
        <StatusBadge tone={item.satisfied ? "neutral" : "attention"}>
          {item.satisfied ? "Met" : "Needs attention"}
        </StatusBadge>
      </div>
      <p className="mt-1 text-xs">{item.detail}</p>
    </li>)}
    {!items.length && <li className="text-sm">No prerequisite results available.</li>}
  </ul>;
}
