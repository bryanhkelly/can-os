/**
 * A private snapshot is a frozen, normalized source set, not an assurance
 * of complete participation outcomes or approved external reporting.
 * Never capture a manifest while known source receipts are unreconciled.
 */
export type SourceReadiness = {
  observedEvents: number;
  sourceCoverage: {
    status: "no_source_evidence" | "source_unreconciled" | "source_normalized";
    lifecycleCompletenessVerified: false;
  };
};
export function assertSnapshotSourceReadiness(value: SourceReadiness): void {
  if (!Number.isSafeInteger(value.observedEvents) || value.observedEvents < 1 ||
      value.sourceCoverage.status !== "source_normalized") {
    throw new Error("Private source snapshot requires reconciled nonempty source evidence");
  }
}
