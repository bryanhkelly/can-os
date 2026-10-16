import * as React from "react";

import { cn } from "@/lib/utils";

export interface WorkspaceShellProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function WorkspaceShell({ title, eyebrow, subtitle, actions, className, children }: WorkspaceShellProps) {
  return (
    <main className={cn("min-h-screen bg-background px-6 py-10 text-foreground", className)}>
      <div className="mx-auto max-w-5xl">
        <header>
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
        {children}
      </div>
    </main>
  );
}

export { WorkspaceShell };
