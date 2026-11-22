import type { ReportableEventType } from "@/domain/reportable-event-catalog";

export type ReportingSourceGroup = {
  eventType: string;
  status: "accepted" | "duplicate" | "legacy" | "retry_pending" | "dead_letter";
  count: number;
};

export function summarizeReportingSourceCoverage(
  rows: readonly ReportingSourceGroup[],
  unprojected: number,
  unresolvedCorrections: number,
): {
  observedCounts: Partial<Record<ReportableEventType, number>>;
  observedEvents: number;
  sourceCoverage: {
    status: "no_source_evidence" | "source_unreconciled" | "source_normalized";
    legacyEvents: number;
    duplicateEvents: number;
    retryPendingEvents: number;
    deadLetterEvents: number;
    unprojectedEvents: number;
    unresolvedCorrections: number;
    lifecycleCompletenessVerified: false;
  };
} {
  if ([unprojected, unresolvedCorrections].some(n=>!Number.isSafeInteger(n)||n<0)) {
    throw new Error("Invalid source reconciliation count");
  }
  const observedCounts: Partial<Record<ReportableEventType, number>> = {};
  let observedEvents = 0, legacyEvents = 0, duplicateEvents = 0, retryPendingEvents = 0,
    deadLetterEvents = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.count) || row.count < 0) {
      throw new Error("Invalid reporting group count");
    }
    if (row.status === "accepted") {
      observedCounts[row.eventType as ReportableEventType] =
        (observedCounts[row.eventType as ReportableEventType] ?? 0) + row.count;
      observedEvents += row.count;
    } else if (row.status === "legacy") legacyEvents += row.count;
    else if (row.status === "duplicate") duplicateEvents += row.count;
    else if (row.status === "retry_pending") retryPendingEvents += row.count;
    else if (row.status === "dead_letter") deadLetterEvents += row.count;
    else throw new Error("Unrecognized reporting receipt state");
  }
  const hasAny = observedEvents + legacyEvents + duplicateEvents +
    retryPendingEvents + deadLetterEvents + unprojected + unresolvedCorrections > 0;
  const status = !hasAny ? "no_source_evidence" :
    legacyEvents || unprojected || retryPendingEvents || deadLetterEvents ||
      unresolvedCorrections || (duplicateEvents > 0 && observedEvents === 0) ?
      "source_unreconciled" : "source_normalized";
  return {
    observedCounts, observedEvents,
    sourceCoverage: {
      status, legacyEvents, duplicateEvents, retryPendingEvents, deadLetterEvents,
      unprojectedEvents: unprojected,
      unresolvedCorrections, lifecycleCompletenessVerified: false,
    },
  };
}
