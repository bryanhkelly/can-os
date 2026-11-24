import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * V6.1 navigation for a small group of related destinations or actions.
 *
 * Not a pager (PageNavigation/DirectoryWindowPagination) and not a set of
 * selectable views (DetailNavigation/SectionTab). Feature components retain
 * authority over destination URLs, access checks and visibility.
 */
export function WorkspaceLinkNavigation({
  label, children, surface = "panel", className,
}: {
  label: string;
  children: ReactNode;
  surface?: "panel" | "plain";
  className?: string;
}) {
  return <nav aria-label={label} data-workspace-link-navigation={surface}
    className={cn(
      "flex min-w-0 flex-wrap items-center gap-4 text-sm [&>a]:min-w-0 [&>a]:max-w-full [&>a]:[overflow-wrap:anywhere]",
      surface === "panel" && "border border-border bg-card p-4",
      className,
    )}>
    {children}
  </nav>;
}
