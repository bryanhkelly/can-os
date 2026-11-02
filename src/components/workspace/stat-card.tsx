import * as React from "react";

import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  interactive?: boolean;
  className?: string;
}

function StatCard({ label, value, hint, interactive = false, className }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-2xl border border-border/70 bg-card p-5 shadow-sm",
      interactive && "transition-shadow hover:shadow-md group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
      className,
    )}>
      <p className="font-serif text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export { StatCard };
