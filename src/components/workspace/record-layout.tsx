import * as React from "react";
import { cn } from "@/lib/utils";
import { PageEyebrow, PageTitle } from "./page-frame";

/** Route-stable, entity-first record view. The route owns the data and permissions. */
export function RecordHeader({ eyebrow, title, subtitle, status, actions, breadcrumbs, className,
  focusOnMount = false }: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <PageTitle ref={titleRef} tabIndex={focusOnMount ? -1 : undefined}>{title}</PageTitle>
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
        {meta && <span className="min-w-0 text-muted-foreground">{meta}</span>}
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
