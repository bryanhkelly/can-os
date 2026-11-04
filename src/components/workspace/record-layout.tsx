import * as React from "react";
import { cn } from "@/lib/utils";

/** Route-stable, entity-first record view. The route owns the data and permissions. */
export function RecordHeader({ eyebrow, title, subtitle, status, actions, breadcrumbs, className }: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
}) {
  return <header className={cn("min-w-0 border-b border-border pb-5", className)}>
    {breadcrumbs && <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">{breadcrumbs}</nav>}
    {eyebrow && <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-4xl font-normal leading-tight tracking-normal text-foreground">{title}</h1>
        {subtitle && <div className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{status}{actions}</div>
    </div>
  </header>;
}

export function RecordLayout({ header, navigation, main, rail, activity, className }: {
  header: React.ReactNode;
  navigation?: React.ReactNode;
  main: React.ReactNode;
  rail?: React.ReactNode;
  activity?: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("min-w-0 space-y-5", className)}>
    {header}
    {navigation && <nav aria-label="Record sections" className="flex flex-wrap gap-1 border-b border-border pb-2">{navigation}</nav>}
    <div className={cn("grid min-w-0 items-start gap-5", rail && "xl:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="min-w-0 space-y-5">{main}</div>
      {rail && <aside aria-label="Related record context" className="min-w-0 space-y-4">{rail}</aside>}
    </div>
    {activity && <section aria-label="Record activity" className="border border-border bg-card p-5">{activity}</section>}
  </div>;
}

export function EntityCard({ title, subtitle, meta, status, href, children, className }: {
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const body = <>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="font-serif text-2xl font-normal leading-tight">{title}</h2>
      {subtitle && <div className="mt-2 text-xs text-muted-foreground">{subtitle}</div>}</div>
      {status}
    </div>
    {children && <div className="mt-4 text-sm text-muted-foreground">{children}</div>}
    <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs">
      <span className="min-w-0 text-muted-foreground">{meta}</span>
      <span className="shrink-0 font-semibold text-primary" aria-hidden="true">Open →</span>
    </div>
  </>;
  return <a href={href} className={cn(
    "can-entity-card flex min-h-40 min-w-0 flex-col gap-4 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className)}>{body}</a>;
}
