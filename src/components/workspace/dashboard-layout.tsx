import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * CAN V6.1 dashboard composition. Presentation only.
 * Data, permissions, and actions remain in the owning route and services.
 */
export function DashboardLayout({ wallpaper, quickActions, primary, rail, footer, className }: {
  wallpaper?: React.ReactNode;
  quickActions?: React.ReactNode;
  primary: React.ReactNode;
  rail?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("can-dashboard space-y-5", className)}>
    {wallpaper}
    {quickActions && <nav aria-label="Dashboard shortcuts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions}</nav>}
    <div className={cn("grid min-w-0 items-start gap-5", rail && "xl:grid-cols-[minmax(0,1fr)_17rem] 2xl:grid-cols-[minmax(0,1fr)_19rem]")}>
      <div className="min-w-0 space-y-5">{primary}</div>
      {rail && <aside aria-label="Dashboard calendar and updates" className="min-w-0 space-y-4">{rail}</aside>}
    </div>
    {footer && <div className="min-w-0">{footer}</div>}
  </div>;
}

export function DashboardPanel({ title, description, action, children, className, id, headingLevel: Heading = "h2" }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  headingLevel?: "h2" | "h3" | "h4" | "h5" | "h6";
}) {
  const generatedId = React.useId();
  const titleId = id ? `${id}-title` : generatedId;
  return <section id={id} aria-labelledby={titleId}
    className={cn("min-w-0 border border-border bg-card", className)}>
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <Heading id={titleId} className="font-serif text-section font-normal leading-tight tracking-normal text-foreground">{title}</Heading>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm">{action}</div>}
    </header>
    <div className="min-w-0 p-4 sm:p-5">{children}</div>
  </section>;
}

/** Must receive a real Link or button as child, not an inert clickable container. */
export function DashboardShortcut({ title, description, icon, children, className }: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactElement;
  className?: string;
}) {
  return <Slot className={cn(
    "group flex min-h-16 min-w-0 items-center gap-3 border border-border bg-card p-3 text-left text-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className,
  )}>
    {React.cloneElement(children, {}, <>
      {icon && <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center border bg-muted text-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
      <span className="text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true">→</span>
    </>)}
  </Slot>;
}
