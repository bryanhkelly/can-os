import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Display only. A timestamp is source-owned evidence, not proof that a
 * notification or delivery was received. UTC prevents SSR hydration drift.
 */
export function formatRecordedTime(value: string, timeZone = "UTC"): string | null {
  // A local timestamp without an offset is ambiguous between SSR and browser.
  if (!/(?:Z|[+-]\\d{2}:\\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric",
      minute: "2-digit", timeZone, timeZoneName: "short",
    }).format(date);
  } catch {
    return null;
  }
}

export function RecordedTime({ value, timeZone = "UTC",
  fallback = "Recorded time unavailable", className, children }: {
  value: string;
  timeZone?: string;
  fallback?: string;
  className?: string;
  children?: ReactNode;
}) {
  return <time dateTime={value} className={cn("tabular-nums", className)}>
    {children}{formatRecordedTime(value, timeZone) ?? fallback}
  </time>;
}
