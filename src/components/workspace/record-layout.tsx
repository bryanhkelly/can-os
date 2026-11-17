import * as React from "react";
import { cn } from "@/lib/utils";
import { PageEyebrow, PageTitle } from "./page-frame";
import { DetailNavigation } from "./workspace-panel";

/** Route-stable, entity-first record view. The route owns the data and permissions. */
export function RecordHeader({ eyebrow, title, subtitle, leading, status, actions, breadcrumbs, className,
  focusOnMount = false }: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
  focusOnMount?: boolean;
}) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [focusOnMount, title]);
  return <header className={cn("min-w-0 border-b border-border pb-5", className)}>
    {breadcrumbs && <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">{breadcrumbs}</nav>}
    {eyebrow && <PageEyebrow className="mb-2">{eyebrow}</PageEyebrow>}
    <div className="grid min-w-0 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 wrap-break-word">
          <PageTitle ref={titleRef} data-variant="record" tabIndex={focusOnMount ? -1 : undefined}>{title}</PageTitle>
          {subtitle && <div className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</div>}
        </div>
        {leading && <div className="shrink-0">{leading}</div>}
      </div>
      {(status || actions) && <div className="flex min-w-0 flex-wrap items-center gap-2">{status}{actions && <div role="group" aria-label="Record actions" className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}</div>}
    </div>
  </header>;
}

export function RecordLayout({ header, navigation, main, rail, activity, railLabel = "Related record context", activityLabel = "Record activity", className }: {
  header: React.ReactNode;
  navigation?: React.ReactNode;
  main: React.ReactNode;
  rail?: React.ReactNode;
  activity?: React.ReactNode;
  railLabel?: string;
  activityLabel?: string;
  className?: string;
}) {
  return <div className={cn("min-w-0 space-y-5", className)}>
    {header}
    {navigation && <DetailNavigation label="Record sections" variant="record">{navigation}</DetailNavigation>}
    <div className={cn("grid min-w-0 items-start gap-5", rail && "xl:grid-cols-[minmax(0,1fr)_18rem]")}>
      <div className="min-w-0 space-y-5">{main}</div>
      {rail && <aside aria-label={railLabel} className="min-w-0 space-y-4">{rail}</aside>}
    </div>
    {activity && <section aria-label={activityLabel} className="border border-border bg-card p-5">{activity}</section>}
  </div>;
}

export interface RecordFact {
  /** Human-readable fact name. Values always come from the owning route's authorized reader. */
  label: string;
  value: React.ReactNode;
  /** Stable identity when multiple facts share a label or values reorder. */
  id?: string;
}

/** Compact semantic record metadata, not a metric dashboard or editable form. */
export function RecordFacts({ items, columns = 2, variant = "plain", label, className }: {
  items: readonly RecordFact[];
  columns?: 1 | 2 | 3;
  /** Tile presentation for concise record evidence states, not dashboard metrics. */
  variant?: "plain" | "tiles";
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return <dl aria-label={label} className={cn(
    "grid min-w-0 gap-4 text-sm",
    columns === 2 && "sm:grid-cols-2",
    columns === 3 && "sm:grid-cols-3",
    className,
  )}>
    {items.map((item, index) => <div key={item.id ?? `${item.label}:${index}`}
      className={cn("min-w-0", variant === "tiles" && "border border-border bg-card p-3")}>
      <dt className="text-xs text-muted-foreground">{item.label}</dt>
      <dd className={cn("mt-1 min-w-0 wrap-break-word text-foreground", variant === "tiles" && "font-semibold")}>{item.value}</dd>
    </div>)}
  </dl>;
}

type EntityCardLinkProps = {
  className: string;
  children: React.ReactNode;
};

type EntityCardBaseProps = {
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  leading?: React.ReactNode;
  children?: React.ReactNode;
  openLabel?: string;
  className?: string;
};

type EntityCardProps = EntityCardBaseProps & (
  | { href: string; renderLink?: never }
  | { href?: never; renderLink: (props: EntityCardLinkProps) => React.ReactNode }
);

export function EntityCard(props: EntityCardProps) {
  const { title, subtitle, meta, status, leading, children, openLabel = "Open", className } = props;
  const body = <>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-5">
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}</div>
      </div>
      {status}
    </div>
    <div className="flex flex-1 flex-col p-5 sm:p-6">
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
      <div className={cn("mt-auto flex items-center justify-between border-t border-border pt-4 text-xs", !meta && "justify-end")}>
        {meta && <div className="min-w-0 text-muted-foreground">{meta}</div>}
        <span className="shrink-0 font-semibold text-primary" aria-hidden="true">{openLabel} →</span>
      </div>
    </div>
  </>;
  const cardClassName = cn(
    "can-entity-card flex min-h-40 min-w-0 flex-col overflow-hidden border border-border/70 bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className,
  );
  if ("renderLink" in props && props.renderLink) {
    return props.renderLink({ className: cardClassName, children: body });
  }
  if ("href" in props && props.href) {
    return <a href={props.href} className={cardClassName}>{body}</a>;
  }
  throw new Error("EntityCard requires either href or renderLink.");
}
