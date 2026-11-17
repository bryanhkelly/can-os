import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusTone } from "@/components/workspace/workspace-panel";

/** Presentation-only history of events from an authoritative, authorized reader.
 * No lifecycle inference, ordering, permission checks, or data fetching happens here.
 */
export interface StatusTimelineEntry {
  id: string;
  title: string;
  occurredAt: string;
  description?: ReactNode;
  status?: string;
  tone?: StatusTone;
}

export function StatusTimeline({ entries, label = "Status history",
  emptyMessage = "No recorded history.", timeZone = "UTC", className }: {
  entries: readonly StatusTimelineEntry[];
  label?: string;
  emptyMessage?: string;
  /** Display time zone; defaults to explicit UTC for deterministic SSR and hydration. */
  timeZone?: string;
  className?: string;
}) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric",
    minute: "2-digit", timeZone, timeZoneName: "short",
  });
  if (!entries.length) return <p role="status"
    className={cn("text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  return <ol aria-label={label} className={cn("divide-y divide-border border border-border", className)}>
    {entries.map(entry => <li key={entry.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 p-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{entry.title}</p>
        <time dateTime={entry.occurredAt} className="mt-1 block text-xs tabular-nums text-muted-foreground">
          {Number.isNaN(new Date(entry.occurredAt).getTime())
            ? "Recorded time unavailable" : dateFormatter.format(new Date(entry.occurredAt))}
        </time>
        {entry.description && <div className="mt-1 text-xs text-muted-foreground">{entry.description}</div>}
      </div>
      {entry.status && <StatusBadge tone={entry.tone ?? "neutral"}>{entry.status}</StatusBadge>}
    </li>)}
  </ol>;
}
