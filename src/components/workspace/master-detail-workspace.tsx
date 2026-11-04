import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Master/detail explorer for triage-heavy queues (admissions, staff, actions).
 * Selection lives in URL/router state owned by the route, not in this shell.
 * At mobile widths, the selected record follows the queue in DOM order.
 */
export function MasterDetailWorkspace({ title, description, toolbar, list, detail, footer, mobileMode = "list", className }: {
  title: string;
  description?: string;
  toolbar?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  /** Keep mobile selected records in the initial viewport; the route controls this using URL state. */
  mobileMode?: "list" | "detail";
  footer?: ReactNode;
  className?: string;
}) {
  return <section aria-label={title} className={cn("min-w-0 border border-border bg-card", className)}>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-serif text-section font-normal leading-tight">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {toolbar}
    </header>
    <div className="grid min-w-0 lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)]">
      <section aria-label="Records in queue" className={cn("min-w-0 border-b border-border lg:block lg:border-b-0 lg:border-r", mobileMode === "detail" && "hidden")}>{list}</section>
      <section aria-label="Selected record details" className={cn("min-w-0 lg:block", mobileMode === "list" && "hidden")}>{detail}</section>
    </div>
    {footer && <footer className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{footer}</footer>}
  </section>;
}

/** Route-controlled selection; use in a real Link, preserving URL search and back-state. */
export function MasterDetailListItem({ title, description, status, selected = false, href, className }: {
  title: string;
  description?: string;
  status?: ReactNode;
  selected?: boolean;
  href: string;
  className?: string;
}) {
  return <a href={href} aria-current={selected ? "page" : undefined}
    className={cn("block border-b border-border border-l-[3px] px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      selected ? "border-l-primary bg-accent/60" : "border-l-transparent", className)}>
    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{status}</div>
    {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
  </a>;
}
