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
  children: React.ReactNode;
}

function WorkspaceShell({ title, eyebrow, subtitle, actions, breadcrumbs, width = "standard", rail, className, children }: WorkspaceShellProps) {
  return (
    <main className={cn("min-h-screen bg-background px-6 py-10 text-foreground", className)}>
      <div className={cn("mx-auto", width === "wide" ? "max-w-7xl" : width === "reading" ? "max-w-3xl" : "max-w-5xl")}>
        {breadcrumbs && <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{breadcrumbs}</nav>}
        <header className="border-b pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {eyebrow}
                </p>
              )}
              <h1 className="mt-2 font-serif text-4xl">{title}</h1>
            </div>
            {actions}
          </div>
          {subtitle && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </header>
        {rail ? <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">{children}</div>
          <aside aria-label="Related context" className="space-y-4 pt-8 lg:sticky lg:top-6 lg:self-start">{rail}</aside>
        </div> : children}
      </div>
    </main>
  );
}

export { WorkspaceShell };
