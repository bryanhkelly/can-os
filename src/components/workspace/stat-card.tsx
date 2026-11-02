import * as React from "react";

import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md", className)}>
      <p className="font-serif text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export { StatCard };
