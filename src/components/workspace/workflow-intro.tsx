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
  return <section aria-label={eyebrow} className={cn("relative mt-3 overflow-hidden border border-border bg-card px-5 py-5 sm:px-6 sm:py-6", className)}>
    
    <div className="relative">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 max-w-3xl font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
    </div>
  </section>;
}
