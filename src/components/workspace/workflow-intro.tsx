import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Presentation-only workflow introduction; actions remain owned by each route. */
export function WorkflowIntro({ eyebrow, title, description, actions, className }: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return <section aria-label={eyebrow} className={cn("relative isolate mt-3 overflow-hidden rounded-3xl border border-border/70 bg-card px-6 py-8 shadow-sm sm:px-9 sm:py-10", className)}>
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 size-64 rounded-full bg-accent opacity-70 blur-3xl" />
    <div className="relative">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{description}</p>
      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
    </div>
  </section>;
}
