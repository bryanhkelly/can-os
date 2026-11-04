import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Reusable dashboard progress: server-computed values only. */
export function DashboardProgress({ label, value, max = 100, description, className }: {
  label: string;
  value: number;
  max?: number;
  description?: string;
  className?: string;
}) {
  const valid = Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= 0 && value <= max;
  const progress = valid ? Math.min(100, Math.max(0, value / max * 100)) : 0;
  return <div className={cn("min-w-0 space-y-2", className)}>
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-semibold">{label}</span>
      <span className="text-muted-foreground">{valid ? `${Math.round(progress)}%` : "Unavailable"}</span>
    </div>
    {valid ? <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}
      className="h-1.5 w-full overflow-hidden bg-muted">
      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
    </div> : <div role="status" className="text-xs text-muted-foreground">Progress cannot be verified.</div>}
    {description && <p className="text-xs text-muted-foreground">{description}</p>}
  </div>;
}

export interface TimelineEntry {
  id: string;
  time: string;
  title: string;
  description?: string;
  href?: string;
  status?: ReactNode;
}
export function DashboardTimeline({ entries, emptyMessage = "Nothing scheduled.", className }: {
  entries: readonly TimelineEntry[];
  emptyMessage?: string;
  className?: string;
}) {
  if (!entries.length) return <p className="text-xs text-muted-foreground" role="status">{emptyMessage}</p>;
  return <ol className={cn("min-w-0 divide-y divide-border", className)}>
    {entries.map(entry => <li key={entry.id} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-3 first:pt-0">
      <time className="text-xs tabular-nums text-muted-foreground">{entry.time}</time>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          {entry.href ? <a href={entry.href} className="text-xs font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{entry.title}</a>
            : <h3 className="text-xs font-semibold">{entry.title}</h3>}
          {entry.status}
        </div>
        {entry.description && <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>}
      </div>
    </li>)}
  </ol>;
}

export interface DashboardPreviewItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  href: string;
  status?: ReactNode;
}
export function DashboardPreviewList({ items, emptyMessage = "No items to show.", className }: {
  items: readonly DashboardPreviewItem[];
  emptyMessage?: string;
  className?: string;
}) {
  if (!items.length) return <p role="status" className="text-xs text-muted-foreground">{emptyMessage}</p>;
  return <ul className={cn("min-w-0 divide-y divide-border", className)}>{items.map(item =>
    <li key={item.id}><a href={item.href} className="flex min-w-0 items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{item.title}</span>
        {item.description && <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>}
        {item.meta && <span className="mt-1 block text-[0.7rem] text-muted-foreground">{item.meta}</span>}
      </span>
      {item.status}
      <span className="text-primary" aria-hidden="true">→</span>
    </a></li>)}</ul>;
}

export function DashboardMediaTile({ title, subtitle, imageSrc, href, label, className }: {
  title: string;
  subtitle?: string;
  imageSrc?: string;
  href: string;
  label?: string;
  className?: string;
}) {
  return <a href={href} aria-label={label ?? title} className={cn(
    "group relative isolate flex min-h-40 flex-col justify-end overflow-hidden border border-border bg-ink p-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className,
  )}>
    {imageSrc && <img src={imageSrc} alt="" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover" />}
    <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
    <span className="font-serif text-2xl leading-tight">{title}</span>
    {subtitle && <span className="mt-1 text-xs text-white/90">{subtitle}</span>}
    <span className="absolute bottom-4 right-4 font-semibold" aria-hidden="true">→</span>
  </a>;
}
