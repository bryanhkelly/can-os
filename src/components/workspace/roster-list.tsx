import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Presentation only: roster sources retain authorization, enrollment lifecycle,
 * pagination and identity redaction. Never pass identities the viewer cannot see.
 */
export function RosterList<T>({
  rows, rowKey, primary, detail, actions, emptyMessage = "No current participants.",
  label = "Class roster", className,
}: {
  rows: readonly T[];
  rowKey: (row: T) => string;
  primary: (row: T) => ReactNode;
  detail?: (row: T) => ReactNode;
  actions?: (row: T) => ReactNode;
  emptyMessage?: string;
  label?: string;
  className?: string;
}) {
  if (!rows.length) return <p role="status" className={cn("mt-4 text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  return <ul aria-label={label} className={cn("mt-4 divide-y divide-border", className)}>
    {rows.map(row => <li key={rowKey(row)}
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-semibold">{primary(row)}</div>
        {detail && <div className="mt-1 text-sm text-muted-foreground">{detail(row)}</div>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-3">{actions(row)}</div>}
    </li>)}
  </ul>;
}
