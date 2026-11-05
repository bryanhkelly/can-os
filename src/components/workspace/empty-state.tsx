import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  kind?: "records" | "matches";
  actions?: React.ReactNode;
  className?: string;
}

function EmptyState({ title, description, kind = "records", actions, className }: EmptyStateProps) {
  return (
    <div data-empty-kind={kind} className={cn("rounded-2xl border border-dashed bg-muted/20 p-7 text-sm leading-6 text-muted-foreground", className)}>
      <p>{title ?? (kind === "matches" ? "No matching records" : "No records yet")}</p>
      {description && <p className="mt-1">{description}</p>}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { EmptyState };
