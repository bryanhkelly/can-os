import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePanel({ title, description, actions, children, className, id }: {
  title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return <section id={id} aria-label={title} className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm", className)}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-5">
      <div><h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      {actions}
    </header>
    <div className="p-5 sm:p-6">{children}</div>
  </section>;
}

export function DetailNavigation({ label, children }: { label: string; children: ReactNode }) {
  return <nav aria-label={label} className="my-6 flex flex-wrap gap-2 rounded-xl border bg-card p-2 text-sm [&_a]:rounded-lg [&_a]:px-4 [&_a]:py-2 [&_a:hover]:bg-muted [&_a[aria-current=page]]:bg-foreground [&_a[aria-current=page]]:text-background">{children}</nav>;
}

export function StatusBadge({ children, tone = "neutral" }: {
  children: ReactNode; tone?: "neutral" | "attention" | "success";
}) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
    tone === "attention" && "border-amber-500/50 bg-amber-500/10 text-foreground",
    tone === "success" && "border-emerald-500/50 bg-emerald-500/10 text-foreground",
    tone === "neutral" && "bg-muted text-muted-foreground")}>{children}</span>;
}

export function PersonMark({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("");
  return <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-semibold">{initials}</span>;
}
