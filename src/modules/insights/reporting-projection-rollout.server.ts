/**
 * Reporting projection and private snapshots are standard platform capabilities.
 * A missing rollout variable is not an availability decision. Canonical storage,
 * database permissions, source reconciliation and report authorization remain
 * enforced at their respective read/write boundaries.
 *
 * Explicit maintenance pauses apply only to projection workers and snapshot
 * creation, never to authorized reads of already captured evidence.
 */
export function reportingProjectionEnabled(): boolean {
  return process.env.CAN_REPORTING_PROJECTION_MAINTENANCE_PAUSE !== "1";
}

export function reportingSnapshotsEnabled(): boolean {
  return reportingProjectionEnabled() &&
    process.env.CAN_REPORTING_SNAPSHOT_MAINTENANCE_PAUSE !== "1";
}
