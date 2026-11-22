/**
 * Safe, explicit activation gate. Deploy migration 0100 and pass its schema
 * preflight before enabling any new receipt writes or reads.
 *
 * When disabled, canonical domain events continue through their existing
 * outbox and can be replayed into the projection after activation.
 */
export function reportingProjectionEnabled(): boolean {
  return process.env.CAN_REPORTING_SOURCE_PROJECTION_ENABLED === "1";
}
