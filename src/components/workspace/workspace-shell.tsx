import * as React from "react";

import { cn } from "@/lib/utils";

export interface WorkspaceShellProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  width?: "reading" | "standard" | "wide";
  rail?: React.ReactNode;
  className?: string;
  /** Use when a specialized identity header supplies the page h1 inside children. */
  contentHeader?: boolean;
  children: React.ReactNode;
}

function WorkspaceShell({ title, eyebrow, subtitle, actions, breadcrumbs, width = "standard", rail, className, contentHeader = false, children }: WorkspaceShellProps) {
  return (
    <main aria-label={contentHeader && typeof title === "string" ? title : undefined} className={cn("min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 sm:py-9 xl:px-10", className)}>
      <div className={cn("mx-auto", width === "wide" ? "max-w-7xl" : width === "reading" ? "max-w-3xl" : "max-w-5xl")}>
        {breadcrumbs && <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{breadcrumbs}</nav>}
        {!contentHeader && <header className="can-workspace-header border-b border-border/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {eyebrow && (
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-primary">
                  {eyebrow}
                </p>
              )}
              <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
            </div>
            {actions}
          </div>
          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
        </header>}
        {rail ? <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">{children}</div>
          <aside aria-label="Related context" className="space-y-4 pt-8 lg:sticky lg:top-6 lg:self-start">{rail}</aside>
        </div> : children}
      </div>
    </main>
  );
}

export { WorkspaceShell };
