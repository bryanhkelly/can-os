import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Person identity is the first meaningful landmark: no unrelated dashboard above it. */
export function ProfileIdentity({ name, subtitle, portrait, badges, actions, className }: {
  name: string;
  subtitle?: ReactNode;
  portrait?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <header className={cn("border border-border bg-card px-5 py-6 sm:px-7", className)}>
    <div className="flex flex-wrap items-start gap-5">
      {portrait && <div className="shrink-0" aria-label="Profile picture">{portrait}</div>}
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-4xl font-normal leading-none tracking-normal text-foreground sm:text-5xl">{name}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        {badges && <div className="mt-4 flex flex-wrap items-center gap-2">{badges}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </header>;
}

export interface ProfileMetric {
  id: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

/** Read-only, server-derived facts—not guessed GPA, attendance rates, or progress. */
export function ProfileMetricBand({ metrics, className }: {
  metrics: readonly ProfileMetric[];
  className?: string;
}) {
  return <dl className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
    {metrics.map(metric=><div key={metric.id} className="min-w-0 border border-border bg-muted/35 px-4 py-4">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{metric.label}</dt>
      <dd className="mt-2 font-sans text-2xl font-semibold tabular-nums leading-none text-foreground">{metric.value}</dd>
      {metric.detail && <dd className="mt-2 text-xs leading-5 text-muted-foreground">{metric.detail}</dd>}
    </div>)}
  </dl>;
}

/** The tab slot contains real router Links and URL-backed selected state. */
export function ProfileRecordLayout({ identity, metrics, navigation, children, rail, className }: {
  identity: ReactNode;
  metrics?: readonly ProfileMetric[];
  navigation?: ReactNode;
  children: ReactNode;
  rail?: ReactNode;
  className?: string;
}) {
  return <div className={cn("min-w-0 space-y-5", className)}>
    <div className="border border-border bg-card [&>header]:border-0">
      {identity}
      {metrics && metrics.length > 0 && <ProfileMetricBand metrics={metrics} className="px-5 pb-5 sm:px-7 sm:pb-7"/>}
    </div>
    {navigation && <nav aria-label="Profile sections" className="flex min-w-0 gap-1 overflow-x-auto border border-border bg-card px-2 py-1.5 [scrollbar-width:thin]">{navigation}</nav>}
    <div className={cn("grid min-w-0 items-start gap-5", rail && "xl:grid-cols-[minmax(0,1fr)_21rem]")}>
      <div className="min-w-0 space-y-5">{children}</div>
      {rail && <aside aria-label="Profile meetings and related actions" className="min-w-0 space-y-4">{rail}</aside>}
    </div>
  </div>;
}

/** Apply to the active URL-backed Link, never a fake clickable tab. */
export const profileTabClass = (active: boolean) => cn(
  "inline-flex min-h-10 shrink-0 items-center border-b-2 px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  active ? "border-primary bg-muted/65 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
);
