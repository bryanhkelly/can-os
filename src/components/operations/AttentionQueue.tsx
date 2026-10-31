import type { DailyAttentionItem } from "@/domain/daily-operations";

const categoryLabels = {
  opening: "Opening handoff",
  staffing: "Staffing",
  admissions: "Admissions",
  documents: "Forms & documents",
  family: "Family",
  academic: "Academic activity",
  operations: "Operations",
} as const;

/** Shared, read-only presentation. Every destination still enforces its own server authorization. */
export function AttentionQueue({ items = [], empty = "Nothing needs your attention in the current authorized view." }: {
  items: readonly DailyAttentionItem[];
  empty?: string;
}) {
  return <section aria-label="What needs my attention" className="mt-8">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl">What needs my attention</h2>
        <p className="mt-1 text-sm text-muted-foreground">Canonical work and source-derived follow-ups for your current role and scope.</p>
      </div>
      {items.length > 0 && <span className="rounded-full border px-3 py-1 text-xs">{items.length} open</span>}
    </div>
    {!items.length && <p className="mt-4 rounded-xl border p-5 text-sm text-muted-foreground">{empty}</p>}
    <div className="mt-4 space-y-3">
      {items.map(item => <article key={item.id} className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{categoryLabels[item.category]}</p>
            <h3 className="mt-1 font-semibold">{item.title}</h3>
          </div>
          {item.priority !== "normal" && <span className="text-xs uppercase text-muted-foreground">{item.priority}</span>}
        </div>
        {item.detail && <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            {item.ownerName ? `Owner: ${item.ownerName}` : "Owner: unassigned or determined by the owning workflow"}
            {" · "}{item.dueAt ? `Due ${new Date(item.dueAt).toLocaleDateString()}` : "No deadline recorded"}
          </p>
          <div className="flex flex-wrap gap-3 font-semibold text-foreground">
            {item.secondaryHref && <a href={item.secondaryHref} className="underline">{item.secondaryLabel ?? "Open workspace"} →</a>}
            <a href={item.href} className="underline">{item.nextStep} →</a>
          </div>
        </div>
      </article>)}
    </div>
  </section>;
}
