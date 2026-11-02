import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageNavigation({ label, previous, next, children, showUnavailable = false,
  previousLabel = "Previous page", nextLabel = "Next page", className }: {
  label: string;
  previous?: ReactNode;
  next?: ReactNode;
  children?: ReactNode;
  showUnavailable?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}) {
  return <nav aria-label={label} className={cn("flex flex-wrap items-center gap-3 text-sm", className)}>
    {previous || (showUnavailable && <span aria-disabled="true" className="rounded border px-3 py-2 opacity-50">{previousLabel}</span>)}
    {children}
    {next || (showUnavailable && <span aria-disabled="true" className="rounded border px-3 py-2 opacity-50">{nextLabel}</span>)}
  </nav>;
}
