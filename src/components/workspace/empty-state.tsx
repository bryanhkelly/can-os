import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-2xl border border-dashed bg-muted/20 p-7 text-sm leading-6 text-muted-foreground", className)}>
      <p>{title}</p>
      {description && <p className="mt-1">{description}</p>}
    </div>
  );
}

export { EmptyState };
